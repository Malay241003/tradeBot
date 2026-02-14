
import { backtestPair } from "./backtest/engine.js";
import { CONFIG } from "./backtest/config.js";

async function run() {
    console.log("Testing backtestPair on BTCUSDT...");
    try {
        const result = await backtestPair("BTCUSDT");
        if (!result) {
            console.log("No result returned (maybe not enough data).");
            return;
        }

        console.log(`Trades found: ${result.trades.length}`);
        if (result.trades.length > 0) {
            console.log("First 5 trades:");
            result.trades.slice(0, 5).forEach((t, i) => {
                console.log(`Trade ${i + 1}: R=${t.R.toFixed(2)}, ExitReason=${t.finalExitReason}, TP1=${t.tp1Hit}, TP2=${t.tp2Hit}`);
            });

            // Check for partial exit reasons
            const tp1Trades = result.trades.filter(t => t.tp1Hit);
            const trailTrades = result.trades.filter(t => t.finalExitReason === 'TRAIL');
            const timeTrades = result.trades.filter(t => t.finalExitReason === 'TIME');

            console.log(`\nStats:`);
            console.log(`TP1 Hit: ${tp1Trades.length}`);
            console.log(`Trailing Stop Exits: ${trailTrades.length}`);
            console.log(`Time Exits: ${timeTrades.length}`);
        }
    } catch (e) {
        console.error("Error running backtest:", e);
    }
}

run();
