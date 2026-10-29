/// Which piece each VK storage payment paid for, worked out once per claim.
///
/// A storage escrow hides its vault keeper until the keeper claims it: the claim
/// transaction's input carries the registration secrets, and from those the
/// registration commitment, and from that -- one contract read -- the piece. The
/// file cycle screens used to do this in every visitor's browser for every claim
/// the network had ever made, four node reads each, on every visit.
///
/// Here it is done once, as the claims are indexed, a bounded number per pass,
/// oldest first. A store that predates this table fills in over a few passes;
/// a rebuild starts from the first claim. The screens then look a piece up by its
/// commitment hash, or a payment by its commitment, in one indexed query.
import { decodeFunctionData, encodePacked, keccak256 } from 'viem';
import { db, toBytes, toHex } from '../src/lib/db/postgres.mjs';

const CLAIM_EVENTS = { EscrowClaimed: 'claimed', EscrowClaimedOnDeletion: 'deletion' };
const CLAIM_FUNCTIONS = new Set(['claimEscrow', 'claimEscrowOnDeletion']);
const ZERO_HASH = `0x${'0'.repeat(64)}`;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
/// Claims worked out per pass. Each costs up to three contract reads.
const BUDGET = Math.max(1, Number(process.env.INDEX_ESCROW_LINK_BUDGET ?? '500'));

export async function escrowLinksMigrated() {
  const { rows } = await db().query(
    `SELECT to_regclass('escrow_link') IS NOT NULL
        AND to_regclass('escrow_link_state') IS NOT NULL AS ready`,
  );
  return rows[0]?.ready === true;
}

const isHash = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/// keccak256(abi.encodePacked(a, b)), the contract's commitment rule.
export function packedCommitment(a, b) {
  return keccak256(encodePacked(['bytes32', 'bytes32'], [a, b]));
}

/**
 * What one claim transaction reveals: the registration commitment behind the
 * payment, if the input is a claim for this payment. Null otherwise -- a claim
 * sent through some other contract cannot be read back this way, and is kept
 * as an unresolved link rather than guessed at.
 */
export function registrationFromClaimInput(abi, input, paymentCommitment) {
  try {
    const decoded = decodeFunctionData({ abi, data: input });
    if (!CLAIM_FUNCTIONS.has(decoded.functionName)) return null;
    const [nullifier, secret, regNullifier, regSecret, linkNonce] = decoded.args;
    if (packedCommitment(nullifier, secret).toLowerCase() !== String(paymentCommitment).toLowerCase()) return null;
    if (!isHash(linkNonce)) return null;
    return packedCommitment(regNullifier, regSecret);
  } catch {
    return null;
  }
}

/// The claim events after `afterBlock`, oldest first, from whichever store holds
/// the event log.
async function claimEventsAfter(afterBlock, uptoBlock, limit, clickhouse) {
  const { rows: types } = await db().query(
    'SELECT id, name FROM event_type WHERE name = ANY($1)', [Object.keys(CLAIM_EVENTS)],
  );
  if (types.length === 0) return [];
  const nameById = new Map(types.map((t) => [Number(t.id), t.name]));
  const ids = types.map((t) => Number(t.id));

  if (clickhouse) {
    const result = await clickhouse.query({
      query: `SELECT block_number, log_index, tx_hash, event_id, args
                FROM event
               WHERE event_id IN {ids:Array(UInt16)}
                 AND block_number > {after:Int64} AND block_number <= {upto:UInt64}
               ORDER BY block_number, log_index
               LIMIT {limit:UInt32}`,
      query_params: { ids, after: String(afterBlock), upto: String(uptoBlock), limit },
      format: 'JSONEachRow',
    });
    return (await result.json()).map((row) => ({
      name: nameById.get(Number(row.event_id)),
      blockNumber: BigInt(row.block_number),
      logIndex: Number(row.log_index),
      txHash: `0x${row.tx_hash}`,
      args: typeof row.args === 'string' ? JSON.parse(row.args || '{}') : (row.args ?? {}),
    }));
  }

  const { rows } = await db().query(
    `SELECT block_number, log_index, tx_hash, event_id, args
       FROM event
      WHERE event_id = ANY($1) AND block_number > $2 AND block_number <= $3
      ORDER BY block_number, log_index
      LIMIT $4`,
    [ids, String(afterBlock), String(uptoBlock), limit],
  );
  return rows.map((row) => ({
    name: nameById.get(Number(row.event_id)),
    blockNumber: BigInt(row.block_number),
    logIndex: Number(row.log_index),
    txHash: toHex(row.tx_hash),
    args: row.args ?? {},
  }));
}

/// Claim inputs from the stored transactions, and from the node for any the
/// store does not hold.
async function claimInputs(client, hashes) {
  const inputs = new Map();
  if (hashes.length === 0) return inputs;
  const { rows } = await db().query(
    'SELECT hash, input FROM transaction WHERE hash = ANY($1::bytea[])',
    [hashes.map((h) => toBytes(h))],
  );
  for (const row of rows) {
    if (row.input && row.input.length > 0) inputs.set(toHex(row.hash).toLowerCase(), toHex(row.input));
  }
  const missing = hashes.filter((h) => !inputs.has(h.toLowerCase()));
  await Promise.all(missing.map(async (hash) => {
    const tx = await client.getTransaction({ hash }).catch(() => null);
    if (tx?.input) inputs.set(hash.toLowerCase(), tx.input);
  }));
  return inputs;
}

async function read(client, contract, functionName, args) {
  if (!contract) return null;
  return client.readContract({ address: contract.address, abi: contract.abi, functionName, args })
    .catch(() => null);
}

/**
 * Work out the next batch of claims and record them.
 *
 * `wired` holds VKEscrow and FileRegistrationSC as `{ address, abi }`. Returns
 * how many claims were recorded, or a reason it did nothing.
 */
export async function resolveEscrowLinks({ client, wired, atBlock, clickhouse = null }) {
  if (!(await escrowLinksMigrated())) return { skipped: 'escrow_link not migrated' };
  const escrow = wired.VKEscrow;
  const registry = wired.FileRegistrationSC;
  if (!escrow) return { skipped: 'VKEscrow not deployed' };

  const { rows: [state] } = await db().query('SELECT resolved_to FROM escrow_link_state WHERE id');
  const after = state ? BigInt(state.resolved_to) : -1n;
  const upto = BigInt(atBlock);
  if (after >= upto) return { recorded: 0 };

  const claims = await claimEventsAfter(after, upto, BUDGET, clickhouse);
  const inputs = await claimInputs(client, [...new Set(claims.map((c) => c.txHash))]);

  const links = await Promise.all(claims.map(async (claim) => {
    const payment = String(claim.args.paymentCommitment ?? '');
    if (!isHash(payment)) return null;
    const registration = registrationFromClaimInput(
      escrow.abi, inputs.get(claim.txHash.toLowerCase()), payment,
    );
    let commitmentHash = null;
    let vk = null;
    let status = null;
    if (registration) {
      status = await read(client, escrow, 'escrowStatus', [payment]);
      const resolved = await read(client, registry, 'registrationCommitmentToCommitmentHash', [registration]);
      if (isHash(resolved) && resolved !== ZERO_HASH) {
        commitmentHash = resolved;
        const record = await read(client, registry, 'getRecord', [resolved]);
        const recordVk = record?.vkAddress ?? record?.[2];
        if (typeof recordVk === 'string' && recordVk.toLowerCase() !== ZERO_ADDRESS) vk = recordVk;
      }
    }
    return {
      payment,
      txHash: claim.txHash,
      kind: CLAIM_EVENTS[claim.name],
      block: claim.blockNumber,
      log: claim.logIndex,
      recipient: claim.args.recipient ?? null,
      registration,
      commitmentHash,
      // The claimant is the keeper the registration names, so it stands in
      // when the record cannot be read.
      vk: vk ?? claim.args.recipient ?? null,
      amount: status ? String(status[0] ?? status.totalAmount) : null,
      serviceStart: status ? String(status[1] ?? status.serviceStart) : null,
      serviceEnd: status ? String(status[2] ?? status.serviceEnd) : null,
      depositor: status ? (status[7] ?? status.depositor) : null,
    };
  }));

  const present = links.filter(Boolean);
  for (const link of present) {
    await db().query(
      `INSERT INTO escrow_link (payment_commitment, claim_tx, kind, claim_block, claim_log, recipient,
                                registration_commitment, commitment_hash, vk,
                                amount, service_start, service_end, depositor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (payment_commitment, claim_tx) DO UPDATE SET
         kind = EXCLUDED.kind, claim_block = EXCLUDED.claim_block, claim_log = EXCLUDED.claim_log,
         recipient = EXCLUDED.recipient, registration_commitment = EXCLUDED.registration_commitment,
         commitment_hash = EXCLUDED.commitment_hash, vk = EXCLUDED.vk, amount = EXCLUDED.amount,
         service_start = EXCLUDED.service_start, service_end = EXCLUDED.service_end,
         depositor = EXCLUDED.depositor`,
      [toBytes(link.payment), toBytes(link.txHash), link.kind, String(link.block), link.log,
        toBytes(link.recipient), toBytes(link.registration), toBytes(link.commitmentHash), toBytes(link.vk),
        link.amount, link.serviceStart, link.serviceEnd, toBytes(link.depositor)],
    );
  }

  // A full batch may have stopped part-way through a block, so the next pass
  // starts at that block again; the upsert makes reading it twice harmless.
  // A short batch read everything up to `upto`.
  const lastBlock = claims.length > 0 ? claims[claims.length - 1].blockNumber : upto;
  let next = claims.length < BUDGET ? upto : lastBlock - 1n;
  // One block holding more claims than a whole batch would otherwise be read
  // again forever; move past it.
  if (next <= after) next = lastBlock;
  await db().query(
    `INSERT INTO escrow_link_state (id, resolved_to, updated_at) VALUES (TRUE, $1, now())
     ON CONFLICT (id) DO UPDATE SET resolved_to = EXCLUDED.resolved_to, updated_at = now()`,
    [String(next)],
  );
  return { recorded: present.length, resolvedTo: String(next) };
}
