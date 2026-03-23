// bot/live/liveCandles.js
// Lightweight candle fetcher for live mode — in-memory cache, no disk
// Only fetches latest 300 candles (enough for indicator warm-up)
// For crypto: reads from WebSocket in-memory store (instant, no REST call)
// For stocks: reads from TwelveData WS store (top 8) or REST with dual-key rotation

import axios from 'axios';
import { getStoreCandles as getCryptoStoreCandles } from './wsCandles.js';

const BINANCE_BASE = 'https://api.binance.com';
const FETCH_COUNT = 300;   // ~3 days of 15m candles, plenty for EMA200

// Calculate the start time of the most recent candle for a given interval
function getLatestCandleBoundaryMs(interval) {
    const now = Date.now();
    const intervalMs = interval === '1h' ? 60 * 60 * 1000 : 15 * 60 * 1000;
    return now - (now % intervalMs);
}

// In-memory cache
const cache = new Map();
// We no longer use a naive TTL. Instead, we check if the cache was fetched
// *after* the most recent candle closed on the real-world clock.
function isCacheValid(fetchedAt, interval) {
    // If we fetched the data BEFORE the most recent 15m/1h boundary occurred,
    // the cache is STALE because a new candle has definitively closed since then!
    const latestBoundary = getLatestCandleBoundaryMs(interval);
    return fetchedAt > latestBoundary;
}

const INTERVAL_MAP = {
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
};

// ═══════════════════════════════════════
// DUAL API KEY ROTATION (TwelveData)
// ═══════════════════════════════════════
// Rotates between 2 API keys with 30s minimum gap per key
// to reduce ban risk from frequent REST calls.

const TD_RATE_LIMIT = 7;           // Stay under 8/min with 1 buffer
const TD_WINDOW_MS = 60 * 1000;    // 1 minute window

function getTwelveDataKeys() {
    const keys = [];
    const k1 = process.env.TWELVEDATA_API_KEY_1 || process.env.TWELVEDATA_API_KEY;
    const k2 = process.env.TWELVEDATA_API_KEY_2;
    if (k1) keys.push(k1);
    if (k2 && k2 !== 'YOUR_SECOND_KEY_HERE') keys.push(k2);
    return keys;
}

// Per-key tracking: { key: string, lastUsed: number, callTimestamps: number[] }
let keyStates = null;
let currentKeyIndex = 0;

function initKeyStates() {
    if (keyStates) return;
    const keys = getTwelveDataKeys();
    keyStates = keys.map(k => ({
        key: k,
        lastUsed: 0,
        callTimestamps: [],
    }));
    if (keyStates.length === 0) {
        console.error('[RATE] No TwelveData API keys configured');
    } else {
        console.log(`[RATE] TwelveData dual-key rotation: ${keyStates.length} key(s) configured`);
    }
}

let lastCallTime = 0;
const KEY_SWITCH_DELAY_MS = 30_000; // 30s minimum wait when switching to a different key

async function waitForTwelveDataSlot() {
    initKeyStates();
    if (keyStates.length === 0) return null;

    while (true) {
        const now = Date.now();
        let bestKey = null;

        // Clean old timestamps for all keys
        for (const state of keyStates) {
            while (state.callTimestamps.length > 0 && state.callTimestamps[0] < now - TD_WINDOW_MS) {
                state.callTimestamps.shift();
            }
        }

        let ks = keyStates[currentKeyIndex];

        // If current key has capacity, continue using it (Burst mode)
        if (ks.callTimestamps.length < TD_RATE_LIMIT) {
            bestKey = ks;
        } else {
            // Current key is exhausted, try to switch to the other key
            for (let attempt = 1; attempt < keyStates.length; attempt++) {
                const nextIdx = (currentKeyIndex + attempt) % keyStates.length;
                if (keyStates[nextIdx].callTimestamps.length < TD_RATE_LIMIT) {
                    const timeSinceLastCall = now - lastCallTime;
                    // Enforce the 30-second interval when switching keys
                    if (timeSinceLastCall >= KEY_SWITCH_DELAY_MS) {
                        currentKeyIndex = nextIdx;
                        bestKey = keyStates[nextIdx];
                        break;
                    } else {
                        const waitTime = KEY_SWITCH_DELAY_MS - timeSinceLastCall;
                        console.log(`[RATE] Key${currentKeyIndex + 1} exhausted. Switching to Key${nextIdx + 1} — waiting ${(waitTime / 1000).toFixed(1)}s`);
                        await new Promise(r => setTimeout(r, waitTime));
                        return await waitForTwelveDataSlot(); // re-evaluate after waiting
                    }
                }
            }
        }

        if (bestKey) {
            // Apply a tiny 250ms gap between consecutive calls to avoid 429 concurrency errors
            const timeSinceLastCall = Date.now() - lastCallTime;
            if (timeSinceLastCall < 250) {
                await new Promise(r => setTimeout(r, 250 - timeSinceLastCall));
            }

            const reqNow = Date.now();
            bestKey.callTimestamps.push(reqNow);
            bestKey.lastUsed = reqNow;
            lastCallTime = reqNow;
            console.log(`[RATE] Using TwelveData Key${currentKeyIndex + 1} (${bestKey.callTimestamps.length}/${TD_RATE_LIMIT} calls/min)`);
            return bestKey.key;
        }

        // All keys exhaust their 7 calls. Wait for the earliest timestamp to drop off.
        let minWait = Infinity;
        for (const state of keyStates) {
            if (state.callTimestamps.length > 0) {
                const wait = state.callTimestamps[0] + TD_WINDOW_MS - Date.now();
                if (wait < minWait) minWait = wait;
            }
        }
        
        if (minWait <= 0 || minWait === Infinity) minWait = 1000;
        console.log(`[RATE] All TwelveData keys exhausted — waiting ${(minWait / 1000).toFixed(1)}s for limits to reset`);
        await new Promise(r => setTimeout(r, minWait + 100)); // +100ms buffer
    }
}

/**
 * Fetch recent candles — Binance (crypto) or TwelveData (stocks)
 * Uses in-memory cache to avoid redundant API calls within the same scan
 */
export async function getLiveCandles(symbol, interval, assetClass = 'crypto') {
    const key = `${symbol}_${interval}_${assetClass}`;
    const cached = cache.get(key);

    if (cached && isCacheValid(cached.fetchedAt, interval)) {
        return cached.candles;
    }

    let candles;

    if (assetClass === 'crypto') {
        candles = await fetchBinanceLive(symbol, interval);
    } else {
        const apiKey = await waitForTwelveDataSlot();
        if (!apiKey) return [];
        candles = await fetchTwelveDataLive(symbol, interval, apiKey);
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
 * Fetch latest candles from TwelveData (uses rotating API keys)
 */
async function fetchTwelveDataLive(symbol, interval, apiKey) {
    const tdInterval = interval === '15m' ? '15min' : interval;

    try {
        const res = await axios.get('https://api.twelvedata.com/time_series', {
            params: {
                symbol,
                interval: tdInterval,
                outputsize: FETCH_COUNT,
                apikey: apiKey,
                format: 'JSON',
                order: 'ASC',
                timezone: 'UTC',
            },
            timeout: 15000,
        });

        if (res.data.status === 'error') {
            console.error(`[LIVE] TwelveData ${symbol}: ${res.data.message}`);
            return [];
        }

        const candles = (res.data.values || []).map(v => ({
            time: new Date(`${v.datetime.replace(' ', 'T')}Z`).getTime(),
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

/**
 * Unified candle getter — routes crypto to Binance WS, stocks to TD WS or REST
 * This is the primary function used by scanner.js and positionManager.js
 */
export async function getUnifiedCandles(symbol, interval, assetClass = 'crypto') {
    if (assetClass === 'crypto') {
        // Try WS in-memory store first (instant, no REST call)
        const wsCandles = getCryptoStoreCandles(symbol, interval);
        if (wsCandles && wsCandles.length > 0) {
            return wsCandles;
        }
        // Fallback to REST if WS store is empty (shouldn't happen after boot)
        console.log(`[LIVE] WS store empty for ${symbol} ${interval}, falling back to REST`);
        return getLiveCandles(symbol, interval, assetClass);
    }

    // ─── STOCKS: REST with dual-key rotation ───
    return getLiveCandles(symbol, interval, assetClass);
}
