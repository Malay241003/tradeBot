import { buildUniverse } from "../bot/universe.js";
import { backtestPair } from "./engine.js";
import { computeMetrics } from "./metrics.js";
import { CONFIG } from "./config.js";

async function optimizeTP() {
    console.log("🚀 Starting TP Optimization (Fixed Universe)...");

    // 1. Lock the Universe (Ensure same assets for all runs)
    const universe = await buildUniverse();
    console.log(`🔒 Universe Locked (${universe.length} pairs):`, universe.join(", "));

    const results = [];
    const tpValues = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];

    // 2. Iterate through TP values
    for (const tp of tpValues) {
        console.log(`\n⏳ Testing TP_R = ${tp}...`);

        // Mutate CONFIG at runtime
        CONFIG.TP_R = tp;

        let allTrades = [];

        // Run backtest for locked universe
        for (const pair of universe) {
            // Silence pair-level output for speed
            const result = await backtestPair(pair);
            if (result) {
                allTrades.push(...result.trades);
            }
        }

        // Compute Metrics
        const metrics = computeMetrics(allTrades);

        // Store concise result
        results.push({
            TP: tp,
            Trades: metrics.trades,
            WinRate: metrics.winRate + '%',
            Expectancy: metrics.expectancy + 'R',
            NetProfit: metrics.netProfit + 'R',
            MaxDD: metrics.maxDrawdownR + 'R'
        });

        console.log(`✅ TP=${tp} Done. Net Profit: ${metrics.netProfit}R`);
    }

    // 3. Print Final Report
    console.log("\n===== 🏆 TP OPTIMIZATION RESULTS =====");
    console.table(results);
}

optimizeTP();
