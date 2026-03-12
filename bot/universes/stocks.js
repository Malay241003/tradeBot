// bot/universes/stocks.js
// Two universes:
//  - STOCKS_UNIVERSE: original 12-stock list (used for current backtests)
//  - STOCKS_TOP_150:  S&P 100 universe + 50 growth/mid-cap picks

// ─── Screened Universe (trades≥17, SR≥0.25, 2/3 regime stable, sector-capped) ─
// Previous 12: SPY, QQQ, AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, JPM, V, JNJ
export const STOCKS_UNIVERSE = [
    "TSLA", "NVDA", "AMZN", "META", "AAPL",
    "GOOGL", "AMD", "NOW", "AXP", "FCX"
];

// ─── S&P 100 + 50 Growth/Mid-Cap ─────────────────────────────────────────────
export const STOCKS_TOP_150 = [
    // Mega-cap Tech
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO",
    // Healthcare
    "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "AMGN",
    "GILD", "REGN", "MDT", "SYK", "BSX", "ZTS", "BDX", "ISRG",
    "CI", "ELV", "CVS",
    // Financials
    "JPM", "V", "MA", "WFC", "GS", "SPGI", "BLK", "AXP",
    "SCHW", "MMC", "AON", "CB", "CME", "C", "PNC", "USB",
    "ADP",
    // Consumer
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "TJX", "PM",
    "MO", "CL", "MAR",
    // Energy
    "XOM", "CVX", "COP", "EOG", "SLB", "FCX",
    // Industrials
    "HD", "HON", "CAT", "UNP", "RTX", "GE", "LOW", "LMT",
    "NOC", "ITW", "CSX", "NSC", "EMR", "WM", "APD",
    // Tech / Semi
    "TXN", "IBM", "QCOM", "ORCL", "AMD", "INTC", "CSCO", "ADBE",
    "CRM", "NFLX", "NOW",
    // Comms / Media
    "DIS", "CMCSA", "T",
    // Utilities / REIT
    "SO", "DUK", "AMT", "EQIX",
    // Diversified
    "BRK.B", "BKNG", "VRTX", "PFE", "BA", "MMM",
    // Expansion: 50 Growth / Mid-Cap Tech
    "PANW", "SNPS", "CDNS", "FTNT", "MRVL", "LRCX", "KLAC", "AMAT", "MU", "ON",
    "ABNB", "UBER", "DKNG", "PLTR", "CRWD", "ZS", "SHOP", "MELI", "TTD", "COIN",
    "SNOW", "TEAM", "DASH", "NET", "DDOG", "HUBS", "VEEV", "PAYC", "OKTA", "TWLO",
    "SQ", "PYPL", "WDAY", "APP", "PINS", "SNAP", "ROKU", "SE", "GRAB", "NU",
    "SOFI", "HOOD", "RIVN", "LCID", "NIO", "LI", "XPEV", "BILL", "MNDY", "CELH"
];
