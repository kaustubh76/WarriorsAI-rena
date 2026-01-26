'use client';

/**
 * Skeleton Loading Components
 * Provides shimmer/pulse loading placeholders for better perceived performance
 */

import React from 'react';

interface SkeletonProps {
  className?: string;
  /** Width of the skeleton (CSS value or number for pixels) */
  width?: string | number;
  /** Height of the skeleton (CSS value or number for pixels) */
  height?: string | number;
  /** Whether to use pulse animation instead of shimmer */
  pulse?: boolean;
  /** Border radius (CSS value) */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

const roundedClasses = {
  none: 'rounded-none',
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

/**
 * Base skeleton component with shimmer animation
 * Uses the global .skeleton CSS class defined in globals.css for shimmer effect
 */
export function Skeleton({
  className = '',
  width,
  height,
  pulse = false,
  rounded = 'md',
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  // Use the global .skeleton class for shimmer, or Tailwind's animate-pulse
  const animationClass = pulse ? 'animate-pulse bg-gray-700' : 'skeleton';

  return (
    <div
      className={`${roundedClasses[rounded]} ${animationClass} ${className}`}
      style={style}
    />
  );
}

/**
 * Skeleton for text lines
 */
export function SkeletonText({
  lines = 1,
  className = '',
  lastLineWidth = '75%',
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={16}
          width={index === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
          rounded="sm"
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for avatar/profile images
 */
export function SkeletonAvatar({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      rounded="full"
      className={className}
    />
  );
}

/**
 * Skeleton for card components
 */
export function SkeletonCard({
  className = '',
  showImage = true,
  showAvatar = false,
  lines = 3,
}: {
  className?: string;
  showImage?: boolean;
  showAvatar?: boolean;
  lines?: number;
}) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-xl p-4 ${className}`}>
      {showImage && (
        <Skeleton height={160} className="mb-4" rounded="lg" />
      )}
      {showAvatar && (
        <div className="flex items-center gap-3 mb-4">
          <SkeletonAvatar size={48} />
          <div className="flex-1">
            <Skeleton height={16} width="60%" className="mb-2" />
            <Skeleton height={12} width="40%" />
          </div>
        </div>
      )}
      <SkeletonText lines={lines} />
    </div>
  );
}

/**
 * Skeleton for table rows
 */
export function SkeletonTableRow({
  columns = 4,
  className = '',
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-4 py-3">
          <Skeleton height={16} width={index === 0 ? '80%' : '60%'} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Skeleton for list items
 */
export function SkeletonListItem({
  showAvatar = true,
  className = '',
}: {
  showAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 p-3 ${className}`}>
      {showAvatar && <SkeletonAvatar size={40} />}
      <div className="flex-1">
        <Skeleton height={16} width="70%" className="mb-2" />
        <Skeleton height={12} width="50%" />
      </div>
      <Skeleton height={24} width={60} />
    </div>
  );
}

/**
 * Skeleton for stat cards
 */
export function SkeletonStatCard({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div className={`bg-gray-800/50 border border-gray-700 rounded-xl p-4 ${className}`}>
      <Skeleton height={14} width="60%" className="mb-3" />
      <Skeleton height={32} width="40%" className="mb-2" />
      <Skeleton height={12} width="30%" />
    </div>
  );
}

/**
 * Skeleton for leaderboard entries
 */
export function SkeletonLeaderboardEntry({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 p-4 bg-gray-800/30 rounded-lg ${className}`}>
      <Skeleton width={32} height={32} rounded="full" />
      <SkeletonAvatar size={48} />
      <div className="flex-1">
        <Skeleton height={16} width="40%" className="mb-2" />
        <Skeleton height={12} width="25%" />
      </div>
      <div className="text-right">
        <Skeleton height={16} width={80} className="mb-2" />
        <Skeleton height={12} width={60} />
      </div>
    </div>
  );
}

/**
 * Skeleton for market cards
 */
export function SkeletonMarketCard({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-xl p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <Skeleton height={20} width={80} rounded="full" />
        <Skeleton height={16} width={60} />
      </div>
      <Skeleton height={20} width="90%" className="mb-2" />
      <Skeleton height={20} width="70%" className="mb-4" />
      <div className="flex justify-between items-center mb-4">
        <div>
          <Skeleton height={12} width={40} className="mb-1" />
          <Skeleton height={24} width={60} />
        </div>
        <div>
          <Skeleton height={12} width={40} className="mb-1" />
          <Skeleton height={24} width={60} />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton height={40} className="flex-1" rounded="lg" />
        <Skeleton height={40} className="flex-1" rounded="lg" />
      </div>
    </div>
  );
}

/**
 * Skeleton for battle cards
 */
export function SkeletonBattleCard({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton height={20} width={100} rounded="full" />
        <Skeleton height={16} width={80} />
      </div>
      <Skeleton height={18} width="85%" className="mb-4" />
      <div className="flex items-center justify-between mb-4">
        <div className="text-center">
          <SkeletonAvatar size={64} className="mx-auto mb-2" />
          <Skeleton height={14} width={60} className="mx-auto" />
        </div>
        <Skeleton height={32} width={32} rounded="full" />
        <div className="text-center">
          <SkeletonAvatar size={64} className="mx-auto mb-2" />
          <Skeleton height={14} width={60} className="mx-auto" />
        </div>
      </div>
      <Skeleton height={40} rounded="lg" />
    </div>
  );
}

export default Skeleton;
