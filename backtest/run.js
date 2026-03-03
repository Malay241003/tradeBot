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
import { CRYPTO_TOP100 } from "../bot/universes/crypto_top100.js";
import { CRYPTO_LONG } from "../bot/universes/crypto_long.js";
import { CRYPTO_SHORT } from "../bot/universes/crypto_short.js";

import fs from "fs";

// =======================================
// CLI ARGUMENT PARSING
// =======================================
function parseArgs() {
  const args = process.argv.slice(2);
  let asset = "crypto"; // default
  let direction = "short"; // default
  let universe = "original"; // "original" (14 legacy), "top100", or "validated" (WF-validated)

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

    if (args[i] === "--universe" && args[i + 1]) {
      universe = args[i + 1].toLowerCase();
    } else if (args[i].startsWith("--universe=")) {
      universe = args[i].split("=")[1].toLowerCase();
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

  return { asset, direction, universe };
}

// =======================================
// UNIVERSE BUILDER PER ASSET
// =======================================
async function getUniverse(assetClass, universeType, direction) {
  switch (assetClass) {
    case "crypto": {
      if (universeType === "validated") {
        // Walk-forward validated universe
        const file = `validated_universe_${direction}.json`;
        if (fs.existsSync(file)) {
          const data = JSON.parse(fs.readFileSync(file, "utf8"));
          console.log(`[UNIVERSE] WF-Validated ${direction.toUpperCase()} — ${data.pairs.length} coins`);
          return data.pairs;
        }
        console.warn(`⚠️ ${file} not found, falling back to original universe`);
        return buildUniverse();
      }
      if (universeType === "screened") {
        // All statistically screened coins (before WF pruning) — max trade frequency
        const file = `screened_pairs_${direction}.json`;
        if (fs.existsSync(file)) {
          const pairs = JSON.parse(fs.readFileSync(file, "utf8"));
          console.log(`[UNIVERSE] Screened ${direction.toUpperCase()} — ${pairs.length} coins (pre-WF)`);
          return pairs;
        }
        console.warn(`⚠️ ${file} not found, falling back to original universe`);
        return buildUniverse();
      }
      if (universeType === "top100") {
        console.log(`[UNIVERSE] Crypto Top 100 — ${CRYPTO_TOP100.length} pairs`);
        return CRYPTO_TOP100;
      }
      if (universeType === "legacy") {
        // Old 14-coin hardcoded universe
        return buildUniverse();
      }
      // Default: direction-specific deployment universe (exp ≥ 0.4R filtered)
      if (direction === "long") {
        console.log(`[UNIVERSE] Crypto LONG deployment — ${CRYPTO_LONG.length} coins`);
        return CRYPTO_LONG;
      } else {
        console.log(`[UNIVERSE] Crypto SHORT deployment — ${CRYPTO_SHORT.length} coins`);
        return CRYPTO_SHORT;
      }
    }

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
  // User explicitly requested /results_long/ and /results_short/ separation
  if (asset === "crypto") {
    const dir = `./results_${direction}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // For other assets (stocks/forex), separate by both asset and direction
  const dir = `./results_${asset}_${direction}`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// =======================================
// MAIN BACKTEST
// =======================================
async function runBacktest() {
  const { asset, direction, universe: universeType } = parseArgs();
  const outputDir = getOutputDir(asset, direction);

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  📊  BACKTEST — ${asset.toUpperCase().padEnd(10)} ${direction.toUpperCase().padEnd(27)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  const universe = await getUniverse(asset, universeType, direction);

  let allTrades = [];
  let perPairStats = [];
  let fullResults = [];

  console.log("Universe:", universe);

  // 🔁 BACKTEST EACH PAIR/SYMBOL
  for (const pair of universe) {
    console.log("Backtesting:", pair);

    const result = await backtestPair(pair, {
      assetClass: asset,
      direction,
      ...(DIRECTION_CONFIGS[direction] || {})
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

  // 🔁 WALK-FORWARD (PER PAIR) — only for crypto (needs getBinanceCandles in walkForward.js)
  if (asset === "crypto") {
    console.log("\n===== WALK-FORWARD VALIDATION =====");

    for (const pair of universe) {
      const wf = await walkForward(pair, { direction });
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
  }

  console.log(`\n✅ ${asset.toUpperCase()} backtest complete. Results in: ${outputDir === "." ? "project root" : outputDir}`);
}

runBacktest();
