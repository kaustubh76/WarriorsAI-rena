'use client';

import React, { useState } from 'react';
import { RefreshCw, Plus, Search, Filter, Clock, CheckCircle, AlertTriangle, XCircle, Sparkles, TrendingUp, Zap, Shield } from 'lucide-react';
import { useScheduledResolutions } from '@/hooks/useScheduledResolutions';
import { ScheduledResolutionCard } from '@/components/flow/ScheduledResolutionCard';
import { ScheduleResolutionModal } from '@/components/flow/ScheduleResolutionModal';
import { ResolutionDetailsModal } from '@/components/flow/ResolutionDetailsModal';

type StatusFilter = 'all' | 'pending' | 'ready' | 'executing' | 'completed' | 'failed';

export default function FlowScheduledResolutionsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedResolutionId, setSelectedResolutionId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const {
    resolutions,
    pendingResolutions,
    readyResolutions,
    executingResolutions,
    completedResolutions,
    failedResolutions,
    stats,
    loading,
    scheduling,
    error,
    refresh,
    scheduleResolution,
    executeResolution,
    cancelResolution,
    getResolution,
  } = useScheduledResolutions();

  // Filter resolutions based on selected filter
  const getFilteredResolutions = () => {
    let filtered = resolutions;

    switch (statusFilter) {
      case 'pending':
        filtered = pendingResolutions;
        break;
      case 'ready':
        filtered = readyResolutions;
        break;
      case 'executing':
        filtered = executingResolutions;
        break;
      case 'completed':
        filtered = completedResolutions;
        break;
      case 'failed':
        filtered = failedResolutions;
        break;
      default:
        filtered = resolutions;
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(r =>
        r.externalMarket?.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.externalMarketId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.mirrorKey?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  };

  const filteredResolutions = getFilteredResolutions();

  // Handle actions
  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      await executeResolution(id);
    } finally {
      setExecutingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelResolution(id);
    } finally {
      setCancellingId(null);
    }
  };

  const handleSchedule = async (params: any) => {
    await scheduleResolution(params);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-purple-600" />
                Flow Scheduled Market Resolutions
              </h1>
              <p className="mt-2 text-gray-600">
                Automated resolution of external markets on Flow blockchain
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={refresh}
                disabled={loading}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-5 h-5" />
                Schedule Resolution
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Pending</div>
                <div className="text-3xl font-bold text-blue-600 mt-1">{stats.pending}</div>
              </div>
              <Clock className="w-12 h-12 text-blue-500 opacity-50" />
            </div>
            <div className="mt-2 text-xs text-gray-500">Waiting for scheduled time</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Ready</div>
                <div className="text-3xl font-bold text-green-600 mt-1">{stats.ready}</div>
              </div>
              <Zap className="w-12 h-12 text-green-500 opacity-50" />
            </div>
            <div className="mt-2 text-xs text-gray-500">Ready to execute now</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Completed</div>
                <div className="text-3xl font-bold text-gray-700 mt-1">{stats.completed}</div>
              </div>
              <CheckCircle className="w-12 h-12 text-gray-500 opacity-50" />
            </div>
            <div className="mt-2 text-xs text-gray-500">Successfully executed</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Failed</div>
                <div className="text-3xl font-bold text-red-600 mt-1">{stats.failed}</div>
              </div>
              <AlertTriangle className="w-12 h-12 text-red-500 opacity-50" />
            </div>
            <div className="mt-2 text-xs text-gray-500">Execution failed</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets..."
                className="w-full pl-11 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'all', label: 'All', count: stats.total },
                { key: 'pending', label: 'Pending', count: stats.pending },
                { key: 'ready', label: 'Ready', count: stats.ready },
                { key: 'completed', label: 'Completed', count: stats.completed },
                { key: 'failed', label: 'Failed', count: stats.failed },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    statusFilter === key
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading && resolutions.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <div className="text-gray-600">Loading resolutions...</div>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 flex items-center gap-4">
            <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-900">Error loading resolutions</div>
              <div className="text-red-700 text-sm mt-1">{error}</div>
            </div>
          </div>
        ) : filteredResolutions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Filter className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchQuery ? 'No matching resolutions' : 'No resolutions found'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery
                ? 'Try adjusting your search or filter criteria'
                : 'Schedule your first market resolution to get started'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-2 transition-all"
              >
                <Plus className="w-5 h-5" />
                Schedule Your First Resolution
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredResolutions.map((resolution) => (
              <ScheduledResolutionCard
                key={resolution.id}
                resolution={resolution}
                onExecute={handleExecute}
                onCancel={handleCancel}
                onViewDetails={(id) => setSelectedResolutionId(id)}
                isExecuting={executingId === resolution.id}
                isCancelling={cancellingId === resolution.id}
              />
            ))}
          </div>
        )}

        {/* Benefits Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-purple-500">
            <TrendingUp className="w-10 h-10 text-purple-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Automated Resolution</h3>
            <p className="text-gray-600 text-sm">
              Schedule market resolutions to execute automatically at your desired time with on-chain verification from trusted oracles.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-blue-500">
            <Zap className="w-10 h-10 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Gas Efficient</h3>
            <p className="text-gray-600 text-sm">
              Flow blockchain ensures minimal transaction costs (~0.001 FLOW) with fast finality and reliable execution.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-indigo-500">
            <Shield className="w-10 h-10 text-indigo-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Oracle Integration</h3>
            <p className="text-gray-600 text-sm">
              Seamlessly integrate with Polymarket, Kalshi, and internal oracles for verified, tamper-proof market outcomes.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ScheduleResolutionModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={handleSchedule}
        isScheduling={scheduling}
      />

      {selectedResolutionId && (
        <ResolutionDetailsModal
          resolutionId={selectedResolutionId}
          isOpen={selectedResolutionId !== null}
          onClose={() => setSelectedResolutionId(null)}
          getResolution={getResolution}
        />
      )}
    </div>
  );
}
