export function computeMetrics(trades) {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;

  // New accumulators
  let totalProfit = 0;
  let totalLossAbs = 0;

  for (const t of trades) {
    equity += t.R;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;

    if (t.R > 0) {
      totalProfit += t.R;
    } else if (t.R < 0) {
      totalLossAbs += Math.abs(t.R);
    }
  }

  const wins = trades.filter(t => t.R > 0);
  const winRate = trades.length
    ? wins.length / trades.length
    : 0;

  // User-provided formula logic:
  // avgWinR = Sum(WinR) / Wins (or 1 to avoid NaN)
  // avgLossR = Sum(AbsLossR) / NonWins (Dilute loss over all non-wins including BE)

  const avgWinR = wins.length > 0
    ? wins.reduce((a, b) => a + b.R, 0) / wins.length
    : 0;

  const lossSumAbs = trades
    .filter(t => t.R < 0)
    .reduce((a, b) => a + Math.abs(b.R), 0);

  // Denominator for avgLossR is (Total - Wins), i.e., Losses + BE.
  const nonWinCount = trades.length - wins.length;
  const avgLossR = nonWinCount > 0
    ? lossSumAbs / nonWinCount
    : 0;

  const expectancy =
    winRate * avgWinR - (1 - winRate) * avgLossR;

  const durations = trades.map(t => t.durationBars || 0);
  const avgBars = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);

  const lostTrades = trades.filter(t => t.R < 0).length;

  // Calculate Distribution
  const winDistMap = {};
  const lossDistMap = {};

  for (const t of trades) {
    if (t.R === 0) continue;

    // Group distribution by Gross Price Action R (ignoring fees/slippage for the bucket)
    const displayR = t.grossR !== undefined ? t.grossR : t.R;
    const roundedR = displayR > 0 ? `+${(Math.round(displayR * 100) / 100).toFixed(2)}` : (Math.round(displayR * 100) / 100).toFixed(2);

    if (t.R > 0) {
      winDistMap[`${roundedR}R`] = (winDistMap[`${roundedR}R`] || 0) + 1;
    } else if (t.R < 0) {
      lossDistMap[`${roundedR}R`] = (lossDistMap[`${roundedR}R`] || 0) + 1;
    }
  }

  const winDistribution = {};
  const winEntries = Object.entries(winDistMap).sort((a, b) => (b[1] - a[1]) || (parseFloat(b[0]) - parseFloat(a[0])));
  for (const [rVal, count] of winEntries.slice(0, 5)) {
    const pct = wins.length > 0 ? ((count / wins.length) * 100).toFixed(2) : "0.00";
    winDistribution[rVal] = `${count} (${pct}%)`;
  }
  if (winEntries.length > 5) {
    winDistribution["..."] = `(${winEntries.length - 5} other targets)`;
  }

  const lossDistribution = {};
  const lossEntries = Object.entries(lossDistMap).sort((a, b) => (b[1] - a[1]) || (parseFloat(a[0]) - parseFloat(b[0])));
  for (const [rVal, count] of lossEntries.slice(0, 5)) {
    const pct = lostTrades > 0 ? ((count / lostTrades) * 100).toFixed(2) : "0.00";
    lossDistribution[rVal] = `${count} (${pct}%)`;
  }
  if (lossEntries.length > 5) {
    lossDistribution["..."] = `(${lossEntries.length - 5} other targets)`;
  }

  return {
    trades: trades.length,
    winRate: (winRate * 100).toFixed(2),
    expectancy: expectancy.toFixed(2),
    maxDrawdownR: maxDD.toFixed(2),
    avgTimeInTradeBars: avgBars.toFixed(1),

    // New Variables
    wonTrades: wins.length,
    lostTrades: lostTrades,
    totalProfit: totalProfit.toFixed(2),
    totalLoss: totalLossAbs.toFixed(2),
    netProfit: equity.toFixed(2),
    winDistribution,
    lossDistribution
  };
}
