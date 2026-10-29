import { cn } from '@/lib/utils';

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-[3px]' }[size];
  return (
    <div
      className={cn(
        'rounded-full border-bg-border border-t-ft-blue animate-spin',
        s,
        className
      )}
    />
  );
}

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-[#64748b]">
      <Spinner size="lg" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function ErrorState({ message, retry, detail }: { message: string; retry?: () => void; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-ft-red">
      <div className="text-4xl">⚠</div>
      <p className="text-sm text-center max-w-xs">{message}</p>
      {/* The reason, when there is one: "could not read" alone gives nobody
          anything to fix. */}
      {detail && <p className="text-xs text-center max-w-md text-[#94a3b8] break-words">{detail}</p>}
      {retry && (
        <button
          onClick={retry}
          className="text-xs px-4 py-1.5 rounded border border-ft-red/30 hover:bg-ft-red/10 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'No data found' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-[#64748b]">
      <div className="text-3xl opacity-40">○</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
