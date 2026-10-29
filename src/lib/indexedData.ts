export interface IndexedBlock {
  number: string;
  hash: `0x${string}`;
  parentHash: `0x${string}`;
  timestamp: string;
  miner: `0x${string}`;
  gasUsed: string;
  gasLimit: string;
  transactionCount: number;
  /** Decimal wei. Absent from an index written before it was recorded. */
  baseFeePerGas?: string | null;
  size?: number | string | null;
  /** From the explorer database only; null when a receipt is missing. */
  feesWei?: string | null;
}

export interface IndexedTransaction {
  hash: `0x${string}`;
  blockNumber: string;
  blockHash: `0x${string}`;
  transactionIndex: number;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: string;
  gas: string;
  gasPrice?: string;
  input: `0x${string}`;
  /** Joined on from the block by /api/index/transactions?withBlockTime=1. */
  blockTimestamp?: string;
}

export interface IndexedFileTrustEvent {
  address: `0x${string}`;
  contractName?: string;
  contractLabel?: string;
  blockNumber: string;
  transactionHash: `0x${string}`;
  transactionIndex?: number;
  logIndex?: number;
  name?: string;
  args?: Record<string, unknown>;
}

export interface IndexedManifest {
  generatedAt: string;
  fromBlock: string;
  toBlock: string;
  blockStart: string;
  latestBlock: string;
  counts: {
    blocks: number;
    transactions: number;
    logs: number;
    filetrustEvents: number;
    files: number;
    sectors: number;
    partitions: number;
    guardians: number;
    vaultKeepers: number;
    dkgSessions: number;
    accessRequests: number;
  };
}

/**
 * Ask the server for a slice of the index rather than downloading all of it.
 *
 * These used to fetch `/index/*.json` straight from the browser and filter the
 * result. The files grow with the chain, so that cost was paid in full on every
 * screen regardless of how little it wanted: megabytes of events downloaded to
 * show forty rows. `/api/index/...` does the filtering where the file already
 * is, and the seam lets the JSON behind it become a database later without
 * touching a screen.
 */
async function fetchIndexJson<T>(
  dataset: string,
  params?: Record<string, string | string[] | number | undefined>,
): Promise<T | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined && one !== '') query.append(key, String(one));
    }
  }
  const suffix = query.size > 0 ? `?${query}` : '';
  // `default` rather than `no-store`, so the ETag can do its job. The route
  // answers 304 when the indexer has not moved since the last ask, which is a
  // cheap question and a free answer; no-store would forbid asking it.
  const res = await fetch(`/api/index/${dataset}${suffix}`, { cache: 'default' }).catch(() => null);
  // 404 is "no index built yet", which every caller reads as null and answers
  // from its own bounded chain window instead.
  if (!res || !res.ok) return null;
  return res.json() as Promise<T>;
}

interface IndexPage<T> {
  rows: T[];
  /** Opaque; pass back exactly what was given. Null at the end of the data, so
   *  a caller stops when it stops rather than by counting. */
  nextCursor: string | null;
}

/// One page, with the cursor that continues it.
export async function fetchIndexPage<T>(
  dataset: string,
  params?: Record<string, string | string[] | number | undefined>,
): Promise<IndexPage<T> | null> {
  const body = await fetchIndexJson<IndexPage<T> | T[]>(dataset, params);
  if (body === null) return null;
  // The file fallback and the store both send the envelope, but a bare array is
  // still accepted so an older deployment of either does not break a newer
  // client.
  return Array.isArray(body)
    ? { rows: body, nextCursor: null }
    : { rows: body.rows ?? [], nextCursor: body.nextCursor ?? null };
}

/// Just the rows, for the callers that want a whole dataset and are unaffected
/// by pagination existing.
async function fetchIndexRows<T>(
  dataset: string,
  params?: Record<string, string | string[] | number | undefined>,
): Promise<T[] | null> {
  const page = await fetchIndexPage<T>(dataset, params);
  return page ? page.rows : null;
}

export function toBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return fallback;
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return fallback;
}

export function toHex(value: unknown): `0x${string}` | undefined {
  return typeof value === 'string' && value.startsWith('0x') ? value as `0x${string}` : undefined;
}

export async function fetchIndexedTransactions(limit?: number, withBlockTime = false) {
  return fetchIndexRows<IndexedTransaction>('transactions', {
    limit,
    withBlockTime: withBlockTime ? '1' : undefined,
  });
}

/** Events for one address, contract or event name. Passing nothing still asks
 *  for all of them, which is what the disputes screen wants and what everything
 *  else should avoid on a chain of any age. */
export async function fetchIndexedFileTrustEvents(filter?: {
  address?: string | string[];
  contract?: string | string[];
  event?: string | string[];
  /** An address or 32-byte key the events are about, matched on its own index. */
  subject?: string;
  /** Decimal block numbers. Applied by the store, not after the rows arrive. */
  fromBlock?: string;
  toBlock?: string;
  limit?: number;
}) {
  return fetchIndexRows<IndexedFileTrustEvent>('events', filter);
}

export async function fetchIndexedManifest() {
  return fetchIndexJson<IndexedManifest>('manifest');
}

/**
 * Vault keeper profiles as projected rows.
 *
 * Null means the projection has not run, which is not the same as a network
 * with no vault keepers: the first sends the screen to the chain, the second is
 * an answer. The route returns 404 rather than an empty list to keep the two
 * distinguishable.
 */
export async function fetchIndexedVaultKeepers(options?: EntityOptions) {
  return fetchIndexedEntities('vault-keepers', options);
}

/** Guardian profiles as projected rows. Null carries the same meaning as it does
 *  for vault keepers: no projection, so read the chain. */
export async function fetchIndexedGuardians(options?: EntityOptions) {
  return fetchIndexedEntities('guardians', options);
}

/** File policies as projected rows, keyed by fileId rather than an address. */
export async function fetchIndexedFilePolicies(options?: EntityOptions) {
  return fetchIndexedEntities('file-policies', options);
}

interface EntityOptions { limit?: number; cursor?: string; activeOnly?: boolean }

function fetchIndexedEntities(dataset: string, options?: EntityOptions) {
  return fetchIndexRows<Record<string, unknown>>(dataset, {
    limit: options?.limit,
    cursor: options?.cursor,
    active: options?.activeOnly ? '1' : undefined,
  });
}
