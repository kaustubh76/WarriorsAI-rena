'use client';

import React from 'react';
import { MarketSource } from '@/types/externalMarket';

interface MarketSourceFilterProps {
  selected: MarketSource | 'all';
  onChange: (source: MarketSource | 'all') => void;
  counts?: {
    all?: number;
    polymarket?: number;
    kalshi?: number;
    native?: number;
  };
  showNative?: boolean;
}

export function MarketSourceFilter({
  selected,
  onChange,
  counts,
  showNative = false,
}: MarketSourceFilterProps) {
  const sources: { value: MarketSource | 'all'; label: string; icon: string }[] = [
    { value: 'all', label: 'All Markets', icon: '🌐' },
    { value: MarketSource.POLYMARKET, label: 'Polymarket', icon: '🔮' },
    { value: MarketSource.KALSHI, label: 'Kalshi', icon: '📊' },
  ];

  if (showNative) {
    sources.splice(1, 0, { value: MarketSource.NATIVE, label: 'Native', icon: '🏆' });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sources.map(({ value, label, icon }) => {
        const isSelected = selected === value;
        const count =
          value === 'all'
            ? counts?.all
            : value === MarketSource.POLYMARKET
            ? counts?.polymarket
            : value === MarketSource.KALSHI
            ? counts?.kalshi
            : counts?.native;

        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
              ${
                isSelected
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }
            `}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {count !== undefined && (
              <span
                className={`
                  px-2 py-0.5 text-xs rounded-full
                  ${isSelected ? 'bg-white/20' : 'bg-gray-700'}
                `}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface MarketSourceTabsProps {
  selected: MarketSource | 'all';
  onChange: (source: MarketSource | 'all') => void;
  counts?: {
    all?: number;
    polymarket?: number;
    kalshi?: number;
  };
}

export function MarketSourceTabs({
  selected,
  onChange,
  counts,
}: MarketSourceTabsProps) {
  const tabs = [
    { value: 'all' as const, label: 'All', count: counts?.all },
    { value: MarketSource.POLYMARKET, label: 'Polymarket', count: counts?.polymarket },
    { value: MarketSource.KALSHI, label: 'Kalshi', count: counts?.kalshi },
  ];

  return (
    <div className="border-b border-gray-700">
      <nav className="flex gap-4" aria-label="Tabs">
        {tabs.map(({ value, label, count }) => {
          const isSelected = selected === value;

          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              className={`
                relative py-3 px-1 font-medium text-sm transition-colors
                ${
                  isSelected
                    ? 'text-purple-400'
                    : 'text-gray-400 hover:text-gray-200'
                }
              `}
            >
              <span className="flex items-center gap-2">
                {label}
                {count !== undefined && (
                  <span
                    className={`
                      px-2 py-0.5 text-xs rounded-full
                      ${isSelected ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700 text-gray-400'}
                    `}
                  >
                    {count}
                  </span>
                )}
              </span>
              {isSelected && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default MarketSourceFilter;
