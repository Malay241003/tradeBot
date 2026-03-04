// bot/live/signalEngine.js
// Reuses shared/entry.js logic for live signal detection

import {
    volatilityExpansion,
    failedBounce15m,
    rejectionBreakdown,
    calcSurvivalSL,
    failedPullback15m,
    rejectionBreakout,
    calcLongSL
} from '../../shared/entry.js';

import { liquidationProxy, bullishLiquidationProxy } from '../../shared/orderBookTrigger.js';
import { LIVE_CONFIG } from './config.js';

/**
 * Check for entry signal at bar index `i`
 * Returns signal object or null
 */
export function checkSignal({ pair, symbol, direction, assetClass, candles15m, candles1h, ind15mArr, ind1hArr, i, h1 }) {

    const opts = {
        MACRO_EMA: LIVE_CONFIG.MACRO_EMA,
        TP_R: LIVE_CONFIG.TP_R,
        SL_ATR_BUFFER: direction === 'short' ? LIVE_CONFIG.SL_ATR_BUFFER_SHORT : LIVE_CONFIG.SL_ATR_BUFFER_LONG,
    };

    // ═══════════════════════════════════════
    // 1. MACRO REGIME FILTER (1H EMA200)
    // ═══════════════════════════════════════
    const hc = candles1h[h1];
    const hi = ind1hArr[h1];
    const macroEma = opts.MACRO_EMA || 'ema100';

    if (direction === 'short' && hc.close > hi[macroEma]) return null;
    if (direction === 'long' && hc.close <= hi[macroEma]) return null;

    // ═══════════════════════════════════════
    // 2. VOLATILITY EXPANSION (1H)
    // ═══════════════════════════════════════
    if (!volatilityExpansion(candles1h, ind1hArr, h1, assetClass, opts)) return null;

    // ═══════════════════════════════════════
    // 3. SETUP + TRIGGER (15M)
    // ═══════════════════════════════════════
    let setup = false;
    let trigger = false;
    let liqOverride = false;

    if (direction === 'short') {
        setup = failedBounce15m(candles15m, ind15mArr, i, assetClass, opts);
        trigger = rejectionBreakdown(candles15m, i, assetClass, opts);
        liqOverride = liquidationProxy(candles15m, i);
    } else {
        setup = failedPullback15m(candles15m, ind15mArr, i, assetClass, opts);
        trigger = rejectionBreakout(candles15m, i, assetClass, opts);
        liqOverride = bullishLiquidationProxy(candles15m, i);
    }

    if (!setup && !liqOverride) return null;
    if (!trigger && !liqOverride) return null;

    // ═══════════════════════════════════════
    // 4. CALCULATE ENTRY, SL, TP
    // ═══════════════════════════════════════
    const entry = candles15m[i].close;
    let sl, tp;

    if (direction === 'short') {
        sl = calcSurvivalSL(candles15m, ind15mArr, i, opts);
        const risk = sl - entry;
        if (risk <= 0) return null; // Invalid SL
        tp = entry - risk * LIVE_CONFIG.TP_R;
    } else {
        sl = calcLongSL(candles15m, ind15mArr, i, opts);
        const risk = entry - sl;
        if (risk <= 0) return null; // Invalid SL
        tp = entry + risk * LIVE_CONFIG.TP_R;
    }

    // ═══════════════════════════════════════
    // 5. RETURN SIGNAL
    // ═══════════════════════════════════════
    return {
        pair,
        symbol,
        direction,
        assetClass,
        entryPrice: entry,
        sl,
        tp,
        setup: !!setup,
        trigger: !!trigger,
        liquidationOverride: !!liqOverride,
        signalTime: new Date().toISOString(),
        barTime: candles15m[i].time,
    };
}
