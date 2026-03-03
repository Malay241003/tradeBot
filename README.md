# 📈 TradeBot — Systematic Crypto & US Stock Trading Engine

A quantitative trading bot and backtesting engine built in Node.js. Uses technical indicators on multi-timeframe candlestick data (15m, 1h) to generate long and short signals across **crypto** and **US stock** universes, with a full backtesting pipeline, walk-forward validation, Monte Carlo risk analysis, prop firm simulation, and live paper trading.

## ✨ Key Features

- **Multi-asset universe:** 18 crypto long pairs, 13 crypto short pairs, 10 US stocks (TSLA, NVDA, AAPL, etc.)
- **Market data** via Binance (Crypto) and TwelveData (Stocks) adapters with local JSON cache
- **Full historical backtesting** from 2018 to present with institutional-grade friction (spread, slippage, funding)
- **Walk-forward validation** per pair (sliding train/test windows)
- **Directional strategy separation** — decoupled Long & Short logic with independent configs
- **Screening & portfolio pipeline** — statistical screening, risk modeling, walk-forward portfolio optimization
- **Combined Prop Firm Simulator** — Monte Carlo simulation of Blueberry Funded 1-Step challenge with all 15 rules enforced
- **Monte Carlo V2 risk engine** — 4 layers: IID, Block Bootstrap, Correlation-Preserving, Stress Injection
- **5-year compounding projection** — 3 scenarios × 5,000 simulations
- **Fat-tail analytics** — MFE/MAE analysis, TP capture efficiency, bell curve overlays
- **Jupyter notebooks** for visualization (equity curves, MC fan charts, compounding projections)
- **Live paper trading bot** (planned) — real-time signal execution on CoinDCX with prop firm rule enforcement

---

## 📁 Project Structure

```
tradeBot/
├── bot/                          # Live trading module
│   ├── main.js                   # Bot entry point (15-min scan loop)
│   ├── coindcx.js                # CoinDCX API client (HMAC auth)
│   ├── binance.js                # Binance candle data fetcher + cache
│   ├── universe.js               # Dynamic universe builder
│   ├── adapters/                 # Data source router (Binance/TwelveData)
│   │   ├── index.js              # Unified getCandles() dispatcher
│   │   └── twelvedata.js         # TwelveData adapter (stocks/forex)
│   └── universes/                # Asset universe definitions
│       ├── crypto_long.js        # 18 crypto pairs (long direction)
│       ├── crypto_short.js       # 13 crypto pairs (short direction)
│       └── stocks.js             # 10 US stocks + S&P 100 list
│
├── backtest/                     # Crypto backtesting engine
│   ├── run.js                    # Main backtest runner
│   ├── config.js                 # Config (capital, TP_R, fees, prop firm rules)
│   ├── engine.js                 # Core engine (signal → trade simulation)
│   ├── propFirmSim.js            # Per-strategy prop firm simulator
│   ├── walkForward.js            # Walk-forward validation engine
│   ├── metrics.js                # Performance metrics calculator
│   └── (..MC, equity, export)    # Monte Carlo, equity curves, CSV exporters
│
├── backtest_us_stocks/           # US stocks backtesting engine
│   ├── run.js                    # Stocks backtest runner
│   └── config.js                 # Stocks-specific config
│
├── shared/                       # Shared strategy logic (crypto)
│   ├── entry.js                  # Entry signals (volatility, rejection, failure patterns)
│   ├── precomputeIndicators.js   # Technical indicator computation
│   ├── orderBookTrigger.js       # Liquidation proxy triggers
│   ├── entryDiagnostics.js       # Entry signal quality tracking
│   └── utils.js                  # Symbol conversion utilities
│
├── shared_us_stocks/             # Shared strategy logic (stocks)
│
├── scripts/                      # Crypto screening & portfolio pipeline
│   ├── screen_universe.js        # Statistical screening
│   ├── portfolioOptimizer.js     # Portfolio optimization
│   └── (..validators, fetchers)
│
├── scripts_us_stocks/            # US stocks screening pipeline
│
├── analysis/                     # Visualization & analytics
│   ├── tradingAnalytics.js       # Fat-tail distribution analytics
│   ├── trading_analysis_long.ipynb   # Jupyter: LONG strategy charts
│   ├── trading_analysis_short.ipynb  # Jupyter: SHORT strategy charts
│   └── us_stocks_long.ipynb      # Jupyter: US stocks charts
│
├── combinedPropFirmSim.js        # Combined prop firm Monte Carlo simulator
│                                 # (merges crypto long+short + US stocks long)
│
├── data/                         # Cached candle data (gitignored)
├── results_long/                 # Crypto long backtest output (gitignored)
├── results_short/                # Crypto short backtest output (gitignored)
├── result_us_stocks_long/        # US stocks long output (gitignored)
└── .env                          # API keys (gitignored)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ — [Download](https://nodejs.org/)
- **Python 3.10+** — [Download](https://python.org/) *(only for Jupyter notebooks)*
- **Git** — [Download](https://git-scm.com/)

### 1. Clone & Install

```bash
git clone https://github.com/Malay241003/tradeBot.git
cd tradeBot
npm install
```

### 2. Environment Variables (live trading only)

Create `.env` in the project root:

```env
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret
TWELVEDATA_API_KEY=your_twelvedata_api_key
COINDCX_KEY=your_coindcx_api_key
COINDCX_SECRET=your_coindcx_secret
```

> ⚠️ **Not required for backtesting.** Backtests use public Binance/TwelveData candle data.

---

## 🏃 Usage

### Run Crypto Backtest

```bash
node backtest/run.js
```

Runs the full pipeline: universe build → data fetch → backtest → walk-forward → Monte Carlo → analytics → CSV/JSON export.

### Run US Stocks Backtest

```bash
node backtest_us_stocks/run.js
```

### Run Combined Prop Firm Simulation

```bash
node combinedPropFirmSim.js
```

Runs 5,000 Monte Carlo simulations of a Blueberry Funded 1-Step challenge ($5,000 account) using pooled trades from crypto long + crypto short + US stocks long. Enforces all 15 Blueberry Funded rules including:
- 10% profit target, 6% static max DD, 4% daily DD (higher-of)
- Crypto 1:2 / Stocks 1:10 leverage caps
- Lot size restrictions ($5k tier: BTC 0.05, ETH 2.0, SOL 2.0)
- 3.5% daily DD hard stop buffer
- No weekend entries, no martingale, no position stacking (4/7)

**Latest result: 72.68% pass rate** (3,634 / 5,000 simulations passed)

### Run Live Bot

```bash
npm start
```

> ⚠️ Requires valid API keys. Currently in stub mode — live strategy wiring is in progress.

---

## 📊 Visualization

```bash
pip install jupyter pandas matplotlib seaborn numpy scipy
cd analysis
jupyter notebook trading_analysis_long.ipynb
```

Generates: equity curves, R distributions, MFE/MAE analysis, MC fan charts, prop firm pass rates, 5-year compounding projections.

---

## 📜 License

This project is for personal/educational use. Use at your own risk. Cryptocurrency and stock trading involve significant financial risk.
