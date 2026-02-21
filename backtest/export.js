import fs from "fs";

export function exportCSV(perPairStats, globalMetrics, direction = "short") {
  const header =
    "Pair,Trades,WinRate,Expectancy,MaxDrawdownR,AvgTimeInTradeBars\n";

  const rows = perPairStats.map(p =>
    `${p.pair},${p.trades},${p.winRate},${p.expectancy},${p.maxDrawdownR},${p.avgTimeInTradeBars}`
  ).join("\n");

  const suffix = `_${direction}`;

  fs.writeFileSync(
    `./backtest_results${suffix}.csv`,
    header + rows
  );

  fs.writeFileSync(
    `./backtest_summary${suffix}.json`,
    JSON.stringify(globalMetrics, null, 2)
  );
}

/**
 * Export Monte-Carlo DD histogram (Excel-ready)
 */
export function exportMCDDHistogram(histogram, direction = "short") {
  const header = "DrawdownR,Frequency\n";
  const rows = histogram
    .map(h => `${h.drawdownR},${h.frequency}`)
    .join("\n");

  const suffix = `_${direction}`;

  fs.writeFileSync(
    `./monte_carlo_dd${suffix}.csv`,
    header + rows
  );
}

export function exportDiagnosticExpectancy(rows, direction = "short") {
  const header = [
    "Pair",
    "Expectancy",
    "EntryRate",
    "BTCBlockRate",
    "VolBlockRate",
    "BounceBlockRate",
    "RejectionBlockRate",
    "LiquidationSaveRate",
    "ExpectancyPerTrade"
  ].join(",");

  const body = rows.map(r =>
    [
      r.pair,
      r.expectancy,
      r.entryRate.toFixed(4),
      r.btcBlockRate.toFixed(4),
      r.volBlockRate.toFixed(4),
      r.bounceBlockRate.toFixed(4),
      r.rejectionBlockRate.toFixed(4),
      r.liquidationSaveRate.toFixed(4),
      r.expectancyPerTrade.toFixed(4)
    ].join(",")
  ).join("\n");

  const suffix = `_${direction}`;

  fs.writeFileSync(
    `./diagnostic_expectancy${suffix}.csv`,
    header + "\n" + body
  );
}



export function exportEntryDiagnostics(perPairResults, direction = "short") {
  const header = [
    "Pair",
    "TotalBars",
    "EntriesTaken",
    "Trades",
    "SumR",

    "RegimeBlocked",
    "BTCBlocked",
    "VolBlocked",
    "BounceBlocked",
    "RejectionBlocked",
    "LiquidationOverride",

    "EntryRate",
    "ExpectancyPerTrade"
  ].join(",");

  const rows = perPairResults.map(r => {
    const d = r.diagnostics;

    const entryRate =
      d.entriesTaken / Math.max(d.totalBars, 1);

    const expectancyPerTrade =
      d.sumR / Math.max(d.trades, 1);

    return [
      r.pair,
      d.totalBars,
      d.entriesTaken,
      d.trades,
      d.sumR.toFixed(2),

      d.regimeBlocked,
      d.btcBlocked,
      d.volBlocked,
      d.bounceBlocked,
      d.rejectionBlocked,
      d.liquidationOverride,

      entryRate.toFixed(4),
      expectancyPerTrade.toFixed(4)
    ].join(",");
  }).join("\n");

  const suffix = `_${direction}`;

  fs.writeFileSync(
    `./entry_diagnostics${suffix}.csv`,
    header + "\n" + rows
  );
}

export function exportTradesDetailed(trades, direction = "short") {
  const header = [
    "Pair",
    "EntryTime",
    "ExitTime",
    "EntryPrice",
    "ExitPrice",
    "R",
    "GrossR",
    "FeeCostR",
    "SlippageCostR",
    "SpreadCostR",
    "FundingCostR",
    "DurationBars",

    "VolExpansion",
    "FailedBounce",
    "Rejection",
    "LiquidationOverride",

    "MaxFavorableR",
    "MaxAdverseR"
  ].join(",");

  const rows = trades.map(t =>
    [
      t.pair,
      t.entryTime,
      t.exitTime,
      t.entryPrice,
      t.exitPrice,
      t.R.toFixed(2),
      (t.grossR !== undefined ? t.grossR : t.R).toFixed(2),
      (t.feeCostR || 0).toFixed(2),
      (t.slippageCostR || 0).toFixed(2),
      (t.spreadCostR || 0).toFixed(2),
      (t.fundingCostR || 0).toFixed(2),
      t.durationBars,

      t.volExpansion ? 1 : 0,
      t.failedBounce ? 1 : 0,
      t.rejection ? 1 : 0,
      t.liquidationOverride ? 1 : 0,

      t.maxFavorableR.toFixed(2),
      t.maxAdverseR.toFixed(2)
    ].join(",")
  ).join("\n");

  const suffix = `_${direction}`;

  fs.writeFileSync(
    `./trades_detailed${suffix}.csv`,
    header + "\n" + rows
  );
}
// ================================
// EQUITY CURVE EXPORT
// ================================
export function exportEquityCurve(trades, direction = "short") {
  // Sort trades by exit time to build chronological curve
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);

  let equity = 0;
  const curve = sorted.map(t => {
    equity += t.R;
    return `${new Date(t.exitTime).toISOString()},${equity.toFixed(2)}`;
  });

  const header = "Time,EquityR";
  const suffix = `_${direction}`;

  fs.writeFileSync(
    `./equity_curve${suffix}.csv`,
    header + "\n" + curve.join("\n")
  );
}
