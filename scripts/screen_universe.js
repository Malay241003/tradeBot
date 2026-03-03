/**
 * screen_universe.js
 * 
 * Mass-backtests ALL coins in the top-100 universe using FIXED macro params
 * (no optimization — pure strategy edge discovery).
 * 
 * For each coin, captures:
 *   - Total trades, win rate, expectancy, max drawdown
 *   - Sharpe ratio, Calmar ratio
 *   - Per-period stability (3 time splits)
 *   - Daily R-returns for portfolio construction
 * 
 * Usage:
 *   node scripts/screen_universe.js --direction=long
 *   node scripts/screen_universe.js --direction=short
 */

import { backtestPair } from "../backtest/engine.js";
import { computeMetrics } from "../backtest/metrics.js";
import { DIRECTION_CONFIGS } from "../backtest/config.js";
import { CRYPTO_TOP100 } from "../bot/universes/crypto_top100.js";
import fs from "fs";

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long"; // default
}

/**
 * Compute advanced screening metrics from trades
 */
function computeScreeningMetrics(trades) {
    if (!trades || trades.length === 0) {
        return { trades: 0, expectancy: 0, sharpe: 0, maxDD: 0, calmar: 0, winRate: 0 };
    }

    const basic = computeMetrics(trades);

    // Build daily R returns for Sharpe calculation
    const dailyR = buildDailyReturns(trades);
    const avgDailyR = dailyR.reduce((s, r) => s + r, 0) / (dailyR.length || 1);
    const stdDailyR = Math.sqrt(
        dailyR.reduce((s, r) => s + (r - avgDailyR) ** 2, 0) / (dailyR.length || 1)
    );

    const sharpe = stdDailyR > 0 ? (avgDailyR / stdDailyR) * Math.sqrt(365) : 0;
    const maxDD = parseFloat(basic.maxDrawdownR) || 0;
    const netR = parseFloat(basic.netProfit) || 0;
    const calmar = maxDD > 0 ? netR / maxDD : 0;

    // Regime stability: split trades into 3 equal time periods
    const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
    const third = Math.floor(sorted.length / 3);
    const periods = [
        sorted.slice(0, third),
        sorted.slice(third, 2 * third),
        sorted.slice(2 * third)
    ];
    const periodExpectancies = periods.map(p => {
        if (p.length === 0) return 0;
        const totalR = p.reduce((s, t) => s + t.R, 0);
        return totalR / p.length;
    });
    const profitablePeriods = periodExpectancies.filter(e => e > 0).length;

    return {
        trades: trades.length,
        wonTrades: parseInt(basic.wonTrades) || 0,
        lostTrades: parseInt(basic.lostTrades) || 0,
        winRate: parseFloat(basic.winRate) || 0,
        expectancy: parseFloat(basic.expectancy) || 0,
        netR,
        maxDD,
        sharpe: Math.round(sharpe * 100) / 100,
        calmar: Math.round(calmar * 100) / 100,
        avgBars: parseFloat(basic.avgTimeInTradeBars) || 0,
        profitablePeriods,
        periodExpectancies: periodExpectancies.map(e => Math.round(e * 100) / 100),
        dailyReturns: dailyR // Kept for portfolio optimization
    };
}

/**
 * Build daily R returns from trade list
 */
function buildDailyReturns(trades) {
    if (trades.length === 0) return [];

    const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
    const dayMs = 24 * 60 * 60 * 1000;

    // Group trades by exit day
    const dailyMap = new Map();
    for (const t of sorted) {
        const exitTime = t.exitTime || t.entryTime;
        const dayKey = Math.floor(exitTime / dayMs);
        if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, 0);
        dailyMap.set(dayKey, dailyMap.get(dayKey) + t.R);
    }

    // Fill zero-return days between first and last trade
    const days = [...dailyMap.keys()].sort((a, b) => a - b);
    if (days.length === 0) return [];

    const result = [];
    for (let d = days[0]; d <= days[days.length - 1]; d++) {
        result.push(dailyMap.get(d) || 0);
    }
    return result;
}

async function main() {
    const direction = parseDirection();

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║  🔬  UNIVERSE SCREENING — ${direction.toUpperCase().padEnd(25)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");
    console.log(`Testing ${CRYPTO_TOP100.length} coins with FIXED macro params (no optimization)\n`);
    console.log(`Direction config:`, DIRECTION_CONFIGS[direction]);
    console.log("");

    const results = [];
    let processed = 0;
    let skipped = 0;
    let insufficientData = 0;

    for (const pair of CRYPTO_TOP100) {
        processed++;
        const pct = ((processed / CRYPTO_TOP100.length) * 100).toFixed(0);
        process.stdout.write(`\r[${processed}/${CRYPTO_TOP100.length}] (${pct}%) Screening ${pair}...         `);

        try {
            const result = await backtestPair(pair, {
                assetClass: "crypto",
                direction,
                ...(DIRECTION_CONFIGS[direction] || {})
            });

            if (!result || !result.trades || result.trades.length === 0) {
                skipped++;
                continue;
            }

            const metrics = computeScreeningMetrics(result.trades);

            results.push({
                pair,
                base: pair.replace("B-", "").replace("USDT", ""),
                direction,
                ...metrics
            });
        } catch (err) {
            console.error(`\n[ERROR] ${pair}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`\n\n✅ Screening complete.`);
    console.log(`   Processed: ${processed} | With trades: ${results.length} | Skipped: ${skipped}\n`);

    // Sort by expectancy descending
    results.sort((a, b) => b.expectancy - a.expectancy);

    // Display summary table
    console.log("═══════════════════════════════════════════════════════════════════════════════");
    console.log("  #  Coin      Trades  WinRate  Expect.   NetR    MaxDD   Sharpe  Calmar  Stable");
    console.log("═══════════════════════════════════════════════════════════════════════════════");
    results.forEach((r, i) => {
        const stable = `${r.profitablePeriods}/3`;
        console.log(
            `${String(i + 1).padStart(3)}  ${r.base.padEnd(8)}  ${String(r.trades).padStart(5)}  ` +
            `${r.winRate.toFixed(1).padStart(5)}%  ${r.expectancy > 0 ? "+" : ""}${r.expectancy.toFixed(2).padStart(6)}  ` +
            `${r.netR > 0 ? "+" : ""}${r.netR.toFixed(1).padStart(7)}  ${r.maxDD.toFixed(1).padStart(6)}  ` +
            `${r.sharpe.toFixed(2).padStart(6)}  ${r.calmar.toFixed(2).padStart(6)}  ${stable.padStart(5)}`
        );
    });
    console.log("");

    // Save full results (excluding dailyReturns for readability — save those separately)
    const outputSummary = results.map(r => {
        const { dailyReturns, ...rest } = r;
        return rest;
    });

    const summaryFile = `screening_results_${direction}.json`;
    fs.writeFileSync(summaryFile, JSON.stringify(outputSummary, null, 2));
    console.log(`📁 Summary: ${summaryFile}`);

    // Save daily returns matrix for portfolio optimization
    const dailyReturnsMatrix = {};
    for (const r of results) {
        dailyReturnsMatrix[r.pair] = r.dailyReturns;
    }
    const returnsFile = `screening_daily_returns_${direction}.json`;
    fs.writeFileSync(returnsFile, JSON.stringify(dailyReturnsMatrix));
    console.log(`📁 Daily returns matrix: ${returnsFile}`);
}

main().catch(err => {
    console.error("❌ Fatal:", err.message);
    process.exit(1);
});
