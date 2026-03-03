/**
 * portfolioOptimizer.js
 * 
 * Finds the optimal combination of crypto coins that produces
 * the SMOOTHEST equity curve (minimum drawdown, maximum Sharpe).
 * 
 * Implements three methods:
 *   1. Minimum Variance Portfolio (Markowitz)
 *   2. Risk Parity (equal risk contribution)
 *   3. Maximum Diversification Ratio
 * 
 * References:
 *   - Markowitz (1952) "Portfolio Selection" (Journal of Finance)
 *   - Maillard, Roncalli, Teïletche (2010) "The Properties of Equally Weighted Risk Contribution Portfolios"
 *   - Choueifaty & Coignard (2008) "Toward Maximum Diversification"
 * 
 * Usage:
 *   node scripts/portfolioOptimizer.js --direction=long
 *   node scripts/portfolioOptimizer.js --direction=short
 */

import fs from "fs";

function parseDirection() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith("--direction=")) return arg.split("=")[1].toLowerCase();
    }
    return "long";
}

// ═══════════════════════════════════════════════
// MATRIX MATH UTILITIES
// ═══════════════════════════════════════════════

function matMul(A, B) {
    // A: m×n, B: n×p → C: m×p
    const m = A.length, n = A[0].length, p = B[0].length;
    const C = Array.from({ length: m }, () => new Array(p).fill(0));
    for (let i = 0; i < m; i++)
        for (let j = 0; j < p; j++)
            for (let k = 0; k < n; k++)
                C[i][j] += A[i][k] * B[k][j];
    return C;
}

function matVecMul(A, v) {
    return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}

function dotProduct(a, b) {
    return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

/**
 * Compute covariance matrix from daily returns matrix
 * Uses Ledoit-Wolf shrinkage for stability
 */
function computeCovarianceMatrix(returnsByAsset, assetNames) {
    const n = assetNames.length;

    // Align all return series to the same length (minimum)
    const minLen = Math.min(...assetNames.map(a => (returnsByAsset[a] || []).length));
    if (minLen < 30) {
        console.warn(`⚠️ Very short return series: ${minLen} days`);
    }

    const returns = assetNames.map(a => (returnsByAsset[a] || []).slice(0, minLen));
    const T = minLen;

    // Mean returns
    const means = returns.map(r => r.reduce((s, v) => s + v, 0) / T);

    // Sample covariance matrix
    const S = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
            let cov = 0;
            for (let t = 0; t < T; t++) {
                cov += (returns[i][t] - means[i]) * (returns[j][t] - means[j]);
            }
            cov /= (T - 1);
            S[i][j] = cov;
            S[j][i] = cov;
        }
    }

    // Ledoit-Wolf shrinkage target: diagonal matrix with average variance
    const avgVar = S.reduce((s, row, i) => s + row[i], 0) / n;
    const target = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => i === j ? avgVar : 0)
    );

    // Shrinkage intensity (simplified — use 0.3 as a reasonable default)
    const shrinkage = Math.min(0.5, Math.max(0.1, 1 / Math.sqrt(T)));

    // Shrunk covariance: (1-δ)S + δF
    const covMatrix = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
            (1 - shrinkage) * S[i][j] + shrinkage * target[i][j]
        )
    );

    return { covMatrix, means, shrinkage };
}

// ═══════════════════════════════════════════════
// METHOD 1: MINIMUM VARIANCE PORTFOLIO
// ═══════════════════════════════════════════════

/**
 * Analytical min-variance with long-only constraint
 * Uses gradient projection with iterative refinement
 */
function minimumVariance(covMatrix, n) {
    // Start with equal weights
    let w = new Array(n).fill(1 / n);
    const lr = 0.01;
    const iterations = 5000;

    for (let iter = 0; iter < iterations; iter++) {
        // Gradient: 2 * Σw
        const grad = matVecMul(covMatrix, w).map(g => 2 * g);

        // Gradient descent step
        w = w.map((wi, i) => wi - lr * grad[i]);

        // Project onto simplex (long-only, sum=1)
        w = projectSimplex(w);
    }

    return w;
}

/**
 * Project vector onto probability simplex (Duchi et al. 2008)
 * Ensures: all weights ≥ 0, sum = 1
 */
function projectSimplex(v) {
    const n = v.length;
    const sorted = [...v].sort((a, b) => b - a);
    let cumSum = 0;
    let rho = 0;

    for (let j = 0; j < n; j++) {
        cumSum += sorted[j];
        if (sorted[j] - (cumSum - 1) / (j + 1) > 0) {
            rho = j + 1;
        }
    }

    const theta = (sorted.slice(0, rho).reduce((s, v) => s + v, 0) - 1) / rho;
    return v.map(vi => Math.max(vi - theta, 0));
}

// ═══════════════════════════════════════════════
// METHOD 2: RISK PARITY
// ═══════════════════════════════════════════════

/**
 * Risk Parity: equal risk contribution from each asset
 * Uses Spinu (2013) iterative algorithm
 */
function riskParity(covMatrix, n) {
    let w = new Array(n).fill(1 / n);
    const budgets = new Array(n).fill(1 / n); // Equal risk budgets
    const iterations = 3000;
    const tol = 1e-10;

    for (let iter = 0; iter < iterations; iter++) {
        const sigma_w = matVecMul(covMatrix, w);
        const totalRisk = Math.sqrt(dotProduct(w, sigma_w));

        if (totalRisk < 1e-15) break;

        // Marginal risk contribution
        const mrc = sigma_w.map(sw => sw / totalRisk);

        // Risk contribution per asset
        const rc = w.map((wi, i) => wi * mrc[i]);
        const totalRC = rc.reduce((s, r) => s + r, 0);

        // Target risk contribution
        const targetRC = budgets.map(b => b * totalRC);

        // Update weights proportionally
        const newW = w.map((wi, i) => {
            if (mrc[i] < 1e-15) return wi;
            return wi * (targetRC[i] / (rc[i] + 1e-15));
        });

        // Normalize
        const sumW = newW.reduce((s, v) => s + v, 0);
        w = newW.map(v => v / sumW);

        // Check convergence
        const maxDiff = Math.max(...rc.map((r, i) => Math.abs(r - targetRC[i])));
        if (maxDiff < tol) break;
    }

    return w;
}

// ═══════════════════════════════════════════════
// METHOD 3: MAX DIVERSIFICATION
// ═══════════════════════════════════════════════

/**
 * Maximum Diversification: maximize DR = w'σ / √(w'Σw)
 * Uses gradient ascent on the diversification ratio
 */
function maxDiversification(covMatrix, n) {
    const vols = covMatrix.map((row, i) => Math.sqrt(row[i]));

    let w = new Array(n).fill(1 / n);
    const lr = 0.005;
    const iterations = 5000;

    for (let iter = 0; iter < iterations; iter++) {
        const sigma_w = matVecMul(covMatrix, w);
        const portfolioVol = Math.sqrt(dotProduct(w, sigma_w));
        const weightedAvgVol = dotProduct(w, vols);

        if (portfolioVol < 1e-15) break;

        // Gradient of DR w.r.t. w
        const grad = vols.map((vi, i) =>
            vi / portfolioVol - weightedAvgVol * sigma_w[i] / (portfolioVol ** 3)
        );

        // Gradient ascent (maximize)
        w = w.map((wi, i) => wi + lr * grad[i]);
        w = projectSimplex(w);
    }

    return w;
}

// ═══════════════════════════════════════════════
// PORTFOLIO METRICS
// ═══════════════════════════════════════════════

function portfolioMetrics(weights, returnsByAsset, assetNames) {
    const n = assetNames.length;
    const minLen = Math.min(...assetNames.map(a => (returnsByAsset[a] || []).length));
    const returns = assetNames.map(a => (returnsByAsset[a] || []).slice(0, minLen));

    // Combined portfolio daily returns
    const portfolioDailyR = [];
    for (let t = 0; t < minLen; t++) {
        let dayR = 0;
        for (let i = 0; i < n; i++) {
            dayR += weights[i] * returns[i][t];
        }
        portfolioDailyR.push(dayR);
    }

    // Equity curve
    let equity = 0;
    let peak = 0;
    let maxDD = 0;
    const equityCurve = [];

    for (const r of portfolioDailyR) {
        equity += r;
        equityCurve.push(equity);
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDD) maxDD = dd;
    }

    // Sharpe
    const avgR = portfolioDailyR.reduce((s, r) => s + r, 0) / portfolioDailyR.length;
    const stdR = Math.sqrt(
        portfolioDailyR.reduce((s, r) => s + (r - avgR) ** 2, 0) / portfolioDailyR.length
    );
    const sharpe = stdR > 0 ? (avgR / stdR) * Math.sqrt(365) : 0;
    const calmar = maxDD > 0 ? equity / maxDD : 0;

    // Diversification ratio
    const assetVols = returns.map(r => {
        const avg = r.reduce((s, v) => s + v, 0) / r.length;
        return Math.sqrt(r.reduce((s, v) => s + (v - avg) ** 2, 0) / r.length);
    });
    const weightedAvgVol = dotProduct(weights, assetVols);
    const divRatio = stdR > 0 ? weightedAvgVol / stdR : 1;

    // Equity curve smoothness (R² of linear regression)
    const n_points = equityCurve.length;
    const xMean = (n_points - 1) / 2;
    const yMean = equityCurve.reduce((s, v) => s + v, 0) / n_points;
    let ssXY = 0, ssXX = 0, ssYY = 0;
    for (let i = 0; i < n_points; i++) {
        ssXY += (i - xMean) * (equityCurve[i] - yMean);
        ssXX += (i - xMean) ** 2;
        ssYY += (equityCurve[i] - yMean) ** 2;
    }
    const r2 = ssYY > 0 ? (ssXY ** 2) / (ssXX * ssYY) : 0;

    return {
        totalR: Math.round(equity * 100) / 100,
        maxDD: Math.round(maxDD * 100) / 100,
        sharpe: Math.round(sharpe * 100) / 100,
        calmar: Math.round(calmar * 100) / 100,
        divRatio: Math.round(divRatio * 100) / 100,
        smoothness: Math.round(r2 * 1000) / 1000,
        days: minLen
    };
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
    const direction = parseDirection();

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║  📐  PORTFOLIO OPTIMIZER — ${direction.toUpperCase().padEnd(23)}║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");

    // Load screened universe
    const screenedFile = `screened_universe_${direction}.json`;
    const returnsFile = `screening_daily_returns_${direction}.json`;

    if (!fs.existsSync(screenedFile) || !fs.existsSync(returnsFile)) {
        console.error("❌ Missing input files. Run screen_universe.js and statisticalScreen.js first.");
        process.exit(1);
    }

    const screened = JSON.parse(fs.readFileSync(screenedFile, "utf8"));
    const allReturns = JSON.parse(fs.readFileSync(returnsFile, "utf8"));

    const assetNames = screened.map(c => c.pair);
    const n = assetNames.length;

    if (n < 3) {
        console.error(`❌ Only ${n} coins survived screening. Need at least 3 for portfolio optimization.`);
        process.exit(1);
    }

    console.log(`📊 Optimizing portfolio of ${n} screened coins\n`);

    // Compute covariance matrix
    const { covMatrix, means, shrinkage } = computeCovarianceMatrix(allReturns, assetNames);
    console.log(`   Covariance matrix: ${n}×${n} (Ledoit-Wolf shrinkage: ${(shrinkage * 100).toFixed(1)}%)\n`);

    // ── Run all three methods ──
    const methods = [
        { name: "Minimum Variance", fn: () => minimumVariance(covMatrix, n) },
        { name: "Risk Parity", fn: () => riskParity(covMatrix, n) },
        { name: "Max Diversification", fn: () => maxDiversification(covMatrix, n) },
    ];

    const results = {};

    for (const method of methods) {
        console.log(`\n━━━ ${method.name.toUpperCase()} ━━━`);
        const weights = method.fn();
        const metrics = portfolioMetrics(weights, allReturns, assetNames);

        // Filter to non-zero weights only
        const allocations = assetNames
            .map((name, i) => ({
                pair: name,
                base: screened[i].base,
                weight: Math.round(weights[i] * 10000) / 10000,
                individualSharpe: screened[i].sharpe,
                individualExpectancy: screened[i].expectancy
            }))
            .filter(a => a.weight > 0.005)
            .sort((a, b) => b.weight - a.weight);

        console.log(`\n  Portfolio: ${allocations.length} coins | Sharpe: ${metrics.sharpe} | MaxDD: ${metrics.maxDD}R | Calmar: ${metrics.calmar}`);
        console.log(`  Total R: ${metrics.totalR} | Smoothness: ${metrics.smoothness} | Div Ratio: ${metrics.divRatio}\n`);

        console.log("  Coin      Weight    Sharpe   Exp.");
        console.log("  ────      ──────    ──────   ────");
        for (const a of allocations) {
            console.log(
                `  ${a.base.padEnd(8)}  ${(a.weight * 100).toFixed(1).padStart(5)}%    ` +
                `${a.individualSharpe.toFixed(2).padStart(5)}   ${a.individualExpectancy > 0 ? "+" : ""}${a.individualExpectancy.toFixed(2)}`
            );
        }

        results[method.name] = {
            allocations,
            metrics,
            weights: assetNames.map((name, i) => ({ pair: name, weight: weights[i] }))
        };
    }

    // ── Compare methods ──
    console.log("\n\n═══════════════════════════════════════════════════════════════");
    console.log("  METHOD COMPARISON");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Method               Sharpe  MaxDD   Calmar  Smooth  DivR  Coins");
    console.log("  ──────               ──────  ─────   ──────  ──────  ────  ─────");
    for (const [name, data] of Object.entries(results)) {
        const m = data.metrics;
        const coins = data.allocations.length;
        console.log(
            `  ${name.padEnd(20)} ${m.sharpe.toFixed(2).padStart(6)}  ${m.maxDD.toFixed(1).padStart(6)}  ` +
            `${m.calmar.toFixed(2).padStart(6)}  ${m.smoothness.toFixed(3).padStart(6)}  ${m.divRatio.toFixed(2).padStart(4)}  ${String(coins).padStart(4)}`
        );
    }

    // ── Pick best method (by Sharpe) ──
    const bestMethod = Object.entries(results)
        .sort((a, b) => b[1].metrics.sharpe - a[1].metrics.sharpe)[0];

    console.log(`\n🏆 RECOMMENDED: ${bestMethod[0]} (Sharpe: ${bestMethod[1].metrics.sharpe})`);

    // ── Also compute equal-weight baseline ──
    const equalW = new Array(n).fill(1 / n);
    const ewMetrics = portfolioMetrics(equalW, allReturns, assetNames);
    console.log(`\n📊 Equal-Weight Baseline: Sharpe=${ewMetrics.sharpe} MaxDD=${ewMetrics.maxDD}R Calmar=${ewMetrics.calmar}`);

    // Save results
    const outputFile = `portfolio_optimization_${direction}.json`;
    fs.writeFileSync(outputFile, JSON.stringify({
        direction,
        coinsScreened: n,
        shrinkageUsed: shrinkage,
        methods: results,
        bestMethod: bestMethod[0],
        equalWeightBaseline: ewMetrics,
        generatedAt: new Date().toISOString()
    }, null, 2));
    console.log(`\n📁 Results: ${outputFile}`);

    // Save the final deployment universe (best method's non-zero coins)
    const deployPairs = bestMethod[1].allocations.map(a => a.pair);
    const deployFile = `deployment_universe_${direction}.json`;
    fs.writeFileSync(deployFile, JSON.stringify({
        method: bestMethod[0],
        direction,
        pairs: deployPairs,
        allocations: bestMethod[1].allocations,
        metrics: bestMethod[1].metrics
    }, null, 2));
    console.log(`📁 Deployment universe: ${deployFile}`);
}

main();
