import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center space-y-4">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/5">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        Loading System State...
      </p>
    </div>
  );
}
