import { getCandles } from "../bot/adapters/index.js";
import { backtestPair } from "./engine.js";
import { precomputeIndicators } from "../shared/precomputeIndicators.js";
import { DIRECTION_CONFIGS } from "./config.js";
import fs from "fs";

// Micro-Structure Grid Search
const IMPULSE_MULT_OPTS = [0.8, 1.0, 1.2, 1.5];
const WICK_MULT_OPTS = [0.4, 0.5, 0.6, 0.7];
const VOL_FAIL_MULT_OPTS = [0.5, 0.7, 0.8];
const MAX_BARS_OPTS = [192, 384, 672, 960]; // 2d, 4d, 7d, 10d

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

function calculateMetrics(allTrades) {
    if (allTrades.length === 0) return { trades: 0, winRate: 0, expectancy: 0, maxDD: 0, netR: 0 };

    let wins = 0;
    let runningR = 0;
    let peakR = 0;
    let maxDD = 0;

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
    console.log(`🚀 STARTING ASSET-SPECIFIC V2 SEARCH: ${direction.toUpperCase()}`);
    console.log(`======================================\n`);

    const bestPerAsset = {};
    const baseConfig = DIRECTION_CONFIGS[direction] || {};

    const totalPermutations = IMPULSE_MULT_OPTS.length * WICK_MULT_OPTS.length * VOL_FAIL_MULT_OPTS.length * MAX_BARS_OPTS.length;

    for (const p of PAIRS) {
        if (!data[p]) continue;

        console.log(`\nTesting ${p} (${totalPermutations} combinations)...`);
        const pairResults = [];
        let iter = 0;

        for (const imp of IMPULSE_MULT_OPTS) {
            for (const wick of WICK_MULT_OPTS) {
                for (const vol of VOL_FAIL_MULT_OPTS) {
                    for (const bars of MAX_BARS_OPTS) {
                        iter++;
                        if (iter % 25 === 0) process.stdout.write(`\r[${iter}/${totalPermutations}]...`);

                        const opts = {
                            ...baseConfig, // Keep Macro winning config
                            direction,
                            IMPULSE_MULT: imp,
                            WICK_MULT: wick,
                            VOL_FAIL_MULT: vol,
                            MAX_BARS_IN_TRADE: bars
                        };

                        const res = await backtestPair(p, {
                            ...opts,
                            candles15m: data[p].candles15m,
                            candles1h: data[p].candles1h,
                            ind15mArr: data[p].ind15mArr,
                            ind1hArr: data[p].ind1hArr
                        });

                        if (!res || !res.trades) continue;

                        const metrics = calculateMetrics(res.trades);

                        // Thresholds for validity per pair
                        if (metrics.trades > 20 && metrics.expectancy > 0) {
                            pairResults.push({
                                config: opts,
                                ...metrics
                            });
                        }
                    }
                }
            }
        }

        process.stdout.write(`\r[${iter}/${totalPermutations}] Done!     \n`);

        // Sort specifically to find the best for this asset (Max Expectancy)
        pairResults.sort((a, b) => b.expectancy - a.expectancy);

        if (pairResults.length > 0) {
            const best = pairResults[0];
            bestPerAsset[p] = best;
            console.log(`🏆 BEST ${p}: Exp +${best.expectancy.toFixed(2)}R | Win: ${best.winRate.toFixed(1)}% | NetR: +${best.netR.toFixed(1)}`);
            console.log(`   Config: IMP=${best.config.IMPULSE_MULT}, WICK=${best.config.WICK_MULT}, VOL=${best.config.VOL_FAIL_MULT}, EXIT_BARS=${best.config.MAX_BARS_IN_TRADE}`);
        } else {
            console.log(`⚠️ ${p} yielded no highly profitable micro-structures.`);
        }
    }

    return bestPerAsset;
}

async function main() {
    const data = await loadData();
    const longResults = await runGridSearch('long', data);
    const shortResults = await runGridSearch('short', data);

    const finalOutput = {
        long: longResults,
        short: shortResults
    };

    fs.writeFileSync('optimization_v2_results.json', JSON.stringify(finalOutput, null, 2));
    console.log(`\nAll asset-specific results written to optimization_v2_results.json`);
}

main().catch(console.error);
