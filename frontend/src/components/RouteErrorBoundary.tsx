'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  backHref: string;
  backLabel: string;
}

export function RouteErrorBoundary({ error, reset, title, backHref, backLabel }: RouteErrorBoundaryProps) {
  useEffect(() => {
    console.error(`[WarriorsAI-rena] ${title} error:`, error);
  }, [error, title]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">⚠️</div>
        <h2
          className="text-xl sm:text-2xl text-red-400 mb-3 tracking-wider"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          {title}
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Something went wrong loading this page. Please try again.
        </p>
        {error.digest && (
          <p className="text-gray-600 text-xs mb-4 font-mono">Error ID: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/50 text-yellow-300 rounded-lg transition-all text-sm"
            style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.7rem' }}
          >
            TRY AGAIN
          </button>
          <Link
            href={backHref}
            className="px-6 py-2.5 bg-slate-700/50 hover:bg-slate-700/70 border border-slate-600/50 text-slate-300 rounded-lg transition-all text-sm text-center"
            style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.7rem' }}
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
