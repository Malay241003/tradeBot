// shared/entry.js


// ================================
// 2️⃣ VOLATILITY EXPANSION (1H)
// ================================
export function volatilityExpansion(candles1h, ind1hArr, i, assetClass = "crypto") {
  if (i < 50) return false;

  const isStock = assetClass === "stocks";
  const atrMult = isStock ? 1.1 : 1.5;
  const rangeMult = isStock ? 1.1 : 1.3;

  const atr14 = ind1hArr[i].atr;

  const atr50 =
    ind1hArr.slice(i - 50, i)
      .reduce((a, b) => a + b.atr, 0) / 50;

  const avgRange20 =
    candles1h.slice(i - 20, i)
      .reduce((a, b) => a + (b.high - b.low), 0) / 20;

  const rangeNow = candles1h[i].high - candles1h[i].low;

  return (
    atr14 > atrMult * atr50 &&
    rangeNow > rangeMult * avgRange20
  );
}

// ================================
// 3️⃣ FAILED BOUNCE (15m)
// ================================
export function failedBounce15m(candles15m, ind15mArr, i, assetClass = "crypto") {
  if (i < 5) return false;

  const isStock = assetClass === "stocks";
  const impulseMult = isStock ? 0.8 : 1.2;

  const drop = candles15m[i - 4];
  const bounce = candles15m[i - 1];
  const dropATR = ind15mArr[i - 4].atr;

  const dropImpulse =
    (drop.open - drop.low) >= impulseMult * dropATR;

  const weakBounce =
    bounce.high <= ind15mArr[i - 1].ema50;

  const volumeFail =
    bounce.volume < 0.7 * drop.volume;

  return dropImpulse && weakBounce && volumeFail;
}

// ================================
// 4️⃣ REJECTION → BREAKDOWN TRIGGER
// ================================
export function rejectionBreakdown(candles15m, i, assetClass = "crypto") {
  if (i < 2) return false;

  const isStock = assetClass === "stocks";
  const wickMult = isStock ? 0.45 : 0.6;

  const reject = candles15m[i - 1];
  const next = candles15m[i];

  const wick =
    reject.high - Math.max(reject.open, reject.close);

  const range = reject.high - reject.low;

  const rejection =
    wick >= wickMult * range;

  const breakdown =
    next.low < reject.low &&
    next.volume > reject.volume;

  return rejection && breakdown;
}

// ================================
// 5️⃣ STOP CALCULATION
// ================================
export function calcSurvivalSL(candles15m, ind15mArr, i) {
  const bounceHigh = candles15m[i - 1].high;
  return bounceHigh + 0.25 * ind15mArr[i].atr;
}

// ================================
// 6️⃣ [LONG] FAILED PULLBACK (15m)
// ================================
export function failedPullback15m(candles15m, ind15mArr, i, assetClass = "crypto") {
  if (i < 5) return false;

  const isStock = assetClass === "stocks";
  const impulseMult = isStock ? 0.8 : 1.2;

  const rally = candles15m[i - 4];
  const pullback = candles15m[i - 1];
  const rallyATR = ind15mArr[i - 4].atr;

  // 1. Impulse Rally (Green move from Open to High)
  const rallyImpulse =
    (rally.high - rally.open) >= impulseMult * rallyATR;

  // 2. Weak Pullback (Low stays ABOVE EMA50)
  const weakPullback =
    pullback.low >= ind15mArr[i - 1].ema50;

  // 3. Volume Drying Up
  const volumeFail =
    pullback.volume < 0.7 * rally.volume;

  return rallyImpulse && weakPullback && volumeFail;
}

// ================================
// 7️⃣ [LONG] REJECTION → BREAKOUT
// ================================
export function rejectionBreakout(candles15m, i, assetClass = "crypto") {
  if (i < 2) return false;

  const isStock = assetClass === "stocks";
  const wickMult = isStock ? 0.45 : 0.6;

  const reject = candles15m[i - 1];
  const next = candles15m[i];

  // Lower Wick (Hammer)
  const wick =
    Math.min(reject.open, reject.close) - reject.low;

  const range = reject.high - reject.low;

  const rejection =
    wick >= wickMult * range;

  // Breakout: Higher High + Volume Expansion
  const breakout =
    next.high > reject.high &&
    next.volume > reject.volume;

  return rejection && breakout;
}

// ================================
// 8️⃣ [LONG] STOP CALCULATION
// ================================
export function calcLongSL(candles15m, ind15mArr, i) {
  const pullbackLow = candles15m[i - 1].low;
  return pullbackLow - 0.25 * ind15mArr[i].atr;
}









