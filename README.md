# 📈 TradeBot — Systematic Crypto & US Stock Trading Engine

A quantitative trading bot and backtesting engine built in Node.js. Uses technical indicators on multi-timeframe candlestick data (15m, 1h) to generate long and short signals across **crypto** and **US stock** universes, with a full backtesting pipeline, walk-forward validation, Monte Carlo risk analysis, prop firm simulation, and live paper trading.

## ✨ Key Features

- **Multi-asset universe:** 30 crypto long, 14 crypto short, 24 US stocks
- **Hybrid live bot:** Binance WebSocket (crypto, instant) + TwelveData REST (stocks, dual-key rotation)
- **Full historical backtesting** from 2018 to present with institutional-grade friction (spread, slippage, funding)
- **Walk-forward validation** per pair (sliding train/test windows)
- **Directional strategy separation** — decoupled Long & Short logic with independent configs
- **Screening & portfolio pipeline** — statistical screening, risk modeling, walk-forward portfolio optimization
- **Combined Prop Firm Simulator** — Monte Carlo simulation of Blueberry Funded 1-Step challenge with all rules enforced
- **Monte Carlo V2 risk engine** — 4 layers: IID, Block Bootstrap, Correlation-Preserving, Stress Injection
- **5-year compounding projection** — 3 scenarios × 5,000 simulations
- **Fat-tail analytics** — MFE/MAE analysis, TP capture efficiency, bell curve overlays
- **Jupyter notebooks** for visualization (equity curves, MC fan charts, compounding projections)

---

## 📁 Project Structure

```
tradeBot/
├── bot/                          # Live trading module
│   ├── main.js                   # Legacy entry point (stub)
│   ├── binance.js                # Binance candle data fetcher + cache
│   ├── universe.js               # Dynamic universe builder
│   ├── adapters/                 # Data source router (Binance/TwelveData)
│   │   ├── index.js              # Unified getCandles() dispatcher
│   │   └── twelvedata.js         # TwelveData adapter (stocks)
│   ├── universes/                # Asset universe definitions
│   │   ├── crypto_long.js        # 30 crypto pairs (long direction)
│   │   ├── crypto_short.js       # 14 crypto pairs (short direction)
│   │   └── stocks_long.js        # 24 US stocks
│   └── live/                     # Live paper trading bot
│       ├── main.js               # Bot entry point (WS + REST hybrid)
│       ├── config.js             # Blueberry Funded rules + strategy config
│       ├── wsCandles.js          # Binance WebSocket candle store
│       ├── liveCandles.js        # Unified candle fetcher (WS/REST routing)
│       ├── scanner.js            # Signal scanner (crypto + stocks)
│       ├── signalEngine.js       # Entry signal detection (shared logic)
│       ├── riskGate.js           # Pre-trade rule enforcement (8 checks)
│       ├── paperExec.js          # Virtual order execution
│       ├── positionManager.js    # Open position monitoring (SL/TP/trail)
│       ├── state.js              # Persistent state (PostgreSQL/JSON)
│       ├── dashboard.js          # Console dashboard renderer
│       └── db.js                 # PostgreSQL adapter (Render deployment)
│
├── backtest/                     # Crypto backtesting engine
│   ├── run.js                    # Main backtest runner (--direction=long|short)
│   ├── config.js                 # Config (TP_R, fees, prop firm rules)
│   ├── engine.js                 # Core engine (signal → trade simulation)
│   ├── propFirmSim.js            # Per-strategy prop firm simulator
│   ├── walkForward.js            # Walk-forward validation engine
│   └── metrics.js                # Performance metrics calculator
│
├── backtest_us_stocks/           # US stocks backtesting engine
│   ├── run.js                    # Stocks backtest runner
│   └── config.js                 # Stocks-specific config
│
├── shared/                       # Shared strategy logic (crypto)
│   ├── entry.js                  # Entry signals (volatility, rejection, failure)
│   ├── precomputeIndicators.js   # Technical indicator computation (EMA, ATR, ADX)
│   ├── orderBookTrigger.js       # Liquidation proxy triggers
│   └── utils.js                  # Symbol conversion utilities
│
├── shared_us_stocks/             # Shared strategy logic (stocks)
│
├── scripts/                      # Crypto screening & portfolio pipeline
│   ├── screen_universe.js        # Statistical screening
│   ├── fetchTop400BinanceUniverse.js  # Universe fetcher
│   └── filter_expanded_universe.js    # Universe filter
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

### 2. Environment Variables

Create `.env` in the project root:

```env
TWELVEDATA_API_KEY_1=your_primary_twelvedata_key
TWELVEDATA_API_KEY_2=your_secondary_twelvedata_key
```

> ⚠️ **Not required for backtesting.** Backtests use public Binance candle data. TwelveData keys are only needed for live US stock scanning.

---

## 🏃 Usage

### Run Crypto Backtest

```bash
node backtest/run.js --direction=long
node backtest/run.js --direction=short
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

Runs 5,000 Monte Carlo simulations of a Blueberry Funded 1-Step challenge ($5,000 account) using 1,200 pooled trades from crypto long + crypto short + US stocks long. Enforces all Blueberry Funded rules:
- 10% profit target, 6% static max DD, 4% daily DD (higher-of)
- Crypto 1:2 / Stocks 1:10 leverage caps
- Lot size restrictions ($5k tier: BTC 0.05, ETH 2.0, SOL 2.0)
- 3.5% daily DD hard stop buffer
- No martingale, no position stacking (4/7)

**Latest result: 31.06% pass rate** (1,553 / 5,000 simulations)

### Run Live Paper Trading Bot

```bash
node bot/live/main.js
```

Starts the Blueberry Funded 1-Step paper trading bot:
- **Crypto:** Binance WebSocket — instant scan on 15m candle close (43 symbols, 86 streams)
- **Stocks:** Timer-aligned REST scans via TwelveData with dual-key rotation (24 symbols)
- Enforces all Blueberry Funded rules (daily DD, static DD, leverage, lot limits, anti-martingale)
- Virtual $5,000 balance, targets $5,500 (10% profit)
- Logs to PostgreSQL (Render) or JSON files (local)
- US stocks only scanned during market hours (14:30-21:00 UTC)
- Crypto trades 24/7 including weekends

### Deploy to Render.com

1. Create a [Neon PostgreSQL](https://neon.tech) database → copy connection string
2. Push to GitHub → connect repo on [Render.com](https://render.com)
3. Set environment variables on Render:
   - `DATABASE_URL` → Neon connection string
   - `TWELVEDATA_API_KEY_1` → primary TwelveData key
   - `TWELVEDATA_API_KEY_2` → secondary TwelveData key
4. Render auto-deploys from `render.yaml` — bot starts scanning

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
