'use client';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export default function ExternalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} title="EXTERNAL MARKETS ERROR" backHref="/" backLabel="HOME" />;
}
