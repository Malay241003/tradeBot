// bot/live/riskGate.js
// Pre-trade enforcement of ALL Blueberry Funded rules

import { LIVE_CONFIG } from './config.js';

/**
 * Get lot size limit for a given pair
 */
function getLotLimit(pair) {
    const s = pair.toUpperCase();
    if (s.includes('BTC')) return LIVE_CONFIG.LOT_LIMITS.BTC;
    if (s.includes('ETH')) return LIVE_CONFIG.LOT_LIMITS.ETH;
    if (s.includes('SOL')) return LIVE_CONFIG.LOT_LIMITS.SOL;
    return LIVE_CONFIG.LOT_LIMITS.OTHER_CRYPTO;
}

/**
 * Evaluate whether a trade is allowed under all Blueberry Funded rules
 * @returns {{ allowed: boolean, reason: string|null, adjustments: object }}
 */
export function evaluate(signal, state) {
    const result = {
        allowed: true,
        reason: null,
        adjustments: {},
    };

    // ═══════════════════════════════════════
    // 1. CHALLENGE STATUS
    // ═══════════════════════════════════════
    if (state.status !== 'ACTIVE') {
        return deny(`Challenge is ${state.status}. No new trades.`);
    }

    // ═══════════════════════════════════════
    // 2. WEEKEND FILTER
    // ═══════════════════════════════════════
    if (LIVE_CONFIG.SKIP_WEEKEND_ENTRIES) {
        const day = new Date().getUTCDay();
        if (day === 0 || day === 6) {
            state.stats.weekendSkips++;
            return deny('Weekend entry blocked (Sat/Sun UTC).');
        }
    }

    // ═══════════════════════════════════════
    // 3. DAILY DD BUFFER CHECK
    // ═══════════════════════════════════════
    const currentDailyLoss = state.dayStartEquity - state.balance;
    const currentDailyLossPct = currentDailyLoss / state.dayStartEquity;

    if (currentDailyLossPct >= LIVE_CONFIG.SAFE_DAILY_DD_LIMIT) {
        state.stats.dailyDDSkips++;
        return deny(`Daily DD at ${(currentDailyLossPct * 100).toFixed(2)}% — exceeds 3.5% buffer. Pausing for today.`);
    }

    // Check if next trade RISK would push past buffer
    const riskAmount = state.balance * LIVE_CONFIG.RISK_PER_TRADE_PCT;
    const potentialLossPct = (currentDailyLoss + riskAmount) / state.dayStartEquity;

    if (potentialLossPct >= LIVE_CONFIG.SAFE_DAILY_DD_LIMIT) {
        state.stats.dailyDDSkips++;
        return deny(`Next trade risk ($${riskAmount.toFixed(2)}) would push daily DD to ${(potentialLossPct * 100).toFixed(2)}%. Pausing.`);
    }

    // ═══════════════════════════════════════
    // 4. MAX STATIC DD CHECK
    // ═══════════════════════════════════════
    const failLevel = LIVE_CONFIG.INITIAL_BALANCE * (1 - LIVE_CONFIG.MAX_TOTAL_DD_PCT);
    if (state.balance <= failLevel) {
        return deny(`Balance $${state.balance.toFixed(2)} at or below static DD floor $${failLevel.toFixed(2)}`);
    }

    // ═══════════════════════════════════════
    // 5. POSITION STACKING LIMITS
    // ═══════════════════════════════════════
    const sameAssetPositions = state.openPositions.filter(p => p.pair === signal.pair).length;
    if (sameAssetPositions >= LIVE_CONFIG.MAX_POSITIONS_PER_ASSET) {
        return deny(`Already ${sameAssetPositions} positions on ${signal.pair} (max ${LIVE_CONFIG.MAX_POSITIONS_PER_ASSET})`);
    }

    if (state.openPositions.length >= LIVE_CONFIG.MAX_TOTAL_POSITIONS) {
        return deny(`${state.openPositions.length} total positions open (max ${LIVE_CONFIG.MAX_TOTAL_POSITIONS})`);
    }

    // ═══════════════════════════════════════
    // 6. LEVERAGE CAP
    // ═══════════════════════════════════════
    const leverage = LIVE_CONFIG.LEVERAGE[signal.assetClass] || 2;
    const maxPosition = state.balance * leverage;
    const slDistance = Math.abs(signal.entryPrice - signal.sl);
    const slPct = slDistance / signal.entryPrice;
    let positionValue = riskAmount / slPct;

    if (positionValue > maxPosition) {
        state.stats.leverageInterventions++;
        positionValue = maxPosition;
        result.adjustments.leverageCapped = true;
    }

    // ═══════════════════════════════════════
    // 7. LOT SIZE CAP (CRYPTO ONLY)
    // ═══════════════════════════════════════
    if (signal.assetClass === 'crypto') {
        const lotSizeCoins = positionValue / signal.entryPrice;
        const maxLots = getLotLimit(signal.pair);

        if (lotSizeCoins > maxLots) {
            state.stats.lotSizeInterventions++;
            positionValue = maxLots * signal.entryPrice;
            result.adjustments.lotSizeCapped = true;
            result.adjustments.originalLots = lotSizeCoins;
            result.adjustments.cappedLots = maxLots;
        }
    }

    // ═══════════════════════════════════════
    // 8. MARTINGALE CHECK (no 50%+ increase after loss)
    // ═══════════════════════════════════════
    if (state.closedTrades.length > 0) {
        const lastTrade = state.closedTrades[state.closedTrades.length - 1];
        if (lastTrade.netPnL < 0 && lastTrade.riskAmount) {
            if (riskAmount > lastTrade.riskAmount * 1.5) {
                return deny('Risk increased >50% after a loss — anti-martingale rule.');
            }
        }
    }

    // ═══════════════════════════════════════
    // APPROVED — attach calculated values
    // ═══════════════════════════════════════
    result.positionValue = positionValue;
    result.riskAmount = riskAmount;
    result.leverage = leverage;
    result.lotSize = positionValue / signal.entryPrice;

    return result;
}

function deny(reason) {
    return { allowed: false, reason, adjustments: {} };
}
