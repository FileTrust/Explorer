import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, RpcPolicyError, validateRpcPayload,
  boundLogRanges, readLimitedBody, createRpcBudget,
} from '@/lib/rpc-policy.mjs';

export const dynamic = 'force-dynamic';
const upstreamRpc = process.env.RPC_URL || 'http://127.0.0.1:8545';
const expectedChainId = (process.env.EXPLORER_EXPECTED_CHAIN_ID || '').trim().toLowerCase();
const admit = createRpcBudget();
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };

async function forward(payload: unknown, signal: AbortSignal) {
  const response = await fetch(upstreamRpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', signal,
  });
  return { status: response.status, body: await readLimitedBody(response, MAX_RESPONSE_BYTES, signal) };
}

export async function POST(request: NextRequest) {
  let release: (() => void) | undefined;
  const controller = new AbortController();
  try {
    if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new RpcPolicyError('Content-Type must be application/json', 415);
    }
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(10_000)]);
    let payload;
    try { payload = JSON.parse(await readLimitedBody(request, MAX_REQUEST_BYTES, signal)); }
    catch (error) {
      if (error instanceof RpcPolicyError) throw error;
      throw new RpcPolicyError('Invalid JSON-RPC body', 400, -32700);
    }
    const { calls, batch } = validateRpcPayload(payload);
    release = admit(calls);
    if (calls.some((call) => call.method === 'eth_getLogs' && call.params[0].toBlock === 'latest')) {
      const head = await forward({ jsonrpc: '2.0', id: 0, method: 'eth_blockNumber', params: [] }, signal);
      boundLogRanges(calls, JSON.parse(head.body).result);
    }
    const result = await forward(batch ? calls : calls[0], signal);
    return new NextResponse(result.body, { status: result.status, headers });
  } catch (error) {
    const policy = error instanceof RpcPolicyError;
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: {
      code: policy ? error.code : -32098,
      message: policy ? error.message : 'Explorer RPC is temporarily unavailable',
    } }, { status: policy ? error.status : 502, headers: {
      ...headers, ...(policy && error.status === 429 ? { 'Retry-After': '1' } : {}),
    } });
  } finally { controller.abort(); release?.(); }
}

export async function GET() {
  let release: (() => void) | undefined;
  try {
    release = admit([{ method: 'eth_chainId' }]);
    const result = await forward({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }, AbortSignal.timeout(5_000));
    const chainId = JSON.parse(result.body)?.result?.toLowerCase();
    const ok = result.status === 200 && /^0x[0-9a-f]+$/.test(chainId || '') && (!expectedChainId || chainId === expectedChainId);
    return NextResponse.json(ok ? { ok, chainId } : { ok: false, error: 'Configured chain is unavailable or does not match' },
      { status: ok ? 200 : 503, headers });
  } catch (error) {
    const busy = error instanceof RpcPolicyError && error.status === 429;
    return NextResponse.json({ ok: false, error: busy ? 'Explorer RPC is busy' : 'Configured chain is unavailable' },
      { status: busy ? 429 : 503, headers });
  } finally { release?.(); }
}
