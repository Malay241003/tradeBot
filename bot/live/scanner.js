// bot/live/scanner.js
// Fetches live candle data and checks for entry signals

import { getLiveCandles } from './liveCandles.js';
import { getCandles } from '../adapters/index.js';
import { precomputeIndicators } from '../../shared/precomputeIndicators.js';
import { checkSignal } from './signalEngine.js';
import { LIVE_CONFIG } from './config.js';

// Minimum candle count for indicator warm-up
const MIN_CANDLES_15M = 200;
const MIN_CANDLES_1H = 100;

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

        if (!candles15m || candles15m.length < MIN_CANDLES_15M) {
            return null;
        }
        if (!candles1h || candles1h.length < MIN_CANDLES_1H) {
            return null;
        }

        // Compute indicators
        const ind15mArr = precomputeIndicators(candles15m);
        const ind1hArr = precomputeIndicators(candles1h);

        // Align 1h index to the latest 15m candle
        const latestTime = candles15m[candles15m.length - 1].time;
        let h1 = candles1h.length - 1;
        while (h1 > 0 && candles1h[h1].time > latestTime) h1--;

        if (h1 < 50) return null;

        // Check signal at the LATEST bar only
        const i = candles15m.length - 1;

        const signal = checkSignal({
            pair,
            symbol,
            direction,
            assetClass,
            candles15m,
            candles1h,
            ind15mArr,
            ind1hArr,
            i,
            h1,
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
    const hour = new Date().getUTCHours();
    return hour >= LIVE_CONFIG.US_MARKET_OPEN_UTC && hour < LIVE_CONFIG.US_MARKET_CLOSE_UTC;
}
