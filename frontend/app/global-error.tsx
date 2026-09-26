'use client';

import * as React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('Fatal Global Layout Error:', error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#050505] text-[#FAFAFA] font-sans antialiased flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6 rounded-2xl border border-red-500/20 bg-[#0D0D0D] p-8 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Application Exception</h2>
            <p className="mt-2 text-xs text-gray-400">
              A critical failure prevented the application shell from rendering.
            </p>
          </div>
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-lg bg-[#00F0FF] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[#38BDF8]"
          >
            Reload Platform Shell
          </button>
        </div>
      </body>
    </html>
  );
}
