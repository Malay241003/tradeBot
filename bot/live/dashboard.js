// bot/live/dashboard.js
// Rich console dashboard + JSON logging

import { LIVE_CONFIG } from './config.js';

/**
 * Render the live dashboard to console
 */
export function render(state) {
    const balance = state.balance;
    const target = LIVE_CONFIG.INITIAL_BALANCE * (1 + LIVE_CONFIG.PROFIT_TARGET_PCT);
    const failLevel = LIVE_CONFIG.INITIAL_BALANCE * (1 - LIVE_CONFIG.MAX_TOTAL_DD_PCT);
    const dailyDDUsed = ((state.dayStartEquity - balance) / state.dayStartEquity * 100);
    const totalReturn = ((balance - LIVE_CONFIG.INITIAL_BALANCE) / LIVE_CONFIG.INITIAL_BALANCE * 100);
    const daysActive = state.uniqueTradingDays.length;
    const winRate = state.stats.totalTrades > 0
        ? (state.stats.wins / state.stats.totalTrades * 100).toFixed(1)
        : '0.0';

    // Days since start
    const elapsedDays = Math.floor((Date.now() - new Date(state.startedAt).getTime()) / (1000 * 60 * 60 * 24));

    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('  BLUEBERRY FUNDED 1-STEP PAPER TRADING');
    console.log(`  Status: ${statusEmoji(state.status)} ${state.status} | Day ${elapsedDays} of Challenge`);
    console.log('══════════════════════════════════════════════════════');
    console.log(`  Balance:    $${balance.toFixed(2)}  (${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%)`);
    console.log(`  Target:     $${target.toFixed(2)}  (need ${balance < target ? '+$' + (target - balance).toFixed(2) : '✅ REACHED'})`);
    console.log(`  Daily DD:   ${dailyDDUsed.toFixed(2)}% used of 4.00% limit (dayStart: $${state.dayStartEquity.toFixed(2)})`);
    console.log(`  Max DD:     Floor $${failLevel.toFixed(2)} | Current: $${balance.toFixed(2)} ${balance > failLevel ? '✅' : '❌'}`);
    console.log(`  Trading Days: ${daysActive} / ${LIVE_CONFIG.MIN_TRADING_DAYS} minimum ${daysActive >= LIVE_CONFIG.MIN_TRADING_DAYS ? '✅' : '⏳'}`);
    console.log('──────────────────────────────────────────────────────');

    if (state.openPositions.length > 0) {
        console.log(`  Open Positions: ${state.openPositions.length} / ${LIVE_CONFIG.MAX_TOTAL_POSITIONS} max`);
        for (const pos of state.openPositions) {
            const riskPerUnit = Math.abs(pos.initialSl - pos.entryPrice);
            const dir = pos.direction.toUpperCase();
            console.log(`    ${dir} ${pos.pair} @ $${pos.entryPrice.toFixed(4)} | SL: $${pos.sl.toFixed(4)} | MFR: ${pos.maxFavorableR.toFixed(1)}R | Bars: ${pos.barsHeld}`);
        }
    } else {
        console.log('  Open Positions: 0');
    }

    console.log('──────────────────────────────────────────────────────');
    console.log(`  Total Trades: ${state.stats.totalTrades} (${state.stats.wins}W / ${state.stats.losses}L) | Win Rate: ${winRate}%`);
    console.log(`  Total PnL: $${state.stats.totalPnL.toFixed(2)}`);
    console.log(`  Interventions: Lot=${state.stats.lotSizeInterventions} | Lev=${state.stats.leverageInterventions} | DDSkip=${state.stats.dailyDDSkips} | WkndSkip=${state.stats.weekendSkips}`);
    console.log('══════════════════════════════════════════════════════');
    console.log('');
}

function statusEmoji(status) {
    switch (status) {
        case 'ACTIVE': return '🟢';
        case 'PASSED': return '🏆';
        case 'FAILED_DAILY_DD': return '💀';
        case 'FAILED_MAX_DD': return '💀';
        case 'FAILED_TIMEOUT': return '⏰';
        default: return '❓';
    }
}
