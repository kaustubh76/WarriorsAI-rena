'use client';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export default function ArenaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} title="ARENA ERROR" backHref="/" backLabel="HOME" />;
}
