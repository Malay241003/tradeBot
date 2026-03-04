// bot/live/config.js
// Blueberry Funded 1-Step Rules + Live Bot Configuration

export const LIVE_CONFIG = {
    // ═══════════════════════════════════════
    // BLUEBERRY FUNDED 1-STEP RULES
    // ═══════════════════════════════════════
    INITIAL_BALANCE: 5000,
    PROFIT_TARGET_PCT: 0.10,         // 10% → pass at $5,500
    MAX_DAILY_DD_PCT: 0.04,          // 4% daily drawdown
    SAFE_DAILY_DD_LIMIT: 0.035,      // 3.5% hard stop buffer (our safety)
    MAX_TOTAL_DD_PCT: 0.06,          // 6% static max drawdown → fail at $4,700
    MIN_TRADING_DAYS: 3,

    // ═══════════════════════════════════════
    // RISK MANAGEMENT
    // ═══════════════════════════════════════
    RISK_PER_TRADE_PCT: 0.005,       // 0.5% of balance per trade

    // ═══════════════════════════════════════
    // LEVERAGE LIMITS
    // ═══════════════════════════════════════
    LEVERAGE: {
        crypto: 2,                    // 1:2
        stocks: 10,                   // 1:10
    },

    // ═══════════════════════════════════════
    // LOT SIZE LIMITS ($5k TIER)
    // ═══════════════════════════════════════
    LOT_LIMITS: {
        BTC: 0.05,
        ETH: 2.0,
        SOL: 2.0,
        OTHER_CRYPTO: 5.0,
    },

    // ═══════════════════════════════════════
    // POSITION LIMITS
    // ═══════════════════════════════════════
    MAX_POSITIONS_PER_ASSET: 4,
    MAX_TOTAL_POSITIONS: 7,

    // ═══════════════════════════════════════
    // COSTS (CoinDCX Futures)
    // ═══════════════════════════════════════
    FEE_PCT: 0.00118,                // Round-trip taker fee (incl. 18% GST)
    SPREAD_PCT: 0.0010,              // 0.10%
    SLIPPAGE_PCT: 0.0008,            // 0.08%
    FUNDING_PER_8H: 0.0001,          // 0.01%
    COMMISSION_ROUND_TRIP: 0.0004,   // 0.04% of notional

    // ═══════════════════════════════════════
    // STRATEGY (from backtest config)
    // ═══════════════════════════════════════
    TP_R: 5.0,
    MACRO_EMA: 'ema200',
    MAX_BARS_IN_TRADE: 672,          // 7 days in 15m bars
    SL_ATR_BUFFER_SHORT: 0.5,
    SL_ATR_BUFFER_LONG: 1.0,
    USE_TRAILING_STOP: false,
    TRAILING_ACTIVATION_R: 2.0,
    TRAILING_ATR_MULT: 2.5,

    // ═══════════════════════════════════════
    // SCANNING
    // ═══════════════════════════════════════
    SCAN_INTERVAL_MS: 15 * 60 * 1000,   // 15 minutes
    SKIP_WEEKEND_ENTRIES: true,

    // US market hours (UTC) for TwelveData credit optimization
    US_MARKET_OPEN_UTC: 14,   // 9:30 AM EST ≈ 14:30 UTC (rounding to 14)
    US_MARKET_CLOSE_UTC: 21,  // 4:00 PM EST = 21:00 UTC

    // ═══════════════════════════════════════
    // FILE PATHS
    // ═══════════════════════════════════════
    STATE_FILE: './bot/live/data/state.json',
    TRADES_LOG: './bot/live/data/trades_log.json',
    DAILY_SUMMARY: './bot/live/data/daily_summary.json',
    SCAN_LOG: './bot/live/data/scan_log.json',
};
