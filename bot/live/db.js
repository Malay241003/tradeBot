// bot/live/db.js
// PostgreSQL connection + auto table creation (Neon-compatible)

import pg from 'pg';
const { Pool } = pg;

let pool = null;

let dbWarned = false;

export function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            if (!dbWarned) { console.log('[DB] DATABASE_URL not set — using local JSON mode.'); dbWarned = true; }
            return null;
        }
        pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 3,
            idleTimeoutMillis: 30000,
        });
        console.log('[DB] PostgreSQL pool created.');
    }
    return pool;
}

export async function initDB() {
    const p = getPool();
    if (!p) return false;

    try {
        await p.query(`
            CREATE TABLE IF NOT EXISTS bot_state (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS trades (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS daily_summaries (
                id SERIAL PRIMARY KEY,
                date TEXT NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS scan_logs (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log('[DB] Tables verified/created.');
        return true;
    } catch (err) {
        console.error('[DB] Init failed:', err.message);
        return false;
    }
}

// ═══════════════════════════════════════
// STATE OPERATIONS
// ═══════════════════════════════════════

export async function dbLoadState() {
    const p = getPool();
    if (!p) return null;

    const res = await p.query('SELECT data FROM bot_state WHERE id = 1');
    return res.rows.length > 0 ? res.rows[0].data : null;
}

export async function dbSaveState(state) {
    const p = getPool();
    if (!p) return;

    await p.query(`
        INSERT INTO bot_state (id, data, updated_at) VALUES (1, $1, NOW())
        ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()
    `, [JSON.stringify(state)]);
}

// ═══════════════════════════════════════
// LOG OPERATIONS
// ═══════════════════════════════════════

export async function dbAppendTrade(trade) {
    const p = getPool();
    if (!p) return;
    await p.query('INSERT INTO trades (data) VALUES ($1)', [JSON.stringify(trade)]);
}

export async function dbAppendScanLog(entry) {
    const p = getPool();
    if (!p) return;
    await p.query('INSERT INTO scan_logs (data) VALUES ($1)', [JSON.stringify(entry)]);

    // Auto-prune: keep last 1000
    await p.query(`
        DELETE FROM scan_logs WHERE id NOT IN (
            SELECT id FROM scan_logs ORDER BY id DESC LIMIT 1000
        )
    `);
}

export async function dbAppendDailySummary(date, summary) {
    const p = getPool();
    if (!p) return;
    await p.query('INSERT INTO daily_summaries (date, data) VALUES ($1, $2)', [date, JSON.stringify(summary)]);
}
