'use client';

import { formatFtu, formatFullFtu } from '@/lib/utils';
import { quoteFtuToUsdc, formatUsdc, useFtuPrice, weiToFtuNumber } from '@/lib/hooks/useFtuPrice';

export function FtuUsdc({
  amountFtu,
  amountWei,
  className = '',
}: {
  amountFtu?: number;
  amountWei?: bigint;
  className?: string;
}) {
  const { data } = useFtuPrice();
  const ftu = amountFtu ?? (amountWei !== undefined ? weiToFtuNumber(amountWei) : 0);
  const usdc = quoteFtuToUsdc(ftu, data);
  if (usdc === null || ftu === 0) return null;
  return (
    <span
      className={className || 'ml-1 text-xs font-normal text-[#64748b]'}
      title={data ? `1 FTU = ${data.price} USDC · ${data.dex.name}` : undefined}
    >
      ({formatUsdc(usdc)})
    </span>
  );
}

export function FtuAmount({
  wei,
  decimals = 4,
  approximate = false,
  className = '',
  usdcClassName,
  showUnit = true,
}: {
  wei: bigint;
  decimals?: number;
  approximate?: boolean;
  className?: string;
  usdcClassName?: string;
  /** Set false when the column header already says FTU. */
  showUnit?: boolean;
}) {
  return (
    <span className={className} title={formatFullFtu(wei)}>
      {formatFtu(wei, decimals, approximate, showUnit)}
      <FtuUsdc amountWei={wei} className={usdcClassName} />
    </span>
  );
}
