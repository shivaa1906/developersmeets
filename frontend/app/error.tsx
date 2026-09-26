'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log client-side error securely
    console.error('Unhandled App Runtime Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-status-danger/30 bg-status-danger/10 text-status-danger">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <span className="mt-6 rounded-full border border-status-danger/20 bg-status-danger/5 px-3 py-1 text-xs font-mono font-medium text-status-danger">
        RUNTIME_EXCEPTION // 500
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        System Runtime Interruption
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        {error.message || 'An unexpected client runtime exception occurred during component render.'}
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-[11px] text-muted/60">
          Digest: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => reset()}
          variant="default"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Retry Request
        </Button>
        <Link href="/">
          <Button variant="secondary" size="sm" leftIcon={<Home className="h-4 w-4" />}>
            Platform Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
