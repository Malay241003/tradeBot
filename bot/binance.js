import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ ALWAYS points to tradeBot/data/candles
const CACHE_DIR = path.join(__dirname, "..", "data", "candles");

const BASE = "https://api.binance.com";
const MAX_LIMIT = 1000;

// 🟢 FIXED START DATE: 2018-01-01 UTC
const HISTORY_START_DATE = new Date("2018-01-01T00:00:00Z").getTime();

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Clear all cached candle data.
 * Call this before re-downloading full 2018+ history.
 */
export function clearCandleCache() {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log("[INFO] Historical cache cleared. Re-downloading full history from 2018.");
  }
}

/**
 * Check if cached candles are valid.
 * Accepts data regardless of start date (some coins listed after 2018)
 * and regardless of recency (some coins were delisted, e.g. XMR).
 */
function isCacheValid(candles, interval) {
  if (!Array.isArray(candles) || candles.length === 0) return false;

  const first = candles[0].time;
  const last = candles[candles.length - 1].time;

  // Must have a reasonable amount of data (at least 2000 candles)
  if (candles.length < 2000) return false;

  // Must span at least ~1 year of data
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  if (last - first < ONE_YEAR_MS) return false;

  return true;
}

/**
 * Fetch Binance candles from 2018-01-01 to present.
 * Uses pagination to get full history.
 */
export async function getBinanceCandles(symbol, interval, months = 18) {
  // Note: 'months' param kept for backward compatibility but ignored
  // We always fetch from 2018-01-01

  const file = path.join(CACHE_DIR, `${symbol}_${interval}.json`);

  // ✅ Load + validate cache
  if (fs.existsSync(file)) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, "utf8"));
      if (isCacheValid(cached, interval)) {
        return cached;
      }
    } catch {
      // Invalid cache, will re-fetch
    }
  }

  // 🔁 Fetch fresh from 2018
  const all = [];
  let fetchFrom = HISTORY_START_DATE;
  const now = Date.now();

  console.log(`[FETCH] ${symbol} ${interval} from 2018-01-01...`);

  try {
    while (fetchFrom < now) {
      const res = await axios.get(`${BASE}/api/v3/klines`, {
        params: {
          symbol,
          interval,
          startTime: fetchFrom,
          limit: MAX_LIMIT,
        },
      });

      if (!res.data || res.data.length === 0) break;

      all.push(
        ...res.data.map(c => ({
          time: c[0],
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
          volume: +c[5],
        }))
      );

      fetchFrom = res.data.at(-1)[0] + 1;

      if (res.data.length < MAX_LIMIT) break;

      // Rate limit safety
      await new Promise(r => setTimeout(r, 50));
    }
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ${symbol} ${interval}:`, err.message);
    return [];
  }

  // Deduplicate by timestamp
  const seen = new Set();
  const deduped = all.filter(c => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  });

  // Validate monotonic ordering
  for (let i = 1; i < deduped.length; i++) {
    if (deduped[i].time <= deduped[i - 1].time) {
      console.error(`[WARN] Non-monotonic timestamps in ${symbol} ${interval}`);
      break;
    }
  }

  console.log(`[DONE] ${symbol} ${interval}: ${deduped.length} candles`);

  // 💾 Save refreshed cache
  fs.writeFileSync(file, JSON.stringify(deduped));

  return deduped;
}

export async function isBinanceSymbol(symbol) {
  try {
    const res = await axios.get(`${BASE}/api/v3/klines`, {
      params: {
        symbol,
        interval: "15m",
        limit: 120
      }
    });
    return res.data.length >= 120;
  } catch {
    return false;
  }
}
