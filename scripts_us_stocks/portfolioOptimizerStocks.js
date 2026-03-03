/**
 * portfolioOptimizerStocks.js
 * 
 * Portfolio construction for US stocks — finds the combination that produces
 * the SMOOTHEST equity curve (minimum drawdown, maximum risk-adjusted return).
 * 
 * Implements four methods:
 *   1. Minimum Variance Portfolio (Markowitz 1952)
 *   2. Risk Parity / Equal Risk Contribution (Maillard, Roncalli & Teïletche 2010)
 *   3. Maximum Diversification Ratio (Choueifaty & Coignard 2008)
 *   4. Hierarchical Risk Parity (López de Prado 2016) — THE hedge fund standard
 * 
 * Enhancements over crypto optimizer:
 *   - Sector weight cap (no single GICS sector > 35%)
 *   - Composite scoring across multiple quality dimensions
 *   - HRP method using clustering on correlation matrix
 * 
 * References:
 *   - Markowitz (1952) "Portfolio Selection" (J. Finance)
 *   - Maillard, Roncalli, Teïletche (2010) "Equally Weighted Risk Contribution"
 *   - Choueifaty & Coignard (2008) "Toward Maximum Diversification"
 *   - López de Prado (2016) "Building Diversified Portfolios that Outperform Out-of-Sample" (SSRN)
 *   - Ledoit & Wolf (2004) "A Well-Conditioned Estimator for Large-Dimensional Covariance Matrices"
 * 
 * Usage:
 *   node scripts_us_stocks/portfolioOptimizerStocks.js --direction=long
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
// MATRIX MATH UTILITIES
// ═══════════════════════════════════════════════

function matVecMul(A, v) {
    return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}

function dotProduct(a, b) {
    return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

/**
 * Compute covariance matrix from daily returns with Ledoit-Wolf shrinkage
 */
function computeCovarianceMatrix(returnsByAsset, assetNames) {
    const n = assetNames.length;
    const minLen = Math.min(...assetNames.map(a => (returnsByAsset[a] || []).length));
    if (minLen < 20) {
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

    const shrinkage = Math.min(0.5, Math.max(0.1, 1 / Math.sqrt(T)));

    const covMatrix = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
            (1 - shrinkage) * S[i][j] + shrinkage * target[i][j]
        )
    );

    return { covMatrix, means, shrinkage };
}

// ═══════════════════════════════════════════════
// SIMPLEX PROJECTION (Duchi et al. 2008)
// ═══════════════════════════════════════════════

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
// METHOD 1: MINIMUM VARIANCE (Markowitz 1952)
// ═══════════════════════════════════════════════

function minimumVariance(covMatrix, n) {
    let w = new Array(n).fill(1 / n);
    const lr = 0.01;
    const iterations = 5000;

    for (let iter = 0; iter < iterations; iter++) {
        const grad = matVecMul(covMatrix, w).map(g => 2 * g);
        w = w.map((wi, i) => wi - lr * grad[i]);
        w = projectSimplex(w);
    }
    return w;
}

// ═══════════════════════════════════════════════
// METHOD 2: RISK PARITY (Maillard et al. 2010)
// ═══════════════════════════════════════════════

function riskParity(covMatrix, n) {
    let w = new Array(n).fill(1 / n);
    const budgets = new Array(n).fill(1 / n);
    const iterations = 3000;
    const tol = 1e-10;

    for (let iter = 0; iter < iterations; iter++) {
        const sigma_w = matVecMul(covMatrix, w);
        const totalRisk = Math.sqrt(dotProduct(w, sigma_w));
        if (totalRisk < 1e-15) break;

        const mrc = sigma_w.map(sw => sw / totalRisk);
        const rc = w.map((wi, i) => wi * mrc[i]);
        const totalRC = rc.reduce((s, r) => s + r, 0);
        const targetRC = budgets.map(b => b * totalRC);

        const newW = w.map((wi, i) => {
            if (mrc[i] < 1e-15) return wi;
            return wi * (targetRC[i] / (rc[i] + 1e-15));
        });

        const sumW = newW.reduce((s, v) => s + v, 0);
        w = newW.map(v => v / sumW);

        const maxDiff = Math.max(...rc.map((r, i) => Math.abs(r - targetRC[i])));
        if (maxDiff < tol) break;
    }
    return w;
}

// ═══════════════════════════════════════════════
// METHOD 3: MAX DIVERSIFICATION (Choueifaty 2008)
// ═══════════════════════════════════════════════

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

        const grad = vols.map((vi, i) =>
            vi / portfolioVol - weightedAvgVol * sigma_w[i] / (portfolioVol ** 3)
        );

        w = w.map((wi, i) => wi + lr * grad[i]);
        w = projectSimplex(w);
    }
    return w;
}

// ═══════════════════════════════════════════════
// METHOD 4: HIERARCHICAL RISK PARITY (HRP)
// López de Prado (2016)
// ═══════════════════════════════════════════════

/**
 * HRP uses hierarchical clustering on the correlation matrix
 * to build a tree-based allocation. No matrix inversion needed,
 * making it robust to estimation error.
 * 
 * Steps:
 *   1. Compute distance matrix from correlation
 *   2. Hierarchical clustering (single-linkage)
 *   3. Quasi-diagonalize the covariance matrix
 *   4. Recursive bisection for weight allocation
 */
function hrp(covMatrix, corrMatrix, n) {
    // Step 1: Distance matrix — d(i,j) = √(0.5 × (1 - ρ(i,j)))
    const distMatrix = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
            if (i === j) return 0;
            return Math.sqrt(0.5 * (1 - corrMatrix[i][j]));
        })
    );

    // Step 2: Single-linkage hierarchical clustering
    const linkage = singleLinkageClustering(distMatrix, n);

    // Step 3: Get quasi-diagonal ordering from dendrogram
    const sortedIdx = getQuasiDiagOrder(linkage, n);

    // Step 4: Recursive bisection allocation
    const weights = new Array(n).fill(1);
    recursiveBisection(covMatrix, sortedIdx, weights);

    // Normalize
    const total = weights.reduce((s, w) => s + w, 0);
    return weights.map(w => w / total);
}

/**
 * Single-linkage agglomerative clustering
 * Returns array of [cluster1, cluster2, distance, size]
 */
function singleLinkageClustering(distMatrix, n) {
    // Active cluster IDs and their member indices
    const clusters = {};
    for (let i = 0; i < n; i++) {
        clusters[i] = [i];
    }

    // Copy distance matrix
    const dist = distMatrix.map(row => [...row]);
    const active = new Set(Array.from({ length: n }, (_, i) => i));
    const merges = [];
    let nextId = n;

    while (active.size > 1) {
        // Find minimum distance pair
        let minDist = Infinity;
        let bestI = -1, bestJ = -1;

        const activeArr = [...active];
        for (let a = 0; a < activeArr.length; a++) {
            for (let b = a + 1; b < activeArr.length; b++) {
                const i = activeArr[a];
                const j = activeArr[b];
                if (dist[i][j] < minDist) {
                    minDist = dist[i][j];
                    bestI = i;
                    bestJ = j;
                }
            }
        }

        // Merge bestI and bestJ into new cluster
        const newCluster = [...(clusters[bestI] || []), ...(clusters[bestJ] || [])];
        clusters[nextId] = newCluster;

        merges.push([bestI, bestJ, minDist, newCluster.length]);

        // Update distances (single-linkage: min distance)
        // Expand dist matrix if needed
        while (dist.length <= nextId) {
            dist.push(new Array(dist.length + 1).fill(Infinity));
        }
        for (let i = 0; i < dist.length; i++) {
            while (dist[i].length <= nextId) dist[i].push(Infinity);
        }

        for (const k of active) {
            if (k === bestI || k === bestJ) continue;
            const d = Math.min(
                dist[Math.min(k, bestI)][Math.max(k, bestI)],
                dist[Math.min(k, bestJ)][Math.max(k, bestJ)]
            );
            dist[k][nextId] = d;
            dist[nextId][k] = d;
        }

        active.delete(bestI);
        active.delete(bestJ);
        active.add(nextId);

        delete clusters[bestI];
        delete clusters[bestJ];

        nextId++;
    }

    // Store clusters for traversal
    merges._clusters = {};
    let id = n;
    for (const m of merges) {
        merges._clusters[id] = { left: m[0], right: m[1] };
        id++;
    }

    return merges;
}

/**
 * Get quasi-diagonal ordering from hierarchical clustering
 */
function getQuasiDiagOrder(merges, n) {
    if (merges.length === 0) return Array.from({ length: n }, (_, i) => i);

    const clusters = merges._clusters;

    function getLeaves(nodeId) {
        if (nodeId < n) return [nodeId];
        const node = clusters[nodeId];
        if (!node) return [nodeId];
        return [...getLeaves(node.left), ...getLeaves(node.right)];
    }

    // Root is the last merge
    const rootId = n + merges.length - 1;
    return getLeaves(rootId);
}

/**
 * Recursive bisection — allocate weights based on inverse variance
 */
function recursiveBisection(covMatrix, sortedIdx, weights) {
    if (sortedIdx.length <= 1) return;

    const mid = Math.floor(sortedIdx.length / 2);
    const left = sortedIdx.slice(0, mid);
    const right = sortedIdx.slice(mid);

    // Compute cluster variance for left and right
    const leftVar = clusterVariance(covMatrix, left);
    const rightVar = clusterVariance(covMatrix, right);

    // Allocate inversely proportional to variance
    const totalInvVar = 1 / (leftVar + 1e-15) + 1 / (rightVar + 1e-15);
    const leftAlloc = (1 / (leftVar + 1e-15)) / totalInvVar;
    const rightAlloc = (1 / (rightVar + 1e-15)) / totalInvVar;

    for (const i of left) weights[i] *= leftAlloc;
    for (const i of right) weights[i] *= rightAlloc;

    // Recurse
    if (left.length > 1) recursiveBisection(covMatrix, left, weights);
    if (right.length > 1) recursiveBisection(covMatrix, right, weights);
}

/**
 * Compute variance of a cluster (inverse-variance weighted)
 */
function clusterVariance(covMatrix, indices) {
    if (indices.length === 1) return covMatrix[indices[0]][indices[0]];

    // Use inverse-variance weights within cluster
    const variances = indices.map(i => covMatrix[i][i]);
    const invVar = variances.map(v => 1 / (v + 1e-15));
    const totalInvVar = invVar.reduce((s, iv) => s + iv, 0);
    const w = invVar.map(iv => iv / totalInvVar);

    // Portfolio variance with these weights
    let portfolioVar = 0;
    for (let a = 0; a < indices.length; a++) {
        for (let b = 0; b < indices.length; b++) {
            portfolioVar += w[a] * w[b] * covMatrix[indices[a]][indices[b]];
        }
    }
    return portfolioVar;
}

// ═══════════════════════════════════════════════
// SECTOR WEIGHT CAP ENFORCEMENT
// ═══════════════════════════════════════════════

const MAX_SECTOR_WEIGHT = 0.35; // No sector > 35%

function enforceSectorCap(weights, assetNames) {
    let w = [...weights];
    const n = w.length;

    // Group by sector
    const sectorWeights = {};
    for (let i = 0; i < n; i++) {
        const sector = SECTOR_MAP[assetNames[i]] || "Unknown";
        if (!sectorWeights[sector]) sectorWeights[sector] = [];
        sectorWeights[sector].push(i);
    }

    // Iterative proportional fitting — cap sectors and redistribute
    for (let iter = 0; iter < 10; iter++) {
        let capped = false;

        for (const [sector, indices] of Object.entries(sectorWeights)) {
            const totalSectorW = indices.reduce((s, i) => s + w[i], 0);
            if (totalSectorW > MAX_SECTOR_WEIGHT) {
                const scale = MAX_SECTOR_WEIGHT / totalSectorW;
                const excess = totalSectorW - MAX_SECTOR_WEIGHT;

                // Scale down this sector
                for (const i of indices) w[i] *= scale;

                // Distribute excess to other sectors proportionally
                const otherIndices = [];
                for (let i = 0; i < n; i++) {
                    if (!indices.includes(i)) otherIndices.push(i);
                }
                const otherTotal = otherIndices.reduce((s, i) => s + w[i], 0);
                if (otherTotal > 0) {
                    for (const i of otherIndices) {
                        w[i] += excess * (w[i] / otherTotal);
                    }
                }
                capped = true;
            }
        }

        if (!capped) break;
    }

    // Normalize
    const total = w.reduce((s, v) => s + v, 0);
    return w.map(v => v / total);
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

    // Sharpe (annualized √252 for stocks)
    const avgR = portfolioDailyR.reduce((s, r) => s + r, 0) / portfolioDailyR.length;
    const stdR = Math.sqrt(
        portfolioDailyR.reduce((s, r) => s + (r - avgR) ** 2, 0) / portfolioDailyR.length
    );
    const sharpe = stdR > 0 ? (avgR / stdR) * Math.sqrt(252) : 0;
    const calmar = maxDD > 0 ? equity / maxDD : 0;

    // Sortino (downside only)
    const downsideR = portfolioDailyR.filter(r => r < 0);
    const downsideDev = downsideR.length > 0
        ? Math.sqrt(downsideR.reduce((s, r) => s + r ** 2, 0) / portfolioDailyR.length)
        : 0;
    const sortino = downsideDev > 0 ? (avgR / downsideDev) * Math.sqrt(252) : 0;

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
        sortino: Math.round(sortino * 100) / 100,
        calmar: Math.round(calmar * 100) / 100,
        divRatio: Math.round(divRatio * 100) / 100,
        smoothness: Math.round(r2 * 1000) / 1000,
        days: minLen
    };
}

// ═══════════════════════════════════════════════
// COMPOSITE SCORE — multidimensional quality ranking
// ═══════════════════════════════════════════════

function compositeScore(metrics) {
    // Normalized scoring:
    //   Sharpe:     35% weight (risk-adjusted return is king)
    //   Calmar:     25% weight (return per unit drawdown)  
    //   Smoothness: 25% weight (equity curve linearity)
    //   DivRatio:   15% weight (diversification benefit)
    return 0.35 * metrics.sharpe +
        0.25 * metrics.calmar +
        0.25 * (metrics.smoothness * 5) + // Scale smoothness [0-1] to comparable range
        0.15 * metrics.divRatio;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
    const direction = parseDirection();

    const outputDir = `./result_us_stocks_${direction}`;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log(`║  📐  STOCK PORTFOLIO OPTIMIZER — ${direction.toUpperCase().padEnd(22)}║`);
    console.log("╚══════════════════════════════════════════════════════════╝\n");

    // Load inputs
    const screenedFile = path.join(outputDir, "screened_universe.json");
    const returnsFile = path.join(outputDir, "screened_daily_returns.json");
    const corrFile = path.join(outputDir, "correlation_matrix.json");

    if (!fs.existsSync(screenedFile) || !fs.existsSync(returnsFile)) {
        console.error("❌ Missing input files. Run statisticalScreenStocks.js first.");
        process.exit(1);
    }

    const screened = JSON.parse(fs.readFileSync(screenedFile, "utf8"));
    const allReturns = JSON.parse(fs.readFileSync(returnsFile, "utf8"));

    // Load correlation matrix if available (from sectorRiskModel.js)
    let corrMatrix = null;
    if (fs.existsSync(corrFile)) {
        const corrData = JSON.parse(fs.readFileSync(corrFile, "utf8"));
        corrMatrix = corrData.shrunk || corrData.raw;
    }

    const assetNames = screened.map(c => c.pair);
    const n = assetNames.length;

    if (n < 3) {
        console.error(`❌ Only ${n} stocks survived screening. Need at least 3.`);
        process.exit(1);
    }

    console.log(`📊 Optimizing portfolio of ${n} screened stocks\n`);

    // Compute covariance matrix
    const { covMatrix, means, shrinkage } = computeCovarianceMatrix(allReturns, assetNames);
    console.log(`   Covariance matrix: ${n}×${n} (Ledoit-Wolf shrinkage: ${(shrinkage * 100).toFixed(1)}%)`);

    // If no external correlation matrix, compute from covariance
    if (!corrMatrix) {
        corrMatrix = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => {
                const si = Math.sqrt(covMatrix[i][i]);
                const sj = Math.sqrt(covMatrix[j][j]);
                return (si > 0 && sj > 0) ? covMatrix[i][j] / (si * sj) : (i === j ? 1 : 0);
            })
        );
    }

    // ── Run all four methods ──
    const methods = [
        { name: "Minimum Variance", fn: () => minimumVariance(covMatrix, n) },
        { name: "Risk Parity", fn: () => riskParity(covMatrix, n) },
        { name: "Max Diversification", fn: () => maxDiversification(covMatrix, n) },
        { name: "HRP (López de Prado)", fn: () => hrp(covMatrix, corrMatrix, n) },
    ];

    const results = {};

    for (const method of methods) {
        console.log(`\n━━━ ${method.name.toUpperCase()} ━━━`);

        let rawWeights = method.fn();

        // Enforce sector cap
        const weights = enforceSectorCap(rawWeights, assetNames);

        const metrics = portfolioMetrics(weights, allReturns, assetNames);
        const score = compositeScore(metrics);

        // Filter to non-zero weights only
        const allocations = assetNames
            .map((name, i) => ({
                pair: name,
                base: name,
                sector: SECTOR_MAP[name] || "Unknown",
                weight: Math.round(weights[i] * 10000) / 10000,
                individualSharpe: screened[i].sharpe,
                individualExpectancy: screened[i].expectancy
            }))
            .filter(a => a.weight > 0.005)
            .sort((a, b) => b.weight - a.weight);

        // Sector weight summary
        const sectorWeightSummary = {};
        for (const a of allocations) {
            sectorWeightSummary[a.sector] = (sectorWeightSummary[a.sector] || 0) + a.weight;
        }

        console.log(`\n  Portfolio: ${allocations.length} stocks | Sharpe: ${metrics.sharpe} | Sortino: ${metrics.sortino} | MaxDD: ${metrics.maxDD}R | Calmar: ${metrics.calmar}`);
        console.log(`  Total R: ${metrics.totalR} | Smoothness: ${metrics.smoothness} | Div Ratio: ${metrics.divRatio} | Composite: ${score.toFixed(3)}\n`);

        console.log("  Stock     Sector           Weight   Sharpe   Exp.");
        console.log("  ─────     ──────           ──────   ──────   ────");
        for (const a of allocations) {
            console.log(
                `  ${a.base.padEnd(8)}  ${a.sector.padEnd(16)} ${(a.weight * 100).toFixed(1).padStart(5)}%    ` +
                `${a.individualSharpe.toFixed(2).padStart(5)}   ${a.individualExpectancy > 0 ? "+" : ""}${a.individualExpectancy.toFixed(2)}`
            );
        }

        console.log(`\n  Sector weights:`);
        for (const [sec, w] of Object.entries(sectorWeightSummary).sort((a, b) => b[1] - a[1])) {
            const pct = (w * 100).toFixed(1);
            const bar = "█".repeat(Math.round(w * 40));
            console.log(`    ${sec.padEnd(16)} ${bar} ${pct}%`);
        }

        results[method.name] = {
            allocations,
            metrics,
            compositeScore: Math.round(score * 1000) / 1000,
            sectorWeights: sectorWeightSummary,
            weights: assetNames.map((name, i) => ({ pair: name, weight: weights[i] }))
        };
    }

    // ── Compare methods ──
    console.log("\n\n═══════════════════════════════════════════════════════════════════════════");
    console.log("  METHOD COMPARISON");
    console.log("═══════════════════════════════════════════════════════════════════════════");
    console.log("  Method                 Sharpe  Sortino  MaxDD   Calmar  Smooth  DivR   Score  Stocks");
    console.log("  ──────                 ──────  ───────  ─────   ──────  ──────  ────   ─────  ──────");
    for (const [name, data] of Object.entries(results)) {
        const m = data.metrics;
        const stocks = data.allocations.length;
        console.log(
            `  ${name.padEnd(22)} ${m.sharpe.toFixed(2).padStart(6)}  ${m.sortino.toFixed(2).padStart(7)}  ${m.maxDD.toFixed(1).padStart(6)}  ` +
            `${m.calmar.toFixed(2).padStart(6)}  ${m.smoothness.toFixed(3).padStart(6)}  ${m.divRatio.toFixed(2).padStart(4)}   ` +
            `${data.compositeScore.toFixed(3).padStart(5)}  ${String(stocks).padStart(4)}`
        );
    }

    // ── Pick best method (by composite score) ──
    const bestMethod = Object.entries(results)
        .sort((a, b) => b[1].compositeScore - a[1].compositeScore)[0];

    console.log(`\n🏆 RECOMMENDED: ${bestMethod[0]} (Composite Score: ${bestMethod[1].compositeScore})`);

    // ── Equal-weight baseline ──
    const equalW = new Array(n).fill(1 / n);
    const ewMetrics = portfolioMetrics(equalW, allReturns, assetNames);
    console.log(`\n📊 Equal-Weight Baseline: Sharpe=${ewMetrics.sharpe} MaxDD=${ewMetrics.maxDD}R Calmar=${ewMetrics.calmar}`);

    // ── Save results ──
    const outputFile = path.join(outputDir, "portfolio_optimization.json");
    fs.writeFileSync(outputFile, JSON.stringify({
        direction,
        stocksScreened: n,
        shrinkageUsed: shrinkage,
        sectorCapUsed: MAX_SECTOR_WEIGHT,
        methods: results,
        bestMethod: bestMethod[0],
        equalWeightBaseline: ewMetrics,
        generatedAt: new Date().toISOString()
    }, null, 2));
    console.log(`\n📁 Results: ${outputFile}`);

    // Save deployment universe
    const deployPairs = bestMethod[1].allocations.map(a => a.pair);
    const deployFile = path.join(outputDir, "deployment_universe.json");
    fs.writeFileSync(deployFile, JSON.stringify({
        method: bestMethod[0],
        direction,
        pairs: deployPairs,
        allocations: bestMethod[1].allocations,
        metrics: bestMethod[1].metrics,
        compositeScore: bestMethod[1].compositeScore,
        sectorWeights: bestMethod[1].sectorWeights
    }, null, 2));
    console.log(`📁 Deployment universe: ${deployFile}`);
}

main();
