import { formatBytes } from '@/lib/utils';

interface TestCapacityProofBreakdownProps {
  provedCapacityBytes: bigint;
  checkpointDataBytes: bigint;
  provedFreeBytes: bigint;
  provedDataBytes: bigint;
  registeredDataBytes: bigint;
  quoteReservedBytes: bigint;
  conservativeAvailableBytes: bigint;
  activeEpochs: number;
  epochProvenPartitions: number;
  epochPartitions: number;
  freshProofVKs: number;
  capacityProofVKs: number;
  divergenceBytes: bigint;
  checkpointDriftBytes: bigint;
  latestProofAt: bigint;
  epochAborts: number;
  cutoffExclusions: number;
  cutoffExcludedBytes: bigint;
}

/**
 * TEST/DIAGNOSTIC VIEW ONLY.
 *
 * Retained for local storage-lifecycle certification runs. It intentionally
 * exposes per-run counters, VK counts, epoch internals, and full-checkpoint
 * drift. Production cards use LiveCapacitySummary instead.
 */
export function TestCapacityProofBreakdown({
  provedCapacityBytes,
  checkpointDataBytes,
  provedFreeBytes,
  provedDataBytes,
  registeredDataBytes,
  quoteReservedBytes,
  conservativeAvailableBytes,
  activeEpochs,
  epochProvenPartitions,
  epochPartitions,
  freshProofVKs,
  capacityProofVKs,
  divergenceBytes,
  checkpointDriftBytes,
  latestProofAt,
  epochAborts,
  cutoffExclusions,
  cutoffExcludedBytes,
}: TestCapacityProofBreakdownProps) {
  return (
    <div className="space-y-0.5 leading-4">
      <div className="truncate">
        <span className="text-[#94a3b8]">Latest complete proof</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(provedCapacityBytes)}</span>
        <span className="px-1 text-[#475569]">·</span>
        <span className="text-[#94a3b8]">snapshot stored</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(checkpointDataBytes)}</span>
      </div>
      <div className={divergenceBytes > 0n ? 'truncate text-[#f59e0b]' : 'truncate'}>
        <span className="text-[#94a3b8]">Exact-current proof divergence</span>{' '}
        <span className="font-medium">{formatBytes(divergenceBytes)}</span>
      </div>
      <div className="truncate">
        <span className="text-[#94a3b8]">Drift from full checkpoint</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(checkpointDriftBytes)}</span>
      </div>
      {latestProofAt > 0n ? (
        <div className="truncate text-[#94a3b8]">
          Last completed {new Date(Number(latestProofAt) * 1000).toLocaleString()}
        </div>
      ) : null}
      <div className="truncate">
        <span className="text-[#94a3b8]">Conservative free</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(conservativeAvailableBytes)}</span>
      </div>
      <div className="truncate">
        <span className="text-[#94a3b8]">Live registered stored</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(registeredDataBytes)}</span>
        {quoteReservedBytes > 0n ? (
          <>
            <span className="px-1 text-[#475569]">·</span>
            <span className="text-[#94a3b8]">reserved</span>{' '}
            <span className="font-medium text-[#cbd5e1]">{formatBytes(quoteReservedBytes)}</span>
          </>
        ) : null}
      </div>
      <div className="truncate">
        <span className="text-[#94a3b8]">Exact-current proved</span>{' '}
        <span className="font-medium text-[#cbd5e1]">
          {formatBytes(provedFreeBytes + provedDataBytes)}
        </span>
        <span className="px-1 text-[#475569]">·</span>
        <span className="text-[#94a3b8]">stored</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(provedDataBytes)}</span>
      </div>
      {capacityProofVKs > 0 && freshProofVKs < capacityProofVKs ? (
        <div className="truncate text-[#f59e0b]">
          Fresh proofs {freshProofVKs.toLocaleString()}/{capacityProofVKs.toLocaleString()} VKs
        </div>
      ) : null}
      {activeEpochs > 0 ? (
        <div className="truncate">
          <span className="text-[#94a3b8]">Proof epoch</span>{' '}
          <span className="font-medium text-[#cbd5e1]">
            {epochProvenPartitions.toLocaleString()}/{epochPartitions.toLocaleString()} partitions
          </span>
        </div>
      ) : null}
      {epochAborts > 0 || cutoffExclusions > 0 ? (
        <div className="truncate text-[#f59e0b]">
          {epochAborts.toLocaleString()} aborts · {cutoffExclusions.toLocaleString()} exclusions
          {cutoffExcludedBytes > 0n ? ` (${formatBytes(cutoffExcludedBytes)})` : ''}
        </div>
      ) : null}
    </div>
  );
}
