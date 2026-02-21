// bot/adapters/twelvedata.js
// TwelveData adapter — forex & US stocks historical candles
// Same interface as binance.js: returns [{time, open, high, low, close, volume}]

import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, "..", "..", "data", "candles");
const BASE = "https://api.twelvedata.com";
const API_KEY = process.env.TWELVEDATA_API_KEY;

// Rate limit: 8 calls/min on free tier → 10s gap = 6 calls/min (safe margin)
const RATE_LIMIT_MS = 10000;
let lastCallTime = 0;

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// =======================================
// INTERVAL MAPPING
// =======================================
const INTERVAL_MAP = {
    "15m": "15min",
    "1h": "1h",
    "4h": "4h",
    "1d": "1day"
};

// =======================================
// RATE LIMITER
// =======================================
async function rateLimitWait() {
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (elapsed < RATE_LIMIT_MS) {
        const waitMs = RATE_LIMIT_MS - elapsed;
        await new Promise(r => setTimeout(r, waitMs));
    }
    lastCallTime = Date.now();
}

// =======================================
// RATE-LIMIT-AWARE API CALL
// =======================================
// IMPORTANT: TwelveData counts 429 responses as credits.
// So we NEVER retry on 429 — just wait and try once more.
async function apiCall(url, params) {
    await rateLimitWait();

    try {
        const res = await axios.get(url, { params });

        // Handle rate limit response inside data (429 in JSON body)
        if (res.data?.code === 429 || (res.data?.status === "error" && res.data?.message?.includes("API credits"))) {
            // Don't retry — that burns another credit. Just wait the full minute.
            console.log(`  [TWELVEDATA] Rate limit hit. Pausing 62s (NOT retrying to save credits)...`);
            await new Promise(r => setTimeout(r, 62000));
            lastCallTime = Date.now();

            // Single retry after full minute wait
            await rateLimitWait();
            return await axios.get(url, { params });
        }

        return res;
    } catch (err) {
        if (err.response?.status === 429) {
            console.log(`  [TWELVEDATA] HTTP 429. Pausing 62s (NOT retrying to save credits)...`);
            await new Promise(r => setTimeout(r, 62000));
            lastCallTime = Date.now();

            await rateLimitWait();
            return await axios.get(url, { params });
        }
        throw err;
    }
}

// =======================================
// CACHE VALIDATION
// =======================================
function isCacheValid(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return false;
    if (candles.length < 1000) return false;

    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    return (last - first) >= ONE_YEAR_MS;
}

// =======================================
// SAFE SYMBOL FOR FILENAME
// =======================================
function safeSymbol(symbol) {
    return symbol.replace(/\//g, "");
}

// =======================================
// GET EARLIEST AVAILABLE TIMESTAMP
// =======================================
async function getEarliestTimestamp(symbol, tdInterval) {
    try {
        const res = await apiCall(`${BASE}/earliest_timestamp`, {
            symbol,
            interval: tdInterval,
            apikey: API_KEY
        });

        if (res.data?.datetime) {
            const date = res.data.datetime.split(" ")[0]; // "2020-01-30 18:00:00" → "2020-01-30"
            console.log(`  [TWELVEDATA] ${symbol} earliest data: ${date}`);
            return date;
        }
    } catch (err) {
        console.warn(`  [TWELVEDATA] Could not get earliest timestamp for ${symbol}: ${err.message}`);
    }

    // Fallback: try 2020-01-01 (conservative)
    return "2020-01-01";
}

// =======================================
// FETCH CANDLES FROM TWELVEDATA
// =======================================
export async function getTwelveDataCandles(symbol, interval) {
    if (!API_KEY) {
        console.error("[ERROR] TWELVEDATA_API_KEY not set in .env");
        return [];
    }

    const tdInterval = INTERVAL_MAP[interval] || interval;
    const cacheFile = path.join(CACHE_DIR, `TD_${safeSymbol(symbol)}_${interval}.json`);

    // ✅ Check cache first
    if (fs.existsSync(cacheFile)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
            if (isCacheValid(cached)) {
                console.log(`[TWELVEDATA] ${symbol} ${interval}: ${cached.length} candles (cached)`);
                return cached;
            }
        } catch {
            // Invalid cache, re-fetch
        }
    }

    console.log(`[TWELVEDATA] Fetching ${symbol} ${interval}...`);

    // 1️⃣ Auto-detect earliest available date
    const startDate = await getEarliestTimestamp(symbol, tdInterval);
    console.log(`  [TWELVEDATA] Starting from ${startDate}`);

    const all = [];

    // 2️⃣ Sliding-window pagination
    // TwelveData returns max 5000 candles per call.
    // 24/7 markets (crypto/forex): 15m → ~2880/month → 50 days ≈ 4800
    // Stocks (6.5h/day, ~26 bars/day at 15m): 180 days ≈ 4680
    // 1h intervals can use wider windows since fewer bars per day
    const is24h = tdInterval.includes("min") && !symbol.match(/^[A-Z]{1,5}$/); // forex = has /
    const WINDOW_DAYS = interval === "15m"
        ? (is24h ? 50 : 180)     // 24/7: 50d, stocks: 180d
        : (is24h ? 300 : 900);   // 24/7: 300d, stocks: 900d
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    let windowStart = new Date(startDate);
    const today = new Date();

    try {
        let page = 0;

        while (windowStart < today) {
            const windowEnd = new Date(Math.min(
                windowStart.getTime() + WINDOW_DAYS * MS_PER_DAY,
                today.getTime()
            ));

            const startStr = windowStart.toISOString().split("T")[0];
            const endStr = windowEnd.toISOString().split("T")[0];

            if (startStr === endStr) break;

            const res = await apiCall(`${BASE}/time_series`, {
                symbol,
                interval: tdInterval,
                start_date: startStr,
                end_date: endStr,
                outputsize: 5000,
                apikey: API_KEY,
                format: "JSON",
                order: "ASC"
            });

            // Handle "no data" — skip window, don't break
            if (res.data.status === "error") {
                if (res.data.message?.includes("No data")) {
                    // No data in this window — skip forward
                    windowStart = new Date(windowEnd.getTime() + MS_PER_DAY);
                    page++;
                    continue;
                }
                console.error(`[TWELVEDATA] API Error: ${res.data.message}`);
                break;
            }

            const values = res.data.values;
            if (values && values.length > 0) {
                const parsed = values.map(v => ({
                    time: new Date(v.datetime).getTime(),
                    open: +v.open,
                    high: +v.high,
                    low: +v.low,
                    close: +v.close,
                    volume: +(v.volume || 0)
                }));

                all.push(...parsed);
            }

            // Slide window forward
            windowStart = new Date(windowEnd.getTime() + MS_PER_DAY);
            page++;

            // Log progress every 3 windows
            if (page % 3 === 0) {
                console.log(`  [TWELVEDATA] ${symbol} ${interval}: ${all.length} candles (${startStr} → ${endStr})`);
            }
        }
    } catch (err) {
        console.error(`[TWELVEDATA] Failed to fetch ${symbol} ${interval}:`, err.message);
    }

    // 3️⃣ Deduplicate by timestamp
    const seen = new Set();
    const deduped = all.filter(c => {
        if (seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
    });

    // Sort ascending by time
    deduped.sort((a, b) => a.time - b.time);

    console.log(`[TWELVEDATA] ${symbol} ${interval}: ${deduped.length} candles total`);

    if (deduped.length === 0) {
        console.warn(`[TWELVEDATA] No data for ${symbol} ${interval}. Check symbol and API plan.`);
        return [];
    }

    // 💾 Save to cache
    fs.writeFileSync(cacheFile, JSON.stringify(deduped));

    return deduped;
}

// =======================================
// SYMBOL AVAILABILITY CHECK
// =======================================
export async function isTwelveDataSymbol(symbol) {
    try {
        const res = await apiCall(`${BASE}/time_series`, {
            symbol,
            interval: "1day",
            outputsize: 5,
            apikey: API_KEY
        });
        return res.data.status !== "error" && res.data.values?.length > 0;
    } catch {
        return false;
    }
}
