// scripts/fetch_top100_twelvedata.js
// Resumable downloader for Top 150 US stocks via TwelveData.
// SAFE to re-run every day — it skips already-completed stocks.
// Exits cleanly when the 800-credit daily limit is hit.

import { getCandles } from "../bot/adapters/index.js";
import fs from "fs";
import path from "path";

// ─── S&P 100 + 50 Growth/Mid-Cap ──────────────────────────────────────────────
const TOP_150_STOCKS = [
    // Mega-cap Tech
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO",
    // Healthcare
    "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "AMGN",
    "GILD", "REGN", "MDT", "SYK", "BSX", "ZTS", "BDX", "ISRG",
    "CI", "ELV", "CVS",
    // Financials
    "JPM", "V", "MA", "WFC", "GS", "SPGI", "BLK", "AXP",
    "SCHW", "MMC", "AON", "CB", "CME", "C", "PNC", "USB",
    "ADP",
    // Consumer
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "TJX", "PM",
    "MO", "CL", "MAR",
    // Energy
    "XOM", "CVX", "COP", "EOG", "SLB", "FCX",
    // Industrials
    "HD", "HON", "CAT", "UNP", "RTX", "GE", "LOW", "LMT",
    "NOC", "ITW", "CSX", "NSC", "EMR", "WM", "APD",
    // Tech / Semi
    "TXN", "IBM", "QCOM", "ORCL", "AMD", "INTC", "CSCO", "ADBE",
    "CRM", "NFLX", "NOW",
    // Comms / Media
    "DIS", "CMCSA", "T",
    // Utilities / REIT
    "SO", "DUK", "AMT", "EQIX",
    // Diversified
    "BRK.B", "BKNG", "VRTX", "PFE", "BA", "MMM",
    // Expansion: 50 Growth / Mid-Cap Tech
    "PANW", "SNPS", "CDNS", "FTNT", "MRVL", "LRCX", "KLAC", "AMAT", "MU", "ON",
    "ABNB", "UBER", "DKNG", "PLTR", "CRWD", "ZS", "SHOP", "MELI", "TTD", "COIN",
    "SNOW", "TEAM", "DASH", "NET", "DDOG", "HUBS", "VEEV", "PAYC", "OKTA", "TWLO",
    "SQ", "PYPL", "WDAY", "APP", "PINS", "SNAP", "ROKU", "SE", "GRAB", "NU",
    "SOFI", "HOOD", "RIVN", "LCID", "NIO", "LI", "XPEV", "BILL", "MNDY", "CELH"
];

const CACHE_DIR = path.join("data", "candles");
const LOG_FILE = "./fetch_progress.json";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadProgress() {
    if (fs.existsSync(LOG_FILE)) {
        try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")); } catch { }
    }
    return { completed: [] };
}

function saveProgress(completed) {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ completed }, null, 2));
}

function cacheExists(symbol, interval) {
    const safe = symbol.replace(/\//g, "");
    return fs.existsSync(path.join(CACHE_DIR, `TD_${safe}_${interval}.json`));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║  📊  TOP 150 US STOCKS  —  TwelveData Downloader    ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);
    console.log(`Note: Free tier = 800 credits/day. Script exits cleanly`);
    console.log(`      when the limit hits and resumes next run.\n`);

    const progress = loadProgress();
    const pending = TOP_150_STOCKS.filter(s => !progress.completed.includes(s));

    console.log(`✅ Completed : ${progress.completed.length}/${TOP_150_STOCKS.length}`);
    console.log(`🔄 Remaining : ${pending.length}\n`);

    if (pending.length === 0) {
        console.log("🎉 All 150 stocks are downloaded. You can run the backtest now.");
        return;
    }

    for (const symbol of pending) {
        console.log(`\n📥 [${symbol}]`);

        // ── 15m ────────────────────────────────────────────────
        console.log(`   -> 15m`);
        let c15 = [];
        try { c15 = await getCandles(symbol, "15m", "stocks"); } catch (e) {
            console.error(`   [15m] error: ${e.message}`);
        }

        // If 0 candles returned AND no cache file → daily limit hit
        if (c15.length === 0 && !cacheExists(symbol, "15m")) {
            console.error(`\n🛑 DAILY CREDIT LIMIT HIT — exiting cleanly.`);
            console.error(`   ${progress.completed.length}/${TOP_150_STOCKS.length} stocks done.`);
            console.error(`   Run this script again tomorrow to continue.\n`);
            process.exit(0);        // clean exit — 0 so npm doesn't flag as error
        }

        // ── 1h ─────────────────────────────────────────────────
        console.log(`   -> 1h`);
        let c1 = [];
        try { c1 = await getCandles(symbol, "1h", "stocks"); } catch (e) {
            console.error(`   [1h] error: ${e.message}`);
        }

        if (c1.length === 0 && !cacheExists(symbol, "1h")) {
            console.error(`\n🛑 DAILY CREDIT LIMIT HIT — exiting cleanly.`);
            console.error(`   ${progress.completed.length}/${TOP_150_STOCKS.length} stocks done.`);
            console.error(`   Run this script again tomorrow to continue.\n`);
            process.exit(0);
        }

        // ── Mark complete ───────────────────────────────────────
        const ok15 = c15.length > 0 || cacheExists(symbol, "15m");
        const ok1h = c1.length > 0 || cacheExists(symbol, "1h");

        if (ok15 && ok1h) {
            progress.completed.push(symbol);
            saveProgress(progress.completed);
            console.log(`   ✅ ${symbol} saved (${progress.completed.length}/${TOP_150_STOCKS.length})`);
        } else {
            console.log(`   ⚠️  ${symbol} — incomplete data, will retry next run.`);
        }
    }

    console.log(`\n🎉 Download complete! All ${TOP_150_STOCKS.length} stocks ready.`);
    console.log(`   Next: run the backtest, then portfolio_optimization.py\n`);
}

run().catch(err => {
    console.error("Fatal:", err.message);
    process.exit(1);
});
