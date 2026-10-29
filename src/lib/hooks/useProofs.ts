'use client';

import { useEventCountsByName, usePagedEventRows } from '@/lib/hooks/useEventCounts';

export type ProofResult = 'submitted' | 'missed' | 'wrong';

export interface ProofEvent {
  type: ProofResult | 'challenge' | 'partition_challenge' | 'partition_proof' | 'sector_registered' | 'partition_registered' | 'config';
  key: `0x${string}`;
  vk: `0x${string}`;
  round?: bigint;
  deadline?: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  sectorId?: `0x${string}`;
  seed?: `0x${string}`;
  sectorCount?: bigint;
  deadlineIndex?: number;
  partitionIndex?: number;
  configLabel?: string;
}

/**
 * The totals beside the table, counted in the store.
 *
 * These used to be `.length` over the rows the table had downloaded, which made
 * the number and the fetch the same thing: to show "190 proofs" the browser had
 * to hold 190 proofs, and to show a million it would have had to hold a million.
 *
 * One request now returns every event count for the contract, grouped by name,
 * and the numbers stop depending on how much was fetched. If there is no store
 * to ask, it falls back to counting the rows in hand — a smaller number, but
 * from a screen that is honest about being unable to see further.
 */
/**
 * The proof table, a page at a time.
 *
 * The same rows the hook above builds, from the same events, but ordered and
 * paged by the store rather than fetched thirteen times and concatenated. Each
 * row is one event, so the store's ordered stream over several event names is
 * exactly this list.
 */
const PROOF_TABLE_EVENTS = [
  'SectorProofSubmitted', 'SectorProofMissed', 'WrongProofAttempted',
  'PartitionProofSubmitted', 'PartitionProofSubmittedDeterministic',
  'SectorRegistered', 'PartitionRegistered', 'ChallengeOpened',
  'ProofPeriodUpdated', 'VerifierUpdated', 'PartitionVerifierUpdated',
  'PartitionCircuitParamsUpdated', 'ReputationManagerSet',
] as const;

const ZERO_KEY = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

export function usePagedProofs(pageSize = 200) {
  return usePagedEventRows<ProofEvent>('StorageProofSC', PROOF_TABLE_EVENTS, (row) => {
    const a = (row.args ?? {}) as Record<string, any>;
    const base = {
      key: (a.sectorKey ?? a.partitionKey ?? ZERO_KEY) as `0x${string}`,
      vk: (a.vk ?? ZERO_ADDR) as `0x${string}`,
      sectorId: a.sectorId as `0x${string}` | undefined,
      round: a.round as bigint | undefined,
      seed: a.seed as `0x${string}` | undefined,
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
    };
    // A config row has no subject, so it carries a label instead of a key.
    const config = (configLabel: string, who?: unknown): ProofEvent => ({
      ...base, key: ZERO_KEY, vk: (who ?? ZERO_ADDR) as `0x${string}`, type: 'config', configLabel,
    });

    switch (row.name) {
      case 'SectorProofSubmitted': return { ...base, type: 'submitted' };
      case 'SectorProofMissed': return { ...base, type: 'missed' };
      case 'WrongProofAttempted': return { ...base, type: 'wrong' };
      case 'PartitionProofSubmitted':
      case 'PartitionProofSubmittedDeterministic':
        return { ...base, type: 'partition_proof' };
      case 'SectorRegistered': return { ...base, type: 'sector_registered' };
      case 'PartitionRegistered':
        return { ...base, type: 'partition_registered', sectorCount: a.sectorCount,
                 deadlineIndex: a.deadlineIndex, partitionIndex: a.partitionIndex };
      case 'ChallengeOpened': return { ...base, type: 'challenge', deadline: a.deadline };
      case 'ProofPeriodUpdated':
        return config(`ProofPeriod: ${a.proofPeriodSeconds}s / Deadline: ${a.proofDeadlineSeconds}s`);
      case 'VerifierUpdated': return config('Verifier Updated', a.verifier);
      case 'PartitionVerifierUpdated': return config('Partition Verifier Updated', a.partitionVerifier);
      case 'PartitionCircuitParamsUpdated':
        return config(`Circuit: ${a.partitionCircuitSectors} sectors / ${a.partitionCircuitChallenges} challenges`);
      case 'ReputationManagerSet': return config('Reputation Manager Set', a.reputationManager);
      // A name this screen does not render is not a blank row.
      default: return null;
    }
  }, pageSize);
}

export function useProofStats() {
  const { data: counts, isLoading } = useEventCountsByName('StorageProofSC');
  const n = (name: string) => counts?.[name] ?? 0;
  const sum = (...names: string[]) => names.reduce((t, name) => t + n(name), 0);

  const sectorSubmitted = n('SectorProofSubmitted');
  const partitionProofs = sum('PartitionProofSubmitted', 'PartitionProofSubmittedDeterministic');
  const missed = n('SectorProofMissed');
  const submitted = sectorSubmitted + partitionProofs;

  return {
    submitted, sectorSubmitted, missed, partitionProofs,
    wrong: n('WrongProofAttempted'),
    challenges: n('ChallengeOpened'),
    sectorRegistered: n('SectorRegistered'),
    partitionRegistered: n('PartitionRegistered'),
    configEvents: sum('ProofPeriodUpdated', 'VerifierUpdated', 'PartitionVerifierUpdated',
                      'PartitionCircuitParamsUpdated', 'ReputationManagerSet'),
    // Only the names this screen renders, so the total matches the table.
    total: sum(...PROOF_TABLE_EVENTS),
    successRate: submitted + missed > 0 ? Math.round((submitted / (submitted + missed)) * 100) : 0,
    isLoading,
  };
}
