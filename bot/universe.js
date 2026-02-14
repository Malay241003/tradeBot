import axios from "axios";
import { isBinanceSymbol } from "./binance.js";

const MARKETS_URL = "https://api.coindcx.com/exchange/v1/markets";

// 🟢 FIXED 2018-CLEAN UNIVERSE
// These coins existed on both Binance and major exchanges since 2018.
const CLEAN_2018_UNIVERSE = [
  "BTC", "ETH", "XRP", "LTC", "BCH",
  "ADA", "EOS", "TRX", "XLM", "IOTA",
  "XMR", "DASH", "ZEC", "NEO"
];

/**
 * Build universe as intersection of:
 * 1. Fixed 2018-clean list
 * 2. CoinDCX active USDT markets
 * 3. Binance data availability
 * 
 * Output format: B-BTCUSDT
 */
export async function buildUniverse() {
  console.log("[UNIVERSE] Building 2018-clean intersection...");

  // 1️⃣ Fetch CoinDCX active markets
  let coindcxMarkets;
  try {
    const marketsRes = await axios.get(MARKETS_URL);
    coindcxMarkets = new Set(
      marketsRes.data
        .filter(m => m.endsWith("USDT"))
        .map(m => m.replace("USDT", ""))  // Extract base coin
    );
    console.log(`[UNIVERSE] CoinDCX USDT markets: ${coindcxMarkets.size}`);
  } catch (err) {
    console.error("[UNIVERSE] Failed to fetch CoinDCX markets:", err.message);
    return [];
  }

  // 2️⃣ Filter 2018-clean list against CoinDCX + Binance
  const universe = [];

  for (const coin of CLEAN_2018_UNIVERSE) {
    const symbol = `${coin}USDT`;
    const internalFormat = `B-${symbol}`;

    // Check CoinDCX
    if (!coindcxMarkets.has(coin)) {
      console.log(`[UNIVERSE] ${coin}: Not on CoinDCX, skipping`);
      continue;
    }

    // Check Binance
    const binanceOk = await isBinanceSymbol(symbol);
    if (!binanceOk) {
      console.log(`[UNIVERSE] ${coin}: Not on Binance, skipping`);
      continue;
    }

    console.log(`[UNIVERSE] ${coin}: ✅ Available on both exchanges`);
    universe.push(internalFormat);
  }

  console.log(`[UNIVERSE] Final count: ${universe.length} pairs`);
  return universe;
}
