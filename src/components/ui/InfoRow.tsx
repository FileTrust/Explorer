'use client';

import { HelpButton } from '@/components/ui/HelpButton';

/// One labelled row of a detail card, with an optional "?" that explains it.
export function InfoRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-bg-border last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="flex w-44 shrink-0 items-center gap-1.5 text-xs text-[#64748b]">
        {help && <HelpButton title={label}>{help}</HelpButton>}
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm text-[#e2e8f0]">{children}</div>
    </div>
  );
}
