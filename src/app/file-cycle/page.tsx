'use client';

import { useMemo, useState } from 'react';
import { Route } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchBar } from '@/components/ui/SearchBar';
import { FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/Spinner';
import { FileCyclePanel } from '@/components/file-cycle/FileCyclePanel';
import { useFileLifecycle } from '@/lib/hooks/useFileLifecycle';
import { useEventCountsForNames, usePagedEventRows } from '@/lib/hooks/useEventCounts';
import { formatBlockNumber } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

type CycleOption = {
  fileId: `0x${string}`;
  source: 'policy' | 'piece';
  label: string;
  detail: string;
  blockNumber?: bigint;
};

const PICKER_EVENTS = ['FilePolicyCreated', 'FileStorageRegistered'] as const;
const isFullHash = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);

/// One policy creation or piece registration, as a choice in the picker.
function toOption(row: { name?: string; args?: Record<string, unknown>; blockNumber: string }): CycleOption | null {
  const a = (row.args ?? {}) as Record<string, any>;
  const blockNumber = BigInt(row.blockNumber ?? 0);
  if (row.name === 'FilePolicyCreated') {
    return {
      fileId: a.fileId,
      source: 'policy',
      label: 'File policy',
      detail: `T${a.threshold}/N${a.guardianCount} · owner ${String(a.dataOwner ?? '').slice(0, 10)}...`,
      blockNumber,
    };
  }
  if (row.name === 'FileStorageRegistered') {
    return {
      fileId: a.commitmentHash,
      source: 'piece',
      label: 'Registered piece',
      detail: `VK ${String(a.vkAddress ?? '').slice(0, 10)}...`,
      blockNumber,
    };
  }
  return null;
}

export default function FileCyclePage() {
  // The newest policies and pieces, a page at a time, as one stream. This used
  // to load every policy -- four node reads each -- and every piece, to offer
  // six of them.
  const picker = usePagedEventRows<CycleOption>(
    ['AccessControlFT', 'FileRegistrationSC'], PICKER_EVENTS, toOption, 200,
  );
  const totals = useEventCountsForNames([...PICKER_EVENTS]);
  const [search, setSearch] = useState('');
  // Seeded from ?fileId= when a link points at one piece.
  const [selected, setSelected] = useState<`0x${string}` | ''>(
    () => initialQueryParam('fileId') as `0x${string}` | '',
  );

  const options = useMemo(() => {
    // A policy wins over a piece with the same id, as before.
    const policyIds = new Set(picker.rows.filter(row => row.source === 'policy').map(row => row.fileId.toLowerCase()));
    const seen = new Set<string>();
    return picker.rows.filter(row => {
      const key = `${row.source}:${row.fileId.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return row.source === 'policy' || !policyIds.has(row.fileId.toLowerCase());
    });
  }, [picker.rows]);

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    const matches = options.filter(option =>
      option.fileId.toLowerCase().includes(q) ||
      option.label.toLowerCase().includes(q) ||
      option.detail.toLowerCase().includes(q)
    );
    // A whole id can be opened even when it is older than what is loaded.
    if (isFullHash(q) && !matches.some(option => option.fileId.toLowerCase() === q)) {
      matches.unshift({ fileId: q as `0x${string}`, source: 'piece', label: 'Open by id', detail: 'policy file id or piece commitment' });
    }
    return matches;
  }, [options, search]);

  const visibleOptions = search.trim() ? filteredOptions.slice(0, 16) : options.slice(0, 6);
  const selectedHash = selected || ZERO_HASH;
  const lifecycle = useFileLifecycle(selectedHash);
  const selectedOption = selected ? options.find(option => option.fileId.toLowerCase() === selected.toLowerCase()) : undefined;

  function choose(value: `0x${string}`) {
    setSelected(value);
    const params = new URLSearchParams(window.location.search);
    params.set('fileId', value);
    window.history.replaceState(null, '', `/file-cycle?${params.toString()}`);
  }

  if (picker.isLoading) return <LoadingState message="Loading file policies..." />;
  if (picker.error) {
    return <ErrorState message="Failed to load file policies and piece registrations" retry={() => { picker.refetch(); }} />;
  }
  if (options.length === 0 && !selected) return <EmptyState message="No file policies or piece registrations found" />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
        title="File Cycle"
        subtitle="Search a policy, file id, or registered piece, then build the full cycle"
        icon={Route}
        iconColor="text-ft-blue"
      />

      <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
        <label className="mb-1 block text-xs font-medium text-[#64748b]">Search file cycle</label>
        <SearchBar
          placeholder="Search policy id, file id, commitment hash, registered piece..."
          value={search}
          onChange={setSearch}
          className="w-full"
        />

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Policies', value: totals.data?.FilePolicyCreated ?? options.filter(o => o.source === 'policy').length, variant: 'purple' as const },
            { label: 'Registered Pieces', value: totals.data?.FileStorageRegistered ?? options.filter(o => o.source === 'piece').length, variant: 'blue' as const },
            { label: 'Search Results', value: filteredOptions.length, variant: 'cyan' as const },
            { label: 'Selected', value: selected ? 1 : 0, variant: selected ? 'green' as const : 'gray' as const },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2">
              <p className="text-xs text-[#64748b]">{item.label}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-lg font-semibold text-[#e2e8f0]">{item.value.toLocaleString()}</p>
                <Badge label={item.label} variant={item.variant} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              {search.trim() ? 'Matches' : 'Recent Items'}
            </p>
            <span className="text-xs text-[#64748b]">
              {visibleOptions.length.toLocaleString()} shown
              {search.trim() && picker.hasMore && (
                <>
                  {' · '}
                  <button type="button" className="text-ft-blue hover:underline" onClick={() => picker.loadMore()} disabled={picker.loadingMore}>
                    {picker.loadingMore ? 'searching older…' : 'search older items'}
                  </button>
                </>
              )}
            </span>
          </div>

          {visibleOptions.length === 0 ? (
            <div className="rounded-lg border border-bg-border bg-bg-elevated px-4 py-6 text-sm text-[#64748b]">
              No matching policy id, file id, or registered piece was found.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visibleOptions.map(option => {
                const active = selected.toLowerCase() === option.fileId.toLowerCase();
                return (
                  <div
                    key={`${option.source}-${option.fileId}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => choose(option.fileId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose(option.fileId);
                      }
                    }}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                      active
                        ? 'border-ft-blue/50 bg-ft-blue/10'
                        : 'border-bg-border bg-bg-elevated hover:border-ft-blue/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge label={option.source === 'policy' ? 'Policy' : 'Registered Piece'} variant={option.source === 'policy' ? 'purple' : 'blue'} dot />
                      {option.blockNumber && <span className="text-xs text-[#64748b]">{formatBlockNumber(option.blockNumber)}</span>}
                    </div>
                    <div className="mt-2">
                      <FullHash value={option.fileId} />
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">{option.label} · {option.detail}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#64748b]">
            {selectedOption && <Badge label={selectedOption.source === 'policy' ? 'Policy' : 'Piece'} variant={selectedOption.source === 'policy' ? 'purple' : 'blue'} dot />}
            <FullHash value={selectedHash} href={`/files/${selectedHash}`} />
            {selectedOption?.blockNumber && <span>Created {formatBlockNumber(selectedOption.blockNumber)}</span>}
            {selectedOption && <span>{selectedOption.detail}</span>}
          </div>
        )}
      </div>

      {!selected ? (
        <div className="rounded-xl border border-dashed border-bg-border bg-bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-[#e2e8f0]">No file cycle selected</p>
          <p className="mt-2 text-sm text-[#64748b]">
            Search a policy id, file id, or registered piece commitment above, then choose a result to build the cycle.
          </p>
        </div>
      ) : lifecycle.isLoading ? (
        <LoadingState message="Building file cycle..." />
      ) : lifecycle.error || !lifecycle.data ? (
        <ErrorState message="Could not build this file cycle" retry={lifecycle.refetch} />
      ) : (
        <FileCyclePanel data={lifecycle.data} commitmentHash={selectedHash} />
      )}
    </div>
  );
}
