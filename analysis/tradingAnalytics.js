import fs from "fs";
import { CONFIG } from "../backtest/config.js";

// ============================================================
//  PURE-JS STAT HELPERS  (no external deps)
// ============================================================

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, x) => a + (x - m) ** 2, 0) / (arr.length - 1));
}

/** Sample skewness (Fisher's definition) */
function skewness(arr) {
    const n = arr.length;
    if (n < 3) return 0;
    const m = mean(arr);
    const s = stddev(arr);
    if (s === 0) return 0;
    const m3 = arr.reduce((a, x) => a + ((x - m) / s) ** 3, 0) / n;
    // Adjust for sample bias
    return (n * (n - 1)) ** 0.5 / (n - 2) * m3;
}

/**
 * Excess kurtosis (Fisher's definition).
 * Normal distribution → 0.  Fat tails → > 0.
 */
function excessKurtosis(arr) {
    const n = arr.length;
    if (n < 4) return 0;
    const m = mean(arr);
    const s = stddev(arr);
    if (s === 0) return 0;
    const m4 = arr.reduce((a, x) => a + ((x - m) / s) ** 4, 0) / n;
    // Bias-corrected excess kurtosis
    const kurt = ((n + 1) * m4 - 3 * (n - 1)) * (n - 1) / ((n - 2) * (n - 3));
    return kurt;
}

/** Jarque-Bera test statistic (JB > 5.99 → reject normality at 5%) */
function jarqueBera(arr) {
    const n = arr.length;
    if (n < 8) return 0;
    const S = skewness(arr);
    const K = excessKurtosis(arr);
    return (n / 6) * (S ** 2 + K ** 2 / 4);
}

/** Percentile using linear interpolation */
function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computePercentiles(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return {
        P5: percentile(s, 5),
        P10: percentile(s, 10),
        P25: percentile(s, 25),
        P50: percentile(s, 50),
        P75: percentile(s, 75),
        P90: percentile(s, 90),
        P95: percentile(s, 95),
    };
}

// ============================================================
//  DISTRIBUTION STATS (for a single numeric series)
// ============================================================

function distributionStats(arr, label) {
    const sk = skewness(arr);
    const ek = excessKurtosis(arr);
    const jb = jarqueBera(arr);

    return {
        label,
        n: arr.length,
        mean: mean(arr),
        median: median(arr),
        stddev: stddev(arr),
        min: arr.length ? Math.min(...arr) : 0,
        max: arr.length ? Math.max(...arr) : 0,
        skewness: sk,
        excessKurtosis: ek,
        jarqueBera: jb,
        isFatTailed: ek > 0,
        isNormal: jb < 5.99,
        ...computePercentiles(arr),
    };
}

// ============================================================
//  TAIL RATIO
// ============================================================

/** Ratio of avg gain in top-10% MFE trades vs avg loss in bottom-10% R trades */
function tailRatio(trades) {
    const mfeSorted = [...trades].sort((a, b) => b.maxFavorableR - a.maxFavorableR);
    const rSorted = [...trades].sort((a, b) => a.R - b.R);

    const top10n = Math.max(1, Math.floor(trades.length * 0.1));
    const bot10n = Math.max(1, Math.floor(trades.length * 0.1));

    const avgTop10MFE = mean(mfeSorted.slice(0, top10n).map(t => t.maxFavorableR));
    const avgBot10R = mean(rSorted.slice(0, bot10n).map(t => Math.abs(t.R)));

    return avgBot10R > 0 ? avgTop10MFE / avgBot10R : Infinity;
}

// ============================================================
//  TP CAPTURE EFFICIENCY
// ============================================================

/**
 * For winning trades:  capture = TP_R / MFE  (how much of the move did the TP catch?)
 * A ratio near 1 means the TP is well-calibrated; << 1 means you're leaving R on the table.
 */
function tpCaptureEfficiency(trades, tpR) {
    const winners = trades.filter(t => t.R > 0);
    if (!winners.length) return { avgCapture: 0, medianCapture: 0, leftOnTable: 0, winnersAboveTPx2: 0 };

    const captures = winners.map(t => {
        const mfe = t.maxFavorableR;
        return mfe > 0 ? tpR / mfe : 1; // if MFE matches TP exactly → 1
    });

    const leftOnTable = winners.map(t => t.maxFavorableR - tpR).filter(v => v > 0);
    const avgLeft = leftOnTable.length ? mean(leftOnTable) : 0;

    // Trades where MFE exceeded 2× TP_R
    const exceeds2x = winners.filter(t => t.maxFavorableR >= tpR * 2).length;

    return {
        avgCapture: mean(captures),
        medianCapture: median(captures),
        leftOnTableAvgR: avgLeft,
        leftOnTableCount: leftOnTable.length,
        leftOnTablePct: leftOnTable.length / winners.length,
        winnersAboveTPx2: exceeds2x,
        winnersAboveTPx2Pct: exceeds2x / winners.length,
    };
}

// ============================================================
//  MAE SURVIVAL ANALYSIS
// ============================================================

/**
 * Of eventual winners, how many dipped beyond 0.25R, 0.5R, 0.75R, 1.0R, 1.5R, 2.0R ?
 * High survival at deep MAE → your SL is well-placed; trades absorb noise and still win.
 */
function maeSurvivalAnalysis(trades) {
    const winners = trades.filter(t => t.R > 0);
    if (!winners.length) return [];

    const thresholds = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];

    return thresholds.map(thresh => {
        const dipped = winners.filter(t => t.maxAdverseR >= thresh).length;
        return {
            maeThreshold: thresh,
            winnersDipped: dipped,
            pctOfWinners: dipped / winners.length,
        };
    });
}

// ============================================================
//  R-DISTRIBUTION HISTOGRAM
// ============================================================

function rHistogram(trades, bucketSize = 1) {
    const buckets = {};
    for (const t of trades) {
        const b = Math.floor(t.R / bucketSize) * bucketSize;
        buckets[b] = (buckets[b] || 0) + 1;
    }
    return Object.keys(buckets)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => ({
            bucketR: Number(k),
            count: buckets[k],
            pct: buckets[k] / trades.length,
        }));
}

// ============================================================
//  PER-PAIR BREAKDOWN
// ============================================================

function groupByPair(trades) {
    const map = {};
    for (const t of trades) {
        (map[t.pair] ||= []).push(t);
    }
    return map;
}

// ============================================================
//  CSV EXPORTS
// ============================================================

function fmt(v) {
    if (typeof v === "number") return v.toFixed(4);
    if (typeof v === "boolean") return v ? "YES" : "NO";
    return String(v);
}

function exportAnalyticsSummary(rows) {
    const keys = [
        "Scope", "N", "Mean", "Median", "StdDev", "Min", "Max",
        "Skewness", "ExcessKurtosis", "JarqueBera", "FatTailed", "Normal",
        "P5", "P10", "P25", "P50", "P75", "P90", "P95"
    ];
    const header = keys.join(",");
    const body = rows.map(r =>
        [
            r.scope, r.n, fmt(r.mean), fmt(r.median), fmt(r.stddev),
            fmt(r.min), fmt(r.max), fmt(r.skewness), fmt(r.excessKurtosis),
            fmt(r.jarqueBera), fmt(r.isFatTailed), fmt(r.isNormal),
            fmt(r.P5), fmt(r.P10), fmt(r.P25), fmt(r.P50),
            fmt(r.P75), fmt(r.P90), fmt(r.P95)
        ].join(",")
    ).join("\n");

    fs.writeFileSync("./trading_analytics.csv", header + "\n" + body);
}

function exportTPEfficiency(globalEff, perPairEff, tpR) {
    const header = [
        "Scope", "TP_R", "AvgCapture", "MedianCapture",
        "LeftOnTableAvgR", "LeftOnTableCount", "LeftOnTablePct",
        "WinnersAboveTPx2", "WinnersAboveTPx2Pct"
    ].join(",");

    const row = (scope, e) => [
        scope, tpR,
        fmt(e.avgCapture), fmt(e.medianCapture),
        fmt(e.leftOnTableAvgR), e.leftOnTableCount, fmt(e.leftOnTablePct),
        e.winnersAboveTPx2, fmt(e.winnersAboveTPx2Pct)
    ].join(",");

    const rows = [row("GLOBAL", globalEff)];
    for (const [pair, eff] of perPairEff) {
        rows.push(row(pair, eff));
    }

    fs.writeFileSync("./tp_efficiency.csv", header + "\n" + rows.join("\n"));
}

function exportMAESurvival(survival) {
    const header = "MAE_Threshold_R,WinnersDipped,PctOfWinners";
    const body = survival.map(s =>
        `${s.maeThreshold},${s.winnersDipped},${fmt(s.pctOfWinners)}`
    ).join("\n");

    fs.writeFileSync("./mae_survival.csv", header + "\n" + body);
}

// ============================================================
//  CONSOLE SUMMARY
// ============================================================

function printSummary(stats, tpEff, tailR, survival, tpR) {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║         📊  TRADING DISTRIBUTION ANALYTICS          ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");

    for (const s of stats) {
        const verdict = s.isFatTailed ? "🔴 FAT-TAILED" : "🟢 NORMAL-TAILED";
        console.log(`  ${s.scope.padEnd(20)} │ Kurt: ${fmt(s.excessKurtosis).padStart(8)} │ Skew: ${fmt(s.skewness).padStart(8)} │ ${verdict}`);
    }

    console.log(`\n  📎 Tail Ratio (top-10% MFE / bottom-10% |R|):  ${tailR.toFixed(2)}`);
    console.log(`  🎯 TP Capture Efficiency (TP_R = ${tpR}):`);
    console.log(`     Avg capture:            ${(tpEff.avgCapture * 100).toFixed(1)}%`);
    console.log(`     Trades leaving R on table: ${tpEff.leftOnTableCount} (${(tpEff.leftOnTablePct * 100).toFixed(1)}%)`);
    console.log(`     Avg R left on table:    ${tpEff.leftOnTableAvgR.toFixed(2)}R`);
    console.log(`     Winners exceeding 2×TP:  ${tpEff.winnersAboveTPx2} (${(tpEff.winnersAboveTPx2Pct * 100).toFixed(1)}%)`);

    console.log("\n  🛡  MAE Survival (% of winners that dipped beyond threshold):");
    for (const s of survival) {
        const bar = "█".repeat(Math.round(s.pctOfWinners * 30));
        console.log(`     >${s.maeThreshold.toFixed(2)}R: ${(s.pctOfWinners * 100).toFixed(1).padStart(5)}% ${bar}`);
    }

    console.log("");
}

// ============================================================
//  MAIN ENTRY POINT
// ============================================================

export function runTradingAnalytics(trades) {
    if (!trades.length) {
        console.log("[ANALYTICS] No trades to analyse.");
        return;
    }

    const tpR = CONFIG.TP_R;

    // ── Global distribution stats ──────────────────────────────
    const rValues = trades.map(t => t.R);
    const mfeValues = trades.map(t => t.maxFavorableR);
    const maeValues = trades.map(t => t.maxAdverseR);

    const globalR = { scope: "GLOBAL_R", ...distributionStats(rValues, "R") };
    const globalMFE = { scope: "GLOBAL_MFE", ...distributionStats(mfeValues, "MFE") };
    const globalMAE = { scope: "GLOBAL_MAE", ...distributionStats(maeValues, "MAE") };

    const summaryRows = [globalR, globalMFE, globalMAE];

    // ── Per-pair stats ─────────────────────────────────────────
    const byPair = groupByPair(trades);
    const perPairTPEff = [];

    for (const [pair, pts] of Object.entries(byPair)) {
        const pairR = { scope: `${pair}_R`, ...distributionStats(pts.map(t => t.R), "R") };
        const pairMFE = { scope: `${pair}_MFE`, ...distributionStats(pts.map(t => t.maxFavorableR), "MFE") };
        const pairMAE = { scope: `${pair}_MAE`, ...distributionStats(pts.map(t => t.maxAdverseR), "MAE") };
        summaryRows.push(pairR, pairMFE, pairMAE);

        perPairTPEff.push([pair, tpCaptureEfficiency(pts, tpR)]);
    }

    // ── TP efficiency ──────────────────────────────────────────
    const globalTPEff = tpCaptureEfficiency(trades, tpR);

    // ── Tail ratio ─────────────────────────────────────────────
    const tailR = tailRatio(trades);

    // ── MAE survival ───────────────────────────────────────────
    const survival = maeSurvivalAnalysis(trades);

    // ── R histogram ────────────────────────────────────────────
    const hist = rHistogram(trades);

    // ── Console output ─────────────────────────────────────────
    printSummary([globalR, globalMFE, globalMAE], globalTPEff, tailR, survival, tpR);

    // ── CSV exports ────────────────────────────────────────────
    exportAnalyticsSummary(summaryRows);
    exportTPEfficiency(globalTPEff, perPairTPEff, tpR);
    exportMAESurvival(survival);

    console.log("[ANALYTICS] Exported: trading_analytics.csv, tp_efficiency.csv, mae_survival.csv ✔");
}
