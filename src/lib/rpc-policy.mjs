// Public Explorer RPC is a bounded reader, never a node administration API.
export const MAX_REQUEST_BYTES = 256 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_BATCH = 20;
const MAX_GAS = 10_000_000n;
const address = (v) => typeof v === 'string' && /^0x[\da-f]{40}$/i.test(v);
const hash = (v) => typeof v === 'string' && /^0x[\da-f]{64}$/i.test(v);
const quantity = (v) => typeof v === 'string' && /^0x(?:0|[1-9a-f][\da-f]{0,63})$/i.test(v);
const block = (v) => ['latest', 'earliest', 'pending', 'safe', 'finalized'].includes(v)
  || (quantity(v) && BigInt(v) <= 0xffffffffffffffffn);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v, allowed) => Object.keys(v).every((key) => allowed.includes(key));
export class RpcPolicyError extends Error {
  constructor(message, status = 400, code = -32602) {
    super(message); this.status = status; this.code = code;
  }
}
function requireValue(ok, message = 'Invalid RPC parameters') {
  if (!ok) throw new RpcPolicyError(message);
}
const METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'net_version',
  'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount',
  'eth_getBlockByNumber', 'eth_getBlockByHash',
  'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_call',
  'eth_getLogs', 'debug_traceTransaction',
]);

export function validateRpcPayload(payload) {
  const batch = Array.isArray(payload);
  const calls = batch ? payload : [payload];
  requireValue(calls.length > 0 && calls.length <= MAX_BATCH, 'RPC batch must contain 1–20 calls');
  for (const call of calls) {
    requireValue(object(call) && keys(call, ['jsonrpc', 'id', 'method', 'params'])
      && call.jsonrpc === '2.0' && (Number.isSafeInteger(call.id)
        || (typeof call.id === 'string' && call.id.length <= 128)), 'Invalid JSON-RPC request');
    if (!METHODS.has(call.method)) throw new RpcPolicyError('RPC method is not allowed', 403, -32601);
    const p = call.params ?? [];
    requireValue(Array.isArray(p)); call.params = p;
    switch (call.method) {
      case 'eth_chainId': case 'eth_blockNumber': case 'net_version':
        requireValue(p.length === 0); break;
      case 'eth_getBalance': case 'eth_getCode': case 'eth_getTransactionCount':
        requireValue(p.length === 2 && address(p[0]) && block(p[1])); break;
      case 'eth_getBlockByNumber': case 'eth_getBlockByHash':
        requireValue(p.length === 2 && typeof p[1] === 'boolean'
          && (call.method === 'eth_getBlockByHash' ? hash(p[0]) : block(p[0]))); break;
      case 'eth_getTransactionByHash': case 'eth_getTransactionReceipt':
        requireValue(p.length === 1 && hash(p[0])); break;
      case 'eth_call': {
        requireValue(p.length === 2 && object(p[0]) && block(p[1]));
        const tx = p[0];
        requireValue(keys(tx, ['to', 'from', 'data', 'input', 'gas', 'value', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'])
          && address(tx.to) && (tx.from === undefined || address(tx.from)));
        for (const key of ['data', 'input']) if (tx[key] !== undefined) {
          requireValue(typeof tx[key] === 'string' && /^0x(?:[\da-f]{2})*$/i.test(tx[key]) && tx[key].length <= 131074);
        }
        requireValue(!(tx.data !== undefined && tx.input !== undefined));
        for (const key of ['gas', 'value', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas']) {
          if (tx[key] !== undefined) requireValue(quantity(tx[key]));
        }
        requireValue(tx.gas === undefined || BigInt(tx.gas) <= MAX_GAS, 'Call gas exceeds Explorer limit');
        tx.gas ??= `0x${MAX_GAS.toString(16)}`;
        break;
      }
      case 'eth_getLogs': {
        requireValue(p.length === 1 && object(p[0]));
        const f = p[0];
        requireValue(keys(f, ['address', 'topics', 'fromBlock', 'toBlock', 'blockHash']));
        requireValue(f.address !== undefined, 'Log queries require a contract address');
        const addresses = Array.isArray(f.address) ? f.address : [f.address];
        requireValue(addresses.length > 0 && addresses.length <= 20 && addresses.every(address));
        if (f.topics !== undefined) {
          requireValue(Array.isArray(f.topics) && f.topics.length <= 4);
          for (const topic of f.topics) requireValue(topic === null || hash(topic)
            || (Array.isArray(topic) && topic.length > 0 && topic.length <= 20 && topic.every(hash)));
        }
        if (f.blockHash !== undefined) requireValue(hash(f.blockHash) && f.fromBlock === undefined && f.toBlock === undefined);
        else {
          requireValue(quantity(f.fromBlock) && (quantity(f.toBlock) || f.toBlock === 'latest'), 'Log queries require an explicit bounded block range');
          if (f.toBlock !== 'latest') checkRange(f.fromBlock, f.toBlock);
        }
        break;
      }
      case 'debug_traceTransaction': {
        requireValue(p.length === 2 && hash(p[0]) && object(p[1]));
        const opts = p[1];
        requireValue(keys(opts, ['tracer', 'tracerConfig']) && ['callTracer', 'prestateTracer'].includes(opts.tracer), 'Only built-in Explorer tracers are allowed');
        const config = opts.tracerConfig ?? {};
        requireValue(object(config) && keys(config, opts.tracer === 'callTracer' ? ['onlyTopCall'] : ['diffMode'])
          && Object.values(config).every((v) => typeof v === 'boolean'));
        requireValue(opts.tracer !== 'prestateTracer' || config.diffMode === true);
        // No caller-selected JavaScript, replay depth, or timeout.
        call.params[1] = { tracer: opts.tracer, tracerConfig: config, timeout: '3s', reexec: 0 };
        break;
      }
    }
  }
  return { calls, batch };
}
function checkRange(from, to) {
  const start = BigInt(from), end = BigInt(to);
  requireValue(start <= end && end - start <= 9000n, 'Log range exceeds Explorer limit');
}
export function boundLogRanges(calls, latestBlock) {
  for (const call of calls) if (call.method === 'eth_getLogs' && call.params[0].toBlock === 'latest') {
    requireValue(quantity(latestBlock), 'Could not resolve current block');
    checkRange(call.params[0].fromBlock, latestBlock);
    call.params[0].toBlock = latestBlock;
  }
}
export async function readLimitedBody(message, maxBytes, signal) {
  const length = message.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new RpcPolicyError('RPC payload exceeds Explorer limit', 413);
  const reader = message.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RpcPolicyError('RPC payload exceeds Explorer limit', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}
// Shared admission also works against callers rotating/spoofing IP headers.
export function createRpcBudget({ now = Date.now, capacity = 120, refill = 60, concurrent = 64 } = {}) {
  let tokens = capacity, updated = now(), active = 0, traces = 0;
  return (calls) => {
    const count = calls.length, tracing = calls.filter((call) => call.method === 'debug_traceTransaction').length;
    const at = now();
    tokens = Math.min(capacity, tokens + Math.max(0, at - updated) * refill / 1000); updated = at;
    if (tokens < count || active + count > concurrent || traces + tracing > 2) throw new RpcPolicyError('Explorer RPC is busy; retry shortly', 429, -32005);
    tokens -= count; active += count; traces += tracing;
    let released = false;
    return () => { if (!released) { active -= count; traces -= tracing; released = true; } };
  };
}
