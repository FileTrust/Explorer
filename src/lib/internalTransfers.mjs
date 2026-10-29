/// FTU that a contract moved while a transaction ran.
///
/// A transaction lists one transfer: whatever its sender attached. Everything a
/// contract pays out on the way -- a reward from a pool, a DKG or PRE fee, an
/// escrow refund, a stake returned -- happens inside the call and appears in no
/// transaction and, unless the contract chose to emit one, in no event either.
/// So a wallet that is paid by contracts showed its balance rising with nothing
/// in its history to explain it.
///
/// The node can replay a transaction with the `callTracer`, which reports every
/// call it made as a tree of frames, each with its own value. This reads that
/// tree. Kept free of imports so the indexer, the transaction screen and the
/// tests all run the same code.

/// Frame types that move value from one account to another. DELEGATECALL and
/// STATICCALL carry no value of their own, and CALLCODE sends it to the caller
/// itself, so none of those is a transfer between two accounts.
const VALUE_TYPES = new Set(['CALL', 'CREATE', 'CREATE2', 'SELFDESTRUCT']);

function toBigIntValue(value) {
  if (value === undefined || value === null || value === '') return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/**
 * Every value transfer inside one transaction, in the order the calls ran.
 *
 * `frame` is the top frame `callTracer` returns for the transaction. The top
 * frame itself is the transaction and is not repeated here: its value is already
 * the transaction's value.
 *
 * A frame that failed is reverted together with everything it called, so a
 * failed frame's whole subtree is left out -- the payments inside it never
 * happened, however successful each call looked on its own. A transaction that
 * failed outright therefore has none.
 *
 * `traceIndex` numbers every frame visited, not only the ones kept, so it is the
 * same for a given call however the filter changes and can be a stable key.
 */
export function transfersFromCallTrace(frame) {
  if (!frame || typeof frame !== 'object' || frame.error) return [];

  const out = [];
  let index = 0;
  const walk = (node) => {
    for (const child of Array.isArray(node.calls) ? node.calls : []) {
      index += 1;
      const traceIndex = index;
      if (!child || typeof child !== 'object' || child.error) {
        // Skip the subtree, but still count it, so the numbering of the calls
        // after it does not depend on how deep this one went.
        index += countFrames(child);
        continue;
      }
      const type = String(child.type ?? '').toUpperCase();
      const value = toBigIntValue(child.value);
      const from = typeof child.from === 'string' ? child.from.toLowerCase() : null;
      const to = typeof child.to === 'string' ? child.to.toLowerCase() : null;
      if (VALUE_TYPES.has(type) && value > 0n && from && to) {
        out.push({ traceIndex, from, to, value, callType: type });
      }
      walk(child);
    }
  };
  walk(frame);
  return out;
}

function countFrames(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.calls)) return 0;
  return node.calls.reduce((sum, child) => sum + 1 + countFrames(child), 0);
}

/**
 * Whether a node's answer means it cannot trace at all, rather than that one
 * trace failed.
 *
 * Hardhat answers `debug_traceBlockByNumber` with "is not supported" and traces
 * single transactions; a node with the debug API off answers "method not found"
 * to both. Telling the two cases apart is what decides whether to retry a block
 * later or to stop asking.
 */
export function isUnsupportedTraceError(error) {
  const code = error?.code ?? error?.cause?.code;
  if (code === -32601 || code === -32004) return true;
  const message = String(error?.details ?? error?.shortMessage ?? error?.message ?? error ?? '').toLowerCase();
  // Only about the method or the tracer. "block not found" or "transaction not
  // found" is a trace that can succeed later, and must not end tracing for good.
  return /(method|tracer)\b.*\b(not supported|not found|does not exist|not available|unsupported)/.test(message)
    || /is not supported|unknown method|method not allowed/.test(message);
}
