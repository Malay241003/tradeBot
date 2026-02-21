import { getCandles } from "../bot/adapters/index.js";
import { precomputeIndicators } from "../shared/precomputeIndicators.js";
import { computeMetrics } from "./metrics.js";
import { CONFIG, DIRECTION_CONFIGS } from "./config.js";

import {
  volatilityExpansion,
  failedBounce15m,
  rejectionBreakdown,
  calcSurvivalSL,
  failedPullback15m,
  rejectionBreakout,
  calcLongSL
} from "../shared/entry.js";

import {
  initEntryDiagnostics,
  recordBlock,
  recordEntry,
  recordLiquidationOverride,
  bumpBars,
  recordTrade
} from "../shared/entryDiagnostics.js";

import { liquidationProxy, bullishLiquidationProxy } from "../shared/orderBookTrigger.js";

// =======================================
// COST CALCULATION HELPER
// =======================================
function applyCosts(grossR, durationBars, entry, sl) {
  const slDistancePct = Math.abs(entry - sl) / entry;
  const feeCostR = (CONFIG.FEE_PCT * 2) / slDistancePct;
  const slippageCostR = (CONFIG.SLIPPAGE_PCT * 2) / slDistancePct;
  const spreadCostR = (CONFIG.SPREAD_PCT) / slDistancePct;
  const fundingCostR = (CONFIG.FUNDING_PER_8H * (durationBars / 32)) / slDistancePct;

  const netR = grossR - feeCostR - slippageCostR - spreadCostR - fundingCostR;
  return { netR, feeCostR, slippageCostR, spreadCostR, fundingCostR };
}

// =======================================
// BACKTEST
// =======================================
export async function backtestPair(pair, opts = {}) {
  const assetClass = opts.assetClass || "crypto";
  const direction = opts.direction || "short"; // "short" (default) or "long"

  // Resolve symbol: crypto uses B-BTCUSDT → BTCUSDT, forex/stocks use pair as-is
  const symbol = assetClass === "crypto" ? pair.replace("B-", "") : pair;
  const diag = initEntryDiagnostics();

  // Use windowed data if provided (walk-forward), otherwise fetch full history
  const candles15m = opts.candles15m || await getCandles(symbol, "15m", assetClass);
  const candles1h = opts.candles1h || await getCandles(symbol, "1h", assetClass);

  // startOffset: indicator warm-up region. Trades only counted at i >= startOffset.
  const startOffset = Math.max(120, opts.startOffset || 120);

  if (!candles15m || candles15m.length < startOffset + 100) return null;

  const ind15mArr = precomputeIndicators(candles15m);
  const ind1hArr = precomputeIndicators(candles1h);

  let trades = [];
  let inTrade = false;

  let entry, sl, tp, entryIndex;
  let scaleLevel = 0;
  let positionR = 1;
  let rAtTp = CONFIG.TP_R;
  let rAtSl = -1;

  let maxFavorableR = 0;
  let maxAdverseR = 0;

  // Resolving Directional Config Defaults
  const TP_R = (opts.TP_R) ? opts.TP_R : (DIRECTION_CONFIGS[direction]?.TP_R || 3.0);

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
      const riskPerUnit = Math.abs(sl - entry); // Works for both Long and Short

      // R Calc depends on direction
      let favorableR, adverseR;

      if (direction === "short") {
        favorableR = (entry - c.low) / riskPerUnit;
        adverseR = (c.high - entry) / riskPerUnit;
      } else {
        favorableR = (c.high - entry) / riskPerUnit;
        adverseR = (entry - c.low) / riskPerUnit;
      }

      maxFavorableR = Math.max(maxFavorableR, favorableR);
      maxAdverseR = Math.max(maxAdverseR, adverseR);

      // SCALE-INS
      // Short: liquidationProxy
      // Long: bullishLiquidationProxy
      const isScaleTrigger = direction === "short"
        ? liquidationProxy(candles15m, i)
        : bullishLiquidationProxy(candles15m, i);

      if (scaleLevel === 0 && maxFavorableR >= 1 && isScaleTrigger) {
        positionR += 0.5;
        scaleLevel = 1;
        rAtTp += 0.5 * (TP_R - 1);
        rAtSl -= 0.5 * 2; // Extra 0.5 drops from +1R to -1R, a loss of 2R -> -1
      }

      if (scaleLevel === 1 && maxFavorableR >= 2 && isScaleTrigger) {
        positionR += 0.25;
        scaleLevel = 2;
        rAtTp += 0.25 * (TP_R - 2);
        rAtSl -= 0.25 * 3; // Extra 0.25 drops from +2R to -1R, a loss of 3R -> -0.75
      }

      // STOP LOSS / TAKE PROFIT CHECK
      let stoppedOut = false;
      let takeProfit = false;

      if (direction === "short") {
        // Short: High hits SL, Low hits TP
        if (c.high >= sl) stoppedOut = true;
        else if (c.low <= tp) takeProfit = true;
      } else {
        // Long: Low hits SL, High hits TP
        if (c.low <= sl) stoppedOut = true;
        else if (c.high >= tp) takeProfit = true;
      }

      if (stoppedOut) {
        const costs = applyCosts(rAtSl, durationBars, entry, sl);

        trades.push({
          ...tradeContext,
          exitTime: c.time,
          exitPrice: sl,
          R: costs.netR,
          grossR: rAtSl,
          ...costs,
          durationBars,
          maxFavorableR,
          maxAdverseR
        });

        recordTrade(diag, costs.netR);
        inTrade = false;
      } else if (takeProfit) {
        const costs = applyCosts(rAtTp, durationBars, entry, sl);

        trades.push({
          ...tradeContext,
          exitTime: c.time,
          exitPrice: tp,
          R: costs.netR,
          grossR: rAtTp,
          ...costs,
          durationBars,
          maxFavorableR,
          maxAdverseR
        });

        recordTrade(diag, costs.netR);
        inTrade = false;
      }

      // Time-based exit? (Max bars)
      if (inTrade && durationBars > CONFIG.MAX_BARS_IN_TRADE) {
        // Force close at Close
        const exitPrice = c.close;
        let baseR = direction === "short" ? (entry - exitPrice) / riskPerUnit : (exitPrice - entry) / riskPerUnit;
        let grossR = baseR;
        if (scaleLevel >= 1) grossR += (baseR - 1) * 0.5;
        if (scaleLevel >= 2) grossR += (baseR - 2) * 0.25;

        const costs = applyCosts(grossR, durationBars, entry, sl);

        trades.push({
          ...tradeContext,
          exitTime: c.time,
          exitPrice,
          R: costs.netR,
          grossR,
          ...costs,
          durationBars,
          maxFavorableR,
          maxAdverseR,
          note: "timeExit"
        });
        recordTrade(diag, costs.netR);
        inTrade = false;
      }

      continue;
    }

    // ===============================
    // ENTRY (WITH DIAGNOSTICS)
    // ===============================
    bumpBars(diag);

    if (!volatilityExpansion(candles1h, ind1hArr, h1, assetClass)) {
      recordBlock(diag, "volBlocked");
      continue;
    }

    let setup = false;
    let trigger = false;
    let liqOverride = false;

    // Check signals based on direction
    if (direction === "short") {
      setup = failedBounce15m(candles15m, ind15mArr, i, assetClass);
      trigger = rejectionBreakdown(candles15m, i, assetClass);
      liqOverride = liquidationProxy(candles15m, i);
    } else {
      setup = failedPullback15m(candles15m, ind15mArr, i, assetClass);
      trigger = rejectionBreakout(candles15m, i, assetClass);
      liqOverride = bullishLiquidationProxy(candles15m, i);
    }

    if (!setup && !liqOverride) {
      recordBlock(diag, "bounceBlocked");
      continue;
    }

    if (!trigger && !liqOverride) {
      recordBlock(diag, "rejectionBlocked");
      continue;
    }

    if (liqOverride && (!setup || !trigger)) {
      recordLiquidationOverride(diag);
    }

    recordEntry(diag);

    // ✅ ENTER
    entry = c.close;
    entryIndex = i;

    // SL / TP Calc
    if (direction === "short") {
      sl = calcSurvivalSL(candles15m, ind15mArr, i);
      const risk = sl - entry;
      // Sanity check for negative risk (in case SL < Entry error)
      if (risk <= 0) continue; // Skip invalid
      if ((risk / entry) < (CONFIG.MIN_SL_PCT || 0)) {
        recordBlock(diag, "tightSlBlocked");
        continue;
      }
      tp = entry - risk * TP_R;
    } else {
      sl = calcLongSL(candles15m, ind15mArr, i);
      const risk = entry - sl;
      if (risk <= 0) continue;
      if ((risk / entry) < (CONFIG.MIN_SL_PCT || 0)) {
        recordBlock(diag, "tightSlBlocked");
        continue;
      }
      tp = entry + risk * TP_R;
    }

    scaleLevel = 0;
    positionR = 1;
    rAtTp = TP_R;
    rAtSl = -1;
    maxFavorableR = 0;
    maxAdverseR = 0;

    tradeContext = {
      pair,
      direction,
      entryTime: c.time,
      entryPrice: entry,
      sl,
      tp,
      setup,
      trigger,
      liquidationOverride: liqOverride
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







