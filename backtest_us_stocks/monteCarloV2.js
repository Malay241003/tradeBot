/**
 * Monte Carlo V2 — Institutional-Grade Risk Engine
 *
 * Layer 1: Block Bootstrap MC — preserves losing streak clusters
 * Layer 2: Correlation-Preserving MC — preserves cross-pair clustering
 * Layer 3: Stress Injection MC — tests edge decay & worst-case scenarios
 *
 * All layers export equity paths for visualization.
 */

import fs from "fs";

// ============================================================
// UTILITIES
// ============================================================

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(p * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
}

function median(arr) {
    return percentile(arr, 0.5);
}

function simulateEquityPath(tradeSequence) {
    let equity = 0;
    let peak = 0;
    let maxDD = 0;
    const path = [0];

    for (const t of tradeSequence) {
        equity += t.R;
        path.push(equity);
        peak = Math.max(peak, equity);
        maxDD = Math.max(maxDD, peak - equity);
    }

    return { finalEquity: equity, maxDD, path };
}

function computeStats(results, capitalR) {
    const dds = results.map(r => r.maxDD);
    const equities = results.map(r => r.finalEquity);

    const ruinThreshold = capitalR * 0.5;  // 50% of capital in R
    const ruinCount = dds.filter(d => d >= ruinThreshold).length;

    return {
        medianDD: median(dds),
        pct5DD: percentile(dds, 0.95),    // 5% worst-case (95th percentile of DD)
        pct1DD: percentile(dds, 0.99),    // 1% worst-case (99th percentile of DD)
        medianEquity: median(equities),
        pct5Equity: percentile(equities, 0.05),  // 5% worst-case equity
        riskOfRuin: ((ruinCount / results.length) * 100).toFixed(2) + "%"
    };
}

// ============================================================
// LAYER 1: BLOCK BOOTSTRAP MC
// ============================================================

export function blockBootstrapMC(trades, blockSize = 25, runs = 5000) {
    const results = [];
    const n = trades.length;

    for (let r = 0; r < runs; r++) {
        const sequence = [];
        while (sequence.length < n) {
            // Pick a random starting index for a block
            const start = Math.floor(Math.random() * (n - blockSize + 1));
            const block = trades.slice(start, start + blockSize);
            sequence.push(...block);
        }
        // Trim to exact trade count
        sequence.length = n;
        results.push(simulateEquityPath(sequence));
    }

    return results;
}

// ============================================================
// LAYER 2: CORRELATION-PRESERVING MC
// ============================================================

export function correlationPreservingMC(trades, bucketDays = 7, runs = 5000) {
    // Group trades into time buckets
    const buckets = new Map();
    const bucketMs = bucketDays * 24 * 60 * 60 * 1000;

    for (const t of trades) {
        const bucketKey = Math.floor(t.entryTime / bucketMs);
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey).push(t);
    }

    const bucketArray = [...buckets.values()];
    const numBuckets = bucketArray.length;
    const results = [];

    for (let r = 0; r < runs; r++) {
        const sequence = [];
        // Resample entire buckets with replacement
        const targetBuckets = numBuckets;
        for (let b = 0; b < targetBuckets; b++) {
            const idx = Math.floor(Math.random() * numBuckets);
            sequence.push(...bucketArray[idx]);
        }
        results.push(simulateEquityPath(sequence));
    }

    return results;
}

// ============================================================
// LAYER 3: STRESS INJECTION MC
// ============================================================

export function stressInjectionMC(trades, runs = 3000) {
    const results = [];
    const n = trades.length;

    for (let r = 0; r < runs; r++) {
        // Start with a block-bootstrap base
        const sequence = [];
        const blockSize = 25;
        while (sequence.length < n) {
            const start = Math.floor(Math.random() * (n - blockSize + 1));
            sequence.push(...trades.slice(start, start + blockSize));
        }
        sequence.length = n;

        // ─── STRESS 1: Inject 2–4 consecutive loss streaks ───
        // Simulates multiple regime shifts (COVID, LUNA, FTX, etc.)
        const numStreaks = 2 + Math.floor(Math.random() * 3);  // 2-4 streaks
        const minGap = 50;
        const usedZones = [];

        for (let k = 0; k < numStreaks; k++) {
            const streakLen = 8 + Math.floor(Math.random() * 5);  // 8-12 each
            let insertAt;
            let attempts = 0;
            do {
                insertAt = Math.floor(Math.random() * (n - streakLen));
                attempts++;
            } while (attempts < 50 && usedZones.some(z => Math.abs(insertAt - z) < minGap));

            usedZones.push(insertAt);
            for (let s = 0; s < streakLen; s++) {
                sequence[insertAt + s] = { ...sequence[insertAt + s], R: -1.75 };  // worst-case scale-in loss
            }
        }

        // ─── STRESS 2: Edge decay on 30% of trades ───
        // Randomly degrade ~30% of wins to losses (simulates edge erosion)
        const decayRate = 0.25 + Math.random() * 0.1;  // 25-35%
        for (let i = 0; i < sequence.length; i++) {
            if (sequence[i].R > 0 && Math.random() < decayRate) {
                sequence[i] = { ...sequence[i], R: -1 };  // flip win to standard loss
            }
        }

        results.push(simulateEquityPath(sequence));
    }

    return results;
}

// ============================================================
// BASELINE: IID SHUFFLE (current implementation)
// ============================================================

export function iidShuffleMC(trades, runs = 5000) {
    const results = [];

    for (let r = 0; r < runs; r++) {
        const shuffled = [...trades].sort(() => Math.random() - 0.5);
        results.push(simulateEquityPath(shuffled));
    }

    return results;
}

// ============================================================
// ORCHESTRATOR — FULL MC REPORT
// ============================================================

export function runFullMCReport(trades, capitalR = 200, direction = "short") {
    // capitalR = 10000 / 50 = 200R
    console.log("\n╔═══════════════════════════════════════════════════════════════╗");
    console.log("║          🎲  MONTE CARLO V2 — RISK REPORT                  ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝\n");

    // 1. IID Shuffle (baseline)
    console.log("  ⏳ Running IID Shuffle MC (5,000 sims)...");
    const iid = iidShuffleMC(trades, 5000);
    const iidStats = computeStats(iid, capitalR);
    console.log("  ✅ IID Shuffle done.");

    // 2. Block Bootstrap
    console.log("  ⏳ Running Block Bootstrap MC (5,000 sims, block=25)...");
    const block = blockBootstrapMC(trades, 25, 5000);
    const blockStats = computeStats(block, capitalR);
    console.log("  ✅ Block Bootstrap done.");

    // 3. Correlation-Preserving
    console.log("  ⏳ Running Correlation-Preserving MC (5,000 sims, 7-day buckets)...");
    const corr = correlationPreservingMC(trades, 7, 5000);
    const corrStats = computeStats(corr, capitalR);
    console.log("  ✅ Correlation-Preserving done.");

    // 4. Stress Injection
    console.log("  ⏳ Running Stress Injection MC (3,000 sims)...");
    const stress = stressInjectionMC(trades, 3000);
    const stressStats = computeStats(stress, capitalR);
    console.log("  ✅ Stress Injection done.\n");

    // ─── COMPARISON TABLE ───
    const models = [
        { name: "IID Shuffle", stats: iidStats },
        { name: "Block Bootstrap", stats: blockStats },
        { name: "Correl-Preserve", stats: corrStats },
        { name: "Stress Injected", stats: stressStats }
    ];

    console.log("  ┌──────────────────┬────────┬────────┬───────────────┬──────────┐");
    console.log("  │ Model            │ 1% DD  │ 5% DD  │ Median Equity │ RoR      │");
    console.log("  ├──────────────────┼────────┼────────┼───────────────┼──────────┤");

    for (const m of models) {
        const s = m.stats;
        console.log(
            `  │ ${m.name.padEnd(16)} │ ${s.pct1DD.toFixed(1).padStart(6)} │ ${s.pct5DD.toFixed(1).padStart(6)} │ ${s.medianEquity.toFixed(1).padStart(13)} │ ${s.riskOfRuin.padStart(8)} │`
        );
    }

    console.log("  └──────────────────┴────────┴────────┴───────────────┴──────────┘");

    // ─── EXPORT EQUITY PATHS FOR VISUALIZATION ───
    // Sample 50 paths per model for the fan chart
    const samplePaths = (results, count = 50) => {
        const step = Math.max(1, Math.floor(results.length / count));
        return results.filter((_, i) => i % step === 0).slice(0, count).map(r => r.path);
    };

    const mcData = {
        models: models.map(m => ({
            name: m.name,
            stats: m.stats
        })),
        paths: {
            iid: samplePaths(iid),
            block: samplePaths(block),
            correlated: samplePaths(corr),
            stress: samplePaths(stress)
        },
        drawdowns: {
            iid: iid.map(r => r.maxDD),
            block: block.map(r => r.maxDD),
            correlated: corr.map(r => r.maxDD),
            stress: stress.map(r => r.maxDD)
        }
    };

    const suffix = `_${direction}`;

    fs.writeFileSync(`./mc_v2_report${suffix}.json`, JSON.stringify(mcData, null, 2));

    // ─── EXPORT COMPARISON CSV ───
    const csvHeader = "Model,1pct_DD,5pct_DD,Median_DD,Median_Equity,5pct_Equity,Risk_of_Ruin\n";
    const csvRows = models.map(m => {
        const s = m.stats;
        return `${m.name},${s.pct1DD.toFixed(2)},${s.pct5DD.toFixed(2)},${s.medianDD.toFixed(2)},${s.medianEquity.toFixed(2)},${s.pct5Equity.toFixed(2)},${s.riskOfRuin}`;
    }).join("\n");

    fs.writeFileSync(`./mc_v2_comparison${suffix}.csv`, csvHeader + csvRows);
    console.log(`\n  📁 Exported: mc_v2_report${suffix}.json, mc_v2_comparison${suffix}.csv`);

    // ─── CAPITAL RISK INTERPRETATION ───
    const worstDD_R = stressStats.pct1DD;
    const worstDD_Dollar = worstDD_R * 50;
    const worstDD_Pct = ((worstDD_R / capitalR) * 100).toFixed(1);

    console.log("\n  💰 CAPITAL RISK INTERPRETATION (at ₹50/R, ₹10,000 capital):");
    console.log(`     1% worst-case drawdown: ${worstDD_R.toFixed(1)}R = ₹${worstDD_Dollar.toFixed(0)} (${worstDD_Pct}% of capital)`);
    console.log(`     Risk of Ruin (50% loss): ${stressStats.riskOfRuin}`);

    if (worstDD_R > capitalR * 0.5) {
        console.log("     ⚠️  WARNING: 1% worst-case DD exceeds 50% of capital!");
    } else if (worstDD_R > capitalR * 0.3) {
        console.log("     🟡 CAUTION: 1% worst-case DD exceeds 30% of capital.");
    } else {
        console.log("     🟢 SAFE: 1% worst-case DD within 30% of capital.");
    }

    return mcData;
}

// ============================================================
// 5-YEAR COMPOUNDING MC SIMULATION
// ============================================================

function simulateCompoundingPath(tradeSequence, startingCapital, riskPct) {
    let equity = startingCapital;
    let peak = startingCapital;
    let maxDDPct = 0;
    let timeTo2x = null;
    const path = [startingCapital];

    for (let i = 0; i < tradeSequence.length; i++) {
        const t = tradeSequence[i];
        if (equity <= 0) break;

        const riskAmount = equity * riskPct;        // 0.5% of current equity
        const pnl = t.R * riskAmount;               // R-multiple × risk amount
        equity += pnl;
        equity = Math.max(0, equity);                // can't go below 0
        path.push(equity);

        // Track peak and drawdown %
        peak = Math.max(peak, equity);
        const ddPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        maxDDPct = Math.max(maxDDPct, ddPct);

        // Track time to 2× capital
        if (timeTo2x === null && equity >= startingCapital * 2) {
            timeTo2x = i + 1;
        }
    }

    // CAGR over 5 years
    const years = 5;
    const cagr = equity > 0 ? (Math.pow(equity / startingCapital, 1 / years) - 1) * 100 : -100;

    return {
        finalEquity: equity,
        maxDDPct,
        cagr,
        timeTo2x,
        blown: equity <= 0,
        path
    };
}

function generateTradeSequence(trades, method, targetLength) {
    const n = trades.length;

    if (method === "block") {
        // Block Bootstrap — preserves streaks
        const sequence = [];
        const blockSize = 25;
        while (sequence.length < targetLength) {
            const start = Math.floor(Math.random() * (n - blockSize + 1));
            sequence.push(...trades.slice(start, start + blockSize));
        }
        sequence.length = targetLength;
        return sequence;
    }

    if (method === "correlated") {
        // Correlation-Preserving — resample weekly buckets
        const bucketMs = 7 * 24 * 60 * 60 * 1000;
        const buckets = new Map();
        for (const t of trades) {
            const key = Math.floor(t.entryTime / bucketMs);
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(t);
        }
        const bucketArray = [...buckets.values()];
        const sequence = [];
        while (sequence.length < targetLength) {
            const idx = Math.floor(Math.random() * bucketArray.length);
            sequence.push(...bucketArray[idx]);
        }
        sequence.length = targetLength;
        return sequence;
    }

    if (method === "stress") {
        // Stress — block bootstrap + edge decay + loss streak injection
        const sequence = [];
        const blockSize = 25;
        while (sequence.length < targetLength) {
            const start = Math.floor(Math.random() * (n - blockSize + 1));
            sequence.push(...trades.slice(start, start + blockSize));
        }
        sequence.length = targetLength;

        // Inject 2–4 consecutive loss streaks, spaced across the sequence
        // (simulates multiple regime shifts: COVID, LUNA, FTX, etc.)
        const numStreaks = 2 + Math.floor(Math.random() * 3);  // 2-4 streaks
        const minGap = 50;  // minimum trades between streaks
        const usedZones = [];

        for (let k = 0; k < numStreaks; k++) {
            const streakLen = 8 + Math.floor(Math.random() * 5);  // 8-12 each
            let insertAt;
            let attempts = 0;

            // Find a non-overlapping insertion point
            do {
                insertAt = Math.floor(Math.random() * (targetLength - streakLen));
                attempts++;
            } while (
                attempts < 50 &&
                usedZones.some(z => Math.abs(insertAt - z) < minGap)
            );

            usedZones.push(insertAt);
            for (let s = 0; s < streakLen; s++) {
                sequence[insertAt + s] = { ...sequence[insertAt + s], R: -1.75 };
            }
        }

        // Edge decay on ~30% of wins
        const decayRate = 0.25 + Math.random() * 0.1;
        for (let i = 0; i < sequence.length; i++) {
            if (sequence[i].R > 0 && Math.random() < decayRate) {
                sequence[i] = { ...sequence[i], R: -1 };
            }
        }

        return sequence;
    }

    // Fallback: IID shuffle
    const shuffled = [...trades].sort(() => Math.random() - 0.5);
    while (shuffled.length < targetLength) {
        shuffled.push(trades[Math.floor(Math.random() * n)]);
    }
    shuffled.length = targetLength;
    return shuffled;
}

export function runCompoundingMC(trades, config = {}) {
    const {
        startingCapital = 10000,
        riskPct = 0.005,           // 0.5%
        tradesPerYear = 121.5,
        projectionYears = 5,
        runs = 5000
    } = config;

    const targetTrades = Math.round(tradesPerYear * projectionYears);

    console.log("\n╔═══════════════════════════════════════════════════════════════╗");
    console.log("║      💰  5-YEAR COMPOUNDING MC — CAPITAL PROJECTION        ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝\n");
    console.log(`  Config: ₹${startingCapital.toLocaleString()} capital, ${(riskPct * 100).toFixed(1)}% risk/trade, ${targetTrades} trades over ${projectionYears} years\n`);

    const scenarios = [
        { name: "Conservative", method: "block" },
        { name: "Realistic", method: "correlated" },
        { name: "Stress", method: "stress" }
    ];

    const allResults = {};

    for (const scenario of scenarios) {
        console.log(`  ⏳ Running ${scenario.name} (${runs} sims, ${targetTrades} trades each)...`);
        const results = [];
        for (let r = 0; r < runs; r++) {
            const seq = generateTradeSequence(trades, scenario.method, targetTrades);
            results.push(simulateCompoundingPath(seq, startingCapital, riskPct));
        }
        allResults[scenario.name] = results;
        console.log(`  ✅ ${scenario.name} done.`);
    }

    // ─── COMPARISON TABLE ───
    console.log("\n  ┌────────────────┬─────────────┬─────────────┬─────────────┬────────┬──────────┬──────────┐");
    console.log("  │ Scenario       │ Median ₹    │ 5th %ile ₹  │ 95th %ile ₹ │ CAGR   │ Max DD%  │ Blown    │");
    console.log("  ├────────────────┼─────────────┼─────────────┼─────────────┼────────┼──────────┼──────────┤");

    const summaryModels = [];

    for (const scenario of scenarios) {
        const results = allResults[scenario.name];
        const finals = results.map(r => r.finalEquity).sort((a, b) => a - b);
        const cagrs = results.map(r => r.cagr).sort((a, b) => a - b);
        const maxDDs = results.map(r => r.maxDDPct).sort((a, b) => a - b);
        const blownPct = (results.filter(r => r.blown).length / results.length * 100).toFixed(2);
        const timesTo2x = results.filter(r => r.timeTo2x !== null).map(r => r.timeTo2x);

        const stats = {
            medianFinal: median(finals),
            pct5Final: percentile(finals, 0.05),
            pct95Final: percentile(finals, 0.95),
            medianCAGR: median(cagrs),
            pct5CAGR: percentile(cagrs, 0.05),
            medianMaxDD: median(maxDDs),
            pct1MaxDD: percentile(maxDDs, 0.99),
            blownPct,
            medianTimeTo2x: timesTo2x.length > 0 ? median(timesTo2x) : null,
            pctReaching2x: ((timesTo2x.length / results.length) * 100).toFixed(1)
        };

        summaryModels.push({ name: scenario.name, stats });

        console.log(
            `  │ ${scenario.name.padEnd(14)} │ ₹${stats.medianFinal.toFixed(0).padStart(9)} │ ₹${stats.pct5Final.toFixed(0).padStart(9)} │ ₹${stats.pct95Final.toFixed(0).padStart(9)} │ ${stats.medianCAGR.toFixed(1).padStart(5)}% │ ${stats.medianMaxDD.toFixed(1).padStart(6)}%  │ ${stats.blownPct.padStart(6)}%  │`
        );
    }

    console.log("  └────────────────┴─────────────┴─────────────┴─────────────┴────────┴──────────┴──────────┘");

    // ─── MILESTONE ANALYSIS ───
    console.log("\n  📊 MILESTONE ANALYSIS:");
    for (const m of summaryModels) {
        const s = m.stats;
        console.log(`\n  ${m.name}:`);
        console.log(`     Median final capital: ₹${s.medianFinal.toFixed(0).toLocaleString()} (${(s.medianFinal / startingCapital).toFixed(1)}× starting)`);
        console.log(`     CAGR: ${s.medianCAGR.toFixed(1)}% median, ${s.pct5CAGR.toFixed(1)}% pessimistic (5th %ile)`);
        console.log(`     Worst-case DD: ${s.pct1MaxDD.toFixed(1)}% (1% tail)`);
        console.log(`     ${s.pctReaching2x}% of sims reached 2× capital${s.medianTimeTo2x ? ` (median: trade #${Math.round(s.medianTimeTo2x)})` : ''}`);
        console.log(`     Account blown: ${s.blownPct}%`);
    }

    // ─── EXPORT FOR VISUALIZATION ───
    const samplePaths = (results, count = 50) => {
        const step = Math.max(1, Math.floor(results.length / count));
        return results.filter((_, i) => i % step === 0).slice(0, count).map(r => r.path);
    };

    const exportData = {
        config: { startingCapital, riskPct, tradesPerYear, projectionYears, targetTrades },
        scenarios: summaryModels,
        paths: {},
        finalEquities: {}
    };

    for (const scenario of scenarios) {
        const key = scenario.name.toLowerCase();
        exportData.paths[key] = samplePaths(allResults[scenario.name]);
        exportData.finalEquities[key] = allResults[scenario.name].map(r => r.finalEquity);
    }

    const { direction = "short" } = config;
    const suffix = `_${direction}`;

    fs.writeFileSync(`./mc_compounding_report${suffix}.json`, JSON.stringify(exportData, null, 2));
    console.log(`\n  📁 Exported: mc_compounding_report${suffix}.json`);

    return exportData;
}
