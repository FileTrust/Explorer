'use client';

import { useState, type ReactNode } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpButtonProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function HelpButton({ title, children, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={`Explain ${title}`}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-bg-border bg-bg-elevated text-[#64748b] transition-colors hover:border-ft-blue/60 hover:text-ft-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-ft-blue/60"
      >
        <CircleHelp size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-bg-border bg-bg-surface p-3 text-left shadow-xl shadow-black/10">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</p>
            <button
              type="button"
              aria-label="Close help"
              onClick={() => setOpen(false)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--text-subtle)] transition-colors hover:bg-bg-elevated hover:text-[var(--text-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ft-blue/60"
            >
              <X size={12} />
            </button>
          </div>
          <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{children}</div>
        </div>
      )}
    </div>
  );
}
