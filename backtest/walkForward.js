import { getBinanceCandles } from "../bot/binance.js";
import { toBinanceSymbol } from "../shared/utils.js";
import { backtestPair } from "./engine.js";
import { computeMetrics } from "./metrics.js";

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
  const { monthsTrain = 6, monthsTest = 3, direction = "short" } = opts;
  const symbol = toBinanceSymbol(pair);

  // Fetch all data once (cached on disk)
  const allCandles15m = await getBinanceCandles(symbol, "15m");
  const allCandles1h = await getBinanceCandles(symbol, "1h");
  const allBtc1h = await getBinanceCandles("BTCUSDT", "1h");
  const allBtc4h = await getBinanceCandles("BTCUSDT", "4h");

  const barsPerMonth = 30 * 24 * 4; // 15m bars per month
  const trainBars = monthsTrain * barsPerMonth;
  const testBars = monthsTest * barsPerMonth;

  let wfTrades = [];
  let windowResults = [];
  let window = 0;

  for (
    let start = 0;
    start + trainBars + testBars <= allCandles15m.length;
    start += testBars
  ) {
    window++;

    // ── Slice 15m candles: [train | test] ──
    const slice15m = allCandles15m.slice(
      start,
      start + trainBars + testBars
    );

    // Temporal boundaries for this window
    const windowStartTime = slice15m[0].time;
    const windowEndTime = slice15m[slice15m.length - 1].time;

    // ── Slice ALL timeframes to the same temporal window ──
    // This prevents any future data from leaking into any timeframe
    const slice1h = allCandles1h.filter(
      c => c.time >= windowStartTime && c.time <= windowEndTime
    );
    const sliceBtc1h = allBtc1h.filter(
      c => c.time >= windowStartTime && c.time <= windowEndTime
    );
    const sliceBtc4h = allBtc4h.filter(
      c => c.time >= windowStartTime && c.time <= windowEndTime
    );

    // ── Run engine on windowed data ──
    // startOffset = trainBars → engine only generates trades in the test period
    const result = await backtestPair(pair, {
      candles15m: slice15m,
      candles1h: slice1h,
      btc1h: sliceBtc1h,
      btc4h: sliceBtc4h,
      startOffset: trainBars,
      direction
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
