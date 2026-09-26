import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-border bg-surface/30 p-12 text-center',
        className
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
      <p className="mt-4 text-xs font-medium text-muted tracking-wide">{message}</p>
    </div>
  );
};
