'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { GuardianShareProofABI } from '@/lib/abis/GuardianShareProof';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { useDistinctSubjects, useEventCountsByName, useEventCountsByArg, usePagedEventRows } from '@/lib/hooks/useEventCounts';
import { getIndexedLogs } from '@/lib/indexedLogs';

export interface GuardianProofEvent {
  type: 'submitted' | 'missed';
  policyId: `0x${string}`;
  keyEpoch: number;
  guardian: `0x${string}`;
  proofEpoch: bigint;
  valid?: boolean;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

function L(name: string) {
  return getIndexedLogs({
    address: CONTRACTS.GuardianShareProof,
    event: GuardianShareProofABI.find(e => e.name === name)! as any,
  }).catch(() => []);
}

export function useGuardianProofs() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['guardian-proofs'],
    queryFn: async (): Promise<GuardianProofEvent[]> => {
      const [submitted, missed] = await Promise.all([
        L('ShareProofSubmitted'),
        L('ShareProofMissed'),
      ]);

      const events: GuardianProofEvent[] = [];

      for (const l of submitted) {
        const a = (l as any).args;
        events.push({
          type: 'submitted',
          policyId: a.policyId,
          keyEpoch: Number(a.keyEpoch),
          guardian: a.guardian,
          proofEpoch: a.proofEpoch ?? 0n,
          valid: Boolean(a.valid),
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? '0x',
        });
      }

      for (const l of missed) {
        const a = (l as any).args;
        events.push({
          type: 'missed',
          policyId: a.policyId,
          keyEpoch: Number(a.keyEpoch),
          guardian: a.guardian,
          proofEpoch: a.proofEpoch ?? 0n,
          valid: false,
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? '0x',
        });
      }

      return events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}


const SHARE_PROOF_EVENTS = ['ShareProofSubmitted', 'ShareProofMissed'] as const;

/** The guardian proof table, a page at a time. Each row is one event, so the
 *  store's ordered stream over both names is exactly this list. */
export function usePagedGuardianProofs(pageSize = 200) {
  return usePagedEventRows<GuardianProofEvent>('GuardianShareProof', SHARE_PROOF_EVENTS, (row) => {
    const a = (row.args ?? {}) as Record<string, any>;
    if (row.name !== 'ShareProofSubmitted' && row.name !== 'ShareProofMissed') return null;
    const submitted = row.name === 'ShareProofSubmitted';
    return {
      type: submitted ? 'submitted' : 'missed',
      policyId: a.policyId as `0x${string}`,
      keyEpoch: Number(a.keyEpoch ?? 0),
      guardian: a.guardian as `0x${string}`,
      proofEpoch: (a.proofEpoch ?? 0n) as bigint,
      valid: submitted ? Boolean(a.valid) : false,
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
    };
  }, pageSize);
}

/**
 * The totals beside the table, counted in the store.
 *
 * Two things were wrong here. The counts were read under the names
 * `GuardianShareProofSubmitted` and `GuardianShareProofMissed`, which the
 * contract does not emit -- it emits `ShareProofSubmitted` and
 * `ShareProofMissed` -- so the store's counts never matched and the screen
 * silently fell back to counting downloaded rows every time. And the valid /
 * invalid split was a ratio measured on those rows and scaled up to the total,
 * which the store can now answer exactly by grouping on the argument.
 */
export function useGuardianProofStats() {
  const { data: counts } = useEventCountsByName('GuardianShareProof');
  const { data: byValid } = useEventCountsByArg('GuardianShareProof', 'valid', ['ShareProofSubmitted']);
  const { data: distinctGuardians } = useDistinctSubjects('subject_addr', {
    contract: 'GuardianShareProof',
  });

  const submitted = counts?.ShareProofSubmitted ?? 0;
  const missed = counts?.ShareProofMissed ?? 0;

  // The store spells booleans as their JSON text.
  const valid = byValid ? (byValid['true'] ?? 0) : 0;
  const invalid = byValid ? submitted - valid : 0;

  const successRate = submitted + missed > 0
    ? Math.round((valid / (submitted + missed)) * 100)
    : 0;
  const uniqueGuardians = distinctGuardians ?? 0;
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;

  return {
    submitted, missed, valid, invalid, successRate, uniqueGuardians, total,
    isLoading: counts === undefined,
  };
}
