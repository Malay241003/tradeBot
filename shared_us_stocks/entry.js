// shared/entry.js

// ================================
// 2️⃣ VOLATILITY EXPANSION (1H)
// ================================
export function volatilityExpansion(candles1h, ind1hArr, i, assetClass = "crypto", opts = {}) {
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
export function failedBounce15m(candles15m, ind15mArr, i, assetClass = "crypto", opts = {}) {
  if (i < 5) return false;

  const isStock = assetClass === "stocks";
  const impulseMult = opts.IMPULSE_MULT !== undefined ? opts.IMPULSE_MULT : (isStock ? 0.8 : 1.2);

  const drop = candles15m[i - 4];
  const bounce = candles15m[i - 1];
  const dropATR = ind15mArr[i - 4].atr;

  const dropImpulse =
    (drop.open - drop.low) >= impulseMult * dropATR;

  const pullbackEma = opts.PULLBACK_EMA || 'ema50';
  const weakBounce =
    bounce.high <= ind15mArr[i - 1][pullbackEma];

  const volumeFail =
    bounce.volume < (opts.VOL_FAIL_MULT !== undefined ? opts.VOL_FAIL_MULT : 0.7) * drop.volume;

  return dropImpulse && weakBounce && volumeFail;
}

// ================================
// 4️⃣ REJECTION → BREAKDOWN TRIGGER
// ================================
export function rejectionBreakdown(candles15m, i, assetClass = "crypto", opts = {}) {
  if (i < 2) return false;

  const isStock = assetClass === "stocks";
  const wickMult = opts.WICK_MULT !== undefined ? opts.WICK_MULT : (isStock ? 0.45 : 0.6);

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
export function calcSurvivalSL(candles15m, ind15mArr, i, opts = {}) {
  const bounceHigh = candles15m[i - 1].high;
  const slBuffer = opts.SL_ATR_BUFFER !== undefined ? opts.SL_ATR_BUFFER : 0.25;
  return bounceHigh + slBuffer * ind15mArr[i].atr;
}

// ================================
// 6️⃣ [LONG] FAILED PULLBACK (15m)
// ================================
export function failedPullback15m(candles15m, ind15mArr, i, assetClass = "crypto", opts = {}) {
  if (i < 5) return false;

  const isStock = assetClass === "stocks";
  const impulseMult = opts.IMPULSE_MULT !== undefined ? opts.IMPULSE_MULT : (isStock ? 0.8 : 1.2);

  const rally = candles15m[i - 4];
  const pullback = candles15m[i - 1];
  const rallyATR = ind15mArr[i - 4].atr;

  // 1. Impulse Rally (Green move from Open to High)
  const rallyImpulse =
    (rally.high - rally.open) >= impulseMult * rallyATR;

  // 2. Weak Pullback (Low stays ABOVE EMA50)
  const pullbackEma = opts.PULLBACK_EMA || 'ema50';
  const weakPullback =
    pullback.low >= ind15mArr[i - 1][pullbackEma];

  // 3. Volume Drying Up
  const volumeFail =
    pullback.volume < (opts.VOL_FAIL_MULT !== undefined ? opts.VOL_FAIL_MULT : 0.7) * rally.volume;

  return rallyImpulse && weakPullback && volumeFail;
}

// ================================
// 7️⃣ [LONG] REJECTION → BREAKOUT
// ================================
export function rejectionBreakout(candles15m, i, assetClass = "crypto", opts = {}) {
  if (i < 2) return false;

  const isStock = assetClass === "stocks";
  const wickMult = opts.WICK_MULT !== undefined ? opts.WICK_MULT : (isStock ? 0.45 : 0.6);

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
export function calcLongSL(candles15m, ind15mArr, i, opts = {}) {
  const pullbackLow = candles15m[i - 1].low;
  const slBuffer = opts.SL_ATR_BUFFER !== undefined ? opts.SL_ATR_BUFFER : 0.25;
  return pullbackLow - slBuffer * ind15mArr[i].atr;
}










