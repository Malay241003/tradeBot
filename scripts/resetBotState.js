// scripts/resetBotState.js
// One-time script to reset all bot state in Neon DB + local JSON
// Usage: node scripts/resetBotState.js

import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const LOCAL_FILES = [
    './bot/live/data/state.json',
    './bot/live/data/trades_log.json',
    './bot/live/data/daily_summary.json',
    './bot/live/data/scan_log.json',
];

async function reset() {
    console.log('\n🔄 Resetting bot state...\n');

    // 1. Clear Neon PostgreSQL
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
        const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
        try {
            await pool.query('DELETE FROM bot_state');
            await pool.query('DELETE FROM trades');
            await pool.query('DELETE FROM daily_summaries');
            await pool.query('DELETE FROM scan_logs');
            console.log('✅ Neon DB cleared: bot_state, trades, daily_summaries, scan_logs');
            await pool.end();
        } catch (err) {
            console.error('❌ DB error:', err.message);
        }
    } else {
        console.log('⚠️  No DATABASE_URL — skipping DB reset.');
    }

    // 2. Clear local JSON files
    let cleared = 0;
    for (const file of LOCAL_FILES) {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            cleared++;
        }
    }
    console.log(`✅ Local JSON cleared: ${cleared} file(s) deleted`);

    console.log('\n🎉 Bot will start fresh on next launch.\n');
}

reset().catch(err => { console.error('Fatal:', err); process.exit(1); });
