import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ExternalLink, Play, X, Info, AlertTriangle } from 'lucide-react';
import { ResolutionStatusBadge, OracleSourceBadge, OutcomeBadge } from './ResolutionStatusBadge';
import type { ScheduledResolution } from '@/hooks/useScheduledResolutions';

interface ScheduledResolutionCardProps {
  resolution: ScheduledResolution;
  onExecute?: (id: string) => void;
  onCancel?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  isExecuting?: boolean;
  isCancelling?: boolean;
}

export const ScheduledResolutionCard: React.FC<ScheduledResolutionCardProps> = ({
  resolution,
  onExecute,
  onCancel,
  onViewDetails,
  isExecuting = false,
  isCancelling = false,
}) => {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  // Calculate time remaining and progress
  useEffect(() => {
    const updateTime = () => {
      const now = new Date().getTime();
      const scheduled = new Date(resolution.scheduledTime).getTime();
      const created = new Date(resolution.createdAt).getTime();
      const diff = scheduled - now;

      if (diff <= 0) {
        setTimeRemaining('Ready now');
        setProgress(100);
        return;
      }

      // Calculate progress
      const totalDuration = scheduled - created;
      const elapsed = now - created;
      const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      setProgress(progressPercent);

      // Format time remaining
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${seconds}s`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [resolution.scheduledTime, resolution.createdAt]);

  // Determine if resolution is ready
  const now = new Date();
  const isReady = resolution.status === 'pending' && new Date(resolution.scheduledTime) <= now;
  const isPending = resolution.status === 'pending' && !isReady;
  const isCompleted = resolution.status === 'completed';
  const isFailed = resolution.status === 'failed';
  const isCancelled = resolution.status === 'cancelled';

  // Format dates
  const scheduledDate = new Date(resolution.scheduledTime).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const executedDate = resolution.executedAt
    ? new Date(resolution.executedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  // Flow testnet explorer URL
  const getExplorerUrl = (txHash: string) => {
    return `https://testnet.flowdiver.io/tx/${txHash}`;
  };

  return (
    <div
      className={`
        bg-white rounded-lg border-2 shadow-md hover:shadow-lg transition-all duration-300
        ${isReady ? 'border-green-400 ring-2 ring-green-200 animate-pulse-slow' : 'border-gray-200'}
        ${isFailed ? 'border-red-300' : ''}
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate mb-2">
              {resolution.externalMarket?.question || 'Unknown Market'}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <ResolutionStatusBadge status={resolution.status} size="sm" />
              <OracleSourceBadge source={resolution.oracleSource} size="sm" />
              {(isCompleted || isFailed) && resolution.outcome !== undefined && (
                <OutcomeBadge outcome={resolution.outcome} size="sm" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Market Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              Market: {resolution.externalMarket?.marketId || resolution.externalMarketId}
            </span>
          </div>

          {resolution.mirrorKey && (
            <div className="flex items-center gap-2 text-gray-600">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Mirror: {resolution.mirrorKey}</span>
            </div>
          )}
        </div>

        {/* Scheduled Time */}
        <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
          <Calendar className="w-4 h-4 flex-shrink-0 text-purple-500" />
          <div className="flex-1">
            <div className="font-medium">Scheduled: {scheduledDate}</div>
            {isPending && (
              <div className="text-xs text-gray-500 mt-1">
                <Clock className="w-3 h-3 inline mr-1" />
                {timeRemaining} remaining
              </div>
            )}
            {isReady && (
              <div className="text-xs text-green-600 font-medium mt-1 animate-pulse">
                Ready to execute now!
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar (for pending resolutions) */}
        {isPending && (
          <div className="space-y-1">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 text-right">{Math.round(progress)}% elapsed</div>
          </div>
        )}

        {/* Execution Info */}
        {isCompleted && executedDate && (
          <div className="text-sm text-gray-600 bg-green-50 p-3 rounded-lg">
            <div className="font-medium text-green-700">
              Executed: {executedDate}
            </div>
            {resolution.executeTransactionHash && (
              <a
                href={getExplorerUrl(resolution.executeTransactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1 mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                View Transaction
              </a>
            )}
          </div>
        )}

        {/* Error Info */}
        {isFailed && resolution.lastError && (
          <div className="text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-red-700">Execution Failed</div>
                <div className="text-red-600 text-xs mt-1">{resolution.lastError}</div>
                <div className="text-gray-500 text-xs mt-1">Attempts: {resolution.attempts}</div>
              </div>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="pt-3 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div>
              <span className="font-medium">Resolution ID:</span>{' '}
              <span className="font-mono">#{resolution.flowResolutionId.toString()}</span>
            </div>
            <div className="truncate">
              <span className="font-medium">Creator:</span>{' '}
              <span className="font-mono text-xs">{resolution.creator.slice(0, 10)}...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-2">
        {isReady && onExecute && (
          <button
            onClick={() => onExecute(resolution.id)}
            disabled={isExecuting}
            className="flex-1 min-w-[120px] px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {isExecuting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Execute Now
              </>
            )}
          </button>
        )}

        {isPending && onCancel && (
          <button
            onClick={() => onCancel(resolution.id)}
            disabled={isCancelling}
            className="flex-1 min-w-[120px] px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {isCancelling ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                Cancel
              </>
            )}
          </button>
        )}

        {onViewDetails && (
          <button
            onClick={() => onViewDetails(resolution.id)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Info className="w-4 h-4" />
            Details
          </button>
        )}

        {resolution.scheduleTransactionHash && (
          <a
            href={getExplorerUrl(resolution.scheduleTransactionHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View TX
          </a>
        )}
      </div>
    </div>
  );
};
