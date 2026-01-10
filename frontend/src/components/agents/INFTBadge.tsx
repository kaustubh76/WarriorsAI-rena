/**
 * INFTBadge Component
 * Visual indicator showing that an agent is an iNFT with ERC-7857 features
 */

import React from 'react';

interface INFTBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 text-[10px]',
  md: 'w-5 h-5 text-xs',
  lg: 'w-6 h-6 text-sm',
};

const labelSizeClasses = {
  sm: 'text-[10px] ml-1',
  md: 'text-xs ml-1.5',
  lg: 'text-sm ml-2',
};

export function INFTBadge({
  size = 'md',
  showLabel = false,
  className = '',
}: INFTBadgeProps) {
  return (
    <div
      className={`inline-flex items-center ${className}`}
      title="Intelligent NFT (ERC-7857) - Encrypted AI agent with secure ownership transfer"
    >
      {/* iNFT Icon - Brain with blockchain pattern */}
      <div
        className={`
          ${sizeClasses[size]}
          relative flex items-center justify-center
          bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400
          rounded-md shadow-lg
          ring-1 ring-white/20
        `}
      >
        {/* Inner glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 rounded-md" />

        {/* Brain/AI icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative w-3/4 h-3/4 text-white drop-shadow-sm"
        >
          {/* Simplified brain shape */}
          <path d="M12 4.5c-1.5 0-2.5 1-3 2-1 0-2 .5-2.5 1.5-.5 1-.5 2 0 3-.5.5-1 1.5-.5 2.5s1.5 1.5 2.5 1.5c.5 1 1.5 2 3 2s2.5-1 3-2c1 0 2-.5 2.5-1.5s.5-2-.5-2.5c.5-1 .5-2 0-3-.5-1-1.5-1.5-2.5-1.5-.5-1-1.5-2-3-2z" />
          {/* Center connection */}
          <path d="M12 8v8" />
          <path d="M9 12h6" />
        </svg>

        {/* Animated pulse for active iNFTs */}
        <div className="absolute inset-0 rounded-md animate-pulse bg-white/10" />
      </div>

      {showLabel && (
        <span
          className={`
            ${labelSizeClasses[size]}
            font-semibold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400
            bg-clip-text text-transparent
          `}
        >
          iNFT
        </span>
      )}
    </div>
  );
}

/**
 * INFTBadge with tooltip showing features
 */
interface INFTBadgeWithTooltipProps extends INFTBadgeProps {
  features?: {
    encrypted?: boolean;
    hasAuthorizations?: boolean;
    pendingTransfer?: boolean;
  };
}

export function INFTBadgeWithTooltip({
  size = 'md',
  showLabel = false,
  className = '',
  features = {},
}: INFTBadgeWithTooltipProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <INFTBadge size={size} showLabel={showLabel} />

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[200px]">
            <div className="text-sm font-semibold text-white mb-2">
              Intelligent NFT (ERC-7857)
            </div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li className="flex items-center gap-2">
                <span className={features.encrypted ? 'text-green-400' : 'text-gray-500'}>
                  {features.encrypted ? '✓' : '○'}
                </span>
                Encrypted Metadata
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                Secure Re-encryption Transfer
              </li>
              <li className="flex items-center gap-2">
                <span className={features.hasAuthorizations ? 'text-green-400' : 'text-gray-500'}>
                  {features.hasAuthorizations ? '✓' : '○'}
                </span>
                Usage Authorizations
              </li>
              {features.pendingTransfer && (
                <li className="flex items-center gap-2">
                  <span className="text-yellow-400">⏳</span>
                  Transfer Pending
                </li>
              )}
            </ul>
            <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-500">
              AIverse Marketplace Compatible
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px]">
            <div className="border-8 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact iNFT indicator for cards
 */
export function INFTIndicator({ className = '' }: { className?: string }) {
  return (
    <div
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5
        bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20
        border border-purple-500/30 rounded
        ${className}
      `}
    >
      <div className="w-2 h-2 rounded-full bg-gradient-to-br from-purple-400 to-cyan-400" />
      <span className="text-[10px] font-medium text-purple-300">iNFT</span>
    </div>
  );
}

export default INFTBadge;
