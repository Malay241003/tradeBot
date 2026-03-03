/**
 * statisticalScreen.js
 * 
 * Institutional-grade statistical filter for screening results.
 * Calibrated for PORTFOLIO CONSTRUCTION (selecting many assets), not winner-picking.
 * 
 * Implements:
 *   Stage 1: Minimum viability (trades ≥ 30, expectancy > 0, maxDD < 25R)
 *   Stage 2: Minimum Sharpe > 0.3 (annualized) — ensures real risk-adjusted edge
 *   Stage 3: Regime stability (profitable in ≥ 2/3 time periods)
 * 
 * References:
 *   - Bailey & López de Prado (2014) "The Deflated Sharpe Ratio" (SSRN)
 *   - Harvey, Liu & Zhu (2016) "...and the Cross-Section of Expected Returns"
 * 
 * Usage:
 *   node scripts/statisticalScreen.js --direction=long
 *   node scripts/statisticalScreen.js --direction=short
 */

import fs from "fs";

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long";
}

function main() {
    const direction = parseDirection();

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║  🧪  STATISTICAL SCREEN — ${direction.toUpperCase().padEnd(25)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");

    // Load screening results
    const inputFile = `screening_results_${direction}.json`;
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ ${inputFile} not found. Run screen_universe.js first.`);
        process.exit(1);
    }

    const allCoins = JSON.parse(fs.readFileSync(inputFile, "utf8"));
    console.log(`📊 Loaded ${allCoins.length} screened coins\n`);

    // ═══════════════════════════════════════════════
    // STAGE 1: Minimum Viability
    // ═══════════════════════════════════════════════
    // 
    // trades ≥ 30: Statistical significance (t-test needs ~30 samples)
    // expectancy > 0: Strategy must be profitable
    // maxDD < 25R: No catastrophic drawdown (25R = losing 25 consecutive trades at 1R)
    //   Note: 25R is appropriate for 7-year crypto backtests. 
    //   Shorter backtests would use lower thresholds.
    const MIN_TRADES = 30;
    const MIN_EXPECTANCY = 0;
    const MAX_DD = 25;

    console.log("── STAGE 1: Minimum Viability ──");
    console.log(`   Rules: trades ≥ ${MIN_TRADES}, expectancy > ${MIN_EXPECTANCY}, maxDD < ${MAX_DD}R\n`);

    const stage1 = allCoins.filter(c => {
        const pass = c.trades >= MIN_TRADES && c.expectancy > MIN_EXPECTANCY && c.maxDD < MAX_DD;
        if (!pass) {
            const reason = [];
            if (c.trades < MIN_TRADES) reason.push(`trades=${c.trades}`);
            if (c.expectancy <= MIN_EXPECTANCY) reason.push(`exp=${c.expectancy.toFixed(2)}`);
            if (c.maxDD >= MAX_DD) reason.push(`dd=${c.maxDD.toFixed(1)}`);
            console.log(`   ❌ ${c.base.padEnd(8)} ${reason.join(", ")}`);
        }
        return pass;
    });
    console.log(`\n   ✅ Stage 1 survivors: ${stage1.length}/${allCoins.length}\n`);

    // ═══════════════════════════════════════════════
    // STAGE 2: Risk-Adjusted Quality
    // ═══════════════════════════════════════════════
    //
    // For PORTFOLIO CONSTRUCTION, we don't need each asset to have a 
    // statistically exceptional Sharpe. We need each asset to have:
    //   1. A positive risk-adjusted edge (SR > 0.3 annualized)
    //   2. Enough data to trust the estimate (trades ≥ 30, already checked)
    //
    // SR > 0.3 is a reasonable floor — it means the strategy generates
    // ~0.3 standard deviations of return per year, a genuine if modest edge.
    // The portfolio effect will amplify this through diversification.
    //
    // We also compute the Deflated Sharpe Ratio for informational purposes
    // (how likely is this SR to survive out-of-sample given 90 trials tested).
    const MIN_SHARPE = 0.3;

    console.log("── STAGE 2: Risk-Adjusted Quality ──");
    console.log(`   Rule: Annualized Sharpe > ${MIN_SHARPE}\n`);

    const stage2 = [];
    for (const c of stage1) {
        // Deflated Sharpe (informational) — probability SR is real given multiple testing
        const numTrials = allCoins.length;
        const approxDays = Math.max(c.trades * 3, 365);
        const expectedMaxSR = Math.sqrt(2 * Math.log(numTrials));
        const varSR = 1 / approxDays; // Simplified
        const zScore = (c.sharpe - expectedMaxSR) / Math.sqrt(varSR);
        const dsr = normalCDF(zScore);

        c.dsr = Math.round(dsr * 1000) / 1000;
        c.expectedMaxSR = Math.round(expectedMaxSR * 100) / 100;

        if (c.sharpe >= MIN_SHARPE) {
            stage2.push(c);
            console.log(`   ✅ ${c.base.padEnd(8)} SR=${c.sharpe.toFixed(2)} (DSR=${c.dsr.toFixed(3)}, E[maxSR]=${c.expectedMaxSR})`);
        } else {
            console.log(`   ❌ ${c.base.padEnd(8)} SR=${c.sharpe.toFixed(2)} < ${MIN_SHARPE} threshold`);
        }
    }
    console.log(`\n   ✅ Stage 2 survivors: ${stage2.length}/${stage1.length}\n`);

    // ═══════════════════════════════════════════════
    // STAGE 3: Regime Stability
    // ═══════════════════════════════════════════════
    //
    // Split each coin's trades into 3 equal time periods.
    // Require positive expectancy in at least 2/3 periods.
    // This ensures the edge isn't from a single bull/bear regime.
    console.log("── STAGE 3: Regime Stability (2/3 periods profitable) ──\n");

    const stage3 = [];
    for (const c of stage2) {
        if (c.profitablePeriods >= 2) {
            stage3.push(c);
            console.log(`   ✅ ${c.base.padEnd(8)} ${c.profitablePeriods}/3 periods profitable [${c.periodExpectancies.map(e => (e > 0 ? "+" : "") + e.toFixed(2)).join(", ")}]`);
        } else {
            console.log(`   ❌ ${c.base.padEnd(8)} ${c.profitablePeriods}/3 periods profitable — regime dependent`);
        }
    }
    console.log(`\n   ✅ Stage 3 survivors: ${stage3.length}/${stage2.length}\n`);

    // ═══════════════════════════════════════════════
    // FINAL RESULTS
    // ═══════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════════════════");
    console.log(`🏆 FINAL SCREENED UNIVERSE: ${stage3.length} coins (${direction.toUpperCase()})`);
    console.log("═══════════════════════════════════════════════════════════════════════════════\n");

    console.log("  #  Coin      Trades  WinRate  Expect.   NetR    MaxDD   Sharpe    DSR   Calmar  Stable");
    console.log("  ─  ────      ──────  ───────  ───────   ────    ─────   ──────    ───   ──────  ──────");
    stage3.forEach((r, i) => {
        console.log(
            `${String(i + 1).padStart(3)}  ${r.base.padEnd(8)}  ${String(r.trades).padStart(5)}  ` +
            `${r.winRate.toFixed(1).padStart(5)}%  ${r.expectancy > 0 ? "+" : ""}${r.expectancy.toFixed(2).padStart(6)}  ` +
            `${r.netR > 0 ? "+" : ""}${r.netR.toFixed(1).padStart(7)}  ${r.maxDD.toFixed(1).padStart(6)}  ` +
            `${r.sharpe.toFixed(2).padStart(6)}  ${r.dsr.toFixed(3).padStart(5)}  ` +
            `${r.calmar.toFixed(2).padStart(6)}  ${r.profitablePeriods}/3`
        );
    });

    // Save final screened universe
    const outputFile = `screened_universe_${direction}.json`;
    const screened = stage3.map(c => {
        const { dailyReturns, ...rest } = c;
        return rest;
    });
    fs.writeFileSync(outputFile, JSON.stringify(screened, null, 2));
    console.log(`\n📁 Screened universe: ${outputFile}`);

    // Save the list of surviving pairs for run.js
    const pairsFile = `screened_pairs_${direction}.json`;
    fs.writeFileSync(pairsFile, JSON.stringify(stage3.map(c => c.pair)));
    console.log(`📁 Pairs list: ${pairsFile}`);
}

/**
 * Normal CDF approximation (Abramowitz & Stegun)
 */
function normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

main();
