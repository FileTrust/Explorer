import { publicClient } from '@/lib/client';
import { ADDRESS_TO_NAME, CONTRACTS, CONTRACT_LABELS, ContractName } from '@/lib/addresses';
import { FileRegistrationSCABI } from '@/lib/abis/FileRegistrationSC';
import { GuardianRegistryABI } from '@/lib/abis/GuardianRegistry';
import { VaultKeeperRegistryABI } from '@/lib/abis/VaultKeeperRegistry';
import { ZkDkgCoordinatorV2ABI } from '@/lib/abis/ZkDkgCoordinatorV2';
import { DataVaultABI } from '@/lib/abis/DataVault';
import { getIndexedLogs } from '@/lib/indexedLogs';

export interface SearchResult {
  path: string;
  label: string;
  kind: string;
}

const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function isContractName(q: string): ContractName | undefined {
  const normalized = q.toLowerCase().replace(/[\s_-]/g, '');
  return (Object.keys(CONTRACTS) as ContractName[]).find(name =>
    name.toLowerCase() === normalized ||
    CONTRACT_LABELS[name].toLowerCase().replace(/[\s_-]/g, '') === normalized
  );
}

async function isGuardian(address: `0x${string}`): Promise<boolean> {
  const profile = await publicClient.readContract({
    address: CONTRACTS.GuardianRegistry,
    abi: GuardianRegistryABI,
    functionName: 'getGuardian',
    args: [address],
  }).catch(() => null);
  return !!profile && BigInt(profile.registeredAt ?? 0n) > 0n;
}

async function isVaultKeeper(address: `0x${string}`): Promise<boolean> {
  const profile = await publicClient.readContract({
    address: CONTRACTS.VaultKeeperRegistry,
    abi: VaultKeeperRegistryABI,
    functionName: 'getVaultKeeper',
    args: [address],
  }).catch(() => null);
  return !!profile && BigInt(profile.registeredAt ?? 0n) > 0n;
}

/// Whether the index already holds this transaction. False for one the indexer
/// has not reached yet and false when there is no index at all -- both send the
/// caller on to the chain, which is the right answer for either.
async function isIndexedTransaction(hash: `0x${string}`): Promise<boolean> {
  const res = await fetch(`/api/index/transaction?hash=${hash}`, { cache: 'default' })
    .catch(() => null);
  if (!res || !res.ok) return false;
  const body = await res.json().catch(() => null);
  return Boolean(body?.rows?.hash ?? body?.hash);
}

async function hasFileRecord(hash: `0x${string}`): Promise<boolean> {
  return publicClient.readContract({
    address: CONTRACTS.FileRegistrationSC,
    abi: FileRegistrationSCABI,
    functionName: 'recordExists',
    args: [hash],
  }).catch(() => false);
}

async function hasSector(hash: `0x${string}`): Promise<boolean> {
  const count = await publicClient.readContract({
    address: CONTRACTS.FileRegistrationSC,
    abi: FileRegistrationSCABI,
    functionName: 'sectorCommitmentCount',
    args: [hash],
  }).catch(() => 0n);
  return BigInt(count) > 0n;
}

async function hasDkgFileId(hash: `0x${string}`): Promise<boolean> {
  const eventNames = ['ZkDkgV2Finalized', 'ZkDkgV2SamePkRefreshFinalized', 'DkgKeyGenExpired', 'V2RefreshExpired'];
  const results = await Promise.all(eventNames.map(name =>
    getIndexedLogs({
      address: CONTRACTS.ZkDkgCoordinatorV2,
      event: ZkDkgCoordinatorV2ABI.find(e => e.name === name)! as any,
      args: { fileId: hash },
    }).catch(() => [])
  ));
  return results.some(logs => logs.length > 0);
}

async function hasAccessFileId(hash: `0x${string}`): Promise<boolean> {
  const results = await Promise.all(['DataAccessRequestedV2', 'BatchCreated'].map(name =>
    getIndexedLogs({
      address: CONTRACTS.DataVault,
      event: DataVaultABI.find(e => e.name === name)! as any,
      args: { fileId: hash },
    }).catch(() => [])
  ));
  return results.some(logs => logs.length > 0);
}

function withQuery(path: string, q: string) {
  return `${path}?q=${encodeURIComponent(q)}`;
}

export async function resolveGlobalSearch(input: string): Promise<SearchResult | null> {
  const raw = input.trim();
  if (!raw || raw.length > 256) return null;

  const prefixMatch = raw.match(/^([a-zA-Z-]+):(.*)$/);
  const prefix = prefixMatch?.[1].toLowerCase();
  const q = (prefixMatch ? prefixMatch[2] : raw).trim();
  if (!q) return null;

  const contractName = isContractName(q);
  if (prefix === 'contract' && contractName) {
    return { path: `/contracts/${contractName}`, label: CONTRACT_LABELS[contractName], kind: 'Contract' };
  }
  if (prefix === 'rank' || prefix === 'ranking' || prefix === 'leaderboard') {
    return { path: withQuery('/rank', q), label: 'Participant rankings', kind: 'Rankings' };
  }

  if ((prefix === 'block' || prefix === 'height') && /^\d+$/.test(q)) {
    return { path: `/blocks/${q}`, label: `Block #${q}`, kind: 'Block' };
  }
  if (prefix === 'tx' && HEX_32.test(q)) {
    return { path: `/tx/${q}`, label: 'Transaction', kind: 'Transaction' };
  }
  if ((prefix === 'address' || prefix === 'account') && ADDRESS.test(q)) {
    return { path: `/address/${q}`, label: ADDRESS_TO_NAME[q.toLowerCase()] ?? 'Address', kind: 'Address' };
  }
  if ((prefix === 'guardian') && ADDRESS.test(q)) {
    return { path: `/guardians/${q}`, label: 'Guardian', kind: 'Guardian' };
  }
  if ((prefix === 'vk' || prefix === 'vaultkeeper' || prefix === 'vault-keeper') && ADDRESS.test(q)) {
    return { path: `/vault-keepers/${q}`, label: 'Vault Keeper', kind: 'Vault Keeper' };
  }
  if (prefix === 'file' && HEX_32.test(q)) {
    return { path: `/files/${q}`, label: 'Piece commitment', kind: 'Piece' };
  }
  if (prefix === 'sector' && HEX_32.test(q)) {
    return { path: withQuery('/storage/sectors', q), label: 'Sector search', kind: 'Sector' };
  }
  if ((prefix === 'partition' || prefix === 'deadline') && q) {
    return { path: withQuery(prefix === 'deadline' ? '/storage/deadlines' : '/storage/partitions', q), label: `${prefix} search`, kind: 'Storage' };
  }
  if (prefix === 'dkg' && HEX_32.test(q)) {
    return { path: withQuery('/dkg', q), label: 'DKG file ID', kind: 'DKG' };
  }
  if (prefix === 'access') {
    return { path: `${withQuery('/access', q)}&view=requests`, label: 'Access search', kind: 'Access' };
  }
  if (prefix === 'economics' || prefix === 'escrow' || prefix === 'reward') {
    const target = prefix === 'escrow' ? '/economics/escrows' : prefix === 'reward' ? '/rewards' : '/economics';
    return { path: withQuery(target, q), label: 'Economics search', kind: 'Economics' };
  }
  if ((prefix === 'policy' || prefix === 'policies') && HEX_32.test(q)) {
    return { path: `/access/policies/${q}`, label: 'File policy', kind: 'Policy' };
  }
  if (prefix === 'proof' && HEX_32.test(q)) {
    return { path: withQuery('/proofs', q), label: 'Proof key', kind: 'Proof' };
  }

  if (contractName) {
    return { path: `/contracts/${contractName}`, label: CONTRACT_LABELS[contractName], kind: 'Contract' };
  }

  if (/^(rank|ranking|rankings|leaderboard|top guardians?|top vks?|guardian rank|vk rank|vault keeper rank)$/i.test(q)) {
    return { path: '/rank', label: 'Participant rankings', kind: 'Rankings' };
  }

  if (/^\d+$/.test(q)) {
    await publicClient.getBlock({ blockNumber: BigInt(q) });
    return { path: `/blocks/${q}`, label: `Block #${q}`, kind: 'Block' };
  }

  if (ADDRESS.test(q)) {
    const address = q as `0x${string}`;
    if (await isGuardian(address)) return { path: `/guardians/${address}`, label: 'Guardian', kind: 'Guardian' };
    if (await isVaultKeeper(address)) return { path: `/vault-keepers/${address}`, label: 'Vault Keeper', kind: 'Vault Keeper' };
    return { path: `/address/${address}`, label: ADDRESS_TO_NAME[address.toLowerCase()] ?? 'Address', kind: 'Address' };
  }

  if (HEX_32.test(q)) {
    const hash = q as `0x${string}`;

    // The index first, the chain only if it has nothing.
    //
    // A search is one question, so it should cost one indexed lookup rather than
    // a call to the endpoint the network itself runs on -- and the transaction
    // screen it leads to is already served from the index, so asking the chain
    // here only to hand over to the store was a round trip that decided nothing.
    // The chain remains the fallback for a transaction newer than the last
    // indexer pass, which is a real and ordinary case on a live chain.
    if (await isIndexedTransaction(hash)) {
      return { path: `/tx/${hash}`, label: 'Transaction', kind: 'Transaction' };
    }
    const tx = await publicClient.getTransaction({ hash }).catch(() => null);
    if (tx) return { path: `/tx/${hash}`, label: 'Transaction', kind: 'Transaction' };

    const block = await publicClient.getBlock({ blockHash: hash }).catch(() => null);
    if (block) return { path: `/blocks/${hash}`, label: `Block ${block.number?.toString() ?? ''}`, kind: 'Block' };

    if (await hasFileRecord(hash)) return { path: `/files/${hash}`, label: 'Piece commitment', kind: 'Piece' };
    if (await hasSector(hash)) return { path: withQuery('/storage/sectors', hash), label: 'Sector root', kind: 'Sector' };
    if (await hasDkgFileId(hash)) return { path: withQuery('/dkg', hash), label: 'DKG file ID', kind: 'DKG' };
    if (await hasAccessFileId(hash)) return { path: withQuery('/access', hash), label: 'Access file ID', kind: 'Access' };

    return { path: withQuery('/economics/files', hash), label: 'Economic file hash search', kind: 'Economics' };
  }

  return {
    path: withQuery('/files', q),
    label: 'Piece search',
    kind: 'Search',
  };
}
