'use client';

import React, { useState } from 'react';
import { DebateSource } from '@/types/externalMarket';

interface ResearchSourcesProps {
  sources: DebateSource[];
  maxVisible?: number;
}

export function ResearchSources({
  sources,
  maxVisible = 5,
}: ResearchSourcesProps) {
  const [showAll, setShowAll] = useState(false);

  const visibleSources = showAll ? sources : sources.slice(0, maxVisible);

  const getRelevanceColor = (relevance: number) => {
    if (relevance >= 0.8) return 'bg-green-500/20 text-green-400';
    if (relevance >= 0.6) return 'bg-blue-500/20 text-blue-400';
    return 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div>
      <h4 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
        <span>📚</span> Sources Consulted
        <span className="text-sm text-gray-400 font-normal">
          ({sources.length})
        </span>
      </h4>

      <div className="space-y-2">
        {visibleSources.map((source, i) => (
          <a
            key={i}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-purple-400 text-sm font-medium group-hover:text-purple-300 truncate">
                  {source.title}
                </div>
                <div className="text-gray-400 text-xs mt-1 line-clamp-2">
                  {source.snippet}
                </div>
                <div className="text-gray-500 text-xs mt-1 truncate">
                  {(() => {
                    try {
                      return new URL(source.url).hostname.replace('www.', '');
                    } catch {
                      return source.url;
                    }
                  })()}
                </div>
              </div>
              <span
                className={`flex-shrink-0 px-2 py-0.5 rounded text-xs ${getRelevanceColor(
                  source.relevance
                )}`}
              >
                {Math.round(source.relevance * 100)}%
              </span>
            </div>
          </a>
        ))}
      </div>

      {sources.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full py-2 text-sm text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-purple-500/50 rounded-lg transition-colors"
        >
          {showAll ? 'Show fewer sources' : `Show ${sources.length - maxVisible} more sources`}
        </button>
      )}
    </div>
  );
}

export default ResearchSources;
