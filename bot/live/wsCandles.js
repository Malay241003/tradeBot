// bot/live/wsCandles.js
// WebSocket-based candle manager for Binance kline streams
// Replaces REST polling with instant push updates for crypto pairs

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import axios from 'axios';

const BINANCE_REST = 'https://api.binance.com';
const BINANCE_WS   = 'wss://stream.binance.com/stream';
const FETCH_COUNT   = 300;       // Initial REST fetch count
const MAX_STORE     = 350;       // Max candles kept in memory (trim buffer)
const INTERVALS     = ['15m', '1h'];

// ═══════════════════════════════════════
// IN-MEMORY CANDLE STORE
// ═══════════════════════════════════════
// Map<symbol, { '15m': candle[], '1h': candle[], current15m: candle|null, current1h: candle|null }>
const store = new Map();

// Event bus — emits 'candleClosed' when a final 15m candle arrives
const events = new EventEmitter();
events.setMaxListeners(100);

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60_000;  // 1 minute max backoff

// ═══════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════

/**
 * Get candles from the in-memory store (populated by WS)
 * Returns closed candles only (not the forming candle)
 */
export function getStoreCandles(symbol, interval) {
    const entry = store.get(symbol);
    if (!entry) return null;
    return entry[interval] || null;
}

/**
 * Get the currently forming (live) candle for real-time price checks
 */
export function getCurrentCandle(symbol, interval) {
    const entry = store.get(symbol);
    if (!entry) return null;
    const key = interval === '1h' ? 'current1h' : 'current15m';
    return entry[key] || null;
}

/**
 * Subscribe to candleClosed events
 * callback receives ({ symbol, interval, candle })
 */
export function onCandleClosed(callback) {
    events.on('candleClosed', callback);
}

/**
 * Boot sequence:
 * 1. REST-fetch initial candles for all symbols
 * 2. Open WebSocket combined stream
 */
export async function boot(cryptoSymbols) {
    console.log(`\n[WS-BOOT] Fetching initial candles for ${cryptoSymbols.length} crypto pairs...`);

    // Fetch initial candles via REST (parallel in batches of 10 to avoid hammering)
    const BATCH_SIZE = 10;
    for (let b = 0; b < cryptoSymbols.length; b += BATCH_SIZE) {
        const batch = cryptoSymbols.slice(b, b + BATCH_SIZE);
        await Promise.all(batch.map(sym => fetchInitialCandles(sym)));
    }

    console.log(`[WS-BOOT] ✅ All ${cryptoSymbols.length} pairs loaded into memory store\n`);

    // Open WebSocket
    connectWebSocket(cryptoSymbols);
}

/**
 * Graceful shutdown
 */
export function shutdown() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
        ws = null;
    }
    events.removeAllListeners();
}

// ═══════════════════════════════════════
// INTERNAL: REST BOOT
// ═══════════════════════════════════════

async function fetchInitialCandles(symbol) {
    const entry = { '15m': [], '1h': [], current15m: null, current1h: null };

    for (const interval of INTERVALS) {
        try {
            const res = await axios.get(`${BINANCE_REST}/api/v3/klines`, {
                params: { symbol, interval, limit: FETCH_COUNT },
                timeout: 10_000,
            });

            const candles = res.data.map(k => ({
                time:   k[0],
                open:   +k[1],
                high:   +k[2],
                low:    +k[3],
                close:  +k[4],
                volume: +k[5],
            }));

            // The last candle might still be forming — separate it
            const now = Date.now();
            const intervalMs = interval === '1h' ? 3_600_000 : 900_000;
            const last = candles[candles.length - 1];

            if (last && now < last.time + intervalMs) {
                // Last candle is still open
                const currentKey = interval === '1h' ? 'current1h' : 'current15m';
                entry[currentKey] = candles.pop();
            }

            entry[interval] = candles;
            console.log(`[WS-BOOT] ${symbol} ${interval}: ${candles.length} closed candles ✓`);

        } catch (err) {
            console.error(`[WS-BOOT] ${symbol} ${interval} REST error: ${err.message}`);
            entry[interval] = [];
        }
    }

    store.set(symbol, entry);
}

// ═══════════════════════════════════════
// INTERNAL: WEBSOCKET
// ═══════════════════════════════════════

function buildStreamUrl(symbols) {
    // Binance combined streams: symbol must be lowercase
    // Format: <symbol>@kline_<interval>
    const streams = [];
    for (const sym of symbols) {
        for (const interval of INTERVALS) {
            streams.push(`${sym.toLowerCase()}@kline_${interval}`);
        }
    }
    return `${BINANCE_WS}?streams=${streams.join('/')}`;
}

function connectWebSocket(symbols) {
    const url = buildStreamUrl(symbols);
    const streamCount = symbols.length * INTERVALS.length;

    console.log(`[WS] Connecting to Binance combined stream (${streamCount} subscriptions)...`);

    ws = new WebSocket(url);

    ws.on('open', () => {
        reconnectAttempts = 0;
        console.log(`[WS] ✅ Connected to Binance combined stream`);
    });

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (!msg.data || !msg.data.k) return;
            handleKline(msg.data);
        } catch (err) {
            // Ignore parse errors for pings/pongs
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[WS] ⚠️ Connection closed (code: ${code}). Reconnecting...`);
        scheduleReconnect(symbols);
    });

    ws.on('error', (err) => {
        console.error(`[WS] ❌ Error: ${err.message}`);
        // 'close' event will fire after this, triggering reconnect
    });

    // Binance drops idle connections after 24h — send pings every 3 minutes
    const pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 3 * 60 * 1000);

    ws.on('close', () => clearInterval(pingInterval));
}

function scheduleReconnect(symbols) {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    console.log(`[WS] Reconnect attempt ${reconnectAttempts} in ${(delay / 1000).toFixed(1)}s`);

    setTimeout(() => {
        if (ws) {
            ws.removeAllListeners();
            ws.terminate();
        }
        connectWebSocket(symbols);
    }, delay);
}

// ═══════════════════════════════════════
// INTERNAL: KLINE MESSAGE HANDLER
// ═══════════════════════════════════════

function handleKline(data) {
    const k = data.k;
    const symbol   = k.s;                     // e.g. "BTCUSDT"
    const interval = k.i;                      // e.g. "15m"
    const isClosed = k.x;                      // true = candle finalized

    const candle = {
        time:   k.t,                           // Open time (ms)
        open:   +k.o,
        high:   +k.h,
        low:    +k.l,
        close:  +k.c,
        volume: +k.v,
    };

    const entry = store.get(symbol);
    if (!entry) return;  // Unknown symbol, skip

    if (isClosed) {
        // ─── CLOSED CANDLE ─────────────────────────
        const arr = entry[interval];
        if (!arr) return;

        // Avoid duplicates (same open time already exists)
        if (arr.length > 0 && arr[arr.length - 1].time === candle.time) {
            arr[arr.length - 1] = candle;  // Update in place
        } else {
            arr.push(candle);
        }

        // Trim to keep memory bounded
        if (arr.length > MAX_STORE) {
            arr.splice(0, arr.length - FETCH_COUNT);
        }

        // Clear the "forming" candle slot
        const currentKey = interval === '1h' ? 'current1h' : 'current15m';
        entry[currentKey] = null;

        // Emit event for 15m closes (triggers scan)
        if (interval === '15m') {
            console.log(`[WS] 🕯️  ${symbol} 15m candle closed @ ${candle.close} — triggering scan`);
            events.emit('candleClosed', { symbol, interval, candle });
        }

    } else {
        // ─── FORMING CANDLE (live tick) ────────────
        const currentKey = interval === '1h' ? 'current1h' : 'current15m';
        entry[currentKey] = candle;
    }
}
