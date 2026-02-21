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
  },
  forex: {
    FEE_PCT: 0,
    SPREAD_PCT: 0.00015,
    SLIPPAGE_PCT: 0.00005,
    SWAP_PER_DAY: 0.00003,
    MAX_BARS_IN_TRADE: 480,
    SESSION: "24/5"
  },
  stocks: {
    FEE_PCT: 0,
    SPREAD_PCT: 0.0001,
    SLIPPAGE_PCT: 0.0001,
    SWAP_PER_DAY: 0,
    MAX_BARS_IN_TRADE: 384,
    SESSION: "9:30-16:00 ET"
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

// =======================================
// ASSET OVERRIDES (V2 OPTIMIZED)
// =======================================
export const ASSET_OVERRIDES = {
  "long": {
    "B-BTCUSDT": {
      "IMPULSE_MULT": 1.5,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 960
    },
    "B-ETHUSDT": {
      "IMPULSE_MULT": 1.2,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 960
    },
    "B-XRPUSDT": {
      "IMPULSE_MULT": 1.2,
      "WICK_MULT": 0.7,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-LTCUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.6,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 960
    },
    "B-BCHUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-ADAUSDT": {
      "IMPULSE_MULT": 1.2,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.8,
      "MAX_BARS_IN_TRADE": 192
    },
    "B-TRXUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.6,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 192
    },
    "B-XLMUSDT": {
      "IMPULSE_MULT": 1.5,
      "WICK_MULT": 0.6,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 384
    },
    "B-IOTAUSDT": {
      "IMPULSE_MULT": 1.2,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-DASHUSDT": {
      "IMPULSE_MULT": 1,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 384
    },
    "B-ZECUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-NEOUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.6,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 672
    }
  },
  "short": {
    "B-BTCUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-ETHUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 384
    },
    "B-XRPUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.7,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-LTCUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-BCHUSDT": {
      "IMPULSE_MULT": 1.2,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.8,
      "MAX_BARS_IN_TRADE": 960
    },
    "B-ADAUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.6,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 192
    },
    "B-TRXUSDT": {
      "IMPULSE_MULT": 1,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-XLMUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 384
    },
    "B-IOTAUSDT": {
      "IMPULSE_MULT": 1,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.7,
      "MAX_BARS_IN_TRADE": 384
    },
    "B-DASHUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.7,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 384
    },
    "B-ZECUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.4,
      "VOL_FAIL_MULT": 0.5,
      "MAX_BARS_IN_TRADE": 672
    },
    "B-NEOUSDT": {
      "IMPULSE_MULT": 0.8,
      "WICK_MULT": 0.5,
      "VOL_FAIL_MULT": 0.8,
      "MAX_BARS_IN_TRADE": 960
    }
  }
};
