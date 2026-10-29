'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { usePersistentFlag } from '@/lib/browserState';

const AUTO_REFRESH_KEY = 'filetrust-explorer-auto-refresh';
export const AUTO_REFRESH_INTERVAL_MS = 30_000;

type RefreshContextValue = {
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;
  refetchInterval: number | false;
};

const RefreshContext = createContext<RefreshContextValue | null>(null);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  // Read straight from the store rather than copied into state by an effect.
  // The `ready` flag this replaces existed only to stop the first write from
  // clobbering the saved value with the default before it had been read.
  const [autoRefresh, setAutoRefresh] = usePersistentFlag(AUTO_REFRESH_KEY, false);

  const value = useMemo<RefreshContextValue>(
    () => ({
      autoRefresh,
      toggleAutoRefresh: () => setAutoRefresh(current => !current),
      refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
    }),
    [autoRefresh, setAutoRefresh]
  );

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefreshControl() {
  const value = useContext(RefreshContext);
  if (!value) {
    throw new Error('useRefreshControl must be used within RefreshProvider');
  }
  return value;
}

export function useAutoRefreshInterval() {
  return useRefreshControl().refetchInterval;
}
