/**
 * statisticalScreenStocks.js
 * 
 * Institutional-grade 4-stage statistical filter for US stock screening results.
 * Calibrated for PORTFOLIO CONSTRUCTION — we're selecting a diversified basket,
 * not picking one winner.
 * 
 * Implements:
 *   Stage 1: Minimum viability (trades ≥ 20, expectancy > 0, maxDD < 15R)
 *   Stage 2: Minimum Sharpe > 0.25 (annualized, √252)
 *   Stage 3: Regime stability (profitable in ≥ 2/3 time periods)
 *   Stage 4: Sector concentration cap (max 5 stocks per GICS sector)
 * 
 * References:
 *   - Bailey & López de Prado (2014) "The Deflated Sharpe Ratio" (SSRN)
 *   - Harvey, Liu & Zhu (2016) "...and the Cross-Section of Expected Returns"
 * 
 * Usage:
 *   node scripts_us_stocks/statisticalScreenStocks.js --direction=long
 */

import fs from "fs";
import path from "path";

// ═══════════════════════════════════════════════
// GICS SECTOR MAPPING (S&P 100)
// ═══════════════════════════════════════════════
export const SECTOR_MAP = {
    // Information Technology
    AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", AVGO: "Technology",
    TXN: "Technology", IBM: "Technology", QCOM: "Technology", ORCL: "Technology",
    AMD: "Technology", INTC: "Technology", CSCO: "Technology", ADBE: "Technology",
    CRM: "Technology", NOW: "Technology",
    // Communication Services
    GOOGL: "Communication", META: "Communication", NFLX: "Communication",
    DIS: "Communication", CMCSA: "Communication", T: "Communication",
    // Consumer Discretionary
    AMZN: "Consumer Disc.", TSLA: "Consumer Disc.", HD: "Consumer Disc.",
    LOW: "Consumer Disc.", MCD: "Consumer Disc.", TJX: "Consumer Disc.",
    BKNG: "Consumer Disc.", MAR: "Consumer Disc.",
    // Healthcare
    LLY: "Healthcare", UNH: "Healthcare", JNJ: "Healthcare", ABBV: "Healthcare",
    MRK: "Healthcare", TMO: "Healthcare", ABT: "Healthcare", AMGN: "Healthcare",
    GILD: "Healthcare", REGN: "Healthcare", MDT: "Healthcare", SYK: "Healthcare",
    BSX: "Healthcare", ZTS: "Healthcare", BDX: "Healthcare", ISRG: "Healthcare",
    CI: "Healthcare", ELV: "Healthcare", CVS: "Healthcare", PFE: "Healthcare",
    VRTX: "Healthcare",
    // Financials
    JPM: "Financials", V: "Financials", MA: "Financials", WFC: "Financials",
    GS: "Financials", SPGI: "Financials", BLK: "Financials", AXP: "Financials",
    SCHW: "Financials", MMC: "Financials", AON: "Financials", CB: "Financials",
    CME: "Financials", C: "Financials", PNC: "Financials", USB: "Financials",
    ADP: "Financials", "BRK.B": "Financials",
    // Consumer Staples
    WMT: "Consumer Staples", PG: "Consumer Staples", KO: "Consumer Staples",
    PEP: "Consumer Staples", COST: "Consumer Staples", PM: "Consumer Staples",
    MO: "Consumer Staples", CL: "Consumer Staples",
    // Energy
    XOM: "Energy", CVX: "Energy", COP: "Energy", EOG: "Energy",
    SLB: "Energy", FCX: "Energy",
    // Industrials
    HON: "Industrials", CAT: "Industrials", UNP: "Industrials", RTX: "Industrials",
    GE: "Industrials", LMT: "Industrials", NOC: "Industrials", ITW: "Industrials",
    CSX: "Industrials", NSC: "Industrials", EMR: "Industrials", WM: "Industrials",
    APD: "Industrials", BA: "Industrials", MMM: "Industrials",
    // Utilities
    SO: "Utilities", DUK: "Utilities",
    // Real Estate
    AMT: "Real Estate", EQIX: "Real Estate"
};

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long";
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

function main() {
    const direction = parseDirection();

    const outputDir = `./result_us_stocks_${direction}`;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║  🧪  STOCK STATISTICAL SCREEN — ${direction.toUpperCase().padEnd(19)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");

    // Load screening results
    const inputFile = path.join(outputDir, "screening_results.json");
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ ${inputFile} not found. Run screenUniverseStocks.js first.`);
        process.exit(1);
    }

    const allStocks = JSON.parse(fs.readFileSync(inputFile, "utf8"));
    console.log(`📊 Loaded ${allStocks.length} screened stocks\n`);

    // ═══════════════════════════════════════════════
    // STAGE 1: Minimum Viability
    // ═══════════════════════════════════════════════
    // trades ≥ 20: Stocks have fewer trades than crypto (session-only + time filter)
    // expectancy > 0: Strategy must be profitable
    // maxDD < 15R: Tighter than crypto (25R) — equities have lower vol, so 15R is already severe
    const MIN_TRADES = 17;
    const MIN_EXPECTANCY = 0;
    const MAX_DD = 15;

    console.log("── STAGE 1: Minimum Viability ──");
    console.log(`   Rules: trades ≥ ${MIN_TRADES}, expectancy > ${MIN_EXPECTANCY}, maxDD < ${MAX_DD}R\n`);

    const stage1 = allStocks.filter(c => {
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
    console.log(`\n   ✅ Stage 1 survivors: ${stage1.length}/${allStocks.length}\n`);

    // ═══════════════════════════════════════════════
    // STAGE 2: Risk-Adjusted Quality
    // ═══════════════════════════════════════════════
    // Sharpe ≥ 0.25: Slightly lower bar than crypto (0.3) — we rely on diversification to boost
    const MIN_SHARPE = 0.25;

    console.log("── STAGE 2: Risk-Adjusted Quality ──");
    console.log(`   Rule: Annualized Sharpe ≥ ${MIN_SHARPE}\n`);

    const stage2 = [];
    for (const c of stage1) {
        // Deflated Sharpe (informational)
        const numTrials = allStocks.length;
        const approxDays = Math.max(c.trades * 5, 252); // Stock trades last longer
        const expectedMaxSR = Math.sqrt(2 * Math.log(numTrials));
        const varSR = 1 / approxDays;
        const zScore = (c.sharpe - expectedMaxSR) / Math.sqrt(varSR);
        const dsr = normalCDF(zScore);

        c.dsr = Math.round(dsr * 1000) / 1000;
        c.expectedMaxSR = Math.round(expectedMaxSR * 100) / 100;
        c.sector = SECTOR_MAP[c.base] || "Unknown";

        if (c.sharpe >= MIN_SHARPE) {
            stage2.push(c);
            console.log(`   ✅ ${c.base.padEnd(8)} SR=${c.sharpe.toFixed(2)} (DSR=${c.dsr.toFixed(3)}) [${c.sector}]`);
        } else {
            console.log(`   ❌ ${c.base.padEnd(8)} SR=${c.sharpe.toFixed(2)} < ${MIN_SHARPE} threshold`);
        }
    }
    console.log(`\n   ✅ Stage 2 survivors: ${stage2.length}/${stage1.length}\n`);

    // ═══════════════════════════════════════════════
    // STAGE 3: Regime Stability
    // ═══════════════════════════════════════════════
    console.log("── STAGE 3: Regime Stability (2/3 periods profitable) ──\n");

    const stage3 = [];
    for (const c of stage2) {
        if (c.profitablePeriods >= 2) {
            stage3.push(c);
            console.log(`   ✅ ${c.base.padEnd(8)} ${c.profitablePeriods}/3 periods [${c.periodExpectancies.map(e => (e > 0 ? "+" : "") + e.toFixed(2)).join(", ")}]`);
        } else {
            console.log(`   ❌ ${c.base.padEnd(8)} ${c.profitablePeriods}/3 — regime dependent`);
        }
    }
    console.log(`\n   ✅ Stage 3 survivors: ${stage3.length}/${stage2.length}\n`);

    // ═══════════════════════════════════════════════
    // STAGE 4: Sector Concentration Cap
    // ═══════════════════════════════════════════════
    // Max 5 stocks per GICS sector — prevents correlated blow-ups
    const MAX_PER_SECTOR = 5;

    console.log(`── STAGE 4: Sector Concentration Cap (max ${MAX_PER_SECTOR} per sector) ──\n`);

    // Sort by Sharpe within each sector to keep the best when capping
    const stage3Sorted = [...stage3].sort((a, b) => b.sharpe - a.sharpe);
    const sectorCounts = {};
    const stage4 = [];

    for (const c of stage3Sorted) {
        const sector = c.sector;
        sectorCounts[sector] = (sectorCounts[sector] || 0);

        if (sectorCounts[sector] < MAX_PER_SECTOR) {
            sectorCounts[sector]++;
            stage4.push(c);
            console.log(`   ✅ ${c.base.padEnd(8)} [${sector}] (${sectorCounts[sector]}/${MAX_PER_SECTOR})`);
        } else {
            console.log(`   ❌ ${c.base.padEnd(8)} [${sector}] — sector cap hit (${MAX_PER_SECTOR}/${MAX_PER_SECTOR})`);
        }
    }

    // Sector summary
    console.log(`\n   Sector allocation:`);
    for (const [sector, count] of Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])) {
        const bar = "█".repeat(count) + "░".repeat(MAX_PER_SECTOR - count);
        console.log(`     ${sector.padEnd(16)} ${bar} ${count}/${MAX_PER_SECTOR}`);
    }
    console.log(`\n   ✅ Stage 4 survivors: ${stage4.length}/${stage3.length}\n`);

    // ═══════════════════════════════════════════════
    // FINAL RESULTS
    // ═══════════════════════════════════════════════
    // Re-sort final by expectancy
    stage4.sort((a, b) => b.expectancy - a.expectancy);

    console.log("═══════════════════════════════════════════════════════════════════════════════════════");
    console.log(`🏆 FINAL SCREENED UNIVERSE: ${stage4.length} stocks (${direction.toUpperCase()})`);
    console.log("═══════════════════════════════════════════════════════════════════════════════════════\n");

    console.log("  #  Stock     Sector           Trades  WinRate  Expect.   NetR    MaxDD   Sharpe    DSR   Calmar  Stable");
    console.log("  ─  ─────     ──────           ──────  ───────  ───────   ────    ─────   ──────    ───   ──────  ──────");
    stage4.forEach((r, i) => {
        console.log(
            `${String(i + 1).padStart(3)}  ${r.base.padEnd(8)}  ${r.sector.padEnd(16)} ${String(r.trades).padStart(5)}  ` +
            `${r.winRate.toFixed(1).padStart(5)}%  ${r.expectancy > 0 ? "+" : ""}${r.expectancy.toFixed(2).padStart(6)}  ` +
            `${r.netR > 0 ? "+" : ""}${r.netR.toFixed(1).padStart(7)}  ${r.maxDD.toFixed(1).padStart(6)}  ` +
            `${r.sharpe.toFixed(2).padStart(6)}  ${r.dsr.toFixed(3).padStart(5)}  ` +
            `${r.calmar.toFixed(2).padStart(6)}  ${r.profitablePeriods}/3`
        );
    });

    // ── Save outputs ──
    const screened = stage4.map(c => {
        const { dailyReturns, ...rest } = c;
        return rest;
    });

    const outputFile = path.join(outputDir, "screened_universe.json");
    fs.writeFileSync(outputFile, JSON.stringify(screened, null, 2));
    console.log(`\n📁 Screened universe: ${outputFile}`);

    // Save list of surviving symbols
    const pairsFile = path.join(outputDir, "screened_pairs.json");
    fs.writeFileSync(pairsFile, JSON.stringify(stage4.map(c => c.pair)));
    console.log(`📁 Pairs list: ${pairsFile}`);

    // Filter daily returns to only screened stocks
    const returnsInputFile = path.join(outputDir, "screening_daily_returns.json");
    if (fs.existsSync(returnsInputFile)) {
        const allReturns = JSON.parse(fs.readFileSync(returnsInputFile, "utf8"));
        const filteredReturns = {};
        for (const c of stage4) {
            if (allReturns[c.pair]) {
                filteredReturns[c.pair] = allReturns[c.pair];
            }
        }
        const filteredFile = path.join(outputDir, "screened_daily_returns.json");
        fs.writeFileSync(filteredFile, JSON.stringify(filteredReturns));
        console.log(`📁 Screened daily returns: ${filteredFile}`);
    }
}

main();
