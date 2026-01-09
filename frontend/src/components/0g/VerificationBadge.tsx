'use client';

import React, { useState } from 'react';

export type VerificationType = 'teeml' | 'zkml' | 'none';

interface VerificationBadgeProps {
  isVerified: boolean;
  verificationType?: VerificationType;
  providerAddress?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-xs gap-1',
  md: 'px-2 py-1 text-xs gap-1.5',
  lg: 'px-3 py-1.5 text-sm gap-2'
};

const iconSizes = {
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
  lg: 'w-4 h-4'
};

export function VerificationBadge({
  isVerified,
  verificationType = 'none',
  providerAddress,
  size = 'sm',
  showTooltip = true,
  className = ''
}: VerificationBadgeProps) {
  const [showTooltipState, setShowTooltipState] = useState(false);

  const getStyles = () => {
    if (!isVerified) {
      return {
        bg: 'bg-gray-500/20',
        text: 'text-gray-400',
        border: 'border-gray-500/30',
        label: 'Unverified',
        icon: (
          <svg className={iconSizes[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
        tooltip: 'This prediction is not verified by 0G Compute Network'
      };
    }

    if (verificationType === 'teeml') {
      return {
        bg: 'bg-green-500/20',
        text: 'text-green-400',
        border: 'border-green-500/30',
        label: 'TEE Verified',
        icon: (
          <svg className={iconSizes[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
        tooltip: `Verified by Trusted Execution Environment${providerAddress ? ` • Provider: ${providerAddress.slice(0, 6)}...${providerAddress.slice(-4)}` : ''}`
      };
    }

    if (verificationType === 'zkml') {
      return {
        bg: 'bg-blue-500/20',
        text: 'text-blue-400',
        border: 'border-blue-500/30',
        label: 'ZK Verified',
        icon: (
          <svg className={iconSizes[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ),
        tooltip: `Zero-Knowledge Proof Verified${providerAddress ? ` • Provider: ${providerAddress.slice(0, 6)}...${providerAddress.slice(-4)}` : ''}`
      };
    }

    // Verified but no specific type
    return {
      bg: 'bg-purple-500/20',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      label: '0G Verified',
      icon: (
        <svg className={iconSizes[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      tooltip: `Verified by 0G Compute Network${providerAddress ? ` • Provider: ${providerAddress.slice(0, 6)}...${providerAddress.slice(-4)}` : ''}`
    };
  };

  const styles = getStyles();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => showTooltip && setShowTooltipState(true)}
      onMouseLeave={() => setShowTooltipState(false)}
    >
      <span
        className={`
          inline-flex items-center rounded-full font-medium border
          ${styles.bg} ${styles.text} ${styles.border}
          ${sizeClasses[size]}
          ${className}
        `}
      >
        {styles.icon}
        <span>{styles.label}</span>
      </span>

      {/* Tooltip */}
      {showTooltip && showTooltipState && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg border border-gray-700">
            {styles.tooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-800" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge for inline use (just icon + short label)
 */
export function VerificationBadgeCompact({
  isVerified,
  verificationType = 'none',
  className = ''
}: Pick<VerificationBadgeProps, 'isVerified' | 'verificationType' | 'className'>) {
  const getIcon = () => {
    if (!isVerified) {
      return (
        <span className="text-gray-400" title="Unverified">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
          </svg>
        </span>
      );
    }

    if (verificationType === 'teeml') {
      return (
        <span className="text-green-400" title="TEE Verified">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </span>
      );
    }

    if (verificationType === 'zkml') {
      return (
        <span className="text-blue-400" title="ZK Verified">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </span>
      );
    }

    return (
      <span className="text-purple-400" title="0G Verified">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  };

  return (
    <span className={`inline-flex items-center ${className}`}>
      {getIcon()}
    </span>
  );
}

export default VerificationBadge;
