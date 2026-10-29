import { guardRead } from '@/lib/read-guard.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { CONTRACT_LABELS } from '@/lib/addresses';

export const dynamic = 'force-dynamic';

/**
 * Every contract this deployment actually put on the chain.
 *
 * The contracts screen listed twenty, from a map written by hand in
 * `addresses.ts`. The deployment puts **eighty-four** there. The missing
 * sixty-four were not hidden on purpose -- they were simply never added to the
 * list, and a screen that exists to show what the protocol is made of was
 * showing under a quarter of it.
 *
 * Read from `deployed_addresses.json`, which is written by the deploy itself, so
 * the list cannot drift from the chain the way a hand-kept copy does. That is
 * the same lesson the event signatures taught: a copy of something the
 * deployment produces will be wrong eventually, and wrong quietly.
 */

/// Where each contract belongs, by what it does rather than by how it is named.
/// Sixty-two of the eighty-four are generated ZK verifiers -- one per committee
/// size -- so a flat list buries the twenty-two that carry the protocol among
/// repetitions of a single thing. The group is what makes the page readable.
const GROUPS: Array<{ group: string; members: string[] }> = [
  { group: 'Identity & access', members: ['GuardianRegistry', 'VaultKeeperRegistry', 'AccessControlFT'] },
  {
    group: 'Storage proofs',
    members: ['StorageProofSC', 'CapacityProofSC', 'PartitionSnapshotProofSC',
      'CapacityCertificationSC', 'CapacityIncrementalBatchSC', 'StorageRegistrationTimeout'],
  },
  { group: 'Files & data', members: ['FileRegistrationSC', 'DataVault', 'DeletionReleaseSC'] },
  {
    group: 'Keys (DKG / PRE)',
    members: ['TElGv2', 'ZkDkgCoordinatorV2', 'ZkDkgDisputeManager', 'GuardianShareProof'],
  },
  {
    group: 'Economics',
    members: ['StakingManager', 'RewardManager', 'GuardianWorkReward', 'ReputationManager', 'VKEscrow'],
  },
  { group: 'Disputes & governance', members: ['StorageReceiptDispute', 'FileTrustTimelock'] },
];

const MEMBER_GROUP = new Map(
  GROUPS.flatMap(({ group, members }) => members.map((m) => [m, group] as const)),
);

/// Anything not named above. A verifier is recognisable by its name, and a
/// library by having neither events nor state -- but the deployment does not say
/// which is which, so the name is what there is.
function groupFor(name: string): string {
  const known = MEMBER_GROUP.get(name);
  if (known) return known;
  if (/verifier/i.test(name)) return 'ZK verifiers';
  if (/lib$/i.test(name) || /Lib[A-Z0-9]*$/.test(name)) return 'Libraries';
  return 'Other';
}

/**
 * The contract's own name, and something readable to put beside it.
 *
 * The deployment groups the share verifiers by committee size, so their path
 * ends in `"10:4"` rather than a name. Solidity compiled them as
 * `ShareVerifierN10T4`, which is the name the artifact is filed under and the
 * one the page has to link to -- a link built from `"10:4"` finds nothing and
 * reads as nothing. The pair is reconstructed rather than looked up because the
 * deployment records the sizes and the compiler records the name, and neither
 * writes down the other.
 */
function identify(trail: string): { name: string; label: string } {
  const parts = trail.split(' ');
  const leaf = parts[parts.length - 1];
  const parent = parts.length > 1 ? parts[parts.length - 2] : '';

  const committee = leaf.match(/^(\d+):(\d+)$/);
  if (committee && /ShareVerifier/i.test(parent)) {
    const [, n, t] = committee;
    return { name: `ShareVerifierN${n}T${t}`, label: `Share verifier — committee ${n} of ${t}` };
  }
  // A single number under a "ByParticipantCount" style parent is the same idea
  // with one dimension.
  if (/^\d+$/.test(leaf) && parent) {
    return { name: `${parent}${leaf}`, label: `${parent} (${leaf})` };
  }
  return { name: leaf, label: leaf };
}

const CHAIN_WORKSPACES: Record<string, string> = {
  hardhat: 'Blockchain',
  cosmos: path.join('Blockchain 2', 'filetrust', 'evm'),
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/// A contract a deployment does not have is written as the zero address.
const ZERO_ADDRESS = /^0x0{40}$/i;

/// Addresses live at several depths and the same one appears under more than one
/// key, so this walks the document and keeps the first name each address is
/// given. Without the deduplication the page would list the same contract three
/// times under three different headings.
///
/// The name is the whole path rather than the leaf, because the leaf alone is
/// not a name. Fifty-four of the verifiers sit under `ShareVerifierByCommittee`
/// keyed by committee size -- `"10:4"`, `"15:2"` -- and taking the leaf listed
/// them as contracts called "10:4", which says nothing and sorts like nothing.
/// Joined to the parent they read as what they are.
function collect(node: unknown, into: Map<string, string>, seen: Set<string>, trail: string[] = []): void {
  if (typeof node === 'string') {
    if (!ADDRESS.test(node) || ZERO_ADDRESS.test(node) || trail.length === 0) return;
    const address = node.toLowerCase();
    if (seen.has(address)) return;
    seen.add(address);
    into.set(trail.join(' '), address);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collect(item, into, seen, trail);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node as Record<string, unknown>)) {
      // `contracts` is the wrapper the deployment writes, not part of any name.
      const next = childKey === 'contracts' && trail.length === 0 ? trail : [...trail, childKey];
      collect(value, into, seen, next);
    }
  }
}

async function handleGET() {
  const deployedPath = process.env.DEPLOYED_ADDRESSES_PATH
    ?? path.join(process.cwd(), 'deployed_addresses.json');

  let document: unknown;
  try {
    document = JSON.parse(await readFile(deployedPath, 'utf8'));
  } catch {
    // No deployment file is not an error worth a 500: the screen falls back to
    // the names compiled into the bundle, the same way every other screen
    // degrades when the thing behind it is absent.
    return NextResponse.json({ rows: [], source: 'none' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Only the deployment's `contracts` section lists contracts. The rest of the file
  // holds other addresses -- the top-level `deployer` is the account that ran the
  // deploy, not a contract -- and walking it put that account on this screen, where
  // its page could only fail: there is no artifact for an account.
  const doc = document as Record<string, unknown> | null;
  const contracts = doc && typeof doc === 'object' && doc.contracts && typeof doc.contracts === 'object'
    ? doc.contracts
    : document;
  const found = new Map<string, string>();
  collect(contracts, found, new Set());

  const rows = [...found.entries()]
    .map(([trail, address]) => {
      const { name, label } = identify(trail);
      return {
        name,
        label: CONTRACT_LABELS[name as keyof typeof CONTRACT_LABELS] ?? label,
        address,
        group: groupFor(name),
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  return NextResponse.json({ rows, source: 'deployment' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  return guardRead(request, () => handleGET(), { ttlMs: 10000, ignoreQuery: true });
}
