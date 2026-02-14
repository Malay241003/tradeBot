
import { precomputeIndicators } from "./shared/precomputeIndicators.js";

// Mock candles
const candles = Array.from({ length: 100 }, (_, i) => ({
    time: i * 60000,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
    volume: 1000
}));

const computed = precomputeIndicators(candles);

console.log("Candles Length:", candles.length);
console.log("Computed Length:", computed.length);
console.log("First Element ATR:", computed[0].atr);
console.log("Last Element ATR:", computed[computed.length - 1].atr);
console.log("Index 20 ATR:", computed[20].atr);
