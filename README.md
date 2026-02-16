# 📈 TradeBot — Systematic Crypto Trading Engine

A quantitative crypto trading bot and backtesting engine built in Node.js. Uses technical indicators on multi-timeframe candlestick data (15m, 1h, 4h) to generate short signals, with a full backtesting pipeline, walk-forward validation, institutional-grade Monte Carlo risk analysis, 5-year compounding projection, and fat-tail distribution analytics.

**Key Features:**
- Multi-pair universe (13 USDT pairs) with Binance data + CoinDCX execution compatibility
- Full historical backtesting from 2018 to present
- Walk-forward validation per pair (rolling window)
- Monte Carlo V2 risk engine (4 layers: IID, Block Bootstrap, Correlation-Preserving, Stress Injection)
- 5-year compounding capital projection (3 scenarios × 5,000 simulations)
- Fat-tail distribution analytics (MFE/MAE analysis, TP capture efficiency, bell curve overlays)
- Jupyter notebook for visualization (equity curves, MC fan charts, compounding projections)
- CSV export for all results

---

## 📁 Project Structure

```
tradeBot/
├── bot/                    # Live trading module
│   ├── main.js             # Entry point for live trading
│   ├── binance.js          # Binance API — candle fetching + caching
│   ├── coindcx.js          # CoinDCX API integration
│   ├── universe.js         # Builds tradable pair universe (Binance ∩ CoinDCX)
│   ├── config.js           # Bot-specific config
│   ├── fetcher.js          # Data fetcher utilities
│   ├── execute.js          # Order execution
│   └── logger.js           # Logging utility
│
├── backtest/               # Backtesting engine
│   ├── run.js              # Main backtest runner (entry point)
│   ├── config.js           # Backtest config (capital, TP_R, fees, etc.)
│   ├── engine.js           # Core backtesting engine (signal → trade simulation)
│   ├── metrics.js          # Performance metrics (win rate, expectancy, drawdown)
│   ├── export.js           # CSV export for results
│   ├── equityCurve.js      # Equity curve generation
│   ├── walkForward.js      # Walk-forward validation engine
│   ├── wfEvaluator.js      # Walk-forward verdict evaluator
│   ├── monteCarloDD.js     # Monte Carlo drawdown simulation (legacy)
│   ├── monteCarloV2.js     # MC V2 — 4-layer institutional risk engine + 5yr compounding
│   ├── mcHistogram.js      # Monte Carlo histogram builder
│   └── optimize_tp.js      # TP sensitivity analysis automation
│
├── shared/                 # Shared strategy logic
│   ├── entry.js            # Entry signal logic
│   ├── entryDiagnostics.js # Entry quality diagnostics
│   ├── precomputeIndicators.js  # Technical indicator pre-computation
│   ├── orderBookTrigger.js # Order book trigger logic
│   └── utils.js            # Utility functions
│
├── analysis/               # Analytics & visualization
│   ├── tradingAnalytics.js # Fat-tail distribution analytics (MFE/MAE/kurtosis)
│   ├── diagnosticExpectancy.js  # Diagnostic-expectancy correlation
│   ├── trading_analysis.ipynb   # Jupyter notebook for graphs
│   ├── add_analytics_cells.py   # Script to inject analytics cells into notebook
│   ├── add_mc_charts.py         # MC V2 visualization cells (drawdown, fan charts)
│   ├── add_compounding_charts.py # 5-year compounding projection charts
│   └── add_bellcurve_cells.py   # Script to add bell curve overlays
│
├── data/                   # Cached candle data (auto-generated, gitignored)
├── tp_comparison/          # TP sensitivity analysis results
├── package.json
└── .gitignore
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ — [Download](https://nodejs.org/)
- **Python 3.10+** — [Download](https://python.org/) *(only needed for Jupyter notebook visualization)*
- **Git** — [Download](https://git-scm.com/)

### 1. Clone the repository

```bash
git clone https://github.com/Malay241003/tradeBot.git
cd tradeBot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables (for live trading only)

Create a `.env` file in the project root:

```env
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret
COINDCX_API_KEY=your_coindcx_api_key
COINDCX_SECRET=your_coindcx_secret
```

> ⚠️ **Not required for backtesting.** The backtest uses public Binance candle data only.

---

## 🏃 Running the Project

### Run a Backtest

```bash
npm run backtest
```

Or directly:

```bash
node backtest/run.js
```

This will:
1. Build the trading universe (13 USDT pairs)
2. Download/cache candle data from Binance (2018 → present)
3. Run backtests across all pairs
4. Run walk-forward validation per pair
5. Run Monte Carlo V2 risk analysis (4-layer engine)
6. Run 5-year compounding capital projection (3 scenarios × 5,000 sims)
7. Run fat-tail distribution analytics
8. Export all results as CSV/JSON files in the project root

**First run takes a few minutes** to download candle data. Subsequent runs use the local cache in `data/`.

### Output Files

| File | Description |
|------|-------------|
| `backtest_summary.json` | Global backtest metrics (trades, win rate, expectancy, etc.) |
| `backtest_results.csv` | Per-pair performance summary |
| `trades_detailed.csv` | Every individual trade with entry/exit/R/MFE/MAE |
| `equity_curve.csv` | Cumulative equity curve data |
| `entry_diagnostics.csv` | Entry signal quality diagnostics |
| `diagnostic_expectancy.csv` | Diagnostic–expectancy correlation per pair |
| `monte_carlo_dd.csv` | Monte Carlo drawdown distribution (legacy) |
| `mc_v2_report.json` | MC V2 risk report (4 models: IID, Block, Corr, Stress) |
| `mc_v2_comparison.csv` | MC V2 model comparison table |
| `mc_compounding_report.json` | 5-year compounding projection (3 scenarios, equity paths) |
| `trading_analytics.csv` | Fat-tail distribution stats (kurtosis, skewness, percentiles) |
| `tp_efficiency.csv` | TP capture efficiency per pair |
| `mae_survival.csv` | MAE survival analysis for winners |

### Run Live Trading Bot

```bash
npm start
```

> ⚠️ Requires valid API keys in `.env`. Use at your own risk.

---

## 📊 Visualization (Jupyter Notebook)

### Install Python dependencies

```bash
pip install jupyter pandas matplotlib seaborn numpy scipy
```

### Launch the notebook

```bash
cd analysis
jupyter notebook trading_analysis.ipynb
```

The notebook reads all CSV files from the project root and generates:
- Equity curve charts
- R / MFE / MAE distribution histograms with bell curve overlays
- MFE vs Actual R scatter plots
- MAE survival analysis
- TP capture efficiency per pair
- Excess kurtosis & skewness heatmaps
- **MC V2**: Drawdown overlay, equity fan charts, risk comparison bars, stress survival heatmap
- **5-Year Compounding**: Capital growth fan chart, final capital distribution, projection summary table

---

## ⚙️ Configuration

All backtest settings are in [`backtest/config.js`](backtest/config.js):

```javascript
export const CONFIG = {
  CAPITAL: 10000,          // Starting capital ($)
  RISK_PER_TRADE: 50,      // 1R = $50
  TP_R: 3,                 // Take Profit in R-multiples
  FEE_PCT: 0.00118,        // Round-trip taker fee (incl. 18% GST)
  SPREAD_PCT: 0.0010,      // Estimated spread
  SLIPPAGE_PCT: 0.0008,    // Estimated slippage
  FUNDING_PER_8H: 0.0001,  // Funding rate per 8h
  MAX_BARS_IN_TRADE: 672,  // Max trade duration (7 days)
};
```

---

## 📜 License

This project is for personal/educational use. Use at your own risk. Cryptocurrency trading involves significant financial risk.
