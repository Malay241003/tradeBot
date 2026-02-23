import { walkForward } from './backtest_us_stocks/walkForward.js';
import { evaluateWF } from './backtest_us_stocks/wfEvaluator.js';

const universe = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];

async function run() {
    let longPassed = [];
    let longFailed = [];
    console.log("Running LONG Walk-Forward...");
    for (const pair of universe) {
        const wf = await walkForward(pair, { direction: 'long', assetClass: 'stocks' });
        if (!wf) continue;
        const verdict = evaluateWF(wf);
        if (verdict.ACCEPT) {
            longPassed.push({ pair, exp: verdict.overallExpectancy, winPct: verdict.positivePct });
        } else {
            longFailed.push({ pair, exp: verdict.overallExpectancy, winPct: verdict.positivePct });
        }
    }

    let shortPassed = [];
    let shortFailed = [];
    console.log("Running SHORT Walk-Forward...");
    for (const pair of universe) {
        const wf = await walkForward(pair, { direction: 'short', assetClass: 'stocks' });
        if (!wf) continue;
        const verdict = evaluateWF(wf);
        if (verdict.ACCEPT) {
            shortPassed.push({ pair, exp: verdict.overallExpectancy, winPct: verdict.positivePct });
        } else {
            shortFailed.push({ pair, exp: verdict.overallExpectancy, winPct: verdict.positivePct });
        }
    }

    console.log("\n=== LONG WF VERDICTS ===");
    console.log(`TOTAL PASSES: ${longPassed.length} / ${universe.length}`);
    console.log("PASSED:", JSON.stringify(longPassed, null, 2));
    console.log("FAILED:", JSON.stringify(longFailed, null, 2));

    console.log("\n=== SHORT WF VERDICTS ===");
    console.log(`TOTAL PASSES: ${shortPassed.length} / ${universe.length}`);
    console.log("PASSED:", JSON.stringify(shortPassed, null, 2));
    console.log("FAILED:", JSON.stringify(shortFailed, null, 2));
}

run();
