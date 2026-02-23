import { buildUniverse } from "../bot/universe.js";
import { backtestPair } from "./engine.js";
import { computeMetrics } from "./metrics.js";
import { monteCarloDrawdown } from "./monteCarloDD.js";
import { runFullMCReport, runCompoundingMC } from "./monteCarloV2.js";
import { buildHistogram } from "./mcHistogram.js";
import { exportCSV, exportMCDDHistogram } from "./export.js";
import { walkForward } from "./walkForward.js";
import { evaluateWF } from "./wfEvaluator.js";
import { exportEquityCurve } from "./equityCurve.js";
import { correlateDiagnosticsWithExpectancy } from "../analysis/diagnosticExpectancy.js";
import { runTradingAnalytics } from "../analysis/tradingAnalytics.js";
import { exportEntryDiagnostics } from "./export.js";
import { exportTradesDetailed } from "./export.js";
import { exportDiagnosticExpectancy } from "./export.js";
import { runPropFirmSimulation } from "./propFirmSim.js";
import { CONFIG, DIRECTION_CONFIGS } from "./config.js";

// 🌎 MULTI-ASSET UNIVERSES
import { FOREX_UNIVERSE } from "../bot/universes/forex.js";
import { STOCKS_UNIVERSE } from "../bot/universes/stocks.js";

import fs from "fs";

// =======================================
// CLI ARGUMENT PARSING
// =======================================
function parseArgs() {
  const args = process.argv.slice(2);
  let asset = "crypto"; // default
  let direction = "short"; // default

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--asset" && args[i + 1]) {
      asset = args[i + 1].toLowerCase();
    } else if (args[i].startsWith("--asset=")) {
      asset = args[i].split("=")[1].toLowerCase();
    }

    if (args[i] === "--direction" && args[i + 1]) {
      direction = args[i + 1].toLowerCase();
    } else if (args[i].startsWith("--direction=")) {
      direction = args[i].split("=")[1].toLowerCase();
    }
  }

  const validAssets = ["crypto", "forex", "stocks"];
  if (!validAssets.includes(asset)) {
    console.error(`❌ Invalid asset class: "${asset}". Valid: ${validAssets.join(", ")}`);
    process.exit(1);
  }

  const validDirs = ["short", "long"];
  if (!validDirs.includes(direction)) {
    console.error(`❌ Invalid direction: "${direction}". Valid: short, long`);
    process.exit(1);
  }

  if (asset === "stocks" && direction === "short") {
    console.error(`❌ The "short" direction is explicitly disabled for US Stocks due to negative Institutional Walk-Forward validation.`);
    process.exit(1);
  }

  return { asset, direction };
}

// =======================================
// UNIVERSE BUILDER PER ASSET
// =======================================
async function getUniverse(assetClass) {
  switch (assetClass) {
    case "crypto":
      return buildUniverse();

    case "forex":
      console.log(`[UNIVERSE] Forex — ${FOREX_UNIVERSE.length} pairs`);
      return FOREX_UNIVERSE;

    case "stocks":
      console.log(`[UNIVERSE] US Stocks — ${STOCKS_UNIVERSE.length} symbols`);
      return STOCKS_UNIVERSE;

    default:
      return [];
  }
}

// =======================================
// OUTPUT DIRECTORY PER ASSET
// =======================================
function getOutputDir(asset, direction) {
  const dir = `./result_us_stocks_${direction}`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// =======================================
// MAIN BACKTEST
// =======================================
async function runBacktest() {
  const { asset, direction } = parseArgs();
  const outputDir = getOutputDir(asset, direction);

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  📊  BACKTEST — ${asset.toUpperCase().padEnd(10)} ${direction.toUpperCase().padEnd(27)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  const universe = await getUniverse(asset);

  let allTrades = [];
  let perPairStats = [];
  let fullResults = [];

  console.log("Universe:", universe);

  // 🔁 BACKTEST EACH PAIR/SYMBOL
  for (const pair of universe) {
    console.log("Backtesting:", pair);

    const overrides = {};
    const result = await backtestPair(pair, {
      assetClass: asset,
      direction,
      ...(DIRECTION_CONFIGS[direction] || {}),
      ...overrides
    });
    if (!result) continue;

    allTrades.push(...result.trades);
    perPairStats.push({
      pair,
      ...result.metrics
    });
    fullResults.push(result);

    console.log("PAIR SUMMARY:", result.pair, result.metrics);
  }

  if (allTrades.length === 0) {
    console.log("\n⚠️  No trades generated. Check data availability and signal parameters.");
    return;
  }

  // 📊 GLOBAL METRICS
  const globalMetrics = computeMetrics(allTrades);

  console.log("\n===== GLOBAL BACKTEST SUMMARY =====");
  console.log(globalMetrics);

  // 📁 EXPORT RESULTS
  const origCwd = process.cwd();
  if (outputDir !== ".") process.chdir(outputDir);

  exportCSV(perPairStats, globalMetrics, direction);
  exportEntryDiagnostics(fullResults, direction);
  console.log(`Entry diagnostics per pair exported (${direction}) ✔`);

  // 🎲 MONTE-CARLO DD (GLOBAL) — Legacy
  const dds = monteCarloDrawdown(allTrades);
  const hist = buildHistogram(dds, 1);
  exportMCDDHistogram(hist, direction);
  console.log("Monte-Carlo DD histogram (legacy) exported ✔");

  // 🎲 MONTE-CARLO V2 — Institutional-Grade Risk Engine
  const mcData = runFullMCReport(allTrades, 200, direction);
  console.log("Monte-Carlo V2 report exported ✔");

  // 💰 5-YEAR COMPOUNDING MC — Capital Projection
  const compoundData = runCompoundingMC(allTrades, { direction });
  console.log("Compounding MC report exported ✔");

  // 🏦 PROP FIRM CHALLENGE SIMULATOR (FUNDING PIPS)
  const propFirmData = runPropFirmSimulation(allTrades, {}, direction);
  console.log("Prop Firm Simulation report exported ✔\n");

  // 📈 EQUITY CURVE (GLOBAL)
  exportEquityCurve(allTrades, direction);
  console.log("Equity Curve exported ✔");

  exportTradesDetailed(allTrades, direction);
  console.log("Trades Detailed exported ✔");

  // 📊 TRADING ANALYTICS (Jupyter/Python style stats)
  runTradingAnalytics(allTrades, direction);

  if (outputDir !== ".") process.chdir(origCwd);

  // 🔁 WALK-FORWARD (PER PAIR)
  console.log("\n===== WALK-FORWARD VALIDATION =====");

  for (const pair of universe) {
    const wf = await walkForward(pair, { direction, assetClass: asset });
    const verdict = evaluateWF(wf);

    console.log(`WF RESULT (${pair}):`, wf.metrics);
    console.log(`WF VERDICT (${pair}):`, verdict);
  }

  const diagnosticRows =
    correlateDiagnosticsWithExpectancy(fullResults);

  // We can export this too if needed, typically correlates to `diagnostic_expectancy.csv`
  // exportDiagnosticExpectancy(diagnosticRows, direction); // Check if available
  if (outputDir !== ".") process.chdir(outputDir);
  exportDiagnosticExpectancy(diagnosticRows, direction);
  if (outputDir !== ".") process.chdir(origCwd);

  console.log("Diagnostic–Expectancy correlation exported ✔");

  console.log(`\n✅ ${asset.toUpperCase()} backtest complete. Results in: ${outputDir === "." ? "project root" : outputDir}`);
}

runBacktest();
