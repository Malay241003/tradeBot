export const CONFIG = {
  CAPITAL: 10000,
  MONTHS: 18,          // unused — data fetches from 2018-01-01
  RISK_PER_TRADE: 50,  // 1R
  // TP_R moved to directional config
  MIN_HISTORY_15M: 1000,
  MIN_HISTORY_1H: 200,
  // CoinDCX Futures (USDT-M) fee structure
  FEE_PCT: 0.00118,
  SPREAD_PCT: 0.0010,       // 0.10%
  SLIPPAGE_PCT: 0.0008,     // 0.08%
  FUNDING_PER_8H: 0.0001,   // 0.01%
  MIN_SL_PCT: 0.0030,       // 0.30% min stop loss distance
  MAX_BARS_IN_TRADE: 672,   // 7 days (96 bars/day)

  // Trailing Stop Configurations
  USE_TRAILING_STOP: false,
  TRAILING_ACTIVATION_R: 2.0, // Activate trailing after 2R is reached
  TRAILING_ATR_MULT: 2.5,     // Trail 2.5 ATRs behind the extreme

  // =======================================
  // FUNDING PIPS PROP FIRM CONSTRAINTS
  // =======================================
  PROP_FIRM: {
    STARTING_BALANCE: 10000,
    RISK_PER_TRADE_PCT: 0.005, // 0.5%
    MAX_LEVERAGE: 2,           // 1:2 strict crypto leverage
    DAILY_DD_LIMIT: 0.05,      // 5% max daily loss
    MAX_DD_LIMIT: 0.06,        // 6% max total loss
    PROFIT_TARGET: 0.10,       // 10% phase 1 target
    COMMISSION_PCT: 0.0004,    // 0.04% per lot round trip
    NO_WEEKEND_HOLDING: true   // Friday exit requirement
  }
};

// =======================================
// PER-ASSET CONFIG PROFILES
// =======================================
export const ASSET_CONFIGS = {
  crypto: {
    FEE_PCT: 0.00118,
    SPREAD_PCT: 0.0010,
    SLIPPAGE_PCT: 0.0008,
    FUNDING_PER_8H: 0.0001,
    MAX_BARS_IN_TRADE: 672,
    SESSION: "24/7"
  }
};

// =======================================
// DIRECTION CONFIG PROFILES
// =======================================
export const DIRECTION_CONFIGS = {
  short: {
    TP_R: 5.0,
    MACRO_EMA: "ema200",
    PULLBACK_EMA: "ema20",
    SL_ATR_BUFFER: 0.5,
    ADX_THRESHOLD: 0
  },
  long: {
    TP_R: 5.0,
    MACRO_EMA: "ema200",
    PULLBACK_EMA: "ema20",
    SL_ATR_BUFFER: 1.0,
    ADX_THRESHOLD: 0
  }
};


