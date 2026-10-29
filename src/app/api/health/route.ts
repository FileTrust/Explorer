import { guardRead } from '@/lib/read-guard.mjs';
import { createPublicClient, http } from 'viem';
import { NextResponse } from 'next/server';
import { getEntityFreshness, getStatus, eventStoreName } from '@/lib/db/repository.mjs';

export const dynamic = 'force-dynamic';

/**
 * The node, addressed as the server can reach it.
 *
 * Not the shared browser client: that one is pointed at `/api/rpc`, a relative
 * path which is exactly right in a browser and meaningless here -- it fails with
 * "Failed to parse URL", and a health check that cannot see the chain would have
 * reported the chain as down.
 */
const nodeClient = createPublicClient({
  transport: http(process.env.RPC_URL || 'http://127.0.0.1:8545', { timeout: 5_000, retryCount: 0 }),
});

/**
 * Is this Explorer telling the truth right now?
 *
 * Not "is the process up" -- that is answered by any page returning 200, and it
 * stays true long after the answers stop being current. The failure this exists
 * to catch is the quiet one: the indexer stops, the store keeps serving, and
 * every screen looks perfectly healthy while showing an hour-old chain. That has
 * already happened once here, when a misconfigured indexer wrote a store nothing
 * could match and the Explorer fell back to a bounded window without a word.
 *
 * So the check is lag: how far behind the chain head the store has fallen, and
 * how many entity rows are waiting to be re-read. Both are numbers an alert can
 * be hung on.
 *
 * Degraded rather than down is a real state and is reported as one. A stale
 * store still answers, and answers about the past correctly; it should page
 * someone without taking the service out of a load balancer.
 */
const LAG_DEGRADED_BLOCKS = 100n;   // ~100s on a one-second chain
const LAG_UNHEALTHY_BLOCKS = 1000n; // ~17 minutes

async function handleGET() {
  const checks: Record<string, unknown> = {};

  // Ranked rather than compared as strings, so "worst wins" is arithmetic and a
  // later check can never accidentally downgrade an earlier failure.
  const LEVELS = ['ok', 'degraded', 'unhealthy'] as const;
  let severity = 0;
  const degrade = (level: 'degraded' | 'unhealthy') => {
    severity = Math.max(severity, LEVELS.indexOf(level));
  };

  // The chain, which is the thing everything else is measured against.
  let head: bigint | null = null;
  try {
    head = await nodeClient.getBlockNumber();
    checks.chain = { reachable: true, head: String(head) };
  } catch {
    checks.chain = { reachable: false, error: 'Chain is temporarily unavailable' };
    degrade('unhealthy');
  }

  // The store, and how far behind it is.
  try {
    const status = await getStatus();
    if (!status) {
      // Not an error: an Explorer serving from files is a supported way to run.
      checks.store = { configured: false, servingFrom: 'files' };
    } else {
      const lag = head === null ? null : head - BigInt(status.toBlock);
      checks.store = {
        configured: true,
        engine: eventStoreName(),
        lastBlock: status.toBlock,
        lagBlocks: lag === null ? null : String(lag),
        events: status.counts.filetrustEvents,
      };
      if (lag !== null) {
        if (lag >= LAG_UNHEALTHY_BLOCKS) degrade('unhealthy');
        else if (lag >= LAG_DEGRADED_BLOCKS) degrade('degraded');
      }
    }
  } catch {
    checks.store = { configured: true, reachable: false, error: 'Index store is temporarily unavailable' };
    degrade('degraded'); // The files can still answer, so this is not fatal.
  }

  // Entity rows: how fresh, and how many are known to be stale.
  // The event log, asked directly. The store check above reads Postgres, which
  // can be up while ClickHouse is down -- and then every event screen falls back
  // to the file index while this said "ok". Degraded rather than unhealthy, for
  // the same reason as a store that is behind: the files still answer.
  if (eventStoreName() === 'clickhouse') {
    const url = `${(process.env.CLICKHOUSE_URL ?? '').replace(/\/+$/, '')}/ping`;
    let reachable = false;
    let error: string | undefined;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000), cache: 'no-store' });
      reachable = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch {
      error = 'Event store is temporarily unavailable';
    }
    checks.eventStore = reachable ? { engine: 'clickhouse', reachable } : { engine: 'clickhouse', reachable, error };
    if (!reachable) degrade('degraded');
  }

  try {
    const freshness = await getEntityFreshness();
    if (freshness) {
      checks.entities = freshness;
      if (freshness.awaitingRefresh > 0 && freshness.syncedBlock === '0') degrade('degraded');
      // A backlog that never drains means the projection is failing quietly,
      // which looks identical to a quiet network from the outside.
      if (freshness.awaitingRefresh > 1000) degrade('degraded');
    }
  } catch {
    // Entity rows are an optimisation; their absence is not a health problem.
  }

  const status = LEVELS[severity];
  return NextResponse.json(
    { status, checkedAt: new Date().toISOString(), checks },
    {
      // 503 only when nothing can be served correctly. A stale store still
      // answers about the past, so it pages someone without being pulled out of
      // rotation.
      status: status === 'unhealthy' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function GET(request: Request) {
  return guardRead(request, () => handleGET(), { ttlMs: 2000, ignoreQuery: true });
}
