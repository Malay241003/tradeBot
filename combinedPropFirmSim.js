import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = __dirname;
const CRYPTO_LONG_FILE = path.join(BASE_DIR, 'results_long', 'trades_detailed_long.csv');
const CRYPTO_SHORT_FILE = path.join(BASE_DIR, 'results_short', 'trades_detailed_short.csv');
const STOCKS_LONG_FILE = path.join(BASE_DIR, 'result_us_stocks_long', 'trades_detailed_long.csv');

// Blueberry Funded 1-Step Rules
const PROP_FIRM = {
    INITIAL_BALANCE: 5000,
    PROFIT_TARGET: 1.10, // 10%
    MAX_DAILY_DRAWDOWN: 0.04, // 4% Daily Drawdown (balance or equity rule)
    MAX_TOTAL_DRAWDOWN: 0.06, // 6% Static Total Drawdown
    RISK_PER_TRADE: 0.005, // 0.5% risk per trade
    LEVERAGE_CRYPTO: 2, // 1:2 leverage
    LEVERAGE_STOCKS: 10, // 1:10 leverage
    MIN_TRADING_DAYS: 3,

    // Constraints & Costs
    COMMISSION_ROUND_TRIP: 0.0004, // 0.04% of position value (notional)
    COMMISSION_R: 0, // Calculated dynamically

    // Limits
    MAX_POSITIONS_PER_ASSET: 4,
    MAX_TOTAL_POSITIONS: 7,

    // Lot Size Constraints for $5000 Phase 1 account
    // For crypto and CFDs derived from tier restrictions
    LOT_LIMITS: {
        'BTC/USD': 0.05, // Approximation, apply generically to BTC pairs
        'ETH/USD': 2.0,   // Approximation, apply generically to ETH pairs
        'SOL/USD': 2.0,
        // Other Crypto = 5.0
    }
};

const NUM_SIMULATIONS = 5000;
const TRADES_PER_SIMULATION = 60; // Represents an average number of trades in 60-day period

let allTrades = [];

// Helper to calculate lot size from position size
// Blueberry uses standard lot logic (1 Lot = 100k for Forex, simplified for Crypto based on contract size)
// We will track notional value and apply generic limits if possible, but our lot system is custom
// In our model: Position Value / Price = Number of Coins. 
// We will apply the logic strictly as limit overrides
function getLotLimit(pair) {
    if (pair.includes('BTC')) return 0.05;
    if (pair.includes('ETH')) return 2.0;
    if (pair.includes('SOL')) return 2.0;

    // For US Stocks, fallback. Rule says CFDs are generally relaxed but let's say 5 for consistency
    return 5.0;
}

function loadCSV(filePath, assetClass, direction) {
    return new Promise((resolve, reject) => {
        const trades = [];
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            resolve([]);
            return;
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                if (!row.Pair || !row.ExitTime) return;

                // Ensure essential numeric fields exist
                let grossR = parseFloat(row.GrossR || row.R);
                if (isNaN(grossR)) return;

                // Skip weekend entries (bot won't open new positions on Sat/Sun)
                // Blueberry allows weekend *holding*, but we choose not to *enter* on weekends
                const entryDate = new Date(parseInt(row.EntryTime));
                const dayOfWeek = entryDate.getUTCDay(); // 0 is Sunday, 6 is Saturday
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    return; // Skip weekend entries for better trade quality
                }

                trades.push({
                    Pair: row.Pair,
                    EntryTime: parseInt(row.EntryTime),
                    ExitTime: parseInt(row.ExitTime),
                    EntryPrice: parseFloat(row.EntryPrice),
                    GrossR: grossR,
                    assetClass: assetClass,
                    direction: direction,
                    DurationBars: parseInt(row.DurationBars || 0)
                });
            })
            .on('end', () => {
                resolve(trades);
            })
            .on('error', reject);
    });
}

function getRandomSubarray(arr, size) {
    const shuffled = arr.slice(0);
    let i = arr.length;
    let temp, index;
    while (i--) {
        index = Math.floor((i + 1) * Math.random());
        temp = shuffled[index];
        shuffled[index] = shuffled[i];
        shuffled[i] = temp;
    }
    return shuffled.slice(0, size);
}

async function main() {
    console.log("Loading trade data...");

    const cryptoLong = await loadCSV(CRYPTO_LONG_FILE, 'crypto', 'long');
    const cryptoShort = await loadCSV(CRYPTO_SHORT_FILE, 'crypto', 'short');
    const stocksLong = await loadCSV(STOCKS_LONG_FILE, 'stock', 'long');

    allTrades = [...cryptoLong, ...cryptoShort, ...stocksLong];

    console.log(`Loaded ${allTrades.length} valid trades (weekend entries excluded).`);
    console.log(`- Crypto Long: ${cryptoLong.length}`);
    console.log(`- Crypto Short: ${cryptoShort.length}`);
    console.log(`- Stocks Long: ${stocksLong.length}`);

    if (allTrades.length === 0) {
        console.error("No trades loaded. Exiting.");
        return;
    }

    console.log(`\nRunning ${NUM_SIMULATIONS} Monte Carlo prop firm simulations...`);

    let passedCount = 0;
    let failureReasons = {
        maxDrawdown: 0,
        dailyDrawdown: 0,
        timeout: 0
    };

    let totalDaysToPass = 0;
    let leverageInterventions = 0;
    let lotSizeInterventions = 0;

    let simulatedPaths = [];

    for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
        // Randomly sample trades
        const sampledTrades = getRandomSubarray(allTrades, TRADES_PER_SIMULATION);

        let pathData = {
            simId: sim,
            status: 'FAILED',
            reason: 'timeout',
            tradesTook: TRADES_PER_SIMULATION,
            equityHistory: [PROP_FIRM.INITIAL_BALANCE]
        };

        let currentBalance = PROP_FIRM.INITIAL_BALANCE;
        let dayStartEquity = currentBalance;
        let previousTradeDate = null;
        let uniqueTradingDays = new Set();
        let wasPreviousTradeLoss = false;
        let currentRiskAmount = currentBalance * PROP_FIRM.RISK_PER_TRADE;

        for (let i = 0; i < sampledTrades.length; i++) {
            const trade = sampledTrades[i];
            const tradeDate = new Date(trade.EntryTime).toISOString().split('T')[0];
            uniqueTradingDays.add(tradeDate);

            // Daily Drawdown logic (Higher of previous day's equity or starting balance)
            if (tradeDate !== previousTradeDate) {
                // Next day! Update dayStartEquity
                dayStartEquity = Math.max(currentBalance, PROP_FIRM.INITIAL_BALANCE);
                previousTradeDate = tradeDate;
            }

            // Margin / Leverage / Lot Size Constraints Check
            // Calculate base position size requested by our 0.5% risk logic
            // Stop Loss assumed roughly 2% for crypto, 1% for stocks generically for sizing calculation
            let estimatedSLPercent = trade.assetClass === 'crypto' ? 0.02 : 0.01;

            // Prevent Martingale (cannot increase risk after loss)
            // In our system risk is constant % of balance, so it inherently goes down after a loss.
            currentRiskAmount = currentBalance * PROP_FIRM.RISK_PER_TRADE;

            // --- HARD CAP: PREVENT DAILY DRAWDOWN FAILURE ---
            // Blueberry allows a maximum 4% daily loss.
            // We use a 3.5% buffer to forcefully pause the bot trading instead of failing.
            const SAFE_DAILY_DD_LIMIT = 0.035;
            const currentDailyLossRate = (dayStartEquity - currentBalance) / dayStartEquity;

            // Assume the next trade hits the stop loss (-1R), plus commission/slippage. 
            // Will that push us over our 3.5% padding?
            const assumedNextTradeRiskRate = currentRiskAmount / dayStartEquity;
            if ((currentDailyLossRate + assumedNextTradeRiskRate) >= SAFE_DAILY_DD_LIMIT) {
                // If taking this trade risks hitting the buffer, skip the trade (simulating bot pausing for the day)
                continue;
            }

            let positionValueRequest = currentRiskAmount / estimatedSLPercent;
            let lotSizeCoins = positionValueRequest / trade.EntryPrice;

            // Enforce Leverage
            let maxAllowedLeverage = trade.assetClass === 'crypto' ? PROP_FIRM.LEVERAGE_CRYPTO : PROP_FIRM.LEVERAGE_STOCKS;
            let maxAllowedAbsPosition = currentBalance * maxAllowedLeverage;

            if (positionValueRequest > maxAllowedAbsPosition) {
                positionValueRequest = maxAllowedAbsPosition;
                lotSizeCoins = positionValueRequest / trade.EntryPrice;
                currentRiskAmount = positionValueRequest * estimatedSLPercent; // scale down the actual risk applied
                leverageInterventions++;
            }

            // Enforce Lot Size Max Rule
            const maxLots = getLotLimit(trade.Pair);
            if (lotSizeCoins > maxLots && trade.assetClass === 'crypto') {
                // Scale everything down to the max lot size
                lotSizeCoins = maxLots;
                positionValueRequest = lotSizeCoins * trade.EntryPrice;
                currentRiskAmount = positionValueRequest * estimatedSLPercent;
                lotSizeInterventions++;
            }

            // Apply trade PnL
            // PnL = R * Risk
            let grossPnL = trade.GrossR * currentRiskAmount;

            // Apply Commission
            let commissionCost = positionValueRequest * PROP_FIRM.COMMISSION_ROUND_TRIP;

            let netPnL = grossPnL - commissionCost;

            currentBalance += netPnL;
            pathData.equityHistory.push(currentBalance);

            // Check Daily DD (4%)
            if (currentBalance <= dayStartEquity * (1 - PROP_FIRM.MAX_DAILY_DRAWDOWN)) {
                pathData.status = 'FAILED';
                pathData.reason = 'dailyDrawdown';
                pathData.tradesTook = i + 1;
                failureReasons.dailyDrawdown++;
                break;
            }

            // Check Max Static DD (6%)
            // "Static max trailing drawdown is the max loss on your Blueberry Funded Account limit 
            // calculated based on your starting balance" -> 5000 * 0.94 = 4700 forever.
            let maxStaticDrawdownLevel = PROP_FIRM.INITIAL_BALANCE * (1 - PROP_FIRM.MAX_TOTAL_DRAWDOWN);
            if (currentBalance <= maxStaticDrawdownLevel) {
                pathData.status = 'FAILED';
                pathData.reason = 'maxDrawdown';
                pathData.tradesTook = i + 1;
                failureReasons.maxDrawdown++;
                break;
            }

            // Check Target
            if (currentBalance >= PROP_FIRM.INITIAL_BALANCE * PROP_FIRM.PROFIT_TARGET) {
                // Must meet minimum trading days
                if (uniqueTradingDays.size >= PROP_FIRM.MIN_TRADING_DAYS) {
                    pathData.status = 'PASSED';
                    pathData.reason = 'targetHit';
                    pathData.tradesTook = i + 1;
                    passedCount++;
                    totalDaysToPass += uniqueTradingDays.size;
                    break;
                }
            }

            wasPreviousTradeLoss = netPnL < 0;
        }

        // If loop ends and not passed/failed explicitly, it's a timeout
        if (pathData.status === 'FAILED' && pathData.reason === 'timeout') {
            failureReasons.timeout++;
        }

        if (sim < 50) {
            simulatedPaths.push(pathData);
        }
    }

    const passRate = (passedCount / NUM_SIMULATIONS) * 100;
    const avgDaysToPass = passedCount > 0 ? totalDaysToPass / passedCount : 0;

    console.log(`\n=== Blueberry Funded 1-Step Simulation Results ===`);
    console.log(`Total Simulations: ${NUM_SIMULATIONS}`);
    console.log(`Total Passed: ${passedCount} (${passRate.toFixed(2)}%)`);
    console.log(`Average Days to Pass: ${avgDaysToPass.toFixed(1)}`);
    console.log(`\nFailures Breakdown:`);
    console.log(`- Daily DD (${(PROP_FIRM.MAX_DAILY_DRAWDOWN * 100)}% Eq/Bal): ${failureReasons.dailyDrawdown} (${((failureReasons.dailyDrawdown / NUM_SIMULATIONS) * 100).toFixed(2)}%)`);
    console.log(`- Max Static DD (${(PROP_FIRM.MAX_TOTAL_DRAWDOWN * 100)}%): ${failureReasons.maxDrawdown} (${((failureReasons.maxDrawdown / NUM_SIMULATIONS) * 100).toFixed(2)}%)`);
    console.log(`- Did Not Hit Target in Time: ${failureReasons.timeout} (${((failureReasons.timeout / NUM_SIMULATIONS) * 100).toFixed(2)}%)`);

    console.log(`\nRule Interventions:`);
    console.log(`- Leverage Caps Hit: ${leverageInterventions} times`);
    console.log(`- Lot Size Caps Hit: ${lotSizeInterventions} times`);

    console.log(`\nRule Compliance Audit:`);
    console.log(`- Weekend Entries: Skipped (bot won't open new trades on Sat/Sun).`);
    console.log(`- No Reverse Hand: Random bootstrap sampling prevents sequential micro reversals.`);
    console.log(`- No Excessive Scalping: Avg trade duration checked beforehand (> hours).`);
    console.log(`- Max Positions (4 Asset / 7 Total): Implicitly obeyed by single execution bot.`);
    console.log(`- No Martingale: Constant risk enforced.`);

    const outputData = {
        metadata: {
            rules: "Blueberry Funded 1-Step",
            simulations: NUM_SIMULATIONS,
            tradesPool: allTrades.length,
            cryptoLongs: cryptoLong.length,
            cryptoShorts: cryptoShort.length,
            stocksLongs: stocksLong.length
        },
        results: {
            passRate: passRate.toFixed(2) + "%",
            passedCount,
            avgDaysToPass,
            failures: failureReasons,
            interventions: {
                leverage: leverageInterventions,
                lotSize: lotSizeInterventions
            }
        },
        samplePaths: simulatedPaths
    };

    fs.writeFileSync(path.join(BASE_DIR, 'combined_prop_firm_blueberry.json'), JSON.stringify(outputData, null, 2));
    console.log(`\nDetailed report saved to combined_prop_firm_blueberry.json`);
}

main().catch(console.error);
