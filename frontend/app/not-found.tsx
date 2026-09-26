import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home, LayoutDashboard } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent shadow-accent-glow">
        <FileQuestion className="h-8 w-8" />
      </div>
      <span className="mt-6 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-mono font-medium text-accent">
        ERROR 404 // RESOURCE_NOT_FOUND
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        The requested endpoint or resource does not exist or has been moved within the platform directory.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/">
          <Button variant="default" size="sm" leftIcon={<Home className="h-4 w-4" />}>
            Return Home
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="secondary" size="sm" leftIcon={<LayoutDashboard className="h-4 w-4" />}>
            Platform Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
