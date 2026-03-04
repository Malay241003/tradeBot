// bot/live/paperExec.js
// Virtual order execution engine — simulates fills locally

import { LIVE_CONFIG } from './config.js';
import { updateBalanceAfterTrade } from './state.js';

/**
 * Execute a paper trade entry
 */
export function enterPosition(signal, approval, state) {
    const position = {
        id: `${signal.pair}_${Date.now()}`,
        pair: signal.pair,
        symbol: signal.symbol,
        direction: signal.direction,
        assetClass: signal.assetClass,
        entryPrice: signal.entryPrice,
        sl: signal.sl,
        initialSl: signal.sl,
        tp: signal.tp,
        entryTime: new Date().toISOString(),
        barTime: signal.barTime,
        positionValue: approval.positionValue,
        riskAmount: approval.riskAmount,
        lotSize: approval.lotSize,
        leverage: approval.leverage,
        adjustments: approval.adjustments,
        scaleLevel: 0,
        positionR: 1,
        rAtTp: LIVE_CONFIG.TP_R,
        rAtSl: -1,
        maxFavorableR: 0,
        maxAdverseR: 0,
        barsHeld: 0,
        setup: signal.setup,
        trigger: signal.trigger,
        liquidationOverride: signal.liquidationOverride,
    };

    state.openPositions.push(position);

    console.log(`  ✅ ENTERED ${signal.direction.toUpperCase()} ${signal.pair} @ $${signal.entryPrice.toFixed(4)}`);
    console.log(`     SL: $${signal.sl.toFixed(4)} | TP: $${signal.tp.toFixed(4)} | Risk: $${approval.riskAmount.toFixed(2)} | Lots: ${approval.lotSize.toFixed(4)}`);

    return position;
}

/**
 * Close a position and calculate PnL
 */
export async function closePosition(position, exitPrice, exitReason, state) {
    const riskPerUnit = Math.abs(position.initialSl - position.entryPrice);

    // Calculate R based on direction
    let baseR;
    if (position.direction === 'short') {
        baseR = (position.entryPrice - exitPrice) / riskPerUnit;
    } else {
        baseR = (exitPrice - position.entryPrice) / riskPerUnit;
    }

    // Apply scale-in adjustments
    let grossR = baseR;
    if (position.scaleLevel >= 1) grossR += (baseR - 1) * 0.5;
    if (position.scaleLevel >= 2) grossR += (baseR - 2) * 0.25;

    // Apply costs
    const slDistancePct = Math.abs(position.entryPrice - position.initialSl) / position.entryPrice;
    const feeCostR = (LIVE_CONFIG.FEE_PCT * 2) / slDistancePct;
    const slippageCostR = (LIVE_CONFIG.SLIPPAGE_PCT * 2) / slDistancePct;
    const spreadCostR = LIVE_CONFIG.SPREAD_PCT / slDistancePct;
    const fundingCostR = (LIVE_CONFIG.FUNDING_PER_8H * (position.barsHeld / 32)) / slDistancePct;

    const netR = grossR - feeCostR - slippageCostR - spreadCostR - fundingCostR;
    const netPnL = netR * position.riskAmount;

    // Commission on notional
    const commissionCost = position.positionValue * LIVE_CONFIG.COMMISSION_ROUND_TRIP;

    const finalPnL = netPnL - commissionCost;

    const trade = {
        id: position.id,
        pair: position.pair,
        direction: position.direction,
        assetClass: position.assetClass,
        entryPrice: position.entryPrice,
        exitPrice,
        entryTime: position.entryTime,
        exitTime: new Date().toISOString(),
        sl: position.initialSl,
        tp: position.tp,
        grossR: +grossR.toFixed(4),
        netR: +netR.toFixed(4),
        netPnL: +finalPnL.toFixed(2),
        riskAmount: +position.riskAmount.toFixed(2),
        positionValue: +position.positionValue.toFixed(2),
        lotSize: +position.lotSize.toFixed(4),
        barsHeld: position.barsHeld,
        maxFavorableR: +position.maxFavorableR.toFixed(4),
        maxAdverseR: +position.maxAdverseR.toFixed(4),
        scaleLevel: position.scaleLevel,
        exitReason,
        costs: {
            feeCostR: +feeCostR.toFixed(4),
            slippageCostR: +slippageCostR.toFixed(4),
            spreadCostR: +spreadCostR.toFixed(4),
            fundingCostR: +fundingCostR.toFixed(4),
            commissionCost: +commissionCost.toFixed(4),
        },
        adjustments: position.adjustments,
    };

    // Remove from open positions
    state.openPositions = state.openPositions.filter(p => p.id !== position.id);

    // Update balance and logs (async)
    await updateBalanceAfterTrade(state, finalPnL, trade);

    const emoji = finalPnL >= 0 ? '🟢' : '🔴';
    console.log(`  ${emoji} CLOSED ${position.direction.toUpperCase()} ${position.pair} @ $${exitPrice.toFixed(4)} | R: ${netR.toFixed(2)} | PnL: $${finalPnL.toFixed(2)} | Reason: ${exitReason}`);

    return trade;
}
