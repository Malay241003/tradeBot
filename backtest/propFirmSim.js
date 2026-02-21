import fs from "fs";
import { CONFIG } from "./config.js";

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function isWeekend(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    return day === 6 || day === 0; // Saturday or Sunday
}

function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(p * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
}

function median(arr) {
    return percentile(arr, 0.5);
}

// ============================================================
// PROP FIRM SIMULATOR
// ============================================================
export function runPropFirmSimulation(trades, config = {}, direction = "short") {
    // Merge provided config with PROP_FIRM config
    const pfConfig = { ...CONFIG.PROP_FIRM, ...config };

    if (!pfConfig || !pfConfig.STARTING_BALANCE) {
        console.warn("\n⚠️ PROP_FIRM config block missing. Skipping formal challenge simulation.");
        return null;
    }

    const {
        STARTING_BALANCE,
        RISK_PER_TRADE_PCT,
        MAX_LEVERAGE,
        DAILY_DD_LIMIT,
        MAX_DD_LIMIT,
        PROFIT_TARGET,
        COMMISSION_PCT,
        NO_WEEKEND_HOLDING
    } = pfConfig;

    const SIMULATION_RUNS = 5000;
    const CHALLENGE_DAYS = 30; // Phase 1 is typically 30 or unlimited, we simulate 30 to show velocity
    const TRADES_PER_DAY = (trades.length / 540); // Rough estimate of trades per day from the 1.5yr dataset

    console.log("\n╔═══════════════════════════════════════════════════════════════╗");
    console.log("║         🏦 FUNDING PIPS - PROP FIRM CHALLENGE SIMULATOR       ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝\n");
    console.log(`  Target: +${(PROFIT_TARGET * 100).toFixed(1)}% | Max DD: -${(MAX_DD_LIMIT * 100).toFixed(1)}% | Daily DD: -${(DAILY_DD_LIMIT * 100).toFixed(1)}% | Leverage: 1:${MAX_LEVERAGE}`);

    let passed = 0;
    let failedMaxDD = 0;
    let failedDailyDD = 0;
    let failedTimeout = 0; // didn't hit 8% in 30 days
    let failedLeverageRestrictions = 0; // Stats tracking how many trades were altered by 1:2 limits

    let totalTradesCapped = 0;
    const paths = []; // save some equity curves for visualization
    const daysToPass = [];

    for (let i = 0; i < SIMULATION_RUNS; i++) {
        // Bootstrap sample trades
        const shuffledTrades = [];
        for (let t = 0; t < Math.ceil(CHALLENGE_DAYS * TRADES_PER_DAY * 1.5); t++) {
            shuffledTrades.push(trades[Math.floor(Math.random() * trades.length)]);
        }

        let equity = STARTING_BALANCE;
        let peakEquity = STARTING_BALANCE;

        // Daily DD tracks equity decay from the start of the UTC 00:00 midnight
        let dayStartEquity = STARTING_BALANCE;
        let currentDay = 1;

        let status = "ACTIVE";
        let tradesTaken = 0;
        let simTradesCapped = 0;

        const path = [STARTING_BALANCE];

        for (const t of shuffledTrades) {
            // Check win condition
            if (equity >= STARTING_BALANCE * (1 + PROFIT_TARGET)) {
                status = "PASSED";
                break;
            }

            // Time progression assumption (Spread trades evenly)
            tradesTaken++;
            if (tradesTaken % Math.ceil(TRADES_PER_DAY) === 0) {
                currentDay++;
                dayStartEquity = equity; // Reset daily drawdown floor
            }

            if (currentDay > CHALLENGE_DAYS) {
                status = "TIMEOUT";
                break;
            }

            // ─── 1. Weekend Holding Restriction ───
            if (NO_WEEKEND_HOLDING && isWeekend(t.entryTime)) {
                continue; // Skip the trade completely, bot is forbidden from holding
            }

            // ─── 2. Stop Loss Calculation & Leverage Cap ───
            // Attempt standard position size
            const riskAmount = equity * RISK_PER_TRADE_PCT;

            // To figure out the real Dollar exposure, we figure out SL distance percentage
            // t.entryPrice and t.exitPrice exist. Since R = (exit - entry) / riskUnit (roughly)
            // If it's a loss of -1R, the loss was exactly 'riskAmount'.
            // To calculate "What leverage did this require?", we reconstruct the % distance to SL.

            // Reconstruct the SL % distance from the raw trade data
            // (Assumes standard engine.js where base R = 1 when hitting SL)
            const slDistancePrice = Math.abs(t.entryPrice - t.sl);
            const slDistancePct = slDistancePrice / t.entryPrice;

            // Required Position Value = RiskAmount / SL_Distance_Pct
            let requestedExposure = riskAmount / slDistancePct;
            let maxAllowedExposure = equity * MAX_LEVERAGE;

            let actualRiskTook = riskAmount;

            if (requestedExposure > maxAllowedExposure) {
                // LEVERAGE CAP HIT: Institutional Sizing Down
                const allowedPositionSize = maxAllowedExposure;  // Max position dollar value
                actualRiskTook = allowedPositionSize * slDistancePct; // You risk less than you wanted to
                simTradesCapped++;
            }

            // ─── 3. Commission Costs ───
            // Funding Pips charges 0.04% round trip based on Position Value
            // Position Value = actualRiskTook / slDistancePct
            const positionValue = actualRiskTook / slDistancePct;
            const roundTripCommission = positionValue * COMMISSION_PCT;

            // ─── 4. PnL Output ───
            // Prop firms don't charge Binance spot fees, but they STILL incur slippage, spread
            // and swap funding. We subtract those from the Gross price-action R.
            const grossR = t.grossR !== undefined ? t.grossR : t.R;
            const slippageR = t.slippageCostR || 0;
            const spreadR = t.spreadCostR || 0;
            const fundingR = t.fundingCostR || 0;

            const propFirmNetR = grossR - slippageR - spreadR - fundingR;

            // PnL = (Prop Firm Net R * Actual Risk Taken) - Firm Specific Commission
            let pnl = (propFirmNetR * actualRiskTook) - roundTripCommission;

            equity += pnl;
            path.push(equity);

            peakEquity = Math.max(peakEquity, equity);

            // ─── 5. Drawdown Checks ───
            const currentTotalDrawdown = (STARTING_BALANCE - equity) / STARTING_BALANCE;
            const currentDailyDrawdown = (dayStartEquity - equity) / dayStartEquity;

            if (currentTotalDrawdown >= MAX_DD_LIMIT) {
                status = "FAILED_MAX_DD";
                break;
            }

            if (currentDailyDrawdown >= DAILY_DD_LIMIT) {
                status = "FAILED_DAILY_DD";
                break;
            }
        }

        totalTradesCapped += simTradesCapped;

        if (status === "PASSED") { passed++; daysToPass.push(currentDay); }
        else if (status === "FAILED_MAX_DD") failedMaxDD++;
        else if (status === "FAILED_DAILY_DD") failedDailyDD++;
        else if (status === "TIMEOUT") failedTimeout++;
        else if (status === "ACTIVE") failedTimeout++; // Ran out of trades 

        if (i < 50) paths.push(path); // Save sample paths for frontend fans
    }

    const passRate = (passed / SIMULATION_RUNS) * 100;
    const expectedCappedTradesPerChallenge = totalTradesCapped / SIMULATION_RUNS;
    const avgDaysToPass = daysToPass.length > 0 ? (daysToPass.reduce((a, b) => a + b, 0) / daysToPass.length) : 0;
    const medianDaysToPass = daysToPass.length > 0 ? median(daysToPass) : 0;

    console.log(`  ✅ Simulation complete (${SIMULATION_RUNS.toLocaleString()} runs)`);
    console.log(`\n  ┌─────────────────────────────────────────────────────────────┐`);
    console.log(`  │ 🎯 Pass Rate (Achieved +${(PROFIT_TARGET * 100).toFixed(0)}% limit)     : ${(passRate).toFixed(2).padStart(6)}%          │`);
    console.log(`  │ ⏱️  Avg Days to Pass                   : ${avgDaysToPass.toFixed(1).padStart(6)} days        │`);
    console.log(`  ├─────────────────────────────────────────────────────────────┤`);
    console.log(`  │ 💀 Failed: Hit 5% Daily Drawdown      : ${((failedDailyDD / SIMULATION_RUNS) * 100).toFixed(2).padStart(6)}%          │`);
    console.log(`  │ 💀 Failed: Hit 10% Overall Drawdown   : ${((failedMaxDD / SIMULATION_RUNS) * 100).toFixed(2).padStart(6)}%          │`);
    console.log(`  │ ⌛ Failed: Time ran out (No +8% hit)  : ${((failedTimeout / SIMULATION_RUNS) * 100).toFixed(2).padStart(6)}%          │`);
    console.log(`  └─────────────────────────────────────────────────────────────┘\n`);

    console.log(`  ⚠️  Leverage Interventions: On average, ${Math.round(expectedCappedTradesPerChallenge)} trades per challenge `);
    console.log(`     were forced to size down to satisfy the 1:${MAX_LEVERAGE} limits.`);

    const reportData = {
        config: pfConfig,
        simulations: SIMULATION_RUNS,
        passRatePct: passRate,
        failDailyDDPct: (failedDailyDD / SIMULATION_RUNS) * 100,
        failMaxDDPct: (failedMaxDD / SIMULATION_RUNS) * 100,
        failTimeoutPct: (failedTimeout / SIMULATION_RUNS) * 100,
        avgDaysToPass: avgDaysToPass,
        medianDaysToPass: medianDaysToPass,
        avgCappedTrades: expectedCappedTradesPerChallenge,
        samplePaths: paths
    };

    fs.writeFileSync(`./prop_firm_report_${direction}.json`, JSON.stringify(reportData, null, 2));
    console.log(`  📁 Exported: prop_firm_report_${direction}.json\n`);

    return reportData;
}
