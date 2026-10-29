import { guardRead } from '@/lib/read-guard.mjs';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * The FTU price service, proxied the way the chain RPC already is.
 *
 * The browser used to call this service directly, at an address baked into the
 * bundle by `NEXT_PUBLIC_FTU_PRICE_URL`. That address is `127.0.0.1:8787`, which
 * is right for a browser on the machine running everything and wrong for every
 * other one: `127.0.0.1` in a browser means *that* computer, so opening the
 * Explorer from a second machine on the network asked its own localhost for a
 * price service it does not run.
 *
 * Reached through here it is the Explorer's own origin, so it works from
 * wherever the Explorer does -- and the price service does not have to be
 * exposed on the network for that to be true.
 *
 * The query is forwarded as it arrives, so the caller still decides the pair and
 * the amount and this stays a pipe rather than a second place those are chosen.
 */
const upstream = (process.env.FTU_PRICE_URL
  || process.env.NEXT_PUBLIC_FTU_PRICE_URL
  || 'http://127.0.0.1:8787').replace(/\/+$/, '');

async function handleGET(request: NextRequest) {
  const target = new URL(`${upstream}/v1/quote`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  try {
    const response = await fetch(target, {
      headers: { Accept: 'application/json', 'User-Agent': 'FileTrust-Explorer' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // A price the Explorer cannot fetch is a missing figure, not a broken page:
    // the screens showing it already render without one.
    return NextResponse.json({
      error: 'Explorer could not reach the FTU price service',
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET(request: NextRequest) {
  return guardRead(request, () => handleGET(request), { ttlMs: 10000 });
}
