/// Asking the node what each transaction paid out inside its calls.
///
/// The extraction itself is `transfersFromCallTrace`; this is the part that talks
/// to the node, and it has to cope with the two chains this repository runs:
///
///   - The Cosmos chain traces a whole block in one call
///     (`debug_traceBlockByNumber`), which is one request per block that holds
///     transactions -- the same price as the receipts the indexer already reads.
///   - Hardhat refuses the block method ("is not supported") but traces single
///     transactions, so it is asked one transaction at a time.
///   - A node with the debug API switched off traces nothing, and is asked once.
///
/// Whichever works is remembered for the rest of the run, so a Hardhat chain does
/// not pay for a refused block call on every block.
import { isUnsupportedTraceError, transfersFromCallTrace } from '../src/lib/internalTransfers.mjs';

const TRACER = { tracer: 'callTracer' };

/**
 * One tracer for one indexer run.
 *
 * `traceBlock` answers `{ ok: true, rows }` with every internal transfer of the
 * block, `{ ok: false, reason }` when this block could not be traced now (it is
 * recorded and tried again later), or `{ ok: false, unsupported: true }` when the
 * node cannot trace at all.
 */
export function createInternalTracer(client) {
  let mode = 'block';

  const request = (method, params) => client.request({ method, params });

  /// One transaction's trace, by hash, so the answer cannot be paired with the
  /// wrong transaction.
  async function traceTransaction(hash) {
    return request('debug_traceTransaction', [hash, TRACER]);
  }

  /// The block in one call, accepted only when it lines up with the block's own
  /// transaction list.
  ///
  /// geth labels each result with its transaction hash; the Cosmos chain sends
  /// the results alone, in block order, and leaves out a transaction it could
  /// not decode -- and returns nothing at all when it cannot find the block's
  /// results. So the answer is checked against the transactions it should
  /// describe: one result each, from the same sender. Anything else is traced a
  /// transaction at a time instead, rather than guessed at.
  async function traceWholeBlock(blockNumber, txs) {
    const results = await request('debug_traceBlockByNumber', [`0x${BigInt(blockNumber).toString(16)}`, TRACER]);
    if (!Array.isArray(results) || results.length !== txs.length) return null;
    const frames = [];
    for (let i = 0; i < txs.length; i += 1) {
      const entry = results[i];
      if (!entry || typeof entry !== 'object' || entry.error) return null;
      const frame = entry.result ?? entry;
      if (entry.txHash && String(entry.txHash).toLowerCase() !== String(txs[i].hash).toLowerCase()) return null;
      if (String(frame?.from ?? '').toLowerCase() !== String(txs[i].from).toLowerCase()) return null;
      frames.push(frame);
    }
    return frames;
  }

  async function traceEach(txs) {
    const frames = [];
    for (const tx of txs) frames.push(await traceTransaction(tx.hash));
    return frames;
  }

  /**
   * `txs` is the block's transactions in block order, each with at least
   * `hash`, `from` and `transactionIndex`.
   */
  async function traceBlock(blockNumber, blockTime, txs) {
    if (mode === 'none') return { ok: false, unsupported: true };
    if (txs.length === 0) return { ok: true, rows: [] };

    let frames = null;
    try {
      if (mode === 'block') {
        try {
          frames = await traceWholeBlock(blockNumber, txs);
        } catch (error) {
          if (!isUnsupportedTraceError(error)) throw error;
          mode = 'tx';
        }
      }
      if (frames === null) frames = await traceEach(txs);
    } catch (error) {
      if (isUnsupportedTraceError(error)) {
        mode = 'none';
        return { ok: false, unsupported: true };
      }
      return { ok: false, reason: String(error?.shortMessage ?? error?.message ?? error).slice(0, 200) };
    }

    const rows = [];
    txs.forEach((tx, i) => {
      for (const transfer of transfersFromCallTrace(frames[i])) {
        rows.push({
          txHash: tx.hash,
          blockNumber: BigInt(blockNumber),
          blockTime: Number(blockTime),
          txIndex: Number(tx.transactionIndex ?? i),
          ...transfer,
        });
      }
    });
    return { ok: true, rows };
  }

  return {
    traceBlock,
    get mode() { return mode; },
  };
}
