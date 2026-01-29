import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { ExternalMarketSelector } from './ExternalMarketSelector';
import { OracleSourceBadge, OutcomeBadge } from './ResolutionStatusBadge';

interface ExternalMarket {
  id: string;
  marketId: string;
  question: string;
  source: string;
  outcome?: string;
  resolvedAt?: string;
}

interface ScheduleResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (params: ScheduleParams) => Promise<void>;
  isScheduling?: boolean;
}

interface ScheduleParams {
  externalMarketId: string;
  mirrorKey?: string;
  scheduledTime: Date;
  oracleSource: 'polymarket' | 'kalshi' | 'internal';
}

export const ScheduleResolutionModal: React.FC<ScheduleResolutionModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  isScheduling = false,
}) => {
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [selectedMarket, setSelectedMarket] = useState<ExternalMarket | null>(null);
  const [oracleSource, setOracleSource] = useState<'polymarket' | 'kalshi' | 'internal'>('polymarket');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [mirrorKey, setMirrorKey] = useState<string>('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedMarketId('');
      setSelectedMarket(null);
      setOracleSource('polymarket');
      setScheduledTime('');
      setMirrorKey('');
      setConfirmed(false);
      setError(null);
    }
  }, [isOpen]);

  // Auto-detect oracle source from selected market
  useEffect(() => {
    if (selectedMarket) {
      const source = selectedMarket.source.toLowerCase();
      if (source === 'polymarket' || source === 'kalshi') {
        setOracleSource(source as 'polymarket' | 'kalshi');
      }
    }
  }, [selectedMarket]);

  // Set time presets
  const setTimePreset = (minutes: number) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutes);
    setScheduledTime(formatDateTimeLocal(date));
  };

  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Calculate time from now
  const getTimeFromNow = () => {
    if (!scheduledTime) return null;

    const scheduled = new Date(scheduledTime);
    const now = new Date();
    const diff = scheduled.getTime() - now.getTime();

    if (diff < 0) return 'In the past';

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} from now`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} from now`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} from now`;
    return 'Now';
  };

  // Form validation
  const isValid = () => {
    if (!selectedMarketId || !selectedMarket) {
      setError('Please select an external market');
      return false;
    }

    if (!scheduledTime) {
      setError('Please set a scheduled time');
      return false;
    }

    const scheduled = new Date(scheduledTime);
    if (scheduled < new Date()) {
      setError('Scheduled time must be in the future');
      return false;
    }

    if (!confirmed) {
      setError('Please confirm the resolution details');
      return false;
    }

    setError(null);
    return true;
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid()) return;

    try {
      const params: ScheduleParams = {
        externalMarketId: selectedMarketId,
        scheduledTime: new Date(scheduledTime),
        oracleSource,
      };

      if (mirrorKey) {
        params.mirrorKey = mirrorKey;
      }

      await onSchedule(params);
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!isOpen) return null;

  const timeFromNow = getTimeFromNow();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-purple-600" />
              <h2 className="text-2xl font-bold text-gray-900">Schedule Market Resolution</h2>
            </div>
            <button
              onClick={onClose}
              disabled={isScheduling}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Schedule automatic resolution of an external market on Flow blockchain
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Market Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              External Market *
            </label>
            <ExternalMarketSelector
              value={selectedMarketId}
              onChange={(id, market) => {
                setSelectedMarketId(id);
                setSelectedMarket(market);
              }}
              disabled={isScheduling}
              onlyResolved={false}
            />
            <p className="mt-1 text-xs text-gray-500">
              Select a resolved external market to schedule for on-chain resolution
            </p>
          </div>

          {/* Oracle Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Oracle Source *
            </label>
            <div className="flex gap-3">
              {(['polymarket', 'kalshi', 'internal'] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setOracleSource(source)}
                  disabled={isScheduling}
                  className={`
                    flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all
                    ${oracleSource === source
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'}
                  `}
                >
                  <OracleSourceBadge source={source} size="sm" />
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Auto-detected from selected market. Override if needed.
            </p>
          </div>

          {/* Scheduled Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scheduled Time *
            </label>

            {/* Time Presets */}
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => setTimePreset(5)}
                className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium"
              >
                5 minutes
              </button>
              <button
                type="button"
                onClick={() => setTimePreset(60)}
                className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium"
              >
                1 hour
              </button>
              <button
                type="button"
                onClick={() => setTimePreset(1440)}
                className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium"
              >
                1 day
              </button>
              <button
                type="button"
                onClick={() => setTimePreset(10080)}
                className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium"
              >
                1 week
              </button>
            </div>

            {/* DateTime Input */}
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              disabled={isScheduling}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />

            {timeFromNow && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-purple-500" />
                <span className="text-purple-700 font-medium">{timeFromNow}</span>
              </div>
            )}
          </div>

          {/* Mirror Key (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mirror Market Key (Optional)
            </label>
            <input
              type="text"
              value={mirrorKey}
              onChange={(e) => setMirrorKey(e.target.value)}
              disabled={isScheduling}
              placeholder="e.g., btc_100k_2024"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              If this market is mirrored on Flow, provide the mirror key for coordinated resolution
            </p>
          </div>

          {/* Preview */}
          {selectedMarket && scheduledTime && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Resolution Preview</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Market:</span>
                  <span className="font-medium text-gray-900 text-right">
                    {selectedMarket.question}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Source:</span>
                  <OracleSourceBadge source={oracleSource} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Outcome:</span>
                  <OutcomeBadge outcome={selectedMarket.outcome === 'YES'} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Scheduled:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(scheduledTime).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Gas Estimate:</span>
                  <span className="font-medium text-gray-900">~0.001 FLOW</span>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="confirm"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isScheduling}
              className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <label htmlFor="confirm" className="text-sm text-gray-700">
              I confirm that I want to schedule this resolution. The resolution will be executed
              automatically at the scheduled time using the outcome from the selected oracle source.
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isScheduling}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isScheduling || !confirmed}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {isScheduling ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Schedule Resolution
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
