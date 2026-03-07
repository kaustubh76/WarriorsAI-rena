'use client';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export default function LeaderboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary error={error} reset={reset} title="LEADERBOARD ERROR" backHref="/" backLabel="HOME" />;
}
