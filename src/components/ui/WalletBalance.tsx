'use client';

import Link from 'next/link';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { useWalletBalance } from '@/lib/hooks/useEvmExplorer';

/** The wallet's free FTU beside a role's locked stake, and the way to the full address page. */
export function WalletBalanceRow({ address }: { address: `0x${string}` }) {
  const { data, isLoading, error } = useWalletBalance(address);
  return (
    <div>
      <dt className="text-xs text-[#64748b] mb-1">Wallet balance (free FTU)</dt>
      <dd className="flex flex-wrap items-center gap-3">
        {isLoading ? (
          <span className="text-xs text-[#64748b]">…</span>
        ) : error || data === undefined ? (
          <span className="text-xs text-ft-amber">unavailable</span>
        ) : (
          <FtuAmount wei={data} decimals={6} className="font-mono text-ft-green font-semibold" />
        )}
        <Link href={`/address/${address}`} className="text-xs text-ft-blue hover:underline">
          Wallet and all transactions →
        </Link>
        <Link href={`/address/${address}?tab=internal`} className="text-xs text-ft-blue hover:underline">
          Rewards and fees received →
        </Link>
      </dd>
    </div>
  );
}
