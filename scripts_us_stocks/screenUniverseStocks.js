/**
 * screenUniverseStocks.js
 * 
 * Mass-backtests ALL 100 S&P stocks using FIXED macro params
 * (no optimization — pure strategy edge discovery).
 * 
 * Adapted from the crypto screen_universe.js for the US stock engine.
 * 
 * For each stock, captures:
 *   - Total trades, win rate, expectancy, max drawdown
 *   - Sharpe ratio, Calmar ratio
 *   - Per-period stability (3 time splits)
 *   - Daily R-returns for portfolio construction
 * 
 * Usage:
 *   node scripts_us_stocks/screenUniverseStocks.js --direction=long
 */

import { backtestPair } from "../backtest_us_stocks/engine.js";
import { computeMetrics } from "../backtest_us_stocks/metrics.js";
import { DIRECTION_CONFIGS } from "../backtest_us_stocks/config.js";
import { STOCKS_TOP_100 } from "../bot/universes/stocks.js";
import fs from "fs";
import path from "path";

// ═══════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long"; // default — short is disabled for stocks
}

// ═══════════════════════════════════════════════
// SCREENING METRICS
// ═══════════════════════════════════════════════

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

    // Annualized Sharpe — stocks trade ~252 days/year
    const sharpe = stdDailyR > 0 ? (avgDailyR / stdDailyR) * Math.sqrt(252) : 0;
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
        dailyReturns: dailyR
    };
}

/**
 * Build daily R returns from trade list
 * Stocks: use trading days only (no weekends/holidays — trades only happen on business days)
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

    // Fill zero-return days between first and last trade (trading days only ~ skip weekends)
    const days = [...dailyMap.keys()].sort((a, b) => a - b);
    if (days.length === 0) return [];

    const result = [];
    for (let d = days[0]; d <= days[days.length - 1]; d++) {
        // Skip weekends (Sat=6, Sun=0)
        const date = new Date(d * dayMs);
        const dow = date.getUTCDay();
        if (dow === 0 || dow === 6) continue;

        result.push(dailyMap.get(d) || 0);
    }
    return result;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
    const direction = parseDirection();

    // Output directory
    const outputDir = `./result_us_stocks_${direction}`;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║  🔬  US STOCK SCREENING — ${direction.toUpperCase().padEnd(25)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");
    console.log(`Testing ${STOCKS_TOP_100.length} stocks with FIXED macro params (no optimization)\n`);
    console.log(`Direction config:`, DIRECTION_CONFIGS[direction]);
    console.log("");

    const results = [];
    let processed = 0;
    let skipped = 0;

    for (const symbol of STOCKS_TOP_100) {
        processed++;
        const pct = ((processed / STOCKS_TOP_100.length) * 100).toFixed(0);
        process.stdout.write(`\r[${processed}/${STOCKS_TOP_100.length}] (${pct}%) Screening ${symbol}...         `);

        try {
            const result = await backtestPair(symbol, {
                assetClass: "stocks",
                direction,
                ...(DIRECTION_CONFIGS[direction] || {})
            });

            if (!result || !result.trades || result.trades.length === 0) {
                skipped++;
                continue;
            }

            const metrics = computeScreeningMetrics(result.trades);

            results.push({
                pair: symbol,
                base: symbol,
                direction,
                ...metrics
            });
        } catch (err) {
            console.error(`\n[ERROR] ${symbol}: ${err.message}`);
            skipped++;
        }
    }

    console.log(`\n\n✅ Screening complete.`);
    console.log(`   Processed: ${processed} | With trades: ${results.length} | Skipped: ${skipped}\n`);

    // Sort by expectancy descending
    results.sort((a, b) => b.expectancy - a.expectancy);

    // Display summary table
    console.log("═══════════════════════════════════════════════════════════════════════════════");
    console.log("  #  Stock     Trades  WinRate  Expect.   NetR    MaxDD   Sharpe  Calmar  Stable");
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

    const summaryFile = path.join(outputDir, "screening_results.json");
    fs.writeFileSync(summaryFile, JSON.stringify(outputSummary, null, 2));
    console.log(`📁 Summary: ${summaryFile}`);

    // Save daily returns matrix for portfolio optimization
    const dailyReturnsMatrix = {};
    for (const r of results) {
        dailyReturnsMatrix[r.pair] = r.dailyReturns;
    }
    const returnsFile = path.join(outputDir, "screening_daily_returns.json");
    fs.writeFileSync(returnsFile, JSON.stringify(dailyReturnsMatrix));
    console.log(`📁 Daily returns matrix: ${returnsFile}`);
}

main().catch(err => {
    console.error("❌ Fatal:", err.message);
    process.exit(1);
});
