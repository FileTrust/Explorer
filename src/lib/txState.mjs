/// What one transaction changed, and why it failed when it did.
///
/// The transaction page shows these the way a block explorer does: the FTU
/// each address gained or lost, the contract storage it rewrote, and for a
/// failed transaction the reason the node gives. Kept free of the page so the
/// tests run the same code.

import { decodeErrorResult } from 'viem';

const ZERO_WORD = `0x${'0'.repeat(64)}`;

function toBig(value) {
  if (value === undefined || value === null || value === '') return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/// A storage word as 32 bytes, so a slot the trace left out and one it gave as
/// "0x0" compare equal.
function word(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) return ZERO_WORD;
  return `0x${value.slice(2).toLowerCase().padStart(64, '0')}`;
}

/**
 * The FTU each address gained or lost in one transaction, biggest first.
 *
 * Read from what the transaction itself says -- its value, its fee -- and the
 * payments contracts made inside it, rather than from the node's state trace:
 * a Cosmos node takes the fee before the transaction runs, so its trace never
 * shows it, while Hardhat's does. Built this way both chains give the same
 * answer. A failed transaction moved nothing but its fee.
 *
 * `feePool` is the row for the fee itself, which goes to the validators.
 */
export function balanceChanges({ from, to, value, fee, failed, payments = [] }) {
  const change = new Map();
  const add = (address, amount) => {
    if (!address || amount === 0n) return;
    const key = address.toLowerCase();
    change.set(key, (change.get(key) ?? 0n) + amount);
  };
  const feeWei = toBig(fee);
  add(from, -feeWei);
  if (!failed) {
    const valueWei = toBig(value);
    add(from, -valueWei);
    add(to, valueWei);
    for (const p of payments) {
      add(p.from, -toBig(p.value));
      add(p.to, toBig(p.value));
    }
  }
  const rows = [...change.entries()]
    .filter(([, amount]) => amount !== 0n)
    .map(([address, amount]) => ({ address, change: amount }));
  if (feeWei > 0n) rows.push({ address: null, feePool: true, change: feeWei });
  const abs = (n) => (n < 0n ? -n : n);
  return rows.sort((a, b) => (abs(b.change) > abs(a.change) ? 1 : abs(b.change) < abs(a.change) ? -1 : 0));
}

/**
 * The accounts one transaction changed, from the node's `prestateTracer` in
 * diff mode: `pre` holds what each changed account had before, `post` what it
 * has after -- only the fields that changed, and a storage slot that went to
 * zero left out of `post`.
 *
 * Each account says how its nonce and balance moved, whether it was created,
 * and every storage slot rewritten, before and after. Accounts whose only
 * change is a slot written with the value it already had are left out.
 *
 * An account missing from `post` is read as unchanged. For a failed
 * transaction a Cosmos node answers with everything the call read in `pre` and
 * nothing in `post` -- the call was undone -- and taking those as cleared would
 * show a failed transaction rewriting dozens of slots.
 */
export function stateChangesFromDiff(diff) {
  const pre = diff && typeof diff.pre === 'object' && diff.pre ? diff.pre : {};
  const post = diff && typeof diff.post === 'object' && diff.post ? diff.post : {};
  const addresses = new Set([...Object.keys(pre), ...Object.keys(post)].map((a) => a.toLowerCase()));
  const find = (side, address) => {
    const key = Object.keys(side).find((k) => k.toLowerCase() === address);
    return key ? side[key] : undefined;
  };

  const out = [];
  for (const address of addresses) {
    const before = find(pre, address) ?? {};
    const now = find(post, address);
    if (now === undefined) continue;

    const slots = new Set([
      ...Object.keys(before.storage ?? {}),
      ...Object.keys(now.storage ?? {}),
    ].map((s) => word(s)));
    const storage = [];
    for (const slot of slots) {
      const was = word(Object.entries(before.storage ?? {}).find(([k]) => word(k) === slot)?.[1]);
      const is = word(Object.entries(now.storage ?? {}).find(([k]) => word(k) === slot)?.[1]);
      if (was !== is) storage.push({ slot, before: was, after: is });
    }
    storage.sort((a, b) => (a.slot < b.slot ? -1 : 1));

    const nonce = now.nonce !== undefined && Number(now.nonce) !== Number(before.nonce ?? 0)
      ? { before: Number(before.nonce ?? 0), after: Number(now.nonce) }
      : null;
    const balance = now.balance !== undefined && toBig(now.balance) !== toBig(before.balance)
      ? { before: toBig(before.balance), after: toBig(now.balance) }
      : null;
    const created = typeof now.code === 'string' && now.code !== '0x'
      && (before.code === undefined || before.code === '0x');

    if (!nonce && !balance && !created && storage.length === 0) continue;
    out.push({ address, nonce, balance, created, storage });
  }
  // Contracts with the most rewritten first, then by address for a stable order.
  return out.sort((a, b) => b.storage.length - a.storage.length || (a.address < b.address ? -1 : 1));
}

const PANIC = {
  0x01: 'assert failed',
  0x11: 'arithmetic overflow or underflow',
  0x12: 'division by zero',
  0x21: 'invalid enum value',
  0x22: 'bad storage byte array',
  0x31: 'pop on an empty array',
  0x32: 'array index out of bounds',
  0x41: 'too much memory',
  0x51: 'call to an empty function',
};

function argText(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(argText).join(', ')}]`;
  return String(value);
}

/**
 * Why a transaction failed, in words, from the top frame `callTracer` returns.
 *
 * The node's own error ("execution reverted", "out of gas: ...") says how it
 * stopped; the revert data, when there is any, says why. That data is decoded
 * as a Solidity `Error(string)` or `Panic(uint256)`, or against `errorsAbi` --
 * the custom errors of the deployed contracts. Null when the frame did not fail.
 */
export function describeFailure(frame, errorsAbi = []) {
  if (!frame || typeof frame !== 'object' || !frame.error) return null;
  const error = String(frame.error);
  let reason = typeof frame.revertReason === 'string' && frame.revertReason ? frame.revertReason : null;
  const output = typeof frame.output === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(frame.output) ? frame.output : null;
  if (!reason && output) {
    try {
      const decoded = decodeErrorResult({ abi: errorsAbi, data: output });
      const args = decoded.args ?? [];
      if (decoded.errorName === 'Error') reason = String(args[0]);
      else if (decoded.errorName === 'Panic') {
        const code = Number(args[0]);
        reason = `panic 0x${code.toString(16)}${PANIC[code] ? ` (${PANIC[code]})` : ''}`;
      } else reason = `${decoded.errorName}(${args.map(argText).join(', ')})`;
    } catch {
      reason = `unknown error ${output.slice(0, 10)}`;
    }
  }
  return { error, reason };
}
