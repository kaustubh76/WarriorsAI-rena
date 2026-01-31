import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Calendar, Clock, User, Hash, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { ResolutionStatusBadge, OracleSourceBadge, OutcomeBadge } from './ResolutionStatusBadge';
import type { ScheduledResolution } from '@/hooks/useScheduledResolutions';

interface ResolutionDetailsModalProps {
  resolutionId: string;
  isOpen: boolean;
  onClose: () => void;
  getResolution: (id: string) => Promise<ScheduledResolution | null>;
}

export const ResolutionDetailsModal: React.FC<ResolutionDetailsModalProps> = ({
  resolutionId,
  isOpen,
  onClose,
  getResolution,
}) => {
  const [resolution, setResolution] = useState<ScheduledResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && resolutionId) {
      fetchResolution();
    }
  }, [isOpen, resolutionId]);

  const fetchResolution = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getResolution(resolutionId);
      setResolution(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getExplorerUrl = (txHash: string) => {
    return `https://testnet.flowdiver.io/tx/${txHash}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50 sticky top-0">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Resolution Details</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <div>
                <div className="font-medium">Error loading resolution</div>
                <div className="text-sm">{error}</div>
              </div>
            </div>
          )}

          {!loading && !error && resolution && (
            <div className="space-y-6">
              {/* Market Information */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Info className="w-5 h-5 text-purple-600" />
                  Market Information
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-gray-500 mb-1">Question</div>
                    <div className="text-base text-gray-900">
                      {resolution.externalMarket?.question || 'Unknown Market'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">External Market ID</div>
                      <div className="text-sm font-mono text-gray-900 break-all">
                        {resolution.externalMarket?.externalId || resolution.externalMarketId}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Oracle Source</div>
                      <OracleSourceBadge source={resolution.oracleSource} />
                    </div>
                  </div>
                  {resolution.mirrorKey && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Mirror Market</div>
                      <div className="text-sm font-mono text-gray-900">
                        {resolution.mirrorKey}
                      </div>
                      {resolution.mirrorMarket && (
                        <div className="text-xs text-gray-600 mt-1">
                          {resolution.mirrorMarket.question}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Resolution Status */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-purple-600" />
                  Resolution Status
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Status</div>
                      <ResolutionStatusBadge status={resolution.status} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Outcome</div>
                      <OutcomeBadge outcome={resolution.outcome} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Flow Resolution ID</div>
                      <div className="text-sm font-mono text-gray-900">
                        #{resolution.flowResolutionId?.toString() || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Attempts</div>
                      <div className="text-sm text-gray-900">{resolution.attempts}</div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Timeline */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600" />
                  Timeline
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3 pb-3 border-b border-gray-200">
                    <Calendar className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Created</div>
                      <div className="text-sm text-gray-600">
                        {new Date(resolution.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 pb-3 border-b border-gray-200">
                    <Clock className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Scheduled Time</div>
                      <div className="text-sm text-gray-600">
                        {new Date(resolution.scheduledTime).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {resolution.executedAt && (
                    <div className="flex items-start gap-3 pb-3 border-b border-gray-200">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">Executed</div>
                        <div className="text-sm text-gray-600">
                          {new Date(resolution.executedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Last Updated</div>
                      <div className="text-sm text-gray-600">
                        {new Date(resolution.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Transactions */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-purple-600" />
                  Transactions
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {resolution.scheduleTransactionHash && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Schedule Transaction</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-mono text-gray-900 break-all flex-1">
                          {resolution.scheduleTransactionHash}
                        </div>
                        <a
                          href={getExplorerUrl(resolution.scheduleTransactionHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex-shrink-0"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}
                  {resolution.executeTransactionHash && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Execute Transaction</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-mono text-gray-900 break-all flex-1">
                          {resolution.executeTransactionHash}
                        </div>
                        <a
                          href={getExplorerUrl(resolution.executeTransactionHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex-shrink-0"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}
                  {!resolution.scheduleTransactionHash && !resolution.executeTransactionHash && (
                    <div className="text-sm text-gray-500 text-center py-2">
                      No transaction hashes available yet
                    </div>
                  )}
                </div>
              </section>

              {/* Creator */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-purple-600" />
                  Creator
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-mono text-gray-900 break-all">
                    {resolution.creator}
                  </div>
                </div>
              </section>

              {/* Error Details */}
              {resolution.status === 'failed' && resolution.lastError && (
                <section>
                  <h3 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Error Details
                  </h3>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="text-sm text-red-800 whitespace-pre-wrap">
                      {resolution.lastError}
                    </div>
                    <div className="mt-2 text-xs text-red-600">
                      Failed after {resolution.attempts} attempt{resolution.attempts !== 1 ? 's' : ''}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
