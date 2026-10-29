'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Search, RefreshCw, Sun } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useChainStats } from '@/lib/hooks/useChainStats';
import { formatBlockNumber } from '@/lib/utils';
import { resolveGlobalSearch } from '@/lib/search';
import { AUTO_REFRESH_INTERVAL_MS, useRefreshControl } from '@/lib/refresh';
import { useTheme } from './Providers';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: stats } = useChainStats();
  const { theme, toggleTheme } = useTheme();
  const { autoRefresh, toggleAutoRefresh } = useRefreshControl();
  const themeLabel = theme === 'dark' ? 'light' : 'dark';

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    try {
      const result = await resolveGlobalSearch(q);
      if (result) {
        router.push(result.path);
        setSearchQuery('');
      } else {
        setSearchError('No match');
      }
    } catch {
      setSearchError('No match');
    } finally {
      setSearching(false);
    }
  }

  async function handleRefreshToggle() {
    const nextAutoRefresh = !autoRefresh;
    toggleAutoRefresh();
    if (nextAutoRefresh) {
      setRefreshing(true);
      await queryClient.invalidateQueries();
      setTimeout(() => setRefreshing(false), 800);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 px-6 py-3 bg-bg-surface/80 backdrop-blur-sm border-b border-bg-border">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xl">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
          <input
            type="text"
            maxLength={256}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setSearchError('');
            }}
            placeholder="Search tx, block, address, file, sector, DKG…"
            className="w-full bg-bg-elevated border border-bg-border rounded-lg pl-9 pr-20 py-2 text-sm text-[#e2e8f0] placeholder:text-[#64748b] focus:outline-none focus:border-ft-blue/50 transition-colors"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#64748b]">
            {searching ? 'Searching' : searchError}
          </span>
        </div>
      </form>

      {/* Stats row */}
      <div className="hidden md:flex items-center gap-4 text-xs text-[#64748b] shrink-0">
        {stats && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[#94a3b8]">Block</span>
              <span className="font-mono text-ft-blue">{formatBlockNumber(stats.blockNumber)}</span>
            </div>
            <div className="w-px h-4 bg-bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[#94a3b8]">Txs</span>
              <span className="font-semibold text-[#e2e8f0]">
                {stats.transactionCount === null ? '—' : stats.transactionCount.toLocaleString()}
              </span>
            </div>
            <div className="w-px h-4 bg-bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[#94a3b8]">Guardians</span>
              <span className="font-semibold text-[#e2e8f0]">{stats.guardianCount.toString()}</span>
            </div>
            <div className="w-px h-4 bg-bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[#94a3b8]">VKs</span>
              <span className="font-semibold text-[#e2e8f0]">{stats.vaultKeeperCount.toString()}</span>
            </div>
            <div className="w-px h-4 bg-bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[#94a3b8]">Files</span>
              <span className="font-semibold text-[#e2e8f0]">{stats.fileCount}</span>
            </div>
          </>
        )}
      </div>

      {/*
        The chosen theme is a fact only the browser holds, so the server cannot
        render this button's label, its pressed state, or its icon correctly --
        it has no way to know. Rendering the server's guess and then correcting
        it is a hydration mismatch, and it was a real one: opened with a saved
        light theme, React reported that attributes of the server HTML did not
        match the client.

        `suppressHydrationWarning` covers the attributes, which is what it is
        for. The icon is a child rather than an attribute, so it cannot be
        covered the same way -- both are rendered and CSS shows whichever the
        document's `data-theme` calls for. React then renders the same thing on
        both sides and the switch happens where it belongs, in the stylesheet.
      */}
      <button
        onClick={toggleTheme}
        suppressHydrationWarning
        title={`Switch to ${themeLabel} mode`}
        aria-label={`Switch to ${themeLabel} mode`}
        aria-pressed={theme === 'light'}
        className="p-2 rounded-lg bg-bg-elevated border border-bg-border hover:border-ft-blue/40 text-[#64748b] hover:text-ft-blue transition-all shrink-0"
      >
        <Sun size={14} className="hidden dark:block" />
        <Moon size={14} className="block dark:hidden" />
      </button>

      <button
        onClick={handleRefreshToggle}
        title={autoRefresh ? 'Auto-refresh on: every 30 seconds' : 'Auto-refresh off'}
        aria-label={autoRefresh ? 'Turn auto-refresh off' : 'Turn auto-refresh on'}
        aria-pressed={autoRefresh}
        className={`p-2 rounded-lg border transition-all shrink-0 ${
          autoRefresh
            ? 'bg-ft-blue/10 border-ft-blue/40 text-ft-blue'
            : 'bg-bg-elevated border-bg-border hover:border-ft-blue/40 text-[#64748b] hover:text-ft-blue'
        }`}
      >
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
      </button>
      <span className="hidden lg:inline text-[10px] text-[#64748b]">
        {autoRefresh ? `${AUTO_REFRESH_INTERVAL_MS / 1000}s auto` : 'auto off'}
      </span>
    </header>
  );
}
