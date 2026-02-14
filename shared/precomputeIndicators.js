import { EMA, RSI, ATR } from "technicalindicators";

export function precomputeIndicators(candles) {
  const close = candles.map(c => c.close);
  const high  = candles.map(c => c.high);
  const low   = candles.map(c => c.low);

  const ema20  = EMA.calculate({ period: 20, values: close });
  const ema50  = EMA.calculate({ period: 50, values: close });
  const ema100 = EMA.calculate({ period: 100, values: close });
  const rsi14  = RSI.calculate({ period: 14, values: close });
  const atr14  = ATR.calculate({ period: 14, high, low, close });

  return candles.map((c, i) => {
    const ema20i  = ema20[i - (ema20.length  - candles.length)];
    const ema50i  = ema50[i - (ema50.length  - candles.length)];
    const ema100i = ema100[i - (ema100.length - candles.length)];
    const rsii    = rsi14[i - (rsi14.length  - candles.length)];
    const atri    = atr14[i - (atr14.length  - candles.length)];

    return {
      ema20:  ema20i,
      ema50:  ema50i,
      ema100: ema100i ?? ema50i,
      rsi:    rsii,
      atr:    Math.max(atri ?? 0, c.close * 0.001)
    };
  });
}
