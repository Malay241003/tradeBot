/**
 * A/B comparison: Scale-in (fixed SL) vs No scale-in (pure 3R)
 *
 * Option A: Remove scale-ins entirely → pure fixed 3R
 * Option B: Keep scale-ins, fix SL to -positionR
 *
 * We re-process the raw trades from engine.js to simulate both variants
 * without modifying engine code.
 */

import { buildUniverse } from "../bot/universe.js";
import { backtestPair } from "./engine.js";
import { computeMetrics } from "./metrics.js";
import { CONFIG } from "./config.js";

async function compare() {
    const universe = await buildUniverse();

    // We'll collect raw trade data from the current engine
    // Then re-score under both variants

    let tradesA = [];  // Option A: no scale-ins
    let tradesB = [];  // Option B: scale-ins with corrected SL

    for (const pair of universe) {
        console.log("Backtesting:", pair);
        const result = await backtestPair(pair);
        if (!result || !result.trades.length) continue;

        for (const t of result.trades) {
            // ─── OPTION A: pure fixed 3R ───
            // Win = +3R, Loss = -1R (ignore scale-ins)
            const rA = t.R > 0 ? CONFIG.TP_R : -1;
            tradesA.push({ ...t, R: rA });

            // ─── OPTION B: scale-ins with corrected SL ───
            // The current engine already records the scaled R on wins.
            // But on losses it hardcodes -1. We need to figure out what
            // positionR would have been at the time of exit.
            //
            // positionR logic:
            //   starts at 1
            //   +0.5 if maxFavorableR >= 1 AND liquidationOverride was present
            //   +0.25 more if maxFavorableR >= 2 AND liquidationOverride present
            //
            // Since liquidationProxy is checked per-bar during the trade and we
            // don't have that data, we approximate using maxFavorableR + the
            // liquidationOverride flag from entry context as a proxy.
            //
            // For a more accurate test, we'll reconstruct positionR from
            // maxFavorableR (which IS recorded) and assume liquidationProxy
            // could fire at any point during the trade (optimistic for scale-ins).

            let posR = 1;
            if (t.maxFavorableR >= 1) posR += 0.5;
            if (t.maxFavorableR >= 2) posR += 0.25;

            let rB;
            if (t.R > 0) {
                // Win: TP_R * positionR
                rB = CONFIG.TP_R * posR;
            } else {
                // Loss: -positionR (corrected)
                rB = -posR;
            }
            tradesB.push({ ...t, R: rB });
        }
    }

    // ─── RESULTS ───
    const metricsA = computeMetrics(tradesA);
    const metricsB = computeMetrics(tradesB);

    console.log("\n" + "=".repeat(60));
    console.log("  OPTION A: No Scale-ins (Pure Fixed 3R)");
    console.log("=".repeat(60));
    console.log(metricsA);

    console.log("\n" + "=".repeat(60));
    console.log("  OPTION B: Scale-ins with Corrected SL (-positionR)");
    console.log("=".repeat(60));
    console.log(metricsB);

    // ─── SIDE-BY-SIDE ───
    console.log("\n" + "=".repeat(60));
    console.log("  SIDE-BY-SIDE COMPARISON");
    console.log("=".repeat(60));

    const fmt = (label, a, b) => {
        const pad = 30;
        console.log(
            `  ${label.padEnd(pad)} ${String(a).padStart(10)}  ${String(b).padStart(10)}`
        );
    };

    fmt("", "Option A", "Option B");
    fmt("", "(No Scale)", "(Scale+Fix)");
    console.log("  " + "-".repeat(52));
    fmt("Total Trades", metricsA.trades, metricsB.trades);
    fmt("Win Rate %", metricsA.winRate, metricsB.winRate);
    fmt("Expectancy (R)", metricsA.expectancy, metricsB.expectancy);
    fmt("Net Profit (R)", metricsA.netProfit, metricsB.netProfit);
    fmt("Total Profit (R)", metricsA.totalProfit, metricsB.totalProfit);
    fmt("Total Loss (R)", metricsA.totalLoss, metricsB.totalLoss);
    fmt("Max Drawdown (R)", metricsA.maxDrawdownR, metricsB.maxDrawdownR);
    fmt("Avg Time (bars)", metricsA.avgTimeInTradeBars, metricsB.avgTimeInTradeBars);

    // Profit Factor
    const pfA = Number(metricsA.totalLoss) > 0
        ? (Number(metricsA.totalProfit) / Number(metricsA.totalLoss)).toFixed(2)
        : "∞";
    const pfB = Number(metricsB.totalLoss) > 0
        ? (Number(metricsB.totalProfit) / Number(metricsB.totalLoss)).toFixed(2)
        : "∞";
    fmt("Profit Factor", pfA, pfB);

    // Return / Max DD ratio
    const rddA = Number(metricsA.maxDrawdownR) > 0
        ? (Number(metricsA.netProfit) / Number(metricsA.maxDrawdownR)).toFixed(2)
        : "∞";
    const rddB = Number(metricsB.maxDrawdownR) > 0
        ? (Number(metricsB.netProfit) / Number(metricsB.maxDrawdownR)).toFixed(2)
        : "∞";
    fmt("Return/MaxDD", rddA, rddB);

    console.log("\n  Net Profit in $:");
    fmt("  (at $50/R)",
        "$" + (Number(metricsA.netProfit) * CONFIG.RISK_PER_TRADE).toFixed(0),
        "$" + (Number(metricsB.netProfit) * CONFIG.RISK_PER_TRADE).toFixed(0)
    );

    console.log("\n✅ Comparison complete.");
}

compare();
