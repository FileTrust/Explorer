import { cn } from '@/lib/utils';

type Variant = 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'gray';

const variantClass: Record<Variant, string> = {
  green:  'bg-ft-green/10 text-ft-green border-ft-green/20',
  red:    'bg-ft-red/10 text-ft-red border-ft-red/20',
  amber:  'bg-ft-amber/10 text-ft-amber border-ft-amber/20',
  blue:   'bg-ft-blue/10 text-ft-blue border-ft-blue/20',
  purple: 'bg-ft-purple/10 text-ft-purple border-ft-purple/20',
  cyan:   'bg-ft-cyan/10 text-ft-cyan border-ft-cyan/20',
  gray:   'bg-bg-elevated text-[#94a3b8] border-bg-border',
};

interface BadgeProps {
  label: string;
  variant?: Variant;
  dot?: boolean;
  className?: string;
}

export function Badge({ label, variant = 'gray', dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        variantClass[variant],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', {
          'bg-ft-green': variant === 'green',
          'bg-ft-red': variant === 'red',
          'bg-ft-amber': variant === 'amber',
          'bg-ft-blue': variant === 'blue',
          'bg-ft-purple': variant === 'purple',
          'bg-ft-cyan': variant === 'cyan',
          'bg-[#94a3b8]': variant === 'gray',
        })} />
      )}
      {label}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge label={active ? 'Active' : 'Inactive'} variant={active ? 'green' : 'gray'} dot />;
}
