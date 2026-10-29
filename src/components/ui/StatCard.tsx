import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HelpButton } from './HelpButton';

interface StatCardProps {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  trend?: { value: number; label: string };
  loading?: boolean;
  className?: string;
  help?: ReactNode;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-ft-blue',
  trend,
  loading,
  className,
  help,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-bg-surface border border-bg-border rounded-xl p-5 flex flex-col gap-3 hover:border-bg-hover transition-colors',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#64748b] font-medium">{title}</p>
        <div className="flex shrink-0 items-center gap-2">
          {Icon && (
            <div className={cn('p-2 rounded-lg bg-bg-elevated', iconColor.replace('text-', 'text-'))}>
              <Icon size={16} className={iconColor} />
            </div>
          )}
          {help && <HelpButton title={title}>{help}</HelpButton>}
        </div>
      </div>

      {loading ? (
        <div className="h-8 w-24 bg-bg-elevated rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-[#e2e8f0] tracking-tight">{value}</p>
      )}

      <div className="flex items-center gap-2 min-h-[20px]">
        {subtitle && <div className="min-w-0 text-xs text-[#64748b]">{subtitle}</div>}
        {trend && (
          <span
            className={cn(
              'text-xs font-medium ml-auto',
              trend.value >= 0 ? 'text-ft-green' : 'text-ft-red'
            )}
          >
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
