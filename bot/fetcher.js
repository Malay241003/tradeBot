// bot/fetcher.js
import axios from "axios";

const BASE = "https://public.coindcx.com";

export async function getCandles(pair, interval) {
  const res = await axios.get(
    `${BASE}/market_data/candles/?pair=${pair}&interval=${interval}`
  );

  return res.data.map(c => ({
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume),
    timestamp: c.time
  }));
}

export async function getOrderBook(pair) {
  const res = await axios.get(
    `${BASE}/market_data/orderbook/?pair=${pair}`
  );

  return {
    bids: Object.entries(res.data.bids).map(([price, qty]) => ({
      price: Number(price),
      qty: Number(qty)
    })),
    asks: Object.entries(res.data.asks).map(([price, qty]) => ({
      price: Number(price),
      qty: Number(qty)
    }))
  };
}
