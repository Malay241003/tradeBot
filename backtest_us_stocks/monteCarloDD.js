export function monteCarloDrawdown(trades, runs = 10000) {
  const dds = [];

  for (let r = 0; r < runs; r++) {
    const shuffled = [...trades].sort(() => Math.random() - 0.5);

    let equity = 0;
    let peak = 0;
    let maxDD = 0;

    for (const t of shuffled) {
      equity += t.R;
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, peak - equity);
    }

    dds.push(maxDD);
  }

  return dds;
}
