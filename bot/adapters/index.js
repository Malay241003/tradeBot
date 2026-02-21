// bot/adapters/index.js
// Adapter router — selects data source based on asset class

import { getBinanceCandles } from "../binance.js";
import { getTwelveDataCandles } from "./twelvedata.js";

/**
 * Unified candle fetcher.
 * Routes to the correct data adapter based on asset class.
 *
 * @param {string} symbol    — e.g. "BTCUSDT", "EUR/USD", "AAPL"
 * @param {string} interval  — e.g. "15m", "1h", "4h"
 * @param {string} assetClass — "crypto" | "forex" | "stocks"
 * @returns {Promise<Array>}  — [{time, open, high, low, close, volume}]
 */
export async function getCandles(symbol, interval, assetClass = "crypto") {
    switch (assetClass) {
        case "crypto":
            return getBinanceCandles(symbol, interval);

        case "forex":
        case "stocks":
            return getTwelveDataCandles(symbol, interval);

        default:
            console.error(`[ADAPTER] Unknown asset class: ${assetClass}`);
            return [];
    }
}
