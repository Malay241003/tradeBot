// bot/live/main.js
// Live Paper Trading Bot — Entry Point
// Scans for signals every 15 minutes, enforces Blueberry Funded rules
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

// ═══════════════════════════════════════
// UNIVERSE DEFINITION
// ═══════════════════════════════════════
import { CRYPTO_LONG } from '../universes/crypto_long.js';
import { CRYPTO_SHORT } from '../universes/crypto_short.js';
import { STOCKS_UNIVERSE } from '../universes/stocks.js';

function buildScanList() {
    const list = [];
    for (const pair of CRYPTO_LONG) list.push({ pair, direction: 'long', assetClass: 'crypto' });
    for (const pair of CRYPTO_SHORT) list.push({ pair, direction: 'short', assetClass: 'crypto' });
    for (const stock of STOCKS_UNIVERSE) list.push({ pair: stock, direction: 'long', assetClass: 'stocks' });
    return list;
}

const SCAN_LIST = buildScanList();

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
// MAIN SCAN CYCLE
// ═══════════════════════════════════════
async function runScanCycle(state) {
    if (state.status !== 'ACTIVE') {
        render(state);
        console.log(`[BOT] Challenge is ${state.status}. Bot paused.`);
        return;
    }

    await handleDayRollover(state);

    console.log(`\n[BOT] === SCAN ${new Date().toLocaleTimeString()} ===`);
    console.log(`[BOT] Checking ${state.openPositions.length} open positions...`);
    await checkAllPositions(state);

    if (state.status !== 'ACTIVE') {
        render(state);
        return;
    }

    let signalsFound = 0;
    let signalsBlocked = 0;
    let signalsEntered = 0;
    const scanDetails = [];

    for (const { pair, direction, assetClass } of SCAN_LIST) {
        if (assetClass === 'stocks' && !isUSMarketOpen()) continue;

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
        signalsFound, signalsBlocked, signalsEntered,
        openPositions: state.openPositions.length,
        balance: state.balance,
        details: scanDetails,
    });

    render(state);
    await saveState(state);

    console.log(`[BOT] Scan complete. Found: ${signalsFound} | Blocked: ${signalsBlocked} | Entered: ${signalsEntered}`);
    console.log(`[BOT] Next scan in ${LIVE_CONFIG.SCAN_INTERVAL_MS / 60000} minutes...`);
}

// ═══════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════
async function main() {
    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('  🚀 BLUEBERRY FUNDED PAPER TRADING BOT');
    console.log(`  Environment: ${process.env.RENDER ? 'RENDER' : 'LOCAL'}`);
    console.log('══════════════════════════════════════════════════════');
    console.log('');

    // Initialize database (if DATABASE_URL is set)
    const dbOk = await initDB();
    console.log(`[BOT] Database: ${dbOk ? '✅ PostgreSQL connected' : '⚠️  JSON fallback mode'}`);

    console.log(`[BOT] Universe: ${CRYPTO_LONG.length} crypto long + ${CRYPTO_SHORT.length} crypto short + ${STOCKS_UNIVERSE.length} stocks long`);
    console.log(`[BOT] Total scan pairs: ${SCAN_LIST.length}`);
    console.log(`[BOT] Scan interval: ${LIVE_CONFIG.SCAN_INTERVAL_MS / 60000} minutes`);
    console.log('');

    // Start HTTP server (needed for Render free tier)
    startHttpServer();

    // Start self-ping (prevents sleeping on Render free tier)
    startSelfPing();

    // Load or create state
    const state = await loadState();
    botState = state; // For health endpoint

    render(state);

    // Run first scan immediately
    await runScanCycle(state);

    // Schedule recurring scans
    setInterval(() => runScanCycle(state), LIVE_CONFIG.SCAN_INTERVAL_MS);
}

process.on('SIGINT', () => {
    console.log('\n[BOT] Shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[BOT] Uncaught exception:', err);
});

main().catch(err => {
    console.error('[BOT] Fatal error:', err);
    process.exit(1);
});
