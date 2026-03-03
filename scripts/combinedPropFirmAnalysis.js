/**
 * combinedPropFirmAnalysis.js
 * 
 * Answers: "Should I combine LONG + SHORT for the prop firm challenge?"
 * 
 * Merges both trade pools, runs prop firm simulation, and compares:
 *   1. LONG-only pass rate & days
 *   2. SHORT-only pass rate & days
 *   3. COMBINED (long+short) pass rate & days
 * 
 * Usage: node scripts/combinedPropFirmAnalysis.js
 */

import fs from "fs";
import { CONFIG } from "../backtest/config.js";

function isWeekend(ts) {
    const d = new Date(ts).getUTCDay();
    return d === 0 || d === 6;
}

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const i = Math.floor(p / 100 * sorted.length);
    return sorted[Math.min(i, sorted.length - 1)];
}

function median(arr) {
    return percentile(arr, 50);
}

/**
 * Run prop firm Monte Carlo on a trade pool
 * Returns { passRate, avgDays, medianDays, failMaxDD, failTimeout, tradesPerDay }
 */
function runPropFirmMC(trades, label, totalBacktestDays = 2555) {
    const pfConfig = CONFIG.PROP_FIRM;
    const {
        STARTING_BALANCE, RISK_PER_TRADE_PCT, MAX_LEVERAGE,
        DAILY_DD_LIMIT, MAX_DD_LIMIT, PROFIT_TARGET,
        COMMISSION_PCT, NO_WEEKEND_HOLDING
    } = pfConfig;

    const SIMULATION_RUNS = 10000;
    const CHALLENGE_DAYS = 30;
    const TRADES_PER_DAY = trades.length / totalBacktestDays;

    let passed = 0, failedMaxDD = 0, failedDailyDD = 0, failedTimeout = 0;
    const daysToPass = [];

    for (let i = 0; i < SIMULATION_RUNS; i++) {
        // Bootstrap sample
        const shuffledTrades = [];
        for (let t = 0; t < Math.ceil(CHALLENGE_DAYS * TRADES_PER_DAY * 1.5); t++) {
            shuffledTrades.push(trades[Math.floor(Math.random() * trades.length)]);
        }

        let equity = STARTING_BALANCE;
        let peakEquity = STARTING_BALANCE;
        let dayStartEquity = STARTING_BALANCE;
        let currentDay = 1;
        let status = "ACTIVE";
        let tradesTaken = 0;

        for (const t of shuffledTrades) {
            if (equity >= STARTING_BALANCE * (1 + PROFIT_TARGET)) {
                status = "PASSED";
                break;
            }

            tradesTaken++;
            if (tradesTaken % Math.max(1, Math.ceil(TRADES_PER_DAY)) === 0) {
                currentDay++;
                dayStartEquity = equity;
            }

            if (currentDay > CHALLENGE_DAYS) {
                status = "TIMEOUT";
                break;
            }

            if (NO_WEEKEND_HOLDING && isWeekend(t.entryTime)) continue;

            const riskAmount = equity * RISK_PER_TRADE_PCT;
            const slDistancePrice = Math.abs(t.entryPrice - t.sl);
            const slDistancePct = slDistancePrice / t.entryPrice;

            let requestedExposure = riskAmount / slDistancePct;
            let maxAllowedExposure = equity * MAX_LEVERAGE;
            let actualRiskTook = riskAmount;

            if (requestedExposure > maxAllowedExposure) {
                const allowedPositionSize = maxAllowedExposure;
                actualRiskTook = allowedPositionSize * slDistancePct;
            }

            const commissionCost = (requestedExposure > maxAllowedExposure ? maxAllowedExposure : requestedExposure) * COMMISSION_PCT * 2;
            const tradeR = t.R;
            const pnl = (tradeR * actualRiskTook) - commissionCost;

            equity += pnl;

            if (equity > peakEquity) peakEquity = equity;

            // Check max DD
            const ddPct = (peakEquity - equity) / STARTING_BALANCE;
            if (ddPct >= MAX_DD_LIMIT) {
                status = "FAIL_MAX_DD";
                break;
            }

            // Check daily DD
            const dailyDD = (dayStartEquity - equity) / STARTING_BALANCE;
            if (dailyDD >= DAILY_DD_LIMIT) {
                status = "FAIL_DAILY_DD";
                break;
            }
        }

        if (status === "PASSED") { passed++; daysToPass.push(currentDay); }
        else if (status === "FAIL_MAX_DD") failedMaxDD++;
        else if (status === "FAIL_DAILY_DD") failedDailyDD++;
        else failedTimeout++;
    }

    return {
        label,
        trades: trades.length,
        tradesPerDay: Math.round(TRADES_PER_DAY * 100) / 100,
        passRate: Math.round(passed / SIMULATION_RUNS * 10000) / 100,
        avgDays: daysToPass.length > 0 ? Math.round(daysToPass.reduce((s, d) => s + d, 0) / daysToPass.length * 10) / 10 : 30,
        medianDays: daysToPass.length > 0 ? median(daysToPass) : 30,
        failMaxDD: Math.round(failedMaxDD / SIMULATION_RUNS * 10000) / 100,
        failDailyDD: Math.round(failedDailyDD / SIMULATION_RUNS * 10000) / 100,
        failTimeout: Math.round(failedTimeout / SIMULATION_RUNS * 10000) / 100
    };
}

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║  📊  COMBINED LONG+SHORT PROP FIRM ANALYSIS                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // Load trade files from CSV
    const longDir = "./results_long";
    const shortDir = "./results_short";

    const longTradesFile = `${longDir}/trades_detailed_long.csv`;
    const shortTradesFile = `${shortDir}/trades_detailed_short.csv`;

    if (!fs.existsSync(longTradesFile) || !fs.existsSync(shortTradesFile)) {
        console.error("❌ Trade files not found. Run backtests first.");
        process.exit(1);
    }

    function parseTradeCsv(filepath) {
        const lines = fs.readFileSync(filepath, "utf8").trim().split("\n");
        const header = lines[0].split(",");
        const rIdx = header.indexOf("R");
        const entryPriceIdx = header.indexOf("EntryPrice");
        const entryTimeIdx = header.indexOf("EntryTime");
        const exitTimeIdx = header.indexOf("ExitTime");
        const exitPriceIdx = header.indexOf("ExitPrice");
        // Reconstruct SL from entry price and R on losing trades
        // For the prop firm sim, we need entryPrice, sl, R, entryTime
        return lines.slice(1).map(line => {
            const cols = line.split(",");
            const R = parseFloat(cols[rIdx]);
            const entryPrice = parseFloat(cols[entryPriceIdx]);
            const entryTime = parseInt(cols[entryTimeIdx]);
            const exitTime = parseInt(cols[exitTimeIdx]);
            const exitPrice = parseFloat(cols[exitPriceIdx]);
            // Approximate SL as ~3% from entry (standard crypto ATR distance)
            // This is used only for leverage calc in prop firm sim
            const slDist = entryPrice * 0.03;
            return { R, entryPrice, exitPrice, entryTime, exitTime, sl: entryPrice - slDist };
        });
    }

    const longTrades = parseTradeCsv(longTradesFile);
    const shortTrades = parseTradeCsv(shortTradesFile);

    console.log(`  LONG trades:  ${longTrades.length} (9 coins)`);
    console.log(`  SHORT trades: ${shortTrades.length} (6 coins)`);
    console.log(`  COMBINED:     ${longTrades.length + shortTrades.length} (15 coins, both directions)\n`);

    // Compute expectancy for each pool
    const longExp = longTrades.reduce((s, t) => s + t.R, 0) / longTrades.length;
    const shortExp = shortTrades.reduce((s, t) => s + t.R, 0) / shortTrades.length;
    const combinedTrades = [...longTrades, ...shortTrades];
    const combinedExp = combinedTrades.reduce((s, t) => s + t.R, 0) / combinedTrades.length;

    const longWinRate = longTrades.filter(t => t.R > 0).length / longTrades.length * 100;
    const shortWinRate = shortTrades.filter(t => t.R > 0).length / shortTrades.length * 100;
    const combinedWinRate = combinedTrades.filter(t => t.R > 0).length / combinedTrades.length * 100;

    console.log("  ── TRADE POOL COMPARISON ──\n");
    console.log("  Pool        Trades  WinRate  Expect.   Trades/Day (est)");
    console.log("  ────        ──────  ───────  ───────   ────────────────");

    // ~2555 days = 7 years of backtesting (2018-2025)
    const backDays = 2555;
    console.log(`  LONG          ${String(longTrades.length).padStart(4)}   ${longWinRate.toFixed(1).padStart(5)}%  +${longExp.toFixed(3)}R   ${(longTrades.length / backDays).toFixed(2)}/day`);
    console.log(`  SHORT         ${String(shortTrades.length).padStart(4)}   ${shortWinRate.toFixed(1).padStart(5)}%  +${shortExp.toFixed(3)}R   ${(shortTrades.length / backDays).toFixed(2)}/day`);
    console.log(`  COMBINED      ${String(combinedTrades.length).padStart(4)}   ${combinedWinRate.toFixed(1).padStart(5)}%  +${combinedExp.toFixed(3)}R   ${(combinedTrades.length / backDays).toFixed(2)}/day`);

    console.log("\n\n  ── PROP FIRM MONTE CARLO (10,000 sims each) ──\n");

    // Run MC for each pool
    const longResult = runPropFirmMC(longTrades, "LONG-only", backDays);
    const shortResult = runPropFirmMC(shortTrades, "SHORT-only", backDays);
    const combinedResult = runPropFirmMC(combinedTrades, "COMBINED", backDays);

    const results = [longResult, shortResult, combinedResult];

    console.log("  Pool          PassRate  AvgDays  MedDays  FailDD  FailTimeout  Trades/Day");
    console.log("  ────          ────────  ───────  ───────  ──────  ───────────  ──────────");
    for (const r of results) {
        const marker = r.label === "COMBINED" ? "🏆" : "  ";
        console.log(
            `${marker}${r.label.padEnd(14)} ${r.passRate.toFixed(1).padStart(6)}%  ${String(r.avgDays).padStart(6)}d  ${String(r.medianDays).padStart(6)}d  ${r.failMaxDD.toFixed(1).padStart(5)}%  ${r.failTimeout.toFixed(1).padStart(10)}%  ${r.tradesPerDay.toFixed(2).padStart(9)}`
        );
    }

    // Analysis
    console.log("\n\n  ══════════════════════════════════════════════════════════════");
    console.log("  📋 ANALYSIS");
    console.log("  ══════════════════════════════════════════════════════════════\n");

    const improvement = combinedResult.passRate - Math.max(longResult.passRate, shortResult.passRate);
    const bestSingleDir = longResult.passRate >= shortResult.passRate ? "LONG" : "SHORT";
    const bestSingleRate = Math.max(longResult.passRate, shortResult.passRate);

    if (combinedResult.passRate > bestSingleRate) {
        console.log(`  🟢 COMBINED is BETTER than ${bestSingleDir}-only`);
        console.log(`     Pass rate: ${bestSingleRate}% → ${combinedResult.passRate}% (+${improvement.toFixed(1)}pp)`);
        console.log(`     Avg days: ${longResult.avgDays}d / ${shortResult.avgDays}d → ${combinedResult.avgDays}d`);
        console.log(`     Trade frequency: ${combinedResult.tradesPerDay}/day (vs ${longResult.tradesPerDay} long, ${shortResult.tradesPerDay} short)`);
        console.log(`\n  ✅ RECOMMENDATION: YES — combine LONG + SHORT for the prop firm challenge.`);
    } else {
        console.log(`  🔴 COMBINED is NOT better than ${bestSingleDir}-only`);
        console.log(`     ${bestSingleDir}: ${bestSingleRate}% vs Combined: ${combinedResult.passRate}%`);
        console.log(`\n  ⚠️  RECOMMENDATION: Stick with ${bestSingleDir}-only for the prop firm challenge.`);
    }

    // Speed analysis
    console.log(`\n  ── SPEED TO TARGET ──`);
    console.log(`  At 0.5% risk per trade, need +10% profit = +20R equivalent`);
    console.log(`  LONG:     ${longResult.tradesPerDay} trades/day × ${longExp.toFixed(2)}R exp = +${(longResult.tradesPerDay * longExp).toFixed(3)}R/day → ~${Math.ceil(20 / (longResult.tradesPerDay * longExp))} days`);
    console.log(`  SHORT:    ${shortResult.tradesPerDay} trades/day × ${shortExp.toFixed(2)}R exp = +${(shortResult.tradesPerDay * shortExp).toFixed(3)}R/day → ~${Math.ceil(20 / (shortResult.tradesPerDay * shortExp))} days`);
    console.log(`  COMBINED: ${combinedResult.tradesPerDay} trades/day × ${combinedExp.toFixed(2)}R exp = +${(combinedResult.tradesPerDay * combinedExp).toFixed(3)}R/day → ~${Math.ceil(20 / (combinedResult.tradesPerDay * combinedExp))} days`);

    // Risk analysis
    console.log(`\n  ── RISK REDUCTION ──`);
    console.log(`  Max DD fail rate: LONG ${longResult.failMaxDD}% | SHORT ${shortResult.failMaxDD}% | COMBINED ${combinedResult.failMaxDD}%`);
    console.log(`  Timeout fail rate: LONG ${longResult.failTimeout}% | SHORT ${shortResult.failTimeout}% | COMBINED ${combinedResult.failTimeout}%`);

    // Save results
    const output = {
        analysis: "Combined Long+Short Prop Firm Analysis",
        long: longResult,
        short: shortResult,
        combined: combinedResult,
        recommendation: combinedResult.passRate > bestSingleRate ? "COMBINE" : `${bestSingleDir}-only`,
        generatedAt: new Date().toISOString()
    };

    fs.writeFileSync("combined_prop_firm_analysis.json", JSON.stringify(output, null, 2));
    console.log(`\n  📁 Results: combined_prop_firm_analysis.json`);
}

main().catch(err => { console.error("❌ Fatal:", err); process.exit(1); });
