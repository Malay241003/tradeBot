/**
 * Walk-Forward Evaluator — Institutional Grade
 *
 * Accept criteria (1-month test windows, rule-based system):
 *   1. ≥50% of windows profitable (with ~1-2 trades/window, noise is high)
 *   2. ≤25% zero-trade windows
 *   3. Max consecutive losing windows < 6 (allows for normal regime periods)
 *   4. Overall WF expectancy > 0 (the aggregate edge must be positive)
 */
export function evaluateWF(wfResult) {
  const windows = wfResult.windowResults;

  let positive = 0;
  let zeroTrade = 0;
  let consecutiveLoss = 0;
  let maxConsecLoss = 0;

  const expectations = [];

  for (const w of windows) {
    if (w.metrics.trades === 0) zeroTrade++;
    expectations.push(+w.metrics.expectancy);

    if (+w.metrics.expectancy > 0) {
      positive++;
      consecutiveLoss = 0;
    } else {
      consecutiveLoss++;
      maxConsecLoss = Math.max(maxConsecLoss, consecutiveLoss);
    }
  }

  // Median expectancy across windows
  const sorted = [...expectations].sort((a, b) => a - b);
  const medianExp = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;

  // Overall WF expectancy (from aggregated trades)
  const overallExp = wfResult.metrics ? +wfResult.metrics.expectancy : 0;

  const positivePct = (positive / windows.length) * 100;

  return {
    windows: windows.length,
    positivePct,
    zeroTradePct: (zeroTrade / windows.length) * 100,
    maxConsecLossWindows: maxConsecLoss,
    medianWindowExpectancy: medianExp.toFixed(2),
    overallExpectancy: overallExp.toFixed(2),
    ACCEPT:
      positivePct >= 50 &&
      zeroTrade / windows.length <= 0.25 &&
      maxConsecLoss < 6 &&
      overallExp > 0
  };
}
