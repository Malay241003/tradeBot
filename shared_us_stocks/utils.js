

export function toBinanceSymbol(pair) {
  // B-BTCUSDT → BTCUSDT
  return pair.replace("B-", "");
}
