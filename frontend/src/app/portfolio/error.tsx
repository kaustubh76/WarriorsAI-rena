'use client';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export default function PortfolioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} title="PORTFOLIO ERROR" backHref="/" backLabel="HOME" />;
}
