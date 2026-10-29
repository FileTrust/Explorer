'use client';

import { isValidElement, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner, EmptyState } from './Spinner';

type SortValue = string | number | bigint | boolean | Date | null | undefined;

export interface Column<T> {
  key: string;
  header: string;
  /** Unit shown on a second header line, so every cell need not repeat it. */
  unit?: string;
  cell: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => SortValue;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  /**
   * Fetch the next page from the server, for tables backed by a cursor.
   *
   * Keyset pagination cannot answer "how many pages are there" without counting
   * the whole table, which on a billion-row log is the query it exists to avoid.
   * So a table that pages on the server grows instead: the numbered pager still
   * moves through what has been loaded, and this brings more. `hasMore` is the
   * cursor being non-null -- the end of the data announces itself rather than
   * being calculated.
   */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /** Rows held server-side beyond what is loaded, when it is known. */
  totalHint?: number;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading,
  pageSize = 25,
  emptyMessage = 'No records found',
  onRowClick,
  className,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  totalHint,
}: DataTableProps<T>) {
  // `requestedPage` is what the reader asked for; `page` is what exists. They
  // differ when the row count shrinks under them -- a filter typed while sitting
  // on page five.
  const [requestedPage, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const column = columns.find(col => col.key === sortKey);
    if (!column) return data;

    return [...data].sort((a, b) => {
      const comparison = compareSortValues(getSortValue(a, column), getSortValue(b, column));
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [columns, data, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  // Clamped as it is read rather than corrected afterwards by an effect. The
  // effect version rendered the empty page first and the right one second, and
  // it wrote state during a render it was already part of.
  const page = Math.min(requestedPage, totalPages - 1);
  const pageStart = page * pageSize;
  const paged = sortedData.slice(pageStart, pageStart + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  function goToPage(nextPage: number) {
    if (!Number.isFinite(nextPage)) return;
    setPage(Math.min(totalPages - 1, Math.max(0, nextPage)));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      <div className="overflow-x-auto rounded-xl border border-bg-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border bg-bg-elevated">
              {columns.map(col => {
                const isSortable = col.sortable !== false;
                const isSorted = sortKey === col.key;

                return (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wider whitespace-nowrap select-none',
                    isSortable && 'cursor-pointer hover:text-[#94a3b8] transition-colors',
                    col.className
                  )}
                  onClick={isSortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="flex flex-col">
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {isSortable && (
                        isSorted
                          ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                          : <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </span>
                    {col.unit && (
                      <span className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-[#475569]">
                        {col.unit}
                      </span>
                    )}
                  </span>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border">
            {paged.map((row, rowIndex) => (
              <tr
                key={keyExtractor(row)}
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-bg-elevated'
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn('px-4 py-3 text-[#e2e8f0]', col.className)}>
                    {col.cell(row, pageStart + rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(totalPages > 1 || hasMore) && (
        <div className="flex flex-col gap-3 px-1 pt-3 text-sm text-[#64748b] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-3">
            <span>
              {pageStart + 1}–{Math.min(pageStart + pageSize, sortedData.length)} of{' '}
              {sortedData.length.toLocaleString()}
              {/* "loaded", not "total": with a cursor there is no total short of
                  counting the table, and claiming one would be a guess. */}
              {hasMore && ' loaded'}
              {hasMore && totalHint ? ` of ${totalHint.toLocaleString()}` : ''}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="rounded bg-bg-elevated px-2 py-1 text-xs text-[#94a3b8] hover:text-[#e2e8f0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              aria-label="First page"
              onClick={() => goToPage(0)}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <label className="flex items-center gap-1 rounded bg-bg-elevated px-2 py-1 text-xs text-[#94a3b8]">
              Page
              <input
                type="number"
                min={1}
                max={totalPages}
                value={page + 1}
                onChange={(event) => goToPage(Number(event.target.value) - 1)}
                className="h-6 w-14 rounded border border-bg-border bg-bg-surface px-2 text-center font-mono text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
              of {totalPages.toLocaleString()}
            </label>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Last page"
              onClick={() => goToPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getSortValue<T>(row: T, column: Column<T>): SortValue {
  if (column.sortValue) return column.sortValue(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (isSortValue(value) && value !== null && value !== undefined) return value;

  try {
    const cellText = extractNodeText(column.cell(row, 0));
    if (cellText) return cellText;
  } catch {
    // Fall back to object stringification if a custom cell cannot render outside table flow.
  }

  if (value === null || value === undefined) return value;
  return String(value);
}

function isSortValue(value: unknown): value is SortValue {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

function compareSortValues(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;

  if (typeof a === 'bigint' && typeof b === 'bigint') {
    return a > b ? 1 : a < b ? -1 : 0;
  }

  const left = normalizeSortValue(a);
  const right = normalizeSortValue(b);

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeSortValue(value: Exclude<SortValue, null | undefined>): string | number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function extractNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).filter(Boolean).join(' ');

  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    const value = props.value ?? props.label ?? props.title;
    if (isSortValue(value)) return String(value ?? '');
    return extractNodeText(props.children as React.ReactNode);
  }

  return '';
}
