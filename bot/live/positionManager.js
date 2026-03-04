// bot/live/positionManager.js
// Manages open positions — checks SL/TP/trailing/scale-ins/time exit

import { getLiveCandles } from './liveCandles.js';
import { getCandles } from '../adapters/index.js';
import { precomputeIndicators } from '../../shared/precomputeIndicators.js';
import { liquidationProxy, bullishLiquidationProxy } from '../../shared/orderBookTrigger.js';
import { closePosition } from './paperExec.js';
import { LIVE_CONFIG } from './config.js';

const IS_RENDER = !!process.env.RENDER;

async function fetchCandles(symbol, interval, assetClass) {
    if (IS_RENDER) return getLiveCandles(symbol, interval, assetClass);
    return getCandles(symbol, interval, assetClass);
}

/**
 * Check all open positions against current market prices
 */
export async function checkAllPositions(state) {
    if (state.openPositions.length === 0) return;

    for (const pos of [...state.openPositions]) {
        try {
            await checkPosition(pos, state);
        } catch (err) {
            console.error(`[POSITION] Error checking ${pos.pair}:`, err.message);
        }
    }
}

async function checkPosition(pos, state) {
    const symbol = pos.assetClass === 'crypto' ? pos.pair.replace('B-', '') : pos.symbol;
    const candles15m = await fetchCandles(symbol, '15m', pos.assetClass);

    if (!candles15m || candles15m.length < 10) return;

    const i = candles15m.length - 1;
    const c = candles15m[i];
    const currentPrice = c.close;
    const riskPerUnit = Math.abs(pos.initialSl - pos.entryPrice);

    pos.barsHeld++;

    // Calculate current R
    let favorableR, adverseR;
    if (pos.direction === 'short') {
        favorableR = (pos.entryPrice - c.low) / riskPerUnit;
        adverseR = (c.high - pos.entryPrice) / riskPerUnit;
    } else {
        favorableR = (c.high - pos.entryPrice) / riskPerUnit;
        adverseR = (pos.entryPrice - c.low) / riskPerUnit;
    }

    pos.maxFavorableR = Math.max(pos.maxFavorableR, favorableR);
    pos.maxAdverseR = Math.max(pos.maxAdverseR, adverseR);

    // Trailing stop
    if (LIVE_CONFIG.USE_TRAILING_STOP && pos.maxFavorableR >= LIVE_CONFIG.TRAILING_ACTIVATION_R) {
        const ind15mArr = precomputeIndicators(candles15m);
        if (pos.direction === 'short') {
            pos.tp = -Infinity;
            const newSl = c.high + LIVE_CONFIG.TRAILING_ATR_MULT * ind15mArr[i].atr;
            if (newSl < pos.sl) pos.sl = newSl;
        } else {
            pos.tp = Infinity;
            const newSl = c.low - LIVE_CONFIG.TRAILING_ATR_MULT * ind15mArr[i].atr;
            if (newSl > pos.sl) pos.sl = newSl;
        }
    }

    // Scale-ins
    const isScaleTrigger = pos.direction === 'short'
        ? liquidationProxy(candles15m, i)
        : bullishLiquidationProxy(candles15m, i);

    if (pos.scaleLevel === 0 && pos.maxFavorableR >= 1 && isScaleTrigger) {
        pos.positionR += 0.5;
        pos.scaleLevel = 1;
        console.log(`  📈 SCALE-IN 1 on ${pos.pair} (+0.5R)`);
    }

    if (pos.scaleLevel === 1 && pos.maxFavorableR >= 2 && isScaleTrigger) {
        pos.positionR += 0.25;
        pos.scaleLevel = 2;
        console.log(`  📈 SCALE-IN 2 on ${pos.pair} (+0.25R)`);
    }

    // SL / TP check
    let stoppedOut = false;
    let takeProfit = false;

    if (pos.direction === 'short') {
        if (c.high >= pos.sl) stoppedOut = true;
        else if (c.low <= pos.tp) takeProfit = true;
    } else {
        if (c.low <= pos.sl) stoppedOut = true;
        else if (c.high >= pos.tp) takeProfit = true;
    }

    if (stoppedOut) {
        await closePosition(pos, pos.sl, 'SL_HIT', state);
        return;
    }
    if (takeProfit) {
        await closePosition(pos, pos.tp, 'TP_HIT', state);
        return;
    }

    // Time exit
    if (pos.barsHeld >= LIVE_CONFIG.MAX_BARS_IN_TRADE) {
        await closePosition(pos, currentPrice, 'TIME_EXIT', state);
        return;
    }
}
