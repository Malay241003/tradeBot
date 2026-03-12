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
 * Check for entry signal at 15m bar index `i`
 * Returns signal object or null
 */
export function checkSignal({ pair, symbol, direction, assetClass, candles15m, ind15mArr, candles1h, ind1hArr, i }) {
    // 1. Align 1H candle matching the 15m candle's time
    const c = candles15m[i];
    let h1 = candles1h.length - 1;
    // The closest FULLY CLOSED 1H candle (a 1h candle at T + 1 hr must be <= 15m candle open time)
    // This perfectly aligns with the backtest engine's strict no-look-ahead macro regime logic.
    while (h1 >= 0 && candles1h[h1].time + 60 * 60 * 1000 > c.time) {
        h1--;
    }
    
    if (h1 < 50) return null;

    // 2. 1H Macro Regime Filter
    const hc = candles1h[h1];
    const hi = ind1hArr[h1];
    const macroEma = LIVE_CONFIG.MACRO_EMA || 'ema100';

    if (direction === "short" && hc.close > hi[macroEma]) return null;
    if (direction === "long" && hc.close <= hi[macroEma]) return null;

    // 3. Volatility Expansion (1H)
    if (!volatilityExpansion(candles1h, ind1hArr, h1, assetClass, LIVE_CONFIG)) return null;

    // 4. Setup & Trigger (15m)
    let setup = false;
    let trigger = false;
    let liqOverride = false;

    if (direction === "short") {
        setup = failedBounce15m(candles15m, ind15mArr, i, assetClass, LIVE_CONFIG);
        trigger = rejectionBreakdown(candles15m, i, assetClass, LIVE_CONFIG);
        liqOverride = liquidationProxy(candles15m, i);
    } else {
        setup = failedPullback15m(candles15m, ind15mArr, i, assetClass, LIVE_CONFIG);
        trigger = rejectionBreakout(candles15m, i, assetClass, LIVE_CONFIG);
        liqOverride = bullishLiquidationProxy(candles15m, i);
    }

    if (!setup && !liqOverride) return null;
    if (!trigger && !liqOverride) return null;

    // 5. Entry Calculation
    const entryPrice = c.close;
    let sl;
    let tp;

    if (direction === "short") {
        const opts = Object.assign({}, LIVE_CONFIG, { SL_ATR_BUFFER: LIVE_CONFIG.SL_ATR_BUFFER_SHORT || 0.5 });
        sl = calcSurvivalSL(candles15m, ind15mArr, i, opts);
        const risk = sl - entryPrice;
        if (risk <= 0) return null; // Invalid SL calculation
        tp = entryPrice - risk * LIVE_CONFIG.TP_R;
    } else {
        const opts = Object.assign({}, LIVE_CONFIG, { SL_ATR_BUFFER: LIVE_CONFIG.SL_ATR_BUFFER_LONG || 1.0 });
        sl = calcLongSL(candles15m, ind15mArr, i, opts);
        const risk = entryPrice - sl;
        if (risk <= 0) return null; // Invalid SL calculation
        tp = entryPrice + risk * LIVE_CONFIG.TP_R;
    }

    // ═══════════════════════════════════════
    // RETURN SIGNAL
    // ═══════════════════════════════════════
    return {
        pair,
        symbol,
        direction,
        assetClass,
        entryPrice,
        sl,
        tp,
        setup,
        trigger,
        liquidationOverride: liqOverride,
        signalTime: new Date().toISOString(),
        barTime: c.time,
    };
}
