'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ProviderInfo {
  address: string;
  model: string;
  endpoint: string;
  serviceType: string;
  inputPrice: string;
  outputPrice: string;
  verifiability: string;
}

interface StorageStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  apiUrl?: string;
  indexer?: string;
  network?: {
    healthy: boolean;
    connectedPeers: number;
    error?: string;
  };
}

interface ZeroGStatusData {
  compute: {
    available: boolean;
    providers: ProviderInfo[];
    message?: string;
  };
  storage: StorageStatus;
  lastUpdated: number;
}

export function ZeroGStatus() {
  const [status, setStatus] = useState<ZeroGStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch compute providers and storage status in parallel
      const [computeRes, storageRes] = await Promise.all([
        fetch('/api/0g/inference').catch(() => null),
        fetch('/api/0g/store', { method: 'PUT' }).catch(() => null)
      ]);

      const computeData = computeRes?.ok ? await computeRes.json() : { success: false };
      const storageData = storageRes?.ok ? await storageRes.json() : { status: 'unhealthy' };

      setStatus({
        compute: {
          available: computeData.success && computeData.providers?.length > 0,
          providers: computeData.providers || [],
          message: computeData.message
        },
        storage: storageData,
        lastUpdated: Date.now()
      });
      setError(null);
    } catch (err) {
      setError('Failed to fetch 0G status');
      console.error('0G status error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const computeHealthy = status?.compute.available ?? false;
  const storageHealthy = status?.storage.status === 'healthy';
  const overallHealthy = computeHealthy && storageHealthy;

  const getStatusColor = (healthy: boolean) => {
    return healthy ? 'text-green-400' : 'text-red-400';
  };

  const getStatusBg = (healthy: boolean) => {
    return healthy ? 'bg-green-500/20' : 'bg-red-500/20';
  };

  const getStatusBorder = (healthy: boolean) => {
    return healthy ? 'border-green-500/50' : 'border-red-500/50';
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
          <span className="text-gray-400 text-sm">Checking 0G Network status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 border border-red-500/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-xl p-4 border ${getStatusBorder(overallHealthy)}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${overallHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-white font-medium">0G Network</span>
          <span className={`text-xs ${getStatusColor(overallHealthy)}`}>
            {overallHealthy ? 'All Systems Operational' : 'Issues Detected'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Compact Status Pills */}
      <div className="flex items-center gap-2 mt-3">
        <div className={`px-2 py-1 rounded-full text-xs ${getStatusBg(computeHealthy)} ${getStatusColor(computeHealthy)}`}>
          Compute: {computeHealthy ? 'Online' : 'Offline'}
        </div>
        <div className={`px-2 py-1 rounded-full text-xs ${getStatusBg(storageHealthy)} ${getStatusColor(storageHealthy)}`}>
          Storage: {storageHealthy ? 'Online' : 'Offline'}
        </div>
        {status?.compute.providers && status.compute.providers.length > 0 && (
          <div className="px-2 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400">
            {status.compute.providers.length} Provider{status.compute.providers.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-700 pt-4">
          {/* Compute Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">0G Compute Network</h4>
            {status?.compute.providers && status.compute.providers.length > 0 ? (
              <div className="space-y-2">
                {status.compute.providers.map((provider, idx) => (
                  <div
                    key={provider.address}
                    className="bg-gray-800 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-mono text-xs">
                        {provider.address.slice(0, 6)}...{provider.address.slice(-4)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        provider.verifiability === 'teeml'
                          ? 'bg-green-500/20 text-green-400'
                          : provider.verifiability === 'zkml'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {provider.verifiability === 'teeml' ? 'TEE Verified' :
                         provider.verifiability === 'zkml' ? 'ZK Verified' : 'Unverified'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Model:</span>
                        <span className="text-gray-300 ml-1">{provider.model}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className="text-gray-300 ml-1">{provider.serviceType}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-400">
                No AI providers currently available.
                {status?.compute.message && (
                  <p className="text-xs text-gray-500 mt-1">{status.compute.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Storage Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">0G Storage Network</h4>
            <div className="bg-gray-800 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Status</span>
                <span className={getStatusColor(storageHealthy)}>
                  {storageHealthy ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>
              {status?.storage.network && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Connected Peers</span>
                  <span className="text-gray-300">{status.storage.network.connectedPeers}</span>
                </div>
              )}
              {status?.storage.network?.error && (
                <p className="text-xs text-red-400 mt-2">{status.storage.network.error}</p>
              )}
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-xs text-gray-500 text-right">
            Last updated: {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      )}
    </div>
  );
}

export default ZeroGStatus;
