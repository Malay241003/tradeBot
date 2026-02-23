import { getCandles } from "../bot/adapters/index.js";
import { backtestPair } from "./engine.js";
import { computeMetrics } from "./metrics.js";
import { precomputeIndicators } from "../shared_us_stocks/precomputeIndicators.js";

/**
 * Walk-forward validation (NO tuning — rule-based system)
 *
 * For each sliding window:
 *   [0 ... trainBars-1]  →  indicator warm-up only (no trades counted)
 *   [trainBars ... end]  →  test period (trades counted)
 *
 * All candle arrays (15m, 1h, BTC) are sliced to the window's
 * temporal boundaries to prevent ANY look-ahead bias.
 *
 * Windows advance by testBars (non-overlapping test periods).
 */
export async function walkForward(pair, opts = {}) {
  const { monthsTrain = 6, monthsTest = 3, direction = "short", assetClass = "crypto" } = opts;
  const symbol = assetClass === "crypto" ? pair.replace("B-", "") : pair;

  // Fetch all data once (cached on disk)
  const allCandles15m = await getCandles(symbol, "15m", assetClass);
  const allCandles1h = await getCandles(symbol, "1h", assetClass);

  if (!allCandles15m || !allCandles1h || allCandles15m.length === 0 || allCandles1h.length === 0) {
    console.log(`[WF] Skipping ${symbol} due to missing data`);
    return null;
  }

  // Precompute Indicators globally to bypass intensive overlapping recalcs
  const allInd15m = precomputeIndicators(allCandles15m);
  const allInd1h = precomputeIndicators(allCandles1h);

  const barsPerMonth = assetClass === "stocks" ? 22 * 26 : 30 * 24 * 4; // 15m bars: 1950 vs 2880
  const trainBars = Math.floor(monthsTrain * barsPerMonth);
  const testBars = Math.floor(monthsTest * barsPerMonth);

  let wfTrades = [];
  let windowResults = [];
  let window = 0;

  for (
    let start = 0;
    start + trainBars + testBars <= allCandles15m.length;
    start += testBars
  ) {
    window++;

    // ── Slice 15m candles and Indicators: [train | test] ──
    const slice15m = allCandles15m.slice(start, start + trainBars + testBars);
    const sliceInd15m = allInd15m.slice(start, start + trainBars + testBars);

    // Temporal boundaries for this window
    const windowStartTime = slice15m[0].time;
    const windowEndTime = slice15m[slice15m.length - 1].time;

    // ── Slice ALL timeframes to the same temporal window ──
    // Index boundaries
    let idx1hStart = allCandles1h.findIndex(c => c.time >= windowStartTime);
    // Find the last index where time <= windowEndTime
    let idx1hEnd = -1;
    for (let i = allCandles1h.length - 1; i >= 0; i--) {
      if (allCandles1h[i].time <= windowEndTime) {
        idx1hEnd = i;
        break;
      }
    }

    if (idx1hStart === -1 || idx1hEnd === -1 || idx1hStart > idx1hEnd) continue;

    const slice1h = allCandles1h.slice(idx1hStart, idx1hEnd + 1);
    const sliceInd1h = allInd1h.slice(idx1hStart, idx1hEnd + 1);

    // ── Run engine on windowed data ──
    // startOffset = trainBars → engine only generates trades in the test period
    const result = await backtestPair(pair, {
      candles15m: slice15m,
      candles1h: slice1h,
      ind15mArr: sliceInd15m,
      ind1hArr: sliceInd1h,
      assetClass,
      startOffset: trainBars,
      direction,
      ...opts // pass down micro structure overrides if applicable
    });

    if (!result || result.trades.length === 0) continue;

    wfTrades.push(...result.trades);

    windowResults.push({
      window,
      metrics: computeMetrics(result.trades)
    });
  }

  return {
    pair,
    windows: window,
    metrics: computeMetrics(wfTrades),
    trades: wfTrades,
    windowResults
  };
}
