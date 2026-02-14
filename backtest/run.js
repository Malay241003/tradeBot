import { buildUniverse } from "../bot/universe.js";
import { backtestPair } from "./engine.js";
import { computeMetrics } from "./metrics.js";
import { monteCarloDrawdown } from "./monteCarloDD.js";
import { buildHistogram } from "./mcHistogram.js";
import { exportCSV, exportMCDDHistogram } from "./export.js";
import { walkForward } from "./walkForward.js";
import { evaluateWF } from "./wfEvaluator.js";
import { exportEquityCurve } from "./equityCurve.js";
import { correlateDiagnosticsWithExpectancy } from "../analysis/diagnosticExpectancy.js";
import { runTradingAnalytics } from "../analysis/tradingAnalytics.js";
import { exportEntryDiagnostics } from "./export.js";
import { exportTradesDetailed } from "./export.js";


import { exportDiagnosticExpectancy }
  from "./export.js";

async function runBacktest() {
  const universe = await buildUniverse();

  let allTrades = [];
  let perPairStats = [];
  let fullResults = [];


  console.log("Universe:", universe);

  // 🔁 BACKTEST EACH PAIR
  for (const pair of universe) {
    console.log("Backtesting:", pair);

    const result = await backtestPair(pair);
    if (!result) continue;

    allTrades.push(...result.trades);
    fullResults.push(result);

    perPairStats.push({
      pair: result.pair,
      ...result.metrics
    });

    console.log("PAIR SUMMARY:", result.pair, result.metrics);

  }

  // 📊 GLOBAL METRICS
  const globalMetrics = computeMetrics(allTrades);

  console.log("\n===== GLOBAL BACKTEST SUMMARY =====");
  console.log(globalMetrics);

  // 📁 EXPORT RESULTS
  exportCSV(perPairStats, globalMetrics);
  exportEntryDiagnostics(fullResults);
  console.log("Entry diagnostics per pair exported ✔");

  // 🎲 MONTE-CARLO DD (GLOBAL)
  const dds = monteCarloDrawdown(allTrades);
  const hist = buildHistogram(dds, 1);
  exportMCDDHistogram(hist);

  console.log("Monte-Carlo DD histogram exported ✔");

  // 📈 EQUITY CURVE (GLOBAL)
  exportEquityCurve(allTrades);
  console.log("Equity Curve exported ✔");

  exportTradesDetailed(allTrades);
  console.log("Equity TradesDetailed exported ✔");

  // 🔁 WALK-FORWARD (PER PAIR)
  console.log("\n===== WALK-FORWARD VALIDATION =====");

  for (const pair of universe) {
    const wf = await walkForward(pair);
    const verdict = evaluateWF(wf);

    console.log(`WF RESULT (${pair}):`, wf.metrics);
    console.log(`WF VERDICT (${pair}):`, verdict);
  }


  const diagnosticRows =
    correlateDiagnosticsWithExpectancy(fullResults);

  exportDiagnosticExpectancy(diagnosticRows);

  console.log("Diagnostic–Expectancy correlation exported ✔");

  // 📊 TRADING DISTRIBUTION ANALYTICS
  runTradingAnalytics(allTrades);
}

runBacktest();
