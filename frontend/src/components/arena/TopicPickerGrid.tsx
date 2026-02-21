'use client';

import { useState } from 'react';
import { Search, TrendingUp, Clock, DollarSign, BarChart3, Zap, ExternalLink } from 'lucide-react';
import { useCuratedTopics, type CuratedTopic } from '@/hooks/arena/useCuratedTopics';

const CATEGORIES = [
  { key: undefined, label: 'All' },
  { key: 'politics', label: 'Politics' },
  { key: 'economics', label: 'Economics' },
  { key: 'climate', label: 'Climate' },
  { key: 'science', label: 'Science' },
  { key: 'technology', label: 'Tech' },
  { key: 'crypto', label: 'Crypto' },
] as const;

interface TopicPickerGridProps {
  onSelectTopic: (topic: CuratedTopic) => void;
}

function formatVolume(volume: string): string {
  const num = parseFloat(volume.replace(/[$,]/g, ''));
  if (isNaN(num)) return volume;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatTimeLeft(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 30) return `${Math.floor(days / 30)}mo left`;
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours}h left`;
}

function getOddsColor(yesPrice: number): string {
  // Balanced odds (40-60%) = green, skewed = yellow/red
  const balance = Math.abs(yesPrice - 50);
  if (balance <= 10) return 'text-green-600';
  if (balance <= 25) return 'text-yellow-600';
  return 'text-orange-600';
}

function getSourceBadge(source: string) {
  if (source === 'polymarket') {
    return { label: 'Poly', color: 'bg-purple-100 text-purple-700' };
  }
  return { label: 'Kalshi', color: 'bg-blue-100 text-blue-700' };
}

export default function TopicPickerGrid({ onSelectTopic }: TopicPickerGridProps) {
  const {
    topics,
    loading,
    error,
    total,
    search,
    setCategory,
    searchQuery,
    categoryFilter,
  } = useCuratedTopics();

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Search + Category Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.label}
              onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === cat.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {!loading && (
          <p className="text-sm text-gray-500">
            {total} curated {total === 1 ? 'topic' : 'topics'} available for battle
          </p>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse bg-white">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-full mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="flex gap-2">
                <div className="h-8 bg-gray-200 rounded w-20" />
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && topics.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No curated topics found</p>
          <p className="text-gray-400 text-sm mt-1">
            Try adjusting your search or category filter
          </p>
        </div>
      )}

      {/* Topic Cards Grid */}
      {!loading && topics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic) => {
            const source = getSourceBadge(topic.source);
            const isHovered = hoveredId === topic.id;

            return (
              <div
                key={topic.id}
                onMouseEnter={() => setHoveredId(topic.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`border rounded-lg p-4 transition-all cursor-pointer bg-white ${
                  isHovered
                    ? 'border-blue-500 shadow-md scale-[1.01]'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
                onClick={() => onSelectTopic(topic)}
              >
                {/* Header: Source Badge + Category */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${source.color}`}>
                    {source.label}
                  </span>
                  {topic.category && (
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                      {topic.category}
                    </span>
                  )}
                </div>

                {/* Question */}
                <h3 className="text-sm font-medium text-gray-900 mb-3 line-clamp-2 min-h-[2.5rem]">
                  {topic.question}
                </h3>

                {/* Price Display */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">YES</p>
                    <p className={`text-lg font-bold ${getOddsColor(topic.yesPrice)}`}>
                      {topic.yesPrice.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">NO</p>
                    <p className="text-lg font-bold text-red-600">
                      {topic.noPrice.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    <span>{formatVolume(topic.volume)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimeLeft(topic.endTime)}</span>
                  </div>
                </div>

                {/* CTA */}
                {isHovered && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                      <Zap className="w-4 h-4" />
                      Create Battle
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
