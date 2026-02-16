// shared/entry.js


// ================================
// 2️⃣ VOLATILITY EXPANSION (1H)
// ================================
export function volatilityExpansion(candles1h, ind1hArr, i) {
  if (i < 50) return false;

  const atr14 = ind1hArr[i].atr;

  const atr50 =
    ind1hArr.slice(i - 50, i)
      .reduce((a, b) => a + b.atr, 0) / 50;

  const avgRange20 =
    candles1h.slice(i - 20, i)
      .reduce((a, b) => a + (b.high - b.low), 0) / 20;

  const rangeNow = candles1h[i].high - candles1h[i].low;

  return (
    atr14 > 1.5 * atr50 &&
    rangeNow > 1.3 * avgRange20
  );
}

// ================================
// 3️⃣ FAILED BOUNCE (15m)
// ================================
export function failedBounce15m(candles15m, ind15mArr, i) {
  if (i < 5) return false;

  const drop = candles15m[i - 4];
  const bounce = candles15m[i - 1];
  const dropATR = ind15mArr[i - 4].atr;

  const dropImpulse =
    (drop.open - drop.low) >= 1.2 * dropATR;

  const weakBounce =
    bounce.high <= ind15mArr[i - 1].ema50;

  const volumeFail =
    bounce.volume < 0.7 * drop.volume;

  return dropImpulse && weakBounce && volumeFail;
}

// ================================
// 4️⃣ REJECTION → BREAKDOWN TRIGGER
// ================================
export function rejectionBreakdown(candles15m, i) {
  if (i < 2) return false;

  const reject = candles15m[i - 1];
  const next = candles15m[i];

  const wick =
    reject.high - Math.max(reject.open, reject.close);

  const range = reject.high - reject.low;

  const rejection =
    wick >= 0.6 * range;

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









