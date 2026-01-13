'use client';

import React, { useState } from 'react';
import { DebateRound, DebateAgentRole } from '@/types/externalMarket';

interface DebateRoundCardProps {
  round: DebateRound;
  compact?: boolean;
}

const roleConfig: Record<
  DebateAgentRole,
  {
    icon: string;
    label: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
  }
> = {
  bull: {
    icon: '🟢',
    label: 'Bull Agent',
    bgColor: 'bg-green-900/20',
    borderColor: 'border-green-500/50',
    textColor: 'text-green-400',
  },
  bear: {
    icon: '🔴',
    label: 'Bear Agent',
    bgColor: 'bg-red-900/20',
    borderColor: 'border-red-500/50',
    textColor: 'text-red-400',
  },
  neutral: {
    icon: '⚪',
    label: 'Neutral Agent',
    bgColor: 'bg-gray-900/40',
    borderColor: 'border-gray-500/50',
    textColor: 'text-gray-400',
  },
  supervisor: {
    icon: '👨‍⚖️',
    label: 'Supervisor',
    bgColor: 'bg-purple-900/20',
    borderColor: 'border-purple-500/50',
    textColor: 'text-purple-400',
  },
};

export function DebateRoundCard({ round, compact = false }: DebateRoundCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const config = roleConfig[round.agentRole];

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString();
  };

  const truncateArgument = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${config.bgColor} ${config.borderColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className={`font-medium ${config.textColor}`}>{config.label}</span>
          {round.roundNumber && (
            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded">
              Round {round.roundNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {round.confidence}% confident
          </span>
          {round.timestamp && (
            <span className="text-xs text-gray-600">
              {formatTimestamp(round.timestamp)}
            </span>
          )}
        </div>
      </div>

      {/* Argument */}
      <div className="text-gray-300 text-sm whitespace-pre-wrap">
        {compact && !isExpanded
          ? truncateArgument(round.argument)
          : round.argument}
      </div>

      {/* Expand/Collapse for compact mode */}
      {compact && round.argument.length > 150 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-purple-400 hover:text-purple-300"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Sources */}
      {round.sources && round.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {round.sources.map((source, i) => {
            let hostname = 'source';
            try {
              hostname = new URL(source).hostname.replace('www.', '');
            } catch {
              hostname = source.slice(0, 20);
            }
            return (
              <a
                key={i}
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 hover:text-white transition-colors"
              >
                {hostname}
              </a>
            );
          })}
        </div>
      )}

      {/* Confidence Bar */}
      <div className="mt-3">
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              round.agentRole === 'bull'
                ? 'bg-green-500'
                : round.agentRole === 'bear'
                ? 'bg-red-500'
                : round.agentRole === 'supervisor'
                ? 'bg-purple-500'
                : 'bg-gray-500'
            }`}
            style={{ width: `${round.confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default DebateRoundCard;
