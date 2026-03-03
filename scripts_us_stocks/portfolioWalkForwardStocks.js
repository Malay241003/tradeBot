/**
 * portfolioWalkForwardStocks.js
 * 
 * Portfolio-level walk-forward validation for US stocks.
 * 
 * Unlike per-stock WF (which tests each stock independently), this script:
 *   1. Runs WF on EACH stock in the optimized portfolio
 *   2. Aggregates trades across all stocks per window (portfolio view)
 *   3. Applies portfolio weights to compute weighted R returns
 *   4. Grades the PORTFOLIO as a whole — not individual stocks
 * 
 * If a stock fails WF, it's removed and the portfolio is re-weighted.
 * This is the FINAL "is the portfolio real?" test.
 * 
 * Adapted from the crypto portfolioWalkForward.js for the US stock engine:
 *   - Uses backtest_us_stocks/walkForward.js and engine.js
 *   - Window sizing: 4mo train / 2mo test (stocks have fewer bars/month)
 *   - Reports Sharpe decay (in-sample vs out-of-sample)
 * 
 * Usage:
 *   node scripts_us_stocks/portfolioWalkForwardStocks.js --direction=long
 */

import { walkForward } from "../backtest_us_stocks/walkForward.js";
import { evaluateWF } from "../backtest_us_stocks/wfEvaluator.js";
import { DIRECTION_CONFIGS } from "../backtest_us_stocks/config.js";
import { SECTOR_MAP } from "./statisticalScreenStocks.js";
import fs from "fs";
import path from "path";

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long";
}

/**
 * Compute portfolio-level metrics from aggregated window trades
 */
function portfolioWindowMetrics(windowTradesMap, weights) {
    const windows = new Map(); // windowIndex → { totalR, trades }

    for (const [pair, wfResult] of Object.entries(windowTradesMap)) {
        const weight = weights[pair] || (1 / Object.keys(windowTradesMap).length);

        for (const wr of wfResult.windowResults) {
            if (!windows.has(wr.window)) {
                windows.set(wr.window, { totalWeightedR: 0, trades: 0, coinCount: 0 });
            }
            const w = windows.get(wr.window);
            const windowExp = parseFloat(wr.metrics.expectancy) || 0;
            const windowTrades = parseInt(wr.metrics.trades) || 0;
            w.totalWeightedR += windowExp * weight * windowTrades;
            w.trades += windowTrades;
            w.coinCount++;
        }
    }

    return windows;
}

async function main() {
    const direction = parseDirection();

    const outputDir = `./result_us_stocks_${direction}`;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log(`║  🔄  STOCK PORTFOLIO WALK-FORWARD — ${direction.toUpperCase().padEnd(23)}║`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // Load deployment universe with weights
    const deployFile = path.join(outputDir, "deployment_universe.json");
    if (!fs.existsSync(deployFile)) {
        console.error(`❌ ${deployFile} not found. Run portfolioOptimizerStocks.js first.`);
        process.exit(1);
    }

    const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
    const pairs = deployment.pairs;
    const weightMap = {};
    for (const a of deployment.allocations) {
        weightMap[a.pair] = a.weight;
    }

    console.log(`📊 Portfolio: ${pairs.length} stocks (${deployment.method})`);
    console.log(`   Direction: ${direction}`);
    console.log(`   Walk-Forward: 4mo train / 2mo test rolling windows\n`);

    // ══════════════════════════════════════════════
    // PHASE 1: Per-Stock Walk-Forward
    // ══════════════════════════════════════════════
    console.log("━━━ PHASE 1: Per-Stock Walk-Forward Validation ━━━\n");

    const stockWF = {};
    const stockVerdicts = {};
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const sector = SECTOR_MAP[pair] || "Unknown";
        process.stdout.write(`  [${i + 1}/${pairs.length}] ${pair.padEnd(8)} [${sector}] ... `);

        try {
            const wf = await walkForward(pair, {
                direction,
                assetClass: "stocks",
                monthsTrain: 4,
                monthsTest: 2,
                ...DIRECTION_CONFIGS[direction]
            });

            if (!wf || !wf.windowResults || wf.windowResults.length === 0) {
                console.log(`❌ FAIL — no WF windows`);
                failed++;
                continue;
            }

            const verdict = evaluateWF(wf);
            stockWF[pair] = wf;
            stockVerdicts[pair] = verdict;

            const status = verdict.ACCEPT ? "✅ PASS" : "❌ FAIL";
            console.log(
                `${status}  ${verdict.windows} windows | ` +
                `${verdict.positivePct.toFixed(0)}% profitable | ` +
                `maxConsecLoss=${verdict.maxConsecLossWindows} | ` +
                `exp=${verdict.overallExpectancy}`
            );

            if (verdict.ACCEPT) passed++;
            else failed++;
        } catch (err) {
            console.log(`❌ ERROR: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n  Summary: ${passed} PASSED, ${failed} FAILED out of ${pairs.length} stocks\n`);

    // ══════════════════════════════════════════════
    // PHASE 2: Portfolio Composition After WF Filter
    // ══════════════════════════════════════════════
    console.log("━━━ PHASE 2: Post-WF Portfolio Composition ━━━\n");

    const survivorPairs = pairs.filter(p => stockVerdicts[p]?.ACCEPT);
    const removedPairs = pairs.filter(p => !stockVerdicts[p]?.ACCEPT);

    if (removedPairs.length > 0) {
        console.log("  ❌ Removed (failed WF):");
        for (const p of removedPairs) {
            const sector = SECTOR_MAP[p] || "Unknown";
            const v = stockVerdicts[p];
            const reason = [];
            if (v) {
                if (v.positivePct < 50) reason.push(`profitable=${v.positivePct.toFixed(0)}%<50%`);
                if (v.maxConsecLossWindows >= 6) reason.push(`consec_loss=${v.maxConsecLossWindows}≥6`);
                if (parseFloat(v.overallExpectancy) <= 0) reason.push(`exp=${v.overallExpectancy}≤0`);
            }
            console.log(`     ${p.padEnd(8)} [${sector}] — ${reason.join(", ") || "error/no data"}`);
        }
        console.log("");
    }

    if (survivorPairs.length === 0) {
        console.error("❌ No stocks survived walk-forward. Portfolio cannot be constructed.");
        process.exit(1);
    }

    // Re-weight survivors (normalize to sum=1)
    const totalWeight = survivorPairs.reduce((s, p) => s + (weightMap[p] || 0), 0);
    const newWeights = {};
    for (const p of survivorPairs) {
        newWeights[p] = (weightMap[p] || 0) / totalWeight;
    }

    console.log(`  ✅ WF-Validated Portfolio: ${survivorPairs.length} stocks\n`);
    console.log("  Stock     Sector           OldWt   NewWt   WF-Exp  WF-Windows  WF-ProfPct");
    console.log("  ─────     ──────           ─────   ─────   ──────  ──────────  ──────────");
    for (const p of survivorPairs) {
        const sector = SECTOR_MAP[p] || "Unknown";
        const oldW = (weightMap[p] || 0) * 100;
        const newW = newWeights[p] * 100;
        const v = stockVerdicts[p];
        console.log(
            `  ${p.padEnd(8)}  ${sector.padEnd(16)} ${oldW.toFixed(1).padStart(4)}%   ${newW.toFixed(1).padStart(4)}%   ` +
            `${v.overallExpectancy.padStart(5)}  ${String(v.windows).padStart(9)}   ${v.positivePct.toFixed(0).padStart(8)}%`
        );
    }

    // Sector composition after WF
    const sectorComposition = {};
    for (const p of survivorPairs) {
        const sec = SECTOR_MAP[p] || "Unknown";
        sectorComposition[sec] = (sectorComposition[sec] || 0) + newWeights[p];
    }
    console.log("\n  Sector weights after WF:");
    for (const [sec, w] of Object.entries(sectorComposition).sort((a, b) => b[1] - a[1])) {
        const bar = "█".repeat(Math.round(w * 40));
        console.log(`    ${sec.padEnd(16)} ${bar} ${(w * 100).toFixed(1)}%`);
    }

    // ══════════════════════════════════════════════
    // PHASE 3: Portfolio-Level Aggregated Metrics
    // ══════════════════════════════════════════════
    console.log("\n━━━ PHASE 3: Portfolio-Level Walk-Forward Metrics ━━━\n");

    let allWfTrades = [];
    for (const p of survivorPairs) {
        if (stockWF[p]) {
            for (const t of stockWF[p].trades) {
                allWfTrades.push({
                    ...t,
                    pair: p,
                    weightedR: t.R * newWeights[p]
                });
            }
        }
    }

    // Sort all WF trades chronologically
    allWfTrades.sort((a, b) => (a.exitTime || a.entryTime) - (b.exitTime || b.entryTime));

    // Compute portfolio equity curve from weighted R
    let equity = 0;
    let peak = 0;
    let maxDD = 0;
    const dailyR = [];
    const dayMs = 24 * 60 * 60 * 1000;
    const dailyMap = new Map();

    for (const t of allWfTrades) {
        equity += t.weightedR;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDD) maxDD = dd;

        const dayKey = Math.floor((t.exitTime || t.entryTime) / dayMs);
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + t.weightedR);
    }

    // Build daily returns array (trading days only)
    const days = [...dailyMap.keys()].sort((a, b) => a - b);
    if (days.length > 0) {
        for (let d = days[0]; d <= days[days.length - 1]; d++) {
            const date = new Date(d * dayMs);
            const dow = date.getUTCDay();
            if (dow === 0 || dow === 6) continue; // Skip weekends
            dailyR.push(dailyMap.get(d) || 0);
        }
    }

    const avgDailyR = dailyR.reduce((s, r) => s + r, 0) / (dailyR.length || 1);
    const stdDailyR = Math.sqrt(dailyR.reduce((s, r) => s + (r - avgDailyR) ** 2, 0) / (dailyR.length || 1));
    const sharpe = stdDailyR > 0 ? (avgDailyR / stdDailyR) * Math.sqrt(252) : 0;
    const calmar = maxDD > 0 ? equity / maxDD : 0;

    // Sortino
    const downsideR = dailyR.filter(r => r < 0);
    const downsideDev = downsideR.length > 0
        ? Math.sqrt(downsideR.reduce((s, r) => s + r ** 2, 0) / dailyR.length)
        : 0;
    const sortino = downsideDev > 0 ? (avgDailyR / downsideDev) * Math.sqrt(252) : 0;

    // Portfolio-level WF window analysis
    const portfolioWindows = portfolioWindowMetrics(
        Object.fromEntries(survivorPairs.map(p => [p, stockWF[p]]).filter(([_, v]) => v)),
        newWeights
    );

    let profitableWindows = 0;
    let totalWindows = 0;
    for (const [_, wData] of portfolioWindows) {
        totalWindows++;
        if (wData.totalWeightedR > 0) profitableWindows++;
    }

    // Win rate & expectancy of WF trades
    const wfWins = allWfTrades.filter(t => t.R > 0).length;
    const wfWinRate = allWfTrades.length > 0 ? (wfWins / allWfTrades.length * 100) : 0;
    const wfExpectancy = allWfTrades.length > 0
        ? allWfTrades.reduce((s, t) => s + t.R, 0) / allWfTrades.length
        : 0;

    console.log("  ┌────────────────────────────────────────────────────────────────┐");
    console.log("  │  PORTFOLIO WALK-FORWARD SUMMARY (US STOCKS)                    │");
    console.log("  ├────────────────────────────────────────────────────────────────┤");
    console.log(`  │  Stocks in portfolio:     ${String(survivorPairs.length).padStart(6)}                              │`);
    console.log(`  │  Total WF trades:        ${String(allWfTrades.length).padStart(6)}                              │`);
    console.log(`  │  Win rate (WF):          ${wfWinRate.toFixed(1).padStart(5)}%                              │`);
    console.log(`  │  Expectancy (unwtd):     ${wfExpectancy > 0 ? "+" : ""}${wfExpectancy.toFixed(3).padStart(5)}R                              │`);
    console.log(`  │  Total weighted R:       ${equity > 0 ? "+" : ""}${equity.toFixed(2).padStart(6)}R                             │`);
    console.log(`  │  Max Drawdown (wtd):     ${maxDD.toFixed(2).padStart(6)}R                             │`);
    console.log(`  │  Sharpe (annualized):    ${sharpe.toFixed(2).padStart(6)}                              │`);
    console.log(`  │  Sortino:                ${sortino.toFixed(2).padStart(6)}                              │`);
    console.log(`  │  Calmar:                 ${calmar.toFixed(2).padStart(6)}                              │`);
    console.log(`  │  Profitable windows:     ${profitableWindows}/${totalWindows} (${totalWindows > 0 ? (profitableWindows / totalWindows * 100).toFixed(0) : 0}%)                            │`);
    console.log("  └────────────────────────────────────────────────────────────────┘");

    // ══════════════════════════════════════════════
    // FINAL VERDICT
    // ══════════════════════════════════════════════
    const portfolioPasses =
        wfExpectancy > 0 &&
        (totalWindows === 0 || profitableWindows / totalWindows >= 0.5) &&
        survivorPairs.length >= 3;

    console.log(`\n  ══════════════════════════════════════════════════════`);
    if (portfolioPasses) {
        console.log(`  🟢 PORTFOLIO WALK-FORWARD: PASSED`);
        console.log(`  The ${survivorPairs.length}-stock ${direction.toUpperCase()} portfolio is validated.`);
    } else {
        console.log(`  🔴 PORTFOLIO WALK-FORWARD: FAILED`);
        console.log(`  The portfolio does not meet WF criteria.`);
        if (wfExpectancy <= 0) console.log(`     Reason: negative expectancy (${wfExpectancy.toFixed(3)})`);
        if (totalWindows > 0 && profitableWindows / totalWindows < 0.5) console.log(`     Reason: <50% profitable windows`);
        if (survivorPairs.length < 3) console.log(`     Reason: too few stocks survived (${survivorPairs.length} < 3)`);
    }
    console.log(`  ══════════════════════════════════════════════════════\n`);

    // ── In-Sample vs Out-of-Sample Comparison ──
    console.log("  📊 IN-SAMPLE vs OUT-OF-SAMPLE COMPARISON:");
    console.log(`     In-Sample Sharpe:     ${deployment.metrics?.sharpe || "N/A"}`);
    console.log(`     Out-of-Sample Sharpe: ${sharpe.toFixed(2)}`);
    const decay = deployment.metrics?.sharpe
        ? ((1 - sharpe / deployment.metrics.sharpe) * 100).toFixed(1)
        : "N/A";
    console.log(`     Sharpe Decay: ${decay}%`);
    console.log(`     (Industry benchmark: <50% decay is acceptable)\n`);

    // ── Save results ──
    const output = {
        direction,
        method: deployment.method,
        windowConfig: { monthsTrain: 4, monthsTest: 2 },
        originalStocks: pairs.length,
        survivingStocks: survivorPairs.length,
        removedStocks: removedPairs.map(p => ({
            pair: p,
            sector: SECTOR_MAP[p] || "Unknown",
            verdict: stockVerdicts[p] || null
        })),
        survivingPairs: survivorPairs,
        weights: newWeights,
        sectorComposition,
        portfolioMetrics: {
            totalTrades: allWfTrades.length,
            winRate: Math.round(wfWinRate * 10) / 10,
            expectancy: Math.round(wfExpectancy * 1000) / 1000,
            totalWeightedR: Math.round(equity * 100) / 100,
            maxDD: Math.round(maxDD * 100) / 100,
            sharpe: Math.round(sharpe * 100) / 100,
            sortino: Math.round(sortino * 100) / 100,
            calmar: Math.round(calmar * 100) / 100,
            profitableWindowsPct: totalWindows > 0 ? Math.round(profitableWindows / totalWindows * 1000) / 10 : 0,
        },
        inSampleMetrics: deployment.metrics,
        sharpeDecayPct: deployment.metrics?.sharpe ? Math.round((1 - sharpe / deployment.metrics.sharpe) * 1000) / 10 : null,
        stockVerdicts: Object.fromEntries(
            pairs.map(p => [p, stockVerdicts[p] || null])
        ),
        passes: portfolioPasses,
        generatedAt: new Date().toISOString()
    };

    const outputFile = path.join(outputDir, "wf_portfolio.json");
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`  📁 Results: ${outputFile}`);

    // Save final validated universe
    if (portfolioPasses) {
        const validatedFile = path.join(outputDir, "validated_universe.json");
        fs.writeFileSync(validatedFile, JSON.stringify({
            direction,
            method: deployment.method,
            pairs: survivorPairs,
            weights: newWeights,
            sectorComposition,
            wfSharpe: Math.round(sharpe * 100) / 100,
            wfSortino: Math.round(sortino * 100) / 100,
            wfMaxDD: Math.round(maxDD * 100) / 100,
            wfCalmar: Math.round(calmar * 100) / 100,
            stocks: survivorPairs.length
        }, null, 2));
        console.log(`  📁 Validated universe: ${validatedFile}`);
    }
}

main().catch(err => {
    console.error("❌ Fatal:", err.message);
    process.exit(1);
});
