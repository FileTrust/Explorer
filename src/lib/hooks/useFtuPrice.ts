'use client';

import { useQuery } from '@tanstack/react-query';
import { useAutoRefreshInterval } from '@/lib/refresh';

export interface FtuQuote {
  schema: string;
  source: string;
  chainId: number;
  pair: string;
  dex: {
    name: string;
    factoryAddress: string;
    routerAddress: string;
    pairAddress: string;
  };
  baseToken: {
    symbol: string;
    name?: string;
    address: string;
    decimals: number;
  };
  quoteToken: {
    symbol: string;
    name?: string;
    address: string;
    decimals: number;
  };
  amountIn: string;
  amountOut: string;
  price: string;
  inversePrice: string;
  priceImpactBps: string;
  route: Array<Record<string, string>>;
  updatedAt: string;
  servedAt: string;
  ttlSeconds: number;
}

/**
 * Where the browser asks for a price: the Explorer's own origin.
 *
 * It used to be the price service directly, at whatever
 * `NEXT_PUBLIC_FTU_PRICE_URL` held -- and that value is baked into the bundle at
 * build time, so every browser got the same one. `127.0.0.1:8787` is right on
 * the machine running the stack and wrong everywhere else, because in a browser
 * that address means the computer the browser is on. Opened from a second
 * machine, the Explorer asked *it* for a price service it does not run.
 *
 * Relative, so it follows the Explorer wherever it is reached from. The upstream
 * address still comes from the environment, on the server, where it means what
 * it says.
 */
export function ftuPriceUrl(): string {
  return '/api/ftu-price';
}

export function useFtuPrice() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['ftu-price'],
    queryFn: async (): Promise<FtuQuote> => {
      const url = new URL(ftuPriceUrl(), window.location.origin);
      url.searchParams.set('base', 'FTU');
      url.searchParams.set('quote', 'USDC');
      url.searchParams.set('amount', '1');
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error(`FTU price feed returned HTTP ${response.status}`);
      return response.json();
    },
    refetchInterval,
    staleTime: 25_000,
    retry: 1,
  });
}

export function weiToFtuNumber(wei: bigint): number {
  return Number(wei) / 1e18;
}

export function quoteFtuToUsdc(amountFtu: number, quote?: FtuQuote): number | null {
  const price = Number(quote?.price);
  if (!Number.isFinite(amountFtu) || !Number.isFinite(price) || price <= 0) return null;
  return amountFtu * price;
}

export function formatUsdc(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs === 0 ? 2 : abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USDC`;
}

export function formatFtuPrice(quote?: FtuQuote): string {
  const price = Number(quote?.price);
  if (!Number.isFinite(price) || price <= 0) return '—';
  return `${formatUsdc(price)} / FTU`;
}
