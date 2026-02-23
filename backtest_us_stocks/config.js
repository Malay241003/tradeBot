export const CONFIG = {
  CAPITAL: 10000,
  // MONTHS: 18,          // unused — data fetches from 2018-01-01
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
  // MAX_BARS_IN_TRADE: 672,   // 7 days (96 bars/day)

  // Trailing Stop Configurations
  USE_TRAILING_STOP: false,
  TRAILING_ACTIVATION_R: 2.0, // Activate trailing after 2R is reached
  TRAILING_ATR_MULT: 2.5,     // Trail 2.5 ATRs behind the extreme

  // =======================================
  // FUNDING PIPS / SABIO TRADE PROP FIRM CONSTRAINTS (STOCKS)
  // =======================================
  PROP_FIRM: {
    STARTING_BALANCE: 10000,     // Standard $10k tier
    RISK_PER_TRADE_PCT: 0.005,   // 0.5% risk per trade
    MAX_LEVERAGE: 5,             // Matches 1:5 stock leverage target (DNA Funded style)
    DAILY_DD_LIMIT: 0.05,        // 5% max daily loss limit 
    MAX_DD_LIMIT: 0.06,          // 6% max total loss limit
    PROFIT_TARGET: 0.10,         // 10% phase 1 target
    COMMISSION_PCT: 0.0004,      // 0.04% per lot round trip commission
    NO_OVERNIGHT_HOLDING: false, // Standard for evaluation, overnight allowed
    NO_WEEKEND_HOLDING: true     // Friday market close flat requirement (No weekend holding)
  }
};

// =======================================
// PER-ASSET CONFIG PROFILES
// =======================================
export const ASSET_CONFIGS = {
  stocks: {
    FEE_PCT: 0,
    SPREAD_PCT: 0.0003,
    SLIPPAGE_PCT: 0.0005,
    SWAP_PER_DAY: 0.0002,
    MAX_BARS_IN_TRADE: 390,
    SESSION: "09:30-16:00 ET"
  }
};

// =======================================
// DIRECTION CONFIG PROFILES
// =======================================
export const DIRECTION_CONFIGS = {
  short: {
    TP_R: 5.0,
    MACRO_EMA: "ema100",
    PULLBACK_EMA: "ema20",
    SL_ATR_BUFFER: 0.5,
    ADX_THRESHOLD: 25
  },
  long: {
    TP_R: 5.0,
    MACRO_EMA: "ema200",
    PULLBACK_EMA: "ema20",
    SL_ATR_BUFFER: 0.25,
    ADX_THRESHOLD: 0
  }
};

// =======================================
// ASSET-SPECIFIC OVERRIDES (V2 OPTIMIZED)
// =======================================
export const OPTIMIZED_MICRO_STRUCTURES = {
  AAPL: {
    long: { IMPULSE_MULT: 1.5, WICK_MULT: 0.6, VOL_FAIL_MULT: 0.5, MAX_BARS_IN_TRADE: 960 }
  },
  MSFT: {
    long: { IMPULSE_MULT: 0.8, WICK_MULT: 0.5, VOL_FAIL_MULT: 0.8, MAX_BARS_IN_TRADE: 384 },
    short: { IMPULSE_MULT: 0.8, WICK_MULT: 0.4, VOL_FAIL_MULT: 0.7, MAX_BARS_IN_TRADE: 192 }
  },
  GOOGL: {
    long: { IMPULSE_MULT: 0.8, WICK_MULT: 0.4, VOL_FAIL_MULT: 0.7, MAX_BARS_IN_TRADE: 192 }
  },
  AMZN: {
    long: { IMPULSE_MULT: 0.8, WICK_MULT: 0.5, VOL_FAIL_MULT: 0.7, MAX_BARS_IN_TRADE: 960 }
  },
  NVDA: {
    long: { IMPULSE_MULT: 0.8, WICK_MULT: 0.4, VOL_FAIL_MULT: 0.5, MAX_BARS_IN_TRADE: 384 }
  },
  META: {
    long: { IMPULSE_MULT: 1.2, WICK_MULT: 0.5, VOL_FAIL_MULT: 0.7, MAX_BARS_IN_TRADE: 672 }
  },
  TSLA: {
    long: { IMPULSE_MULT: 0.8, WICK_MULT: 0.5, VOL_FAIL_MULT: 0.8, MAX_BARS_IN_TRADE: 384 },
    short: { IMPULSE_MULT: 0.8, WICK_MULT: 0.5, VOL_FAIL_MULT: 0.7, MAX_BARS_IN_TRADE: 960 }
  },
  SPY: {
    short: { IMPULSE_MULT: 1, WICK_MULT: 0.4, VOL_FAIL_MULT: 0.8, MAX_BARS_IN_TRADE: 384 }
  }
};
