# 📈 TradeBot — Systematic Crypto Trading Engine

A quantitative crypto trading bot and backtesting engine built in Node.js. Uses technical indicators on multi-timeframe candlestick data (15m, 1h, 4h) to generate short signals, with a full backtesting pipeline, walk-forward validation, institutional-grade Monte Carlo risk analysis, 5-year compounding projection, and fat-tail distribution analytics.

**Key Features:**
- Multi-asset universe (13 USDT crypto pairs, 12 US Stocks including SPY, TSLA, AAPL).
- Market data via Binance (Crypto) and TwelveData (Stocks/Forex) adapters with sliding JSON memory-cache.
- Full historical backtesting from 2018 to present with explicit institutional-grade friction (spread, slippage, tier-specific funding fees).
- Walk-forward validation per pair (sliding train/test windows) with strictly out-of-sample precomputed array execution.
- Directional Strategy Separation (decoupled Long & Short Take Profit logic and separated metrics directories)
- Prop Firm Simulator (Simulates Phase 1 Challenge with $10k funding parameter constraints)
- Monte Carlo V2 risk engine (4 layers: IID, Block Bootstrap, Correlation-Preserving, Stress Injection)
- 5-year compounding capital projection (3 scenarios × 5,000 simulations)
- Fat-tail distribution analytics (MFE/MAE analysis, TP capture efficiency, bell curve overlays)
- Jupyter notebooks for visualization (equity curves, MC fan charts, compounding projections) split cleanly for Longs and Shorts
- CSV export for all results into separated directories

---

## 📁 Project Structure

```
tradeBot/
├── bot/                    # Live trading module (Data APIs, Universe builder)
├── backtest/               # Backtesting engine
│   ├── run.js              # Main backtest runner (entry point)
│   ├── config.js           # Backtest config (capital, TP_R, fees, direction settings)
│   ├── engine.js           # Core backtesting engine (signal → trade simulation + friction math)
│   ├── propFirmSim.js      # Prop Firm Challenge Simulator (Daily/Max DD caps, weekend bans)
│   ├── walkForward.js      # Walk-forward validation engine
│   └── (..other engines)   # MC, Equity curves, Export pipelines
│
├── shared/                 # Shared strategy logic
│   ├── entry.js            # Entry signal logic (Volatility, Rejection, Failures)
│   └── (..other logic)
│
├── analysis/               # Analytics & visualization
│   ├── tradingAnalytics.js # Fat-tail distribution analytics
│   ├── deepAnalysis.js     # Time-of-day and concurrency execution diagnostics
│   ├── trading_analysis_long.ipynb  # Jupyter notebook for LONG strategy visualization
│   └── trading_analysis_short.ipynb # Jupyter notebook for SHORT strategy visualization
│
├── data/                   # Cached candle data (auto-generated, gitignored)
├── results_long/           # Output directory for historical crypto long backtest
├── result_us_stocks_long/  # Output directory for US Stocks long backtest
└── .env                    # Secrets for live execution (Ignored in backtesting)
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
TWELVEDATA_API_KEY=your_twelvedata_api_key
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

### Output Files (`results_long/` & `results_short/`)

| File | Description |
|------|-------------|
| `backtest_summary_{dir}.json` | Global backtest metrics (trades, win rate, expectancy, etc.) |
| `backtest_results_{dir}.csv` | Per-pair performance summary |
| `trades_detailed_{dir}.csv` | Every individual trade with entry/exit/R/MFE/MAE and explicit friction math |
| `equity_curve_{dir}.csv` | Cumulative equity curve data (Both Gross R and Net R) |
| `entry_diagnostics_{dir}.csv` | Entry signal quality diagnostics |
| `diagnostic_expectancy_{dir}.csv` | Diagnostic–expectancy correlation per pair |
| `prop_firm_report_{dir}.json` | Simulated Prop Firm Phase 1 run logic constraints and pass rate |
| `mc_v2_report_{dir}.json` | MC V2 risk report (4 models: IID, Block, Corr, Stress) |
| `mc_v2_comparison_{dir}.csv` | MC V2 model comparison table |
| `mc_compounding_report_{dir}.json` | 5-year compounding projection (3 scenarios, equity paths) |
| `trading_analytics_{dir}.csv` | Fat-tail distribution stats (kurtosis, skewness, percentiles) |
| `tp_efficiency_{dir}.csv` | TP capture efficiency per pair |
| `mae_survival_{dir}.csv` | MAE survival analysis for winners |

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
jupyter notebook trading_analysis_long.ipynb  # Or trading_analysis_short.ipynb
```

The notebooks read all CSV/JSON files from their respective `results_` directories and generate:
- Equity curve charts (Comparing Gross R vs institutional friction Net R)
- R / MFE / MAE distribution histograms with bell curve overlays
- MFE vs Actual R scatter plots
- MAE survival analysis
- TP capture efficiency per pair
- Excess kurtosis & skewness heatmaps
- **Prop Firm Sim**: Expected Pass Rates, Leverage Draw-downs, Time limit statistics
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
