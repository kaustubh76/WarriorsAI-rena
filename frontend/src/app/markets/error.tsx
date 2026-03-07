'use client';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export default function MarketsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} title="MARKET ERROR" backHref="/" backLabel="HOME" />;
}
