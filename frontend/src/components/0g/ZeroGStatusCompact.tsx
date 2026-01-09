'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ProviderInfo {
  address: string;
  model: string;
  endpoint: string;
  serviceType: string;
  inputPrice: string;
  outputPrice: string;
  verifiability: string;
}

interface ZeroGStatusData {
  compute: {
    available: boolean;
    providers: ProviderInfo[];
    message?: string;
  };
  storage: {
    status: 'healthy' | 'unhealthy';
  };
  lastUpdated: number;
}

interface ZeroGStatusCompactProps {
  className?: string;
}

export function ZeroGStatusCompact({ className = '' }: ZeroGStatusCompactProps) {
  const [status, setStatus] = useState<ZeroGStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
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
    } catch (err) {
      console.error('0G status error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    if (expanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  const computeHealthy = status?.compute.available ?? false;
  const storageHealthy = status?.storage.status === 'healthy';
  const overallHealthy = computeHealthy || storageHealthy; // At least one service working
  const providerCount = status?.compute.providers?.length ?? 0;

  if (loading) {
    return (
      <div className={`arcade-card-slate px-3 py-2 bg-slate-900/20 border-slate-500 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400" style={{ fontFamily: 'Press Start 2P, monospace' }}>
            0G
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Compact Badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="arcade-card-slate px-3 py-2 bg-slate-900/20 border-slate-500 hover:border-purple-500 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${overallHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-purple-300" style={{ fontFamily: 'Press Start 2P, monospace' }}>
            0G
          </span>
          {providerCount > 0 && (
            <span className="text-xs bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full">
              {providerCount}
            </span>
          )}
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Dropdown */}
      {expanded && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-gray-900 rounded-xl border border-gray-700 shadow-xl z-50">
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${overallHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-white font-medium">0G Network Status</span>
              </div>
              <span className={`text-xs ${overallHealthy ? 'text-green-400' : 'text-red-400'}`}>
                {overallHealthy ? 'Operational' : 'Issues'}
              </span>
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-2 mb-4">
              <div className={`px-2 py-1 rounded-full text-xs ${
                computeHealthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                Compute: {computeHealthy ? 'Online' : 'Offline'}
              </div>
              <div className={`px-2 py-1 rounded-full text-xs ${
                storageHealthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                Storage: {storageHealthy ? 'Online' : 'Offline'}
              </div>
            </div>

            {/* Providers List */}
            {status?.compute.providers && status.compute.providers.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-400 uppercase">AI Providers</h4>
                {status.compute.providers.slice(0, 3).map((provider) => (
                  <div
                    key={provider.address}
                    className="bg-gray-800 rounded-lg p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-mono">
                        {provider.address.slice(0, 6)}...{provider.address.slice(-4)}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        provider.verifiability === 'teeml'
                          ? 'bg-green-500/20 text-green-400'
                          : provider.verifiability === 'zkml'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {provider.verifiability === 'teeml' ? 'TEE' :
                         provider.verifiability === 'zkml' ? 'ZK' : 'None'}
                      </span>
                    </div>
                    <div className="text-gray-500 mt-1">
                      {provider.model} • {provider.serviceType}
                    </div>
                  </div>
                ))}
                {status.compute.providers.length > 3 && (
                  <p className="text-xs text-gray-500 text-center">
                    +{status.compute.providers.length - 3} more providers
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400">
                No AI providers currently available.
                {status?.compute.message && (
                  <p className="text-gray-500 mt-1">{status.compute.message}</p>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-gray-700 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Updated: {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleTimeString() : 'Never'}
              </span>
              <button
                onClick={fetchStatus}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ZeroGStatusCompact;
