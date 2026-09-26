import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border border-accent/30 bg-accent/10 text-accent',
        secondary:
          'border border-border bg-surface-elevated text-foreground',
        outline:
          'border border-border text-muted',
        success:
          'border border-status-success/30 bg-status-success/10 text-status-success',
        warning:
          'border border-status-warning/30 bg-status-warning/10 text-status-warning',
        danger:
          'border border-status-danger/30 bg-status-danger/10 text-status-danger',
        electric:
          'border border-electric-purple/40 bg-electric-purple/10 text-electric-purple',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.2',
        default: 'text-xs px-2.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
