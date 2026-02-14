import "dotenv/config";
import { toBinanceSymbol } from "../shared/utils.js";
import { getOrderBook } from "./fetcher.js";
import { buildUniverse } from "./universe.js";
import { CONFIG } from "./config.js";
import { getBinanceCandles } from "./binance.js";


const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let PAIRS = [];

async function scan(pair) {
  console.log("\nScanning:", pair);

  try {
    const symbol = toBinanceSymbol(pair);
    // ⚠️ LEGACY LOGIC REMOVED
    // The previous strategy used 'weaknessScore' and 'liquidityCheck' which have been removed.
    //TODO: Wiring up new strategy from backtest/engine.js to live bot.
    console.log(`[STUB] Scanning ${pair} - Waiting for new strategy implementation`);
  } catch (err) {
    console.error(`Error on ${pair}:`, err.message);
  }
}

async function scanAll() {
  try {
    if (PAIRS.length === 0) {
      PAIRS = await buildUniverse();
      console.log("Universe built:", PAIRS);
    }

    console.log("\n=== SCAN", new Date().toLocaleTimeString(), "===");

    for (const pair of PAIRS) {
      await scan(pair); // sequential = safe
    }
  } catch (e) {
    console.error("Universe scan error:", e.message);
  }
}

// run immediately
scanAll();

// run every 15 minutes
setInterval(scanAll, INTERVAL_MS);
