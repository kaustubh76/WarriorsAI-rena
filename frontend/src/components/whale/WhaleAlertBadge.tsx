'use client';

import React from 'react';

interface WhaleAlertBadgeProps {
  count: number;
  hasNew: boolean;
  onClick: () => void;
}

export function WhaleAlertBadge({ count, hasNew, onClick }: WhaleAlertBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
      title={`${count} whale alert${count !== 1 ? 's' : ''}`}
    >
      {/* Whale Icon */}
      <span className={`text-xl ${hasNew ? 'animate-bounce' : ''}`}>
        🐋
      </span>

      {/* Badge Count */}
      {count > 0 && (
        <span
          className={`
            absolute -top-1 -right-1
            min-w-[18px] h-[18px]
            flex items-center justify-center
            text-[10px] font-bold
            rounded-full
            ${hasNew
              ? 'bg-blue-500 text-white animate-pulse'
              : 'bg-gray-600 text-gray-200'
            }
          `}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}

      {/* Pulse ring for new alerts */}
      {hasNew && (
        <span className="absolute inset-0 rounded-lg bg-blue-400/20 animate-ping" />
      )}
    </button>
  );
}

export default WhaleAlertBadge;
