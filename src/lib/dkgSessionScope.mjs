// A successful epoch/share version may have several failed attempts before it.
// Recovery events carry the full material ID; do not merge those histories.
export function dkgSessionScope(args, refresh = false) {
  if(typeof args.materialId==='string' && /^0x[0-9a-f]{64}$/i.test(args.materialId))
    return args.materialId.toLowerCase();
  const key=`${args.fileId}:${args.keyEpoch}`;
  return refresh ? `${key}:${args.shareVersion}` : key;
}

// AttemptClosed accompanies finalization/expiry. Count it only for outcomes
// without a matching finalization/expiry event, so each terminal attempt counts once.
export function dkgAttemptTotals(events, outcomes) {
  const finalized = Number(events.ZkDkgV2Finalized ?? 0) + Number(events.ZkDkgV2SamePkRefreshFinalized ?? 0);
  const expired = Number(events.DkgKeyGenExpired ?? 0) + Number(events.V2RefreshExpired ?? 0);
  const cancelled = Number(outcomes['5'] ?? 0);
  const unactivated = Number(outcomes['6'] ?? 0);
  return { finalized, expired, cancelled, unactivated, total: finalized + expired + cancelled + unactivated };
}

// Fresh DKG acknowledges complete material; refresh publishes commitments
// without that fresh-only event. Keep each dealer in its own attempt/version.
export function dkgDealerMaterials(accepted, commitments) {
  const counts = new Map(), transactions = new Map(), dealers = new Map();
  const rows = [...accepted, ...commitments.filter(row => Number(row.args.shareVersion) > 1)];
  for (const row of rows) {
    const a = row.args;
    const key = dkgSessionScope(a, Number(a.shareVersion) > 1);
    if (!dealers.has(key)) dealers.set(key, new Set());
    dealers.get(key).add(String(a.dealerIndex));
    counts.set(key, dealers.get(key).size);
    if (!transactions.has(key)) transactions.set(key, new Set());
    if (row.transactionHash) transactions.get(key).add(row.transactionHash);
  }
  return { counts, transactions };
}
