'use client';

import React from 'react';

interface FallbackWarningBannerProps {
  isFallback: boolean;
  isVerified: boolean;
  className?: string;
  onDismiss?: () => void;
}

/**
 * Prominent warning banner displayed when AI predictions are in fallback/test mode
 * CRITICAL: This warns users that predictions cannot be used for on-chain trading
 */
export function FallbackWarningBanner({
  isFallback,
  isVerified,
  className = '',
  onDismiss
}: FallbackWarningBannerProps) {
  // Don't show if prediction is verified and not in fallback
  if (isVerified && !isFallback) {
    return null;
  }

  return (
    <div
      className={`
        relative p-4 rounded-lg border-2
        ${isFallback
          ? 'bg-red-500/10 border-red-500/50 text-red-300'
          : 'bg-yellow-500/10 border-yellow-500/50 text-yellow-300'
        }
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Warning Icon */}
        <div className={`flex-shrink-0 ${isFallback ? 'text-red-400' : 'text-yellow-400'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h4 className={`font-semibold text-sm ${isFallback ? 'text-red-300' : 'text-yellow-300'}`}>
            {isFallback ? 'Fallback Mode Active' : 'Prediction Not Verified'}
          </h4>
          <p className="text-sm mt-1 opacity-90">
            {isFallback ? (
              <>
                The 0G Compute Network is currently unavailable. This prediction was generated
                using a fallback provider and <strong>cannot be used for on-chain trading</strong>.
                The AI response has not been cryptographically verified.
              </>
            ) : (
              <>
                This prediction is not verified by the 0G Compute Network.
                <strong> Trading based on unverified predictions is disabled</strong> for your protection.
              </>
            )}
          </p>

          {/* Action hints */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`
              inline-flex items-center gap-1.5 px-2 py-1 rounded-full
              ${isFallback ? 'bg-red-500/20' : 'bg-yellow-500/20'}
            `}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Trading Disabled
            </span>
            <span className={`
              inline-flex items-center gap-1.5 px-2 py-1 rounded-full
              ${isFallback ? 'bg-red-500/20' : 'bg-yellow-500/20'}
            `}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Try Again Later
            </span>
          </div>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`
              flex-shrink-0 p-1 rounded-full transition-colors
              ${isFallback
                ? 'hover:bg-red-500/20 text-red-400'
                : 'hover:bg-yellow-500/20 text-yellow-400'
              }
            `}
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline warning for use in smaller spaces
 */
export function FallbackWarningInline({
  isFallback,
  isVerified,
  className = ''
}: Pick<FallbackWarningBannerProps, 'isFallback' | 'isVerified' | 'className'>) {
  if (isVerified && !isFallback) {
    return null;
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 text-xs font-medium
        ${isFallback ? 'text-red-400' : 'text-yellow-400'}
        ${className}
      `}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      {isFallback ? 'Fallback Mode - Trading Disabled' : 'Unverified - Trading Disabled'}
    </span>
  );
}

/**
 * Hook to manage warning banner dismissal state
 */
export function useFallbackWarning() {
  const [dismissed, setDismissed] = React.useState(false);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
  }, []);

  const reset = React.useCallback(() => {
    setDismissed(false);
  }, []);

  return { dismissed, dismiss, reset };
}

export default FallbackWarningBanner;
