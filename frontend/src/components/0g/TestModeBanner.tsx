'use client';

import React, { useState, useEffect } from 'react';
import { useTestMode } from '@/contexts/TestModeContext';
import { usePathname } from 'next/navigation';

interface TestModeBannerProps {
  className?: string;
}

// Pages where the warning is most critical
const CRITICAL_PAGES = ['/markets', '/ai-agents', '/social/copy-trading', '/portfolio'];

export function TestModeBanner({ className = '' }: TestModeBannerProps) {
  const { isTestMode, lastInferenceVerified, isChecking } = useTestMode();
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  // Check if we're on a critical page
  const isCriticalPage = CRITICAL_PAGES.some(page => pathname?.startsWith(page));

  // Reset dismissed state when navigating to critical pages
  useEffect(() => {
    if (isCriticalPage) {
      setDismissed(false);
    }
  }, [pathname, isCriticalPage]);

  // Don't show if not in test mode
  if (!isTestMode || isChecking) {
    return null;
  }

  // Don't show if dismissed (unless on critical page)
  if (dismissed && !isCriticalPage) {
    return null;
  }

  return (
    <div className={`bg-yellow-500/10 border-b border-yellow-500/30 ${className}`}>
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-yellow-300 text-sm font-medium">
                TEST MODE: 0G Compute Network unavailable
              </p>
              <p className="text-yellow-400/70 text-xs">
                AI predictions are not verified. On-chain trading is disabled for safety.
                {!lastInferenceVerified && (
                  <span className="ml-2 text-red-400">
                    • Last inference was unverified
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Learn More Link */}
            <a
              href="https://docs.0g.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-yellow-400 hover:text-yellow-300 underline"
            >
              Learn More
            </a>

            {/* Dismiss Button (only on non-critical pages) */}
            {!isCriticalPage && (
              <button
                onClick={() => setDismissed(true)}
                className="text-yellow-400 hover:text-yellow-300 p-1"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline warning badge for use within components
 */
export function TestModeWarning({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { isTestMode } = useTestMode();

  if (!isTestMode) {
    return null;
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 bg-yellow-500/20 text-yellow-400 rounded-full ${sizeClasses[size]}`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      Test Mode
    </span>
  );
}

export default TestModeBanner;
