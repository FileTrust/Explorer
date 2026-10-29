import { guardRead } from '@/lib/read-guard.mjs';
import { NextResponse } from 'next/server';
import { aggregateEvents, getStatus } from '@/lib/db/repository.mjs';
import { BUILD_TAG } from '@/lib/buildTag';

export const dynamic = 'force-dynamic';

/**
 * Counting without downloading.
 *
 * Eight screens compute their headline numbers by fetching every matching event
 * and reducing it in the browser: total proofs, escrow sums, reward totals,
 * dispute counts. That is the one failure paging cannot fix, because the screen
 * genuinely wants a total and a page is not one. At a billion events it is not
 * slow, it is impossible -- the rows will not fit in the tab.
 *
 * A count is an index scan where the rows are and a full transfer where they are
 * not. So this answers the question instead of shipping the evidence:
 *
 *   /api/index/aggregate?op=count&contract=StorageProofSC&event=SectorProofSubmitted
 *   /api/index/aggregate?op=count&group=event&contract=StorageProofSC
 *   /api/index/aggregate?op=count&group=arg:valid&contract=GuardianShareProof
 *   /api/index/aggregate?op=sum&arg=amountWei&contract=RewardManager
 *   /api/index/aggregate?op=distinct&field=subject_addr&contract=VKEscrow
 *
 * The response is small and fixed in size no matter how many rows were behind
 * it, which is the property that makes it survive the network growing.
 */

type Op = 'count' | 'sum' | 'distinct';
const OPS: readonly Op[] = ['count', 'sum', 'distinct'];
const isOp = (value: string): value is Op => (OPS as readonly string[]).includes(value);

async function handleGET(request: Request) {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') ?? 'count';

  if (!isOp(op)) {
    return NextResponse.json(
      { error: `op must be one of ${OPS.join(', ')}` },
      { status: 400 },
    );
  }

  const status = await getStatus().catch(() => null);
  if (!status) {
    // No store means no cheap answer. Saying so lets the screen fall back to
    // counting what it can reach, rather than being handed a zero it would
    // display as a fact.
    return NextResponse.json(
      { error: 'No store; aggregates are unavailable' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Same construction as the list endpoints: the answer changes only when the
  // indexer moves, so the question plus the checkpoint block identifies it
  // exactly, and a repeat ask costs a 304 rather than a scan.
  const etag = `W/"agg:${BUILD_TAG}:${status.toBlock}:${
    Buffer.from([...url.searchParams].sort().join('&')).toString('base64url')
  }"`;
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-cache' } });
  }

  try {
    const result = await aggregateEvents({
      op,
      addresses: url.searchParams.getAll('address').filter(Boolean),
      contracts: url.searchParams.getAll('contract').filter(Boolean),
      events: url.searchParams.getAll('event').filter(Boolean),
      // Repeated ?arg= means a composite identity -- a DKG session is a file
      // and a key epoch together, and counting either alone is a different
      // number than the screen shows.
      arg: url.searchParams.getAll('arg').length > 1
        ? url.searchParams.getAll('arg')
        : url.searchParams.get('arg') ?? undefined,
      field: url.searchParams.get('field') ?? undefined,
      groupBy: url.searchParams.get('group') ?? undefined,
      fromBlock: url.searchParams.get('fromBlock') ?? undefined,
      toBlock: url.searchParams.get('toBlock') ?? undefined,
    });

    return NextResponse.json(result, {
      headers: { ETag: etag, 'Cache-Control': 'no-cache', 'X-Index-Source': `store:${status.store}` },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Aggregate query could not be completed within Explorer limits' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function GET(request: Request) {
  return guardRead(request, () => handleGET(request), { ttlMs: 2000 });
}
