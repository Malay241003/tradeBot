import fs from "fs";

function analyzeTrades(direction) {
    const filePath = `./result_us_stocks_${direction}/trades_detailed_${direction}.csv`;
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const csv = fs.readFileSync(filePath, "utf-8");
    const lines = csv.split("\n").filter(l => l.trim().length > 0);
    const headers = lines[0].split(",");

    const indexMap = {};
    headers.forEach((h, i) => { indexMap[h.trim()] = i; });

    const trades = lines.slice(1).map(line => {
        const parts = line.split(",");
        const e1 = parseInt(parts[indexMap["EntryTime"]], 10);
        const e2 = parseInt(parts[indexMap["ExitTime"]], 10);
        return {
            pair: parts[indexMap["Pair"]],
            entryTime: new Date(e1),
            exitTime: new Date(e2),
            result: parseFloat(parts[indexMap["R"]]) > 0 ? "WIN" : "LOSS",
            r: parseFloat(parts[indexMap["R"]])
        };
    });

    console.log(`\n\n=== DEEP ANALYSIS: ${direction.toUpperCase()} ===`);

    // 1. Time of Day Analysis
    console.log(`\n--- Time-of-Day Analysis ---`);
    const hourStats = {};
    trades.forEach(t => {
        const hr = t.entryTime.getUTCHours();
        if (!hourStats[hr]) hourStats[hr] = { trades: 0, wins: 0, netR: 0 };
        hourStats[hr].trades++;
        hourStats[hr].netR += t.r;
        if (t.result === "WIN") hourStats[hr].wins++;
    });

    const sortedHours = Object.keys(hourStats).sort((a, b) => parseInt(a) - parseInt(b));
    sortedHours.forEach(hr => {
        const s = hourStats[hr];
        const winRate = ((s.wins / s.trades) * 100).toFixed(1);
        console.log(`Hour ${hr}:00 UTC -> Trades: ${s.trades.toString().padEnd(3)} | Win Rate: ${winRate}% | Net R: ${s.netR.toFixed(2)}`);
    });

    // 2. Concurrency Analysis
    console.log(`\n--- Trade Concurrency & Correlation Risk ---`);
    trades.sort((a, b) => a.entryTime - b.entryTime);

    let maxConcurrent = 0;
    let concurrentPairsAtMax = new Set();
    let maxTime = null;

    for (let i = 0; i < trades.length; i++) {
        const current = trades[i];
        let concurrent = 1;
        let localPairs = new Set([current.pair]);

        for (let j = 0; j < trades.length; j++) {
            if (i === j) continue;
            const other = trades[j];

            // If other trade was open during the current trade's entry time
            if (current.entryTime >= other.entryTime && current.entryTime < other.exitTime) {
                concurrent++;
                localPairs.add(other.pair);
            }
        }

        if (concurrent > maxConcurrent) {
            maxConcurrent = concurrent;
            maxTime = current.entryTime;
            concurrentPairsAtMax = new Set(localPairs);
        }
    }

    console.log(`Maximum Concurrent Trades: ${maxConcurrent}`);
    console.log(`Occurred At: ${maxTime.toISOString()}`);
    console.log(`Involved Pairs: ${Array.from(concurrentPairsAtMax).join(", ")}`);

    // Quick portfolio risk calc
    const portfolioRisk = maxConcurrent * 1.0; // Assuming 1R risk per trade
    console.log(`Max Portfolio Drawdown Risk in one moment: ${portfolioRisk}R`);
}

analyzeTrades("long");
analyzeTrades("short");
