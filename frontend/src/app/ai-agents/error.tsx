'use client';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export default function AgentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} title="AGENT ERROR" backHref="/" backLabel="HOME" />;
}
