import { formatBytes } from '@/lib/utils';

interface LiveCapacitySummaryProps {
  activeCapacityBytes: bigint;
  freshCapacityBytes: bigint;
  registeredDataBytes: bigint;
  divergenceBytes: bigint;
}

function coveragePercent(fresh: bigint, total: bigint): string {
  if (total <= 0n) return '0%';
  const tenths = fresh >= total ? 1_000n : (fresh * 1_000n) / total;
  const whole = tenths / 10n;
  const fraction = tenths % 10n;
  return fraction === 0n ? `${whole}%` : `${whole}.${fraction}%`;
}

/** Customer-facing capacity proof summary for the live Explorer. */
export function LiveCapacitySummary({
  activeCapacityBytes,
  freshCapacityBytes,
  registeredDataBytes,
  divergenceBytes,
}: LiveCapacitySummaryProps) {
  const hasActiveCapacity = activeCapacityBytes > 0n;
  const hasProofLag = hasActiveCapacity && freshCapacityBytes < activeCapacityBytes;

  return (
    <div className="space-y-0.5 leading-4">
      {hasProofLag ? (
        <div className="truncate text-[#f59e0b]">
          {coveragePercent(freshCapacityBytes, activeCapacityBytes)} of active capacity current
        </div>
      ) : null}
      <div className={divergenceBytes > 0n ? 'truncate text-[#f59e0b]' : 'truncate'}>
        <span className="text-[#94a3b8]">Current Divergence</span>{' '}
        <span className="font-medium">{formatBytes(divergenceBytes)}</span>
      </div>
      <div className="truncate">
        <span className="text-[#94a3b8]">File pieces stored</span>{' '}
        <span className="font-medium text-[#cbd5e1]">{formatBytes(registeredDataBytes)}</span>
      </div>
    </div>
  );
}
