/**
 * sectorRiskModel.js
 * 
 * Computes sector-level and stock-level risk metrics for portfolio construction:
 *   - GICS sector mapping
 *   - Rolling beta vs equal-weight portfolio factor
 *   - Idiosyncratic volatility (residual after market factor)
 *   - Downside semi-deviation (Sortino-style tail risk)
 *   - Full NxN correlation matrix with Ledoit-Wolf shrinkage
 *   - Sector-level average intra-sector and cross-sector correlations
 * 
 * References:
 *   - Fama & French (1993) "Common Risk Factors in the Returns on Stocks and Bonds"
 *   - Ang, Chen & Xing (2006) "Downside Risk" (Review of Financial Studies)
 *   - Ledoit & Wolf (2004) "A Well-Conditioned Estimator for Large-Dimensional Covariance Matrices"
 * 
 * Usage:
 *   node scripts_us_stocks/sectorRiskModel.js --direction=long
 */

import fs from "fs";
import path from "path";
import { SECTOR_MAP } from "./statisticalScreenStocks.js";

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long";
}

// ═══════════════════════════════════════════════
// STATISTICS UTILITIES
// ═══════════════════════════════════════════════

function mean(arr) {
    return arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
}

function stdDev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length || 1));
}

/**
 * Downside semi-deviation — only considers negative returns
 * This is the denominator for the Sortino ratio
 * Reference: Ang, Chen & Xing (2006)
 */
function downsideSemiDev(arr, target = 0) {
    const negatives = arr.filter(r => r < target).map(r => (r - target) ** 2);
    if (negatives.length === 0) return 0;
    return Math.sqrt(negatives.reduce((s, v) => s + v, 0) / arr.length);
}

/**
 * Compute beta and idiosyncratic volatility using OLS regression
 * y = α + β·x + ε
 * idio_vol = std(ε)
 */
function regressionBeta(stockReturns, marketReturns) {
    const n = Math.min(stockReturns.length, marketReturns.length);
    if (n < 10) return { beta: 1, alpha: 0, idioVol: 0, r2: 0 };

    const x = marketReturns.slice(0, n);
    const y = stockReturns.slice(0, n);

    const xMean = mean(x);
    const yMean = mean(y);

    let ssXY = 0, ssXX = 0;
    for (let i = 0; i < n; i++) {
        ssXY += (x[i] - xMean) * (y[i] - yMean);
        ssXX += (x[i] - xMean) ** 2;
    }

    const beta = ssXX > 0 ? ssXY / ssXX : 1;
    const alpha = yMean - beta * xMean;

    // Residuals
    const residuals = y.map((yi, i) => yi - alpha - beta * x[i]);
    const idioVol = stdDev(residuals);

    // R² — proportion of variance explained by market factor
    const ssRes = residuals.reduce((s, e) => s + e ** 2, 0);
    const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return {
        beta: Math.round(beta * 1000) / 1000,
        alpha: Math.round(alpha * 10000) / 10000,
        idioVol: Math.round(idioVol * 10000) / 10000,
        r2: Math.round(r2 * 1000) / 1000
    };
}

/**
 * Compute correlation between two return series
 */
function correlation(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 5) return 0;

    const ma = mean(a.slice(0, n));
    const mb = mean(b.slice(0, n));
    const sa = stdDev(a.slice(0, n));
    const sb = stdDev(b.slice(0, n));

    if (sa < 1e-15 || sb < 1e-15) return 0;

    let cov = 0;
    for (let i = 0; i < n; i++) {
        cov += (a[i] - ma) * (b[i] - mb);
    }
    cov /= n;

    return cov / (sa * sb);
}

/**
 * Ledoit-Wolf shrinkage on correlation matrix for numerical stability
 */
function shrinkCorrelationMatrix(corrMatrix, n) {
    const shrinkage = Math.min(0.5, Math.max(0.1, 1 / Math.sqrt(n)));

    // Target: identity matrix (uncorrelated)
    const shrunk = corrMatrix.map((row, i) =>
        row.map((val, j) => {
            const target = i === j ? 1 : 0;
            return (1 - shrinkage) * val + shrinkage * target;
        })
    );

    return { matrix: shrunk, shrinkage };
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
    const direction = parseDirection();

    const outputDir = `./result_us_stocks_${direction}`;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║  📐  SECTOR RISK MODEL — ${direction.toUpperCase().padEnd(27)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");

    // Load screened universe and daily returns
    const screenedFile = path.join(outputDir, "screened_universe.json");
    const returnsFile = path.join(outputDir, "screened_daily_returns.json");

    if (!fs.existsSync(screenedFile) || !fs.existsSync(returnsFile)) {
        console.error("❌ Missing input files. Run statisticalScreenStocks.js first.");
        process.exit(1);
    }

    const screened = JSON.parse(fs.readFileSync(screenedFile, "utf8"));
    const allReturns = JSON.parse(fs.readFileSync(returnsFile, "utf8"));

    const symbols = screened.map(c => c.pair);
    const n = symbols.length;

    console.log(`📊 Analyzing ${n} screened stocks\n`);

    // ── Align return series ──
    const minLen = Math.min(...symbols.map(s => (allReturns[s] || []).length));
    const returns = {};
    for (const s of symbols) {
        returns[s] = (allReturns[s] || []).slice(0, minLen);
    }

    console.log(`   Return series aligned to ${minLen} trading days\n`);

    // ── Build equal-weight "market" factor ──
    const marketReturns = [];
    for (let t = 0; t < minLen; t++) {
        let dayR = 0;
        for (const s of symbols) {
            dayR += returns[s][t];
        }
        marketReturns.push(dayR / n);
    }

    // ═══════════════════════════════════════════════
    // PER-STOCK RISK METRICS
    // ═══════════════════════════════════════════════
    console.log("── Per-Stock Risk Metrics ──\n");
    console.log("  Stock     Sector           Beta    IdioVol  R²     DownSD   MaxLoss  TotalVol");
    console.log("  ─────     ──────           ────    ───────  ──     ──────   ───────  ────────");

    const stockRiskMetrics = {};

    for (const s of symbols) {
        const r = returns[s];
        const sector = SECTOR_MAP[s] || "Unknown";
        const reg = regressionBeta(r, marketReturns);
        const totalVol = stdDev(r);
        const dsd = downsideSemiDev(r);
        const maxLoss = r.length > 0 ? Math.min(...r) : 0;

        stockRiskMetrics[s] = {
            sector,
            beta: reg.beta,
            alpha: reg.alpha,
            idioVol: reg.idioVol,
            r2: reg.r2,
            totalVol: Math.round(totalVol * 10000) / 10000,
            downsideSemiDev: Math.round(dsd * 10000) / 10000,
            maxSingleDayLoss: Math.round(maxLoss * 10000) / 10000
        };

        console.log(
            `  ${s.padEnd(8)}  ${sector.padEnd(16)} ${reg.beta.toFixed(2).padStart(5)}   ` +
            `${reg.idioVol.toFixed(4).padStart(7)}  ${reg.r2.toFixed(2).padStart(4)}   ` +
            `${dsd.toFixed(4).padStart(7)}  ${maxLoss.toFixed(3).padStart(8)}  ${totalVol.toFixed(4).padStart(7)}`
        );
    }

    // ═══════════════════════════════════════════════
    // CORRELATION MATRIX
    // ═══════════════════════════════════════════════
    console.log("\n── Correlation Matrix ──\n");

    const rawCorrMatrix = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
            if (i === j) {
                rawCorrMatrix[i][j] = 1;
            } else {
                const corr = correlation(returns[symbols[i]], returns[symbols[j]]);
                rawCorrMatrix[i][j] = Math.round(corr * 1000) / 1000;
                rawCorrMatrix[j][i] = rawCorrMatrix[i][j];
            }
        }
    }

    const { matrix: shrunkCorrMatrix, shrinkage } = shrinkCorrelationMatrix(rawCorrMatrix, minLen);
    console.log(`   Shrinkage intensity: ${(shrinkage * 100).toFixed(1)}%`);

    // ── Sector-level correlation analysis ──
    console.log("\n── Sector Correlation Analysis ──\n");

    const sectorGroups = {};
    for (let i = 0; i < n; i++) {
        const sec = stockRiskMetrics[symbols[i]].sector;
        if (!sectorGroups[sec]) sectorGroups[sec] = [];
        sectorGroups[sec].push(i);
    }

    const sectorNames = Object.keys(sectorGroups).sort();

    // Average intra-sector correlation
    console.log("  Intra-sector correlations (higher = more redundant):");
    for (const sec of sectorNames) {
        const indices = sectorGroups[sec];
        if (indices.length < 2) {
            console.log(`    ${sec.padEnd(16)} N/A (only ${indices.length} stock)`);
            continue;
        }
        let sumCorr = 0, count = 0;
        for (let i = 0; i < indices.length; i++) {
            for (let j = i + 1; j < indices.length; j++) {
                sumCorr += shrunkCorrMatrix[indices[i]][indices[j]];
                count++;
            }
        }
        const avgCorr = count > 0 ? sumCorr / count : 0;
        const bar = "█".repeat(Math.max(0, Math.round(avgCorr * 20))) + "░".repeat(Math.max(0, 20 - Math.round(avgCorr * 20)));
        console.log(`    ${sec.padEnd(16)} ${bar} ${avgCorr.toFixed(3)} (${indices.length} stocks)`);
    }

    // Average cross-sector correlation
    console.log("\n  Cross-sector correlation matrix:");
    const sectorCorrMatrix = {};
    process.stdout.write("                  ");
    for (const s of sectorNames) process.stdout.write(s.slice(0, 7).padStart(8));
    console.log("");

    for (const s1 of sectorNames) {
        process.stdout.write(`    ${s1.padEnd(14)}`);
        for (const s2 of sectorNames) {
            const key = [s1, s2].sort().join("|");
            if (!sectorCorrMatrix[key]) {
                let sumCorr = 0, count = 0;
                for (const i of sectorGroups[s1]) {
                    for (const j of sectorGroups[s2]) {
                        if (i !== j) {
                            sumCorr += shrunkCorrMatrix[i][j];
                            count++;
                        }
                    }
                }
                sectorCorrMatrix[key] = count > 0 ? sumCorr / count : 0;
            }
            process.stdout.write(sectorCorrMatrix[key].toFixed(2).padStart(8));
        }
        console.log("");
    }

    // ── Average portfolio correlation ──
    let totalCorr = 0, corrCount = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            totalCorr += shrunkCorrMatrix[i][j];
            corrCount++;
        }
    }
    const avgPortCorr = corrCount > 0 ? totalCorr / corrCount : 0;
    console.log(`\n   📊 Average portfolio pairwise correlation: ${avgPortCorr.toFixed(3)}`);
    console.log(`   📊 Average beta: ${(Object.values(stockRiskMetrics).reduce((s, m) => s + m.beta, 0) / n).toFixed(3)}`);

    // ── Save outputs ──
    const riskModelFile = path.join(outputDir, "sector_risk_model.json");
    fs.writeFileSync(riskModelFile, JSON.stringify({
        direction,
        stocksAnalyzed: n,
        returnDays: minLen,
        shrinkageIntensity: shrinkage,
        avgPortfolioCorrelation: Math.round(avgPortCorr * 1000) / 1000,
        perStock: stockRiskMetrics,
        sectorGroups: Object.fromEntries(
            Object.entries(sectorGroups).map(([sec, indices]) => [sec, indices.map(i => symbols[i])])
        ),
        generatedAt: new Date().toISOString()
    }, null, 2));
    console.log(`\n📁 Sector risk model: ${riskModelFile}`);

    const corrFile = path.join(outputDir, "correlation_matrix.json");
    fs.writeFileSync(corrFile, JSON.stringify({
        symbols,
        raw: rawCorrMatrix,
        shrunk: shrunkCorrMatrix,
        shrinkageIntensity: shrinkage,
        generatedAt: new Date().toISOString()
    }));
    console.log(`📁 Correlation matrix: ${corrFile}`);
}

main();
