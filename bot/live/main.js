// bot/live/main.js
// Live Paper Trading Bot — Entry Point
// Hybrid architecture:
//   • Crypto: WebSocket kline streams → instant scan on candle close
//   • Stocks: Timer-aligned REST scans (TwelveData, every 15 min)
// Includes HTTP server + self-ping to prevent Render free tier from sleeping

import 'dotenv/config';
import http from 'http';
import { LIVE_CONFIG } from './config.js';
import { initDB } from './db.js';
import { loadState, saveState, handleDayRollover, appendScanLog } from './state.js';
import { scanPair, isUSMarketOpen } from './scanner.js';
import * as riskGate from './riskGate.js';
import { enterPosition } from './paperExec.js';
import { checkAllPositions } from './positionManager.js';
import { render } from './dashboard.js';
import * as wsCandles from './wsCandles.js';

// ═══════════════════════════════════════
// UNIVERSE DEFINITION
// ═══════════════════════════════════════
import { CRYPTO_LONG } from '../universes/crypto_long.js';
import { CRYPTO_SHORT } from '../universes/crypto_short.js';
import { STOCKS_LONG } from '../universes/stocks_long.js';

function buildScanList() {
    const list = [];
    for (const pair of CRYPTO_LONG) list.push({ pair, direction: 'long', assetClass: 'crypto' });
    for (const pair of CRYPTO_SHORT) list.push({ pair, direction: 'short', assetClass: 'crypto' });
    for (const stock of STOCKS_LONG) list.push({ pair: stock, direction: 'long', assetClass: 'stocks' });
    return list;
}

const SCAN_LIST = buildScanList();

// Build lookup: Binance symbol → [ { pair, direction } ]
// A symbol like BTCUSDT can appear in both long and short lists
const CRYPTO_SYMBOL_MAP = new Map();
for (const item of SCAN_LIST) {
    if (item.assetClass !== 'crypto') continue;
    const symbol = item.pair.replace('B-', '');
    if (!CRYPTO_SYMBOL_MAP.has(symbol)) CRYPTO_SYMBOL_MAP.set(symbol, []);
    CRYPTO_SYMBOL_MAP.get(symbol).push({ pair: item.pair, direction: item.direction });
}

// Deduplicated Binance symbols for WS subscription
const ALL_CRYPTO_SYMBOLS = [...CRYPTO_SYMBOL_MAP.keys()];

// Stock-only scan list (for timer-based scans with dual-key rotation)
const STOCK_SCAN_LIST = SCAN_LIST.filter(item => item.assetClass === 'stocks');

// ═══════════════════════════════════════
// HTTP SERVER (keeps Render free tier awake)
// ═══════════════════════════════════════
const PORT = process.env.PORT || 10000;
let botState = null; // Reference for health endpoint

function startHttpServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            const status = botState ? botState.status : 'STARTING';
            const balance = botState ? botState.balance.toFixed(2) : '0.00';
            const trades = botState ? botState.stats.totalTrades : 0;
            const scans = botState ? botState.totalScans : 0;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status,
                balance: `$${balance}`,
                trades,
                scans,
                wsConnected: true,
                cryptoSymbols: ALL_CRYPTO_SYMBOLS.length,
                uptime: process.uptime().toFixed(0) + 's',
                timestamp: new Date().toISOString(),
            }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(PORT, () => {
        console.log(`[HTTP] Health server listening on port ${PORT}`);
    });
}

// Self-ping every 13 minutes to prevent Render from sleeping (15 min timeout)
function startSelfPing() {
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
    if (!RENDER_URL) {
        console.log('[PING] No RENDER_EXTERNAL_URL — self-ping disabled (local mode).');
        return;
    }

    const pingUrl = `${RENDER_URL}/health`;
    console.log(`[PING] Self-ping enabled: ${pingUrl} every 13 minutes`);

    setInterval(async () => {
        try {
            const res = await fetch(pingUrl);
            console.log(`[PING] Self-ping: ${res.status}`);
        } catch (err) {
            console.log(`[PING] Self-ping failed: ${err.message}`);
        }
    }, 13 * 60 * 1000); // 13 minutes
}

// ═══════════════════════════════════════
// WEBSOCKET-DRIVEN CRYPTO SCAN
// ═══════════════════════════════════════

/**
 * Queues the scan to avoid concurrent state mutation race conditions
 * when multiple candles close simultaneously.
 */
const cryptoScanQueue = [];
let isProcessingCryptoQueue = false;

async function processCryptoQueue(state) {
    if (isProcessingCryptoQueue) return;
    isProcessingCryptoQueue = true;

    // Check positions ONCE per batch of closed candles to avoid redundant checks
    if (cryptoScanQueue.length > 0 && state.status === 'ACTIVE') {
        await handleDayRollover(state);
        await checkAllPositions(state);
    }

    while (cryptoScanQueue.length > 0) {
        const symbol = cryptoScanQueue.shift();

        if (state.status !== 'ACTIVE') continue;

        const entries = CRYPTO_SYMBOL_MAP.get(symbol);
        if (!entries) continue;

        state.totalScans++;

        let signalsFound = 0;
        let signalsBlocked = 0;
        let signalsEntered = 0;
        const scanDetails = [];

        for (const { pair, direction } of entries) {
            try {
                const signal = await scanPair(pair, direction, 'crypto');
                if (!signal) continue;
                signalsFound++;

                const approval = riskGate.evaluate(signal, state);

                if (!approval.allowed) {
                    signalsBlocked++;
                    scanDetails.push({ pair, direction, assetClass: 'crypto', result: 'BLOCKED', reason: approval.reason });
                    console.log(`  ⛔ ${pair} ${direction}: ${approval.reason}`);
                    continue;
                }

                enterPosition(signal, approval, state);
                signalsEntered++;
                scanDetails.push({
                    pair, direction, assetClass: 'crypto', result: 'ENTERED',
                    entryPrice: signal.entryPrice, sl: signal.sl, tp: signal.tp,
                    risk: approval.riskAmount, adjustments: approval.adjustments,
                });
            } catch (err) {
                console.error(`  [ERROR] ${pair} ${direction}:`, err.message);
            }
        }

        if (signalsFound > 0) {
            await appendScanLog({
                scan: state.totalScans,
                source: 'WS',
                symbol,
                signalsFound, signalsBlocked, signalsEntered,
                openPositions: state.openPositions.length,
                balance: state.balance,
                details: scanDetails,
            });

            render(state);
            console.log(`[WS-SCAN] ${symbol}: Found: ${signalsFound} | Blocked: ${signalsBlocked} | Entered: ${signalsEntered}`);
        }

        await saveState(state);
    }

    isProcessingCryptoQueue = false;
}

function onCryptoCandleClosed({ symbol }, state) {
    if (state.status !== 'ACTIVE') return;
    cryptoScanQueue.push(symbol);
    processCryptoQueue(state).catch(err => {
        console.error(`[WS-QUEUE] Error processing queue:`, err.message);
        isProcessingCryptoQueue = false;
    });
}

// ═══════════════════════════════════════
// TIMER-DRIVEN STOCK + POSITION SCAN
// ═══════════════════════════════════════

/**
 * Timer-aligned scan for stocks only + full position check for all assets.
 * Runs every 15 minutes at :00:10, :15:10, :30:10, :45:10
 */
async function runStockScanCycle(state) {
    if (state.status !== 'ACTIVE') {
        render(state);
        console.log(`[BOT] Challenge is ${state.status}. Bot paused.`);
        return;
    }

    await handleDayRollover(state);

    console.log(`\n[BOT] === STOCK/POSITION SCAN ${new Date().toLocaleTimeString()} ===`);

    // Check ALL open positions (crypto + stocks)
    console.log(`[BOT] Checking ${state.openPositions.length} open positions...`);
    await checkAllPositions(state);

    if (state.status !== 'ACTIVE') {
        render(state);
        return;
    }

    // Scan stocks only (crypto handled by WebSocket events)
    state.totalScans++;

    if (!isUSMarketOpen()) {
        console.log(`[BOT] US market closed — skipping stock scan.`);
        render(state);
        await saveState(state);
        return;
    }

    let signalsFound = 0;
    let signalsBlocked = 0;
    let signalsEntered = 0;
    const scanDetails = [];

    for (const { pair, direction, assetClass } of STOCK_SCAN_LIST) {
        try {
            const signal = await scanPair(pair, direction, assetClass);
            if (!signal) continue;
            signalsFound++;

            const approval = riskGate.evaluate(signal, state);

            if (!approval.allowed) {
                signalsBlocked++;
                scanDetails.push({ pair, direction, assetClass, result: 'BLOCKED', reason: approval.reason });
                console.log(`  ⛔ ${pair} ${direction}: ${approval.reason}`);
                continue;
            }

            enterPosition(signal, approval, state);
            signalsEntered++;
            scanDetails.push({
                pair, direction, assetClass, result: 'ENTERED',
                entryPrice: signal.entryPrice, sl: signal.sl, tp: signal.tp,
                risk: approval.riskAmount, adjustments: approval.adjustments,
            });
        } catch (err) {
            console.error(`  [ERROR] ${pair} ${direction}:`, err.message);
        }
    }

    state.totalScans++;
    await appendScanLog({
        scan: state.totalScans,
        source: 'TIMER',
        signalsFound, signalsBlocked, signalsEntered,
        openPositions: state.openPositions.length,
        balance: state.balance,
        details: scanDetails,
    });

    render(state);
    await saveState(state);

    console.log(`[BOT] Stock scan complete. Found: ${signalsFound} | Blocked: ${signalsBlocked} | Entered: ${signalsEntered}`);
}

// ═══════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════
async function main() {
    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('  🚀 BLUEBERRY FUNDED PAPER TRADING BOT');
    console.log('  ⚡ WebSocket + REST Hybrid Architecture');
    console.log(`  Environment: ${process.env.RENDER ? 'RENDER' : 'LOCAL'}`);
    console.log('══════════════════════════════════════════════════════');
    console.log('');

    // Initialize database (if DATABASE_URL is set)
    const dbOk = await initDB();
    console.log(`[BOT] Database: ${dbOk ? '✅ PostgreSQL connected' : '⚠️  JSON fallback mode'}`);

    console.log(`[BOT] Universe: ${CRYPTO_LONG.length} crypto long + ${CRYPTO_SHORT.length} crypto short + ${STOCKS_LONG.length} stocks long`);
    console.log(`[BOT] Crypto symbols (deduplicated): ${ALL_CRYPTO_SYMBOLS.length}`);
    console.log(`[BOT] Total scan pairs: ${SCAN_LIST.length}`);
    console.log('');

    // Start HTTP server (needed for Render free tier)
    startHttpServer();

    // Start self-ping (prevents sleeping on Render free tier)
    startSelfPing();

    // Load or create state
    const state = await loadState();
    botState = state; // For health endpoint

    render(state);

    // ─── PHASE 1: Boot WebSocket candle store ─────────────
    console.log(`[BOT] Phase 1: Booting WebSocket candle store for ${ALL_CRYPTO_SYMBOLS.length} crypto symbols...`);
    await wsCandles.boot(ALL_CRYPTO_SYMBOLS);

    // ─── PHASE 2: Subscribe to candle close events ─────────
    console.log(`[BOT] Phase 2: Subscribing to WebSocket candle close events...`);
    wsCandles.onCandleClosed((event) => {
        // Queue the candle for processing (avoids concurrent execution races)
        onCryptoCandleClosed(event, state);
    });

    // ─── PHASE 3: Run initial stock scan + position check ──
    console.log(`[BOT] Phase 3: Running initial stock scan + position check...`);
    await runStockScanCycle(state);

    // ─── PHASE 4: Schedule timer for stocks + positions ────
    console.log(`[BOT] Phase 4: Scheduling timer for stock scans + position checks...`);
    scheduleCandleAligned(state);

    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('  ✅ Bot fully started!');
    console.log('  🔌 Crypto: Binance WebSocket (instant on candle close)');
    console.log(`  ⏱️  Stocks: Timer + dual-key rotation (${STOCKS_LONG.length} symbols)`);
    console.log('══════════════════════════════════════════════════════');
    console.log('');
}

/**
 * Align scan timer to 15m candle close + 10 seconds
 * Now only used for stock scans + position management
 */
function scheduleCandleAligned(state) {
    const OFFSET_MS = 10 * 1000;  // 10 seconds after candle close
    const INTERVAL = 15 * 60 * 1000; // 15 minutes

    function msUntilNextCandle() {
        const now = Date.now();
        const elapsed = now % INTERVAL;
        const nextClose = INTERVAL - elapsed;
        return nextClose + OFFSET_MS;
    }

    function scheduleNext() {
        const waitMs = msUntilNextCandle();
        const nextTime = new Date(Date.now() + waitMs);
        const istTime = nextTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
        const waitMin = (waitMs / 60000).toFixed(1);
        console.log(`[BOT] Next stock/position scan at ${istTime} IST (in ${waitMin} min)`);

        setTimeout(async () => {
            await runStockScanCycle(state);
            scheduleNext();
        }, waitMs);
    }

    scheduleNext();
}

process.on('SIGINT', () => {
    console.log('\n[BOT] Shutting down gracefully...');
    wsCandles.shutdown();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[BOT] Uncaught exception:', err);
});

main().catch(err => {
    console.error('[BOT] Fatal error:', err);
    process.exit(1);
});
