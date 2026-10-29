import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'text-ft-blue',
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn('p-2.5 rounded-xl bg-bg-elevated border border-bg-border')}>
            <Icon size={20} className={iconColor} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-[#e2e8f0]">{title}</h1>
          {subtitle && <div className="text-sm text-[#64748b] mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, count, className }: { title: string; count?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 mb-3', className)}>
      <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">{title}</h2>
      {count !== undefined && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-bg-elevated border border-bg-border text-[#64748b]">
          {count.toLocaleString()}
        </span>
      )}
    </div>
  );
}
