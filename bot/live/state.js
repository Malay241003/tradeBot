// bot/live/state.js
// Persistent state manager — PostgreSQL (Render) or JSON fallback (local)

import fs from 'fs';
import path from 'path';
import { LIVE_CONFIG } from './config.js';
import { getPool, dbLoadState, dbSaveState, dbAppendTrade, dbAppendScanLog, dbAppendDailySummary } from './db.js';

const DATA_DIR = path.resolve(path.dirname(LIVE_CONFIG.STATE_FILE));
const useDB = () => !!getPool();

function ensureDataDir() {
    if (!useDB() && !fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function createFreshState() {
    const now = new Date();
    return {
        balance: LIVE_CONFIG.INITIAL_BALANCE,
        peakBalance: LIVE_CONFIG.INITIAL_BALANCE,
        dayStartEquity: LIVE_CONFIG.INITIAL_BALANCE,
        currentDay: now.toISOString().split('T')[0],
        uniqueTradingDays: [],
        openPositions: [],
        closedTrades: [],
        status: 'ACTIVE',
        failReason: null,
        startedAt: now.toISOString(),
        lastUpdated: now.toISOString(),
        totalScans: 0,
        stats: {
            totalTrades: 0,
            wins: 0,
            losses: 0,
            totalPnL: 0,
            lotSizeInterventions: 0,
            leverageInterventions: 0,
            dailyDDSkips: 0,
            weekendSkips: 0,
        }
    };
}

export async function loadState() {
    // Try PostgreSQL first
    if (useDB()) {
        try {
            const data = await dbLoadState();
            if (data) {
                console.log(`[STATE] Loaded from DB. Balance: $${data.balance.toFixed(2)}, Status: ${data.status}`);
                return data;
            }
        } catch (err) {
            console.error('[STATE] DB load error:', err.message);
        }
    }

    // Fallback to JSON
    ensureDataDir();
    if (fs.existsSync(LIVE_CONFIG.STATE_FILE)) {
        try {
            const raw = fs.readFileSync(LIVE_CONFIG.STATE_FILE, 'utf-8');
            const state = JSON.parse(raw);
            console.log(`[STATE] Loaded from JSON. Balance: $${state.balance.toFixed(2)}, Status: ${state.status}`);
            return state;
        } catch (err) {
            console.error(`[STATE] JSON load error:`, err.message);
        }
    }

    console.log(`[STATE] No existing state. Starting fresh with $${LIVE_CONFIG.INITIAL_BALANCE}`);
    const state = createFreshState();
    await saveState(state);
    return state;
}

export async function saveState(state) {
    state.lastUpdated = new Date().toISOString();

    // Save to DB
    if (useDB()) {
        try {
            await dbSaveState(state);
        } catch (err) {
            console.error('[STATE] DB save error:', err.message);
        }
    }

    // Always save JSON locally as backup
    ensureDataDir();
    try {
        fs.writeFileSync(LIVE_CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
    } catch { /* ignore on Render ephemeral FS */ }
}

export async function handleDayRollover(state) {
    const today = new Date().toISOString().split('T')[0];

    if (state.currentDay !== today) {
        // New day — recalculate dayStartEquity (higher-of rule)
        state.dayStartEquity = Math.max(state.balance, LIVE_CONFIG.INITIAL_BALANCE);
        state.currentDay = today;

        console.log(`[STATE] Day rollover → ${today}. dayStartEquity = $${state.dayStartEquity.toFixed(2)}`);

        // Log daily summary for the previous day
        await appendDailySummary(state);
        await saveState(state);
    }
}

export function recordTradingDay(state) {
    const today = new Date().toISOString().split('T')[0];
    if (!state.uniqueTradingDays.includes(today)) {
        state.uniqueTradingDays.push(today);
    }
}

export async function updateBalanceAfterTrade(state, netPnL, trade) {
    state.balance += netPnL;
    state.peakBalance = Math.max(state.peakBalance, state.balance);
    state.stats.totalPnL += netPnL;
    state.stats.totalTrades++;

    if (netPnL > 0) state.stats.wins++;
    else state.stats.losses++;

    recordTradingDay(state);

    // Check challenge status
    const passLevel = LIVE_CONFIG.INITIAL_BALANCE * (1 + LIVE_CONFIG.PROFIT_TARGET_PCT);
    const failLevel = LIVE_CONFIG.INITIAL_BALANCE * (1 - LIVE_CONFIG.MAX_TOTAL_DD_PCT);

    if (state.balance >= passLevel && state.uniqueTradingDays.length >= LIVE_CONFIG.MIN_TRADING_DAYS) {
        state.status = 'PASSED';
        state.failReason = null;
        console.log(`\n🎉 CHALLENGE PASSED! Balance: $${state.balance.toFixed(2)} >= $${passLevel.toFixed(2)}`);
    } else if (state.balance <= failLevel) {
        state.status = 'FAILED_MAX_DD';
        state.failReason = `Balance $${state.balance.toFixed(2)} <= $${failLevel.toFixed(2)} (6% static DD)`;
        console.log(`\n💀 CHALLENGE FAILED — Max Static DD. Balance: $${state.balance.toFixed(2)}`);
    }

    // Check daily DD
    const dailyDDLevel = state.dayStartEquity * (1 - LIVE_CONFIG.MAX_DAILY_DD_PCT);
    if (state.balance <= dailyDDLevel) {
        state.status = 'FAILED_DAILY_DD';
        state.failReason = `Balance $${state.balance.toFixed(2)} <= daily limit $${dailyDDLevel.toFixed(2)}`;
        console.log(`\n💀 CHALLENGE FAILED — Daily DD. Balance: $${state.balance.toFixed(2)}`);
    }

    // Add to closed trades
    state.closedTrades.push(trade);

    await saveState(state);
    await appendTradeLog(trade);
}

// ═══════════════════════════════════════
// LOG WRITERS (DB + JSON fallback)
// ═══════════════════════════════════════

export async function appendTradeLog(trade) {
    if (useDB()) {
        try { await dbAppendTrade(trade); } catch (e) { console.error('[STATE] DB trade log error:', e.message); }
    }
    // JSON fallback
    ensureDataDir();
    try {
        let logs = [];
        if (fs.existsSync(LIVE_CONFIG.TRADES_LOG)) {
            try { logs = JSON.parse(fs.readFileSync(LIVE_CONFIG.TRADES_LOG, 'utf-8')); } catch { logs = []; }
        }
        logs.push(trade);
        fs.writeFileSync(LIVE_CONFIG.TRADES_LOG, JSON.stringify(logs, null, 2));
    } catch { /* ignore on Render */ }
}

export async function appendScanLog(entry) {
    const logEntry = { ...entry, timestamp: new Date().toISOString() };

    if (useDB()) {
        try { await dbAppendScanLog(logEntry); } catch (e) { console.error('[STATE] DB scan log error:', e.message); }
    }
    // JSON fallback
    ensureDataDir();
    try {
        let logs = [];
        if (fs.existsSync(LIVE_CONFIG.SCAN_LOG)) {
            try { logs = JSON.parse(fs.readFileSync(LIVE_CONFIG.SCAN_LOG, 'utf-8')); } catch { logs = []; }
        }
        if (logs.length > 1000) logs = logs.slice(-500);
        logs.push(logEntry);
        fs.writeFileSync(LIVE_CONFIG.SCAN_LOG, JSON.stringify(logs, null, 2));
    } catch { /* ignore on Render */ }
}

async function appendDailySummary(state) {
    const summary = {
        date: state.currentDay,
        balance: state.balance,
        dayStartEquity: state.dayStartEquity,
        dailyPnL: state.balance - state.dayStartEquity,
        dailyDDPct: ((state.dayStartEquity - state.balance) / state.dayStartEquity * 100).toFixed(2) + '%',
        openPositions: state.openPositions.length,
        totalTrades: state.stats.totalTrades,
        status: state.status,
    };

    if (useDB()) {
        try { await dbAppendDailySummary(state.currentDay, summary); } catch (e) { console.error('[STATE] DB daily summary error:', e.message); }
    }
    // JSON fallback
    ensureDataDir();
    try {
        let summaries = [];
        if (fs.existsSync(LIVE_CONFIG.DAILY_SUMMARY)) {
            try { summaries = JSON.parse(fs.readFileSync(LIVE_CONFIG.DAILY_SUMMARY, 'utf-8')); } catch { summaries = []; }
        }
        summaries.push(summary);
        fs.writeFileSync(LIVE_CONFIG.DAILY_SUMMARY, JSON.stringify(summaries, null, 2));
    } catch { /* ignore on Render */ }
}

export async function resetState() {
    const state = createFreshState();
    await saveState(state);
    console.log('[STATE] State reset.');
    return state;
}
