import { guardRead } from '@/lib/read-guard.mjs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Who made a block and who signed it, from the node's consensus side.
 *
 * The EVM JSON-RPC answers what happened inside a block, but not which
 * validator proposed it or how many validators signed it -- that lives in the
 * consensus engine (CometBFT), on its own RPC port, which every Cosmos node
 * serves on 26657. The Explorer runs beside the node, so it asks there:
 * COMETBFT_RPC_URL when set, otherwise the host of RPC_URL on that port.
 *
 * A chain without that side -- Hardhat -- answers nothing on the port, and the
 * screen says consensus details are not available instead of failing.
 */

const TIMEOUT_MS = 4_000;

function cometUrl(): string | null {
  if (process.env.COMETBFT_RPC_URL) return process.env.COMETBFT_RPC_URL.replace(/\/+$/, '');
  try {
    const rpc = new URL(process.env.RPC_URL || 'http://127.0.0.1:8545');
    return `${rpc.protocol}//${rpc.hostname}:26657`;
  } catch {
    return null;
  }
}

async function ask<T>(base: string, path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]), cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = await res.json() as { result?: T; error?: { message?: string; data?: string } };
  if (body.error || !body.result) throw new Error(body.error?.data || body.error?.message || `${path}: no result`);
  return body.result;
}

interface CometBlock { block: { header: { chain_id: string; height: string; time: string; proposer_address: string; app_hash: string } } }
interface CometCommit { signed_header: { commit: { signatures: Array<{ block_id_flag: number; validator_address: string }> } } }
interface CometValidators { total: string; validators: Array<{ address: string; voting_power: string }> }
interface CometStatus { node_info: { moniker: string }; validator_info: { address: string } }

interface ConsensusInfo {
  available: true;
  chainId: string;
  height: string;
  time: string;
  appHash: string;
  proposer: { address: string; votingPower: string | null; thisNode: boolean; name: string | null };
  validators: { count: number; totalVotingPower: string };
  signatures: { signed: number; absent: number; nil: number; signedVotingPower: string };
}

/// Block data never changes, so an answer is kept for a while; the newest
/// block's commit can still gain signatures, so not for long.
const cache = new Map<string, { at: number; value: ConsensusInfo }>();
const CACHE_MS = 60_000;

async function handleGET(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]);
  const height = new URL(request.url).searchParams.get('height') ?? '';
  if (!/^\d{1,18}$/.test(height) || height === '0') {
    return NextResponse.json({ available: false, reason: 'not a block height' }, { status: 400 });
  }
  const base = cometUrl();
  if (!base) return NextResponse.json({ available: false, reason: 'no consensus RPC configured' });

  const hit = cache.get(height);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.value);

  try {
    const [block, commit, status] = await Promise.all([
      ask<CometBlock>(base, `/block?height=${height}`, signal),
      ask<CometCommit>(base, `/commit?height=${height}`, signal),
      ask<CometStatus>(base, '/status', signal),
    ]);
    // Every validator at this height, a page at a time: the signed share of the
    // voting power is what "how many signed" means.
    const validators: CometValidators['validators'] = [];
    for (let page = 1; page <= 20; page += 1) {
      const result = await ask<CometValidators>(base, `/validators?height=${height}&page=${page}&per_page=100`, signal);
      validators.push(...result.validators);
      if (validators.length >= Number(result.total)) break;
    }
    const power = new Map(validators.map((v) => [v.address.toUpperCase(), BigInt(v.voting_power)]));
    const header = block.block.header;
    const sigs = commit.signed_header.commit.signatures;
    // CometBFT marks each signature: 2 signed this block, 3 voted nil, 1 absent.
    const signedSigs = sigs.filter((s) => s.block_id_flag === 2);
    const proposer = header.proposer_address.toUpperCase();
    const thisNode = status.validator_info.address.toUpperCase() === proposer;

    const value: ConsensusInfo = {
      available: true,
      chainId: header.chain_id,
      height: header.height,
      time: header.time,
      appHash: `0x${header.app_hash.toLowerCase()}`,
      proposer: {
        address: proposer,
        votingPower: power.has(proposer) ? String(power.get(proposer)) : null,
        thisNode,
        // Only the node's own validator has a name the consensus RPC gives.
        name: thisNode ? status.node_info.moniker : null,
      },
      validators: {
        count: validators.length,
        totalVotingPower: String(validators.reduce((sum, v) => sum + BigInt(v.voting_power), 0n)),
      },
      signatures: {
        signed: signedSigs.length,
        absent: sigs.filter((s) => s.block_id_flag === 1).length,
        nil: sigs.filter((s) => s.block_id_flag === 3).length,
        signedVotingPower: String(signedSigs.reduce((sum, s) => sum + (power.get(s.validator_address.toUpperCase()) ?? 0n), 0n)),
      },
    };
    if (cache.size > 500) cache.clear();
    cache.set(height, { at: Date.now(), value });
    return NextResponse.json(value);
  } catch (error) {
    return NextResponse.json({
      available: false,
      reason: 'Consensus details are temporarily unavailable',
    });
  }
}

export async function GET(request: Request) {
  return guardRead(request, () => handleGET(request), { ttlMs: 60000 });
}
