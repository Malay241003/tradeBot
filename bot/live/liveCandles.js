// bot/live/liveCandles.js
// Lightweight candle fetcher for live mode — in-memory cache, no disk
// Only fetches latest 300 candles (enough for indicator warm-up)

import axios from 'axios';
import { getTwelveDataCandles } from '../adapters/twelvedata.js';

const BINANCE_BASE = 'https://api.binance.com';
const FETCH_COUNT = 300;   // ~3 days of 15m candles, plenty for EMA200

// In-memory cache with 14-min TTL (refreshes each scan cycle)
const cache = new Map();
const CACHE_TTL_MS = 14 * 60 * 1000;

const INTERVAL_MAP = {
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
};

// ═══════════════════════════════════════
// RATE LIMITER (TwelveData: 8 calls/min on Basic plan)
// ═══════════════════════════════════════
const TD_RATE_LIMIT = 7;           // Stay under 8/min with 1 buffer
const TD_WINDOW_MS = 60 * 1000;    // 1 minute window
const tdCallTimestamps = [];

async function waitForTwelveDataSlot() {
    while (true) {
        const now = Date.now();
        // Remove timestamps older than 1 minute
        while (tdCallTimestamps.length > 0 && tdCallTimestamps[0] < now - TD_WINDOW_MS) {
            tdCallTimestamps.shift();
        }

        if (tdCallTimestamps.length < TD_RATE_LIMIT) {
            tdCallTimestamps.push(now);
            return;
        }

        // Wait until the oldest call falls out of the window
        const waitMs = tdCallTimestamps[0] + TD_WINDOW_MS - now + 100;
        console.log(`[RATE] TwelveData rate limit — waiting ${(waitMs / 1000).toFixed(1)}s`);
        await new Promise(r => setTimeout(r, waitMs));
    }
}

/**
 * Fetch recent candles — Binance (crypto) or TwelveData (stocks)
 * Uses in-memory cache to avoid redundant API calls within the same scan
 */
export async function getLiveCandles(symbol, interval, assetClass = 'crypto') {
    const key = `${symbol}_${interval}_${assetClass}`;
    const cached = cache.get(key);

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.candles;
    }

    let candles;

    if (assetClass === 'crypto') {
        candles = await fetchBinanceLive(symbol, interval);
    } else {
        await waitForTwelveDataSlot();  // Rate limit TwelveData calls
        candles = await fetchTwelveDataLive(symbol, interval);
    }

    if (candles && candles.length > 0) {
        cache.set(key, { candles, fetchedAt: Date.now() });
    }

    return candles;
}

/**
 * Fetch latest candles from Binance public API (no key needed)
 */
async function fetchBinanceLive(symbol, interval) {
    try {
        const res = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
            params: {
                symbol,
                interval: INTERVAL_MAP[interval] || interval,
                limit: FETCH_COUNT,
            },
            timeout: 10000,
        });

        const candles = res.data.map(k => ({
            time: k[0],
            open: +k[1],
            high: +k[2],
            low: +k[3],
            close: +k[4],
            volume: +k[5],
        }));

        console.log(`[LIVE] ${symbol} ${interval}: ${candles.length} candles (Binance)`);
        return candles;

    } catch (err) {
        console.error(`[LIVE] Binance ${symbol} ${interval} error:`, err.message);
        return [];
    }
}

/**
 * Fetch latest candles from TwelveData (needs API key, uses credits)
 */
async function fetchTwelveDataLive(symbol, interval) {
    const API_KEY = process.env.TWELVEDATA_API_KEY;
    if (!API_KEY) {
        console.error('[LIVE] TWELVEDATA_API_KEY not set');
        return [];
    }

    const tdInterval = interval === '15m' ? '15min' : interval;

    try {
        const res = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol,
                interval: tdInterval,
                outputsize: FETCH_COUNT,
                apikey: API_KEY,
                format: 'JSON',
                order: 'ASC',
            },
            timeout: 15000,
        });

        if (res.data.status === 'error') {
            console.error(`[LIVE] TwelveData ${symbol}: ${res.data.message}`);
            return [];
        }

        const candles = (res.data.values || []).map(v => ({
            time: new Date(v.datetime).getTime(),
            open: +v.open,
            high: +v.high,
            low: +v.low,
            close: +v.close,
            volume: +(v.volume || 0),
        }));

        console.log(`[LIVE] ${symbol} ${interval}: ${candles.length} candles (TwelveData)`);
        return candles;

    } catch (err) {
        console.error(`[LIVE] TwelveData ${symbol} ${interval} error:`, err.message);
        return [];
    }
}

/**
 * Clear in-memory cache (useful for testing)
 */
export function clearCache() {
    cache.clear();
}
