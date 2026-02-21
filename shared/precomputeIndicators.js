import { EMA, RSI, ATR, ADX } from "technicalindicators";

export function precomputeIndicators(candles) {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);

  const ema20 = EMA.calculate({ period: 20, values: close });
  const ema50 = EMA.calculate({ period: 50, values: close });
  const ema100 = EMA.calculate({ period: 100, values: close });
  const ema200 = EMA.calculate({ period: 200, values: close });
  const rsi14 = RSI.calculate({ period: 14, values: close });
  const atr14 = ATR.calculate({ period: 14, high, low, close });

  // ADX returns objects { adx, pdi, mdi }
  const adx14 = ADX.calculate({ period: 14, high, low, close });

  return candles.map((c, i) => {
    const ema20i = ema20[i - candles.length + ema20.length];
    const ema50i = ema50[i - candles.length + ema50.length];
    const ema100i = ema100[i - candles.length + ema100.length];
    const ema200i = ema200[i - candles.length + ema200.length];
    const rsii = rsi14[i - candles.length + rsi14.length];
    const atri = atr14[i - candles.length + atr14.length];

    // Extract ADX safely
    const adxObj = adx14[i - candles.length + adx14.length];
    const adxi = adxObj ? adxObj.adx : undefined;

    return {
      ema20: ema20i,
      ema50: ema50i,
      ema100: ema100i ?? ema50i,
      ema200: ema200i ?? ema100i ?? ema50i,
      rsi: rsii,
      atr: Math.max(atri ?? 0, c.close * 0.001),
      adx: adxi ?? 0
    };
  });
}
