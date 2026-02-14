

export function initEntryDiagnostics() {
  return {
    totalBars: 0,

    btcBlocked: 0,
    volBlocked: 0,
    bounceBlocked: 0,
    rejectionBlocked: 0,

    liquidationOverride: 0,
    entriesTaken: 0,

    trades: 0,
    sumR: 0
  };
}

export function recordTrade(diag, R) {
      if (!diag) return;
      diag.trades++;
      diag.sumR += R;
    }


export function recordBlock(diag, reason) {
  if (!diag) return;
  if (diag[reason] !== undefined) {
    diag[reason]++;
  }
}

export function recordEntry(diag) {
  if (!diag) return;
  diag.entriesTaken++;
}

export function recordLiquidationOverride(diag) {
  if (!diag) return;
  diag.liquidationOverride++;
}

export function bumpBars(diag) {
  if (!diag) return;
  diag.totalBars++;
}


export function finalizeDiagnostics(diag) {
  const entryRate =
    diag.entriesTaken / Math.max(diag.totalBars, 1);

  const expectancyPerEntry =
    diag.sumR / Math.max(diag.trades, 1);

  return {
    ...diag,
    entryRate,
    expectancyPerEntry
  };
}
