export function buildHistogram(dds, bucketSize = 1) {
  const hist = {};

  for (const dd of dds) {
    const bucket = Math.floor(dd / bucketSize) * bucketSize;
    hist[bucket] = (hist[bucket] || 0) + 1;
  }

  return Object.keys(hist)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => ({
      drawdownR: Number(k),
      frequency: hist[k]
    }));
}
