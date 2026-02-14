export function correlateDiagnosticsWithExpectancy(results) {
  /*
    results = [
      {
        pair,
        metrics: { expectancy, trades, ... },
        diagnostics
      }
    ]
  */

  const rows = [];

  for (const r of results) {
    const d = r.diagnostics;
    const trades = Number(r.metrics.trades) || 0;
    const expectancy = Number(r.metrics.expectancy) || 0;

    rows.push({
      pair: r.pair,

      expectancy,

      entryRate: d.entriesTaken / Math.max(d.totalBars, 1),

      btcBlockRate: d.btcBlocked / Math.max(d.totalBars, 1),
      volBlockRate: d.volBlocked / Math.max(d.totalBars, 1),
      bounceBlockRate: d.bounceBlocked / Math.max(d.totalBars, 1),
      rejectionBlockRate: d.rejectionBlocked / Math.max(d.totalBars, 1),

      liquidationSaveRate:
        d.liquidationOverride / Math.max(d.entriesTaken, 1),

      expectancyPerTrade:
        d.sumR / Math.max(d.trades, 1)
    });
  }

  return rows;
}
