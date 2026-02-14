import fs from "fs";

export function exportCSV(perPairStats, globalMetrics) {
  const header =
    "Pair,Trades,WinRate,Expectancy,MaxDrawdownR,AvgTimeInTradeBars\n";

  const rows = perPairStats.map(p =>
    `${p.pair},${p.trades},${p.winRate},${p.expectancy},${p.maxDrawdownR},${p.avgTimeInTradeBars}`
  ).join("\n");

  fs.writeFileSync(
    "./backtest_results.csv",
    header + rows
  );

  fs.writeFileSync(
    "./backtest_summary.json",
    JSON.stringify(globalMetrics, null, 2)
  );
}

/**
 * Export Monte-Carlo DD histogram (Excel-ready)
 */
export function exportMCDDHistogram(histogram) {
  const header = "DrawdownR,Frequency\n";
  const rows = histogram
    .map(h => `${h.drawdownR},${h.frequency}`)
    .join("\n");

  fs.writeFileSync(
    "./monte_carlo_dd.csv",
    header + rows
  );
}

export function exportDiagnosticExpectancy(rows) {
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

  fs.writeFileSync(
    "./diagnostic_expectancy.csv",
    header + "\n" + body
  );
}



export function exportEntryDiagnostics(perPairResults) {
  const header = [
    "Pair",
    "TotalBars",
    "EntriesTaken",
    "Trades",
    "SumR",

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

      d.btcBlocked,
      d.volBlocked,
      d.bounceBlocked,
      d.rejectionBlocked,
      d.liquidationOverride,

      entryRate.toFixed(4),
      expectancyPerTrade.toFixed(4)
    ].join(",");
  }).join("\n");

  fs.writeFileSync(
    "./entry_diagnostics.csv",
    header + "\n" + rows
  );
}

export function exportTradesDetailed(trades) {
  const header = [
    "Pair",
    "EntryTime",
    "ExitTime",
    "EntryPrice",
    "ExitPrice",
    "R",
    "DurationBars",

    "BTC_OK",
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
      t.durationBars,

      t.btcOk ? 1 : 0,
      t.volExpansion ? 1 : 0,
      t.failedBounce ? 1 : 0,
      t.rejection ? 1 : 0,
      t.liquidationOverride ? 1 : 0,

      t.maxFavorableR.toFixed(2),
      t.maxAdverseR.toFixed(2)
    ].join(",")
  ).join("\n");

  fs.writeFileSync(
    "./trades_detailed.csv",
    header + "\n" + rows
  );
}
