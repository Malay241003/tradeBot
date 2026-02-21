import { getCandles } from "../bot/adapters/index.js";
import { backtestPair } from "./engine.js";
import { precomputeIndicators } from "../shared/precomputeIndicators.js";
import fs from "fs";

// Configuration Arrays for Grid Search
const MACRO_EMA_OPTS = ['ema50', 'ema100', 'ema200'];
const PULLBACK_EMA_OPTS = ['ema20', 'ema50'];
const SL_ATR_BUFFER_OPTS = [0.25, 0.5, 1.0, 1.5];
const ADX_THRESHOLD_OPTS = [0, 20, 25];
const TP_R_OPTS = [2.0, 3.0, 4.0, 5.0];

const PAIRS = [
    'B-BTCUSDT', 'B-ETHUSDT', 'B-XRPUSDT', 'B-LTCUSDT',
    'B-BCHUSDT', 'B-ADAUSDT', 'B-TRXUSDT', 'B-XLMUSDT',
    'B-IOTAUSDT', 'B-XMRUSDT', 'B-DASHUSDT', 'B-ZECUSDT',
    'B-NEOUSDT'
];

async function loadData() {
    console.log("Loading all pair data into memory...");
    const data = {};
    for (const p of PAIRS) {
        const symbol = p.replace("B-", "");
        const candles15m = await getCandles(symbol, "15m", "crypto");
        const candles1h = await getCandles(symbol, "1h", "crypto");
        if (candles15m && candles1h) {
            const ind15mArr = precomputeIndicators(candles15m);
            const ind1hArr = precomputeIndicators(candles1h);
            data[p] = { candles15m, candles1h, ind15mArr, ind1hArr };
        }
    }
    return data;
}

function calculatePortfolioMetrics(allTrades) {
    if (allTrades.length === 0) return { trades: 0, winRate: 0, expectancy: 0, maxDD: 0, netR: 0 };

    let wins = 0;
    let runningR = 0;
    let peakR = 0;
    let maxDD = 0;

    // Chronological sort
    allTrades.sort((a, b) => a.entryTime - b.entryTime);

    for (const t of allTrades) {
        if (t.R > 0) wins++;
        runningR += t.R;
        if (runningR > peakR) peakR = runningR;
        const currentDD = peakR - runningR;
        if (currentDD > maxDD) maxDD = currentDD;
    }

    return {
        trades: allTrades.length,
        winRate: (wins / allTrades.length) * 100,
        expectancy: runningR / allTrades.length,
        netR: runningR,
        maxDD
    };
}

async function runGridSearch(direction, data) {
    console.log(`\n======================================`);
    console.log(`🚀 STARTING GRID SEARCH: ${direction.toUpperCase()}`);
    console.log(`======================================\n`);

    const results = [];
    let iter = 0;
    const total = MACRO_EMA_OPTS.length * PULLBACK_EMA_OPTS.length * SL_ATR_BUFFER_OPTS.length * ADX_THRESHOLD_OPTS.length * TP_R_OPTS.length;

    for (const macro of MACRO_EMA_OPTS) {
        for (const pull of PULLBACK_EMA_OPTS) {
            for (const sl of SL_ATR_BUFFER_OPTS) {
                for (const adx of ADX_THRESHOLD_OPTS) {
                    for (const tp of TP_R_OPTS) {
                        iter++;
                        if (iter % 25 === 0) process.stdout.write(`\r[${iter}/${total}] Testing combinations...`);

                        const opts = {
                            direction,
                            MACRO_EMA: macro,
                            PULLBACK_EMA: pull,
                            SL_ATR_BUFFER: sl,
                            ADX_THRESHOLD: adx,
                            TP_R: tp
                        };

                        let allTrades = [];
                        for (const p of PAIRS) {
                            if (!data[p]) continue;
                            const res = await backtestPair(p, {
                                ...opts,
                                candles15m: data[p].candles15m,
                                candles1h: data[p].candles1h,
                                ind15mArr: data[p].ind15mArr,
                                ind1hArr: data[p].ind1hArr
                            });
                            if (res && res.trades) allTrades.push(...res.trades);
                        }

                        const metrics = calculatePortfolioMetrics(allTrades);

                        // Only keep viable setups
                        if (metrics.trades > 50 && metrics.expectancy > 0) {
                            results.push({
                                config: opts,
                                ...metrics
                            });
                        }
                    }
                }
            }
        }
    }

    console.log(`\n\n✅ Done. Found ${results.length} profitable combinations.`);

    // Sort by Expectancy DESC
    results.sort((a, b) => b.expectancy - a.expectancy);

    console.log(`\n🏆 TOP 5 EXPECTANCY CONFIGS (${direction.toUpperCase()}):`);
    results.slice(0, 5).forEach((r, i) => {
        console.log(`${i + 1}. Exp: +${r.expectancy.toFixed(2)}R | WinRate: ${r.winRate.toFixed(1)}% | Trades: ${r.trades} | NetR: +${r.netR.toFixed(1)}R | MaxDD: ${r.maxDD.toFixed(1)}R`);
        console.log(`   Config: MACRO=${r.config.MACRO_EMA}, PULL=${r.config.PULLBACK_EMA}, SL_BUF=${r.config.SL_ATR_BUFFER}, ADX=${r.config.ADX_THRESHOLD}, TP=${r.config.TP_R}\n`);
    });

    return results;
}

async function main() {
    const data = await loadData();
    const longResults = await runGridSearch('long', data);
    const shortResults = await runGridSearch('short', data);

    fs.writeFileSync('optimization_results.json', JSON.stringify({ long: longResults, short: shortResults }, null, 2));
    console.log(`\nAll results written to optimization_results.json`);
}

main().catch(console.error);
