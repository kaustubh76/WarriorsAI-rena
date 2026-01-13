'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

interface WhaleTrade {
  id: string;
  source: string;
  marketId: string;
  marketQuestion: string;
  traderAddress?: string;
  side: 'buy' | 'sell';
  outcome: string;
  amountUsd: string;
  price: number;
  timestamp: number;
}

interface WhaleAlertDropdownProps {
  alerts: WhaleTrade[];
  onClose: () => void;
  onMarkRead: () => void;
}

function formatAmount(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getSourceBadgeColor(source: string): string {
  switch (source.toLowerCase()) {
    case 'polymarket':
      return 'bg-purple-500/20 text-purple-300';
    case 'kalshi':
      return 'bg-blue-500/20 text-blue-300';
    default:
      return 'bg-gray-500/20 text-gray-300';
  }
}

export function WhaleAlertDropdown({ alerts, onClose, onMarkRead }: WhaleAlertDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🐋</span>
          <h3 className="text-white font-medium">Whale Alerts</h3>
        </div>
        <Link
          href="/whale-tracker"
          className="text-blue-400 hover:text-blue-300 text-xs"
          onClick={onClose}
        >
          Settings
        </Link>
      </div>

      {/* Alerts List */}
      <div className="max-h-80 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="p-6 text-center">
            <span className="text-4xl block mb-2">🐋</span>
            <p className="text-gray-400 text-sm">No whale alerts yet</p>
            <p className="text-gray-500 text-xs mt-1">
              Large trades will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="px-4 py-3 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${getSourceBadgeColor(alert.source)}`}
                    >
                      {alert.source}
                    </span>
                    <span
                      className={`font-medium ${
                        alert.side === 'buy' ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {formatAmount(alert.amountUsd)}
                    </span>
                  </div>
                  <span className="text-gray-500 text-xs">
                    {formatTimeAgo(alert.timestamp)}
                  </span>
                </div>
                <p className="text-gray-300 text-sm line-clamp-2">
                  {alert.side === 'buy' ? 'Bought' : 'Sold'}{' '}
                  <span className={alert.outcome === 'yes' ? 'text-green-400' : 'text-red-400'}>
                    {alert.outcome.toUpperCase()}
                  </span>{' '}
                  on {alert.marketQuestion}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-gray-800/30">
        {alerts.length > 0 && (
          <button
            onClick={onMarkRead}
            className="text-gray-400 hover:text-gray-300 text-xs"
          >
            Mark all as read
          </button>
        )}
        <Link
          href="/whale-tracker"
          className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-lg text-xs transition-colors ml-auto"
          onClick={onClose}
        >
          View All Alerts →
        </Link>
      </div>
    </div>
  );
}

export default WhaleAlertDropdown;
