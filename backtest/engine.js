import { getBinanceCandles } from "../bot/binance.js";
import { toBinanceSymbol } from "../shared/utils.js";
import { precomputeIndicators } from "../shared/precomputeIndicators.js";
import { computeMetrics } from "./metrics.js";
import { CONFIG } from "./config.js";

import {
  volatilityExpansion,
  failedBounce15m,
  rejectionBreakdown,
  calcSurvivalSL
} from "../shared/entry.js";

import {
  initEntryDiagnostics,
  recordBlock,
  recordEntry,
  recordLiquidationOverride,
  bumpBars,
  recordTrade
} from "../shared/entryDiagnostics.js";




import { liquidationProxy } from "../shared/orderBookTrigger.js";



// =======================================
// BACKTEST
// =======================================
export async function backtestPair(pair, opts = {}) {
  const symbol = toBinanceSymbol(pair);
  const diag = initEntryDiagnostics();

  // Use windowed data if provided (walk-forward), otherwise fetch full history
  const candles15m = opts.candles15m || await getBinanceCandles(symbol, "15m", CONFIG.MONTHS);
  const candles1h = opts.candles1h || await getBinanceCandles(symbol, "1h", CONFIG.MONTHS);

  // startOffset: indicator warm-up region. Trades only counted at i >= startOffset.
  // Normal backtest: 120 (default). Walk-forward: trainBars.
  const startOffset = Math.max(120, opts.startOffset || 120);

  if (!candles15m || candles15m.length < startOffset + 100) return null;

  const ind15mArr = precomputeIndicators(candles15m);
  const ind1hArr = precomputeIndicators(candles1h);

  let trades = [];
  let inTrade = false;

  let entry, sl, tp, entryIndex;
  let scaleLevel = 0;
  let positionR = 1;

  let maxFavorableR = 0;
  let maxAdverseR = 0;

  let tradeContext = null;

  let h1 = 0;

  for (let i = startOffset; i < candles15m.length; i++) {
    const c = candles15m[i];

    while (h1 + 1 < candles1h.length && candles1h[h1 + 1].time <= c.time) h1++;

    if (h1 < 50) continue;

    // ===============================
    // MANAGE TRADE
    // ===============================
    if (inTrade) {
      const durationBars = i - entryIndex;

      const riskPerUnit = sl - entry;

      const favorableR = (entry - c.low) / riskPerUnit;
      const adverseR = (c.high - entry) / riskPerUnit;

      maxFavorableR = Math.max(maxFavorableR, favorableR);
      maxAdverseR = Math.max(maxAdverseR, adverseR);

      // SCALE-INS (unchanged)
      if (scaleLevel === 0 && maxFavorableR >= 1 && liquidationProxy(candles15m, i)) {
        positionR += 0.5;
        scaleLevel = 1;
      }

      if (scaleLevel === 1 && maxFavorableR >= 2 && liquidationProxy(candles15m, i)) {
        positionR += 0.25;
        scaleLevel = 2;
      }

      // SL checked before TP — conservative assumption for short trades
      // ❌ STOP LOSS
      if (c.high >= sl) {
        const R = -positionR;

        trades.push({
          ...tradeContext,
          exitTime: c.time,
          exitPrice: sl,
          R,
          durationBars,
          maxFavorableR,
          maxAdverseR
        });

        recordTrade(diag, R);
        inTrade = false;
      }

      // ✅ TAKE PROFIT
      else if (c.low <= tp) {
        const R = CONFIG.TP_R * positionR;

        trades.push({
          ...tradeContext,
          exitTime: c.time,
          exitPrice: tp,
          R,
          durationBars,
          maxFavorableR,
          maxAdverseR
        });

        recordTrade(diag, R);
        inTrade = false;
      }

      continue;
    }

    // ===============================
    // ENTRY (WITH DIAGNOSTICS)
    // ===============================
    bumpBars(diag);



    if (!volatilityExpansion(candles1h, ind1hArr, h1)) {
      recordBlock(diag, "volBlocked");
      continue;
    }

    const failedBounce = failedBounce15m(candles15m, ind15mArr, i);
    const liquidationNow = liquidationProxy(candles15m, i);

    if (!failedBounce && !liquidationNow) {
      recordBlock(diag, "bounceBlocked");
      continue;
    }

    const rejection = rejectionBreakdown(candles15m, i);
    if (!rejection && !liquidationNow) {
      recordBlock(diag, "rejectionBlocked");
      continue;
    }

    if (liquidationNow && (!failedBounce || !rejection)) {
      recordLiquidationOverride(diag);
    }

    recordEntry(diag);

    // ✅ ENTER
    entry = c.close;
    entryIndex = i;
    sl = calcSurvivalSL(candles15m, ind15mArr, i);
    tp = entry - (sl - entry) * CONFIG.TP_R;

    scaleLevel = 0;
    positionR = 1;
    maxFavorableR = 0;
    maxAdverseR = 0;

    tradeContext = {
      pair,
      entryTime: c.time,
      entryPrice: entry,

      failedBounce,
      rejection,
      liquidationOverride: liquidationNow
    };

    inTrade = true;
  }

  return {
    pair,
    trades,
    metrics: computeMetrics(trades),
    diagnostics: diag
  };
}







