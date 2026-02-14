// shared/orderBookTrigger.js

/**
 * orderBook:
 * {
 *   bids: [[price, size], ...],
 *   asks: [[price, size], ...]
 * }
 *
 * trades: [{ side: "sell" | "buy", qty }]
 */
// shared/orderBookTrigger.js

// ==========================================
// 🔥 REAL ORDER-BOOK LIQUIDATION TRIGGER
// (LIVE TRADING ONLY)
// ==========================================


export function orderBookLiquidationTrigger({
  prevBook,
  currBook,
  recentTrades
}) {
  if (!prevBook || !currBook || !recentTrades) return false;

  // 1️⃣ BID LIQUIDITY DROP
  const prevBidLiq = sumTopLevels(prevBook.bids, 10);
  const currBidLiq = sumTopLevels(currBook.bids, 10);

  const bidLiqDrop =
    prevBidLiq > 0 &&
    currBidLiq / prevBidLiq < 0.65;

  // 2️⃣ SELL IMBALANCE
  let sellVol = 0;
  let buyVol = 0;

  for (const t of recentTrades) {
    if (t.side === "sell") sellVol += t.qty;
    else buyVol += t.qty;
  }

  const sellImbalance =
    sellVol > 0 &&
    sellVol / Math.max(buyVol, 1e-6) > 2.5;

  // 3️⃣ SPREAD EXPANSION
  const prevSpread =
    prevBook.asks[0][0] - prevBook.bids[0][0];

  const currSpread =
    currBook.asks[0][0] - currBook.bids[0][0];

  const spreadExpansion =
    currSpread > prevSpread * 1.8;

  let score = 0;
  if (bidLiqDrop) score++;
  if (sellImbalance) score++;
  if (spreadExpansion) score++;

  return score >= 2;
}

// ==========================================
// 🧪 BACKTEST SAFE LIQUIDATION PROXY
// (NO ORDER BOOK DATA REQUIRED)
// ==========================================
export function liquidationProxy(candles15m, i) {
  if (i < 2) return false;

  const c = candles15m[i];
  const p = candles15m[i - 1];

  const rangeExpansion =
    (c.high - c.low) >
    1.8 * (p.high - p.low);

  const volumeSpike =
    c.volume > 2.5 * p.volume;

  const strongBearClose =
    c.close < c.open &&
    (c.open - c.close) / (c.high - c.low) > 0.6;

  return rangeExpansion && volumeSpike && strongBearClose;
}

// ==========================================
function sumTopLevels(levels, depth) {
  return levels
    .slice(0, depth)
    .reduce((a, l) => a + Number(l[1]), 0);
}
