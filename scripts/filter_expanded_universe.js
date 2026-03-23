/**
 * filter_expanded_universe.js
 * 
 * Parses screening_results_long.json and screening_results_short.json
 * Filters for: Expectancy > 0.5R, Trades >= 10, Win Rate >= 27%
 * Generates the new bot/universes/crypto_long.js and bot/universes/crypto_short.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const MIN_EXPECTANCY = 0.5;
const MIN_TRADES = 10;
const MIN_WIN_RATE = 27; // 27%

function filterResults(inputFile, outputFile, arrayName, direction) {
    console.log(`\n==== Filtering ${direction.toUpperCase()} ====`);
    
    if (!fs.existsSync(inputFile)) {
        console.error(`File not found: ${inputFile}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));
    
    const filtered = data.filter(r => {
        return r.expectancy > MIN_EXPECTANCY &&
               r.trades >= MIN_TRADES &&
               r.winRate >= MIN_WIN_RATE;
    });

    console.log(`Original count: ${data.length}`);
    console.log(`Filtered count: ${filtered.length}\n`);

    // Sort by expectancy
    filtered.sort((a, b) => b.expectancy - a.expectancy);

    const lines = filtered.map(r => {
        const expStr = r.expectancy.toFixed(2);
        const wrStr = r.winRate.toFixed(1);
        const tradesStr = r.trades.toString();
        // pad pair name so comments align
        const pairPad = `"${r.pair}",`.padEnd(18, " ");
        
        return `    ${pairPad}// exp: ${expStr}R  WR: ${wrStr}%  trades: ${tradesStr}`;
    });

    const fileContent = `// bot/universes/crypto_${direction}.js
// Final deployment universe — ${direction.toUpperCase()} direction
// Filtered: exp > 0.5R, trades ≥ 10, WR ≥ 27%
// Source: Top 400 Binance screening (${path.basename(inputFile)})
// Generated: ${new Date().toISOString()}
// Total: ${filtered.length} pairs

export const CRYPTO_${direction.toUpperCase()} = [
${lines.join("\n")}
];
`;

    fs.writeFileSync(outputFile, fileContent);
    console.log(`Written to: ${outputFile}`);
}

const longInput = path.join(ROOT_DIR, "screening_results_long.json");
const longOutput = path.join(ROOT_DIR, "bot", "universes", "crypto_long.js");
filterResults(longInput, longOutput, "CRYPTO_LONG", "long");

const shortInput = path.join(ROOT_DIR, "screening_results_short.json");
const shortOutput = path.join(ROOT_DIR, "bot", "universes", "crypto_short.js");
filterResults(shortInput, shortOutput, "CRYPTO_SHORT", "short");

console.log("\nFiltering complete.");
