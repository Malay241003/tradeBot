export const CONFIG = {
  CAPITAL: 10000,
  MONTHS: 18,          // unused — data fetches from 2018-01-01
  RISK_PER_TRADE: 50,  // 1R
  TP_R: 3,
  MIN_HISTORY_15M: 1000,
  MIN_HISTORY_1H: 200,
  // CoinDCX Futures (USDT-M) fee structure
  // Regular 1: Maker 0.02%, Taker 0.05%
  // 18% GST applicable on fees
  // Round-trip Taker (Regular 1): (0.05% * 2) * 1.18 = 0.118%
  FEE_PCT: 0.00118,

  SPREAD_PCT: 0.0010,  // 0.10%
  SLIPPAGE_PCT: 0.0008,  // 0.08%
  FUNDING_PER_8H: 0.0001, // 0.01%
  MAX_BARS_IN_TRADE: 672 // 🔴 NEW → 7 days (96 bars/day)

  /* 
  VIP Levels (Futures USDT-M):
  Level      | Maker   | Taker   | All-in Round-trip (Taker)
  -----------|---------|---------|-------------------------
  Regular 1  | 0.020%  | 0.050%  | 0.1180%
  VIP 1      | 0.020%  | 0.048%  | 0.1133%
  VIP 2      | 0.0175% | 0.048%  | 0.1133%
  VIP 3      | 0.015%  | 0.047%  | 0.1109%
  VIP 4      | 0.012%  | 0.045%  | 0.1062%
  VIP 5      | 0.010%  | 0.041%  | 0.0968%
  VIP 6      | 0.008%  | 0.034%  | 0.0802%
  VIP 7      | 0.007%  | 0.030%  | 0.0708%
  */

};
