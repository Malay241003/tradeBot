// bot/live/scanner.js
// Fetches live candle data and checks for entry signals

import { getLiveCandles } from './liveCandles.js';
import { getCandles } from '../adapters/index.js';
import { precomputeIndicators } from '../../shared/precomputeIndicators.js';
import { checkSignal } from './signalEngine.js';
import { LIVE_CONFIG } from './config.js';

const MIN_CANDLES_15M = 100;

// Use live fetcher on Render (no disk), full adapter locally
const IS_RENDER = !!process.env.RENDER;

async function fetchCandles(symbol, interval, assetClass) {
    if (IS_RENDER) {
        return getLiveCandles(symbol, interval, assetClass);
    }
    return getCandles(symbol, interval, assetClass);
}

/**
 * Scan a single pair for entry signals
 * @returns {object|null} Signal object or null
 */
export async function scanPair(pair, direction, assetClass) {
    const symbol = assetClass === 'crypto' ? pair.replace('B-', '') : pair;

    try {
        const candles15m = await fetchCandles(symbol, '15m', assetClass);
        const candles1h = await fetchCandles(symbol, '1h', assetClass);

        if (!candles15m || candles15m.length < MIN_CANDLES_15M) return null;
        if (!candles1h || candles1h.length < 50) return null;

        // Compute indicators
        const ind15mArr = precomputeIndicators(candles15m);
        const ind1hArr = precomputeIndicators(candles1h);

        // 1. Find the last FULLY CLOSED 15m candle
        const now = Date.now();
        let i = candles15m.length - 1;
        // A candle is closed if current time >= candle open time + 15 mins
        while (i >= 0 && now < candles15m[i].time + 15 * 60 * 1000) {
            i--;
        }

        if (i < 50) return null;

        const signal = checkSignal({
            pair,
            symbol,
            direction,
            assetClass,
            candles15m,
            ind15mArr,
            candles1h,
            ind1hArr,
            i
        });

        return signal;

    } catch (err) {
        console.error(`[SCANNER] Error scanning ${pair} ${direction}:`, err.message);
        return null;
    }
}

/**
 * Check if current UTC hour is within US market hours
 */
export function isUSMarketOpen() {
    const d = new Date();
    const hour = d.getUTCHours();
    const min = d.getUTCMinutes();
    
    // Core hours: 14:30 UTC to 21:00 UTC (9:30 AM to 4:00 PM EST)
    if (hour < LIVE_CONFIG.US_MARKET_OPEN_UTC) return false;
    if (hour === LIVE_CONFIG.US_MARKET_OPEN_UTC && min < 30) return false;
    if (hour >= LIVE_CONFIG.US_MARKET_CLOSE_UTC) return false;
    
    return true;
}
