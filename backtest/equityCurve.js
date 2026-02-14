import fs from "fs";

export function exportEquityCurve(trades) {
  let equity = 0;

  const rows = trades.map((t, i) => {
    equity += t.R;
    return `${i + 1},${equity.toFixed(2)}`;
  });

  const csv =
    "TradeNumber,EquityR\n" +
    rows.join("\n");

  fs.writeFileSync("./equity_curve.csv", csv);
}
