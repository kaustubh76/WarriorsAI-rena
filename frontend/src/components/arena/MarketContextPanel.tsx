'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

interface MarketData {
  id: string;
  question: string;
  source: string;
  sourceUrl?: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  liquidity?: string;
  endTime?: number;
  status: string;
}

interface MarketContextPanelProps {
  externalMarketId: string;
  source: string;
}

export default function MarketContextPanel({
  externalMarketId,
  source,
}: MarketContextPanelProps) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dbId = `${source === 'polymarket' ? 'poly' : 'kalshi'}_${externalMarketId}`;

  const fetchMarket = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/external/markets/${encodeURIComponent(dbId)}`);
      if (res.status === 404) {
        setError('Market data unavailable');
        setMarket(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch market');
      const data = await res.json();
      if (data.success && data.data) {
        setMarket(data.data);
        setError(null);
      } else {
        setError('Market data unavailable');
      }
    } catch {
      setError('Market data unavailable');
    } finally {
      setLoading(false);
    }
  }, [dbId]);

  useEffect(() => {
    fetchMarket();
    const interval = setInterval(fetchMarket, 30_000);
    return () => clearInterval(interval);
  }, [fetchMarket]);

  if (loading && !market) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading market data...</span>
        </div>
      </div>
    );
  }

  if (error && !market) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
        <p className="text-gray-500 text-sm text-center">{error}</p>
      </div>
    );
  }

  if (!market) return null;

  const yesWidth = Math.max(2, Math.min(98, market.yesPrice));
  const noWidth = 100 - yesWidth;

  const formatVolume = (vol: string) => {
    const n = parseFloat(vol);
    if (isNaN(n)) return vol;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-400">External Market</h4>
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
            source === 'polymarket'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {source.toUpperCase()}
          </span>
        </div>
        {market.sourceUrl && (
          <a
            href={market.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 transition-colors"
          >
            View on {source === 'polymarket' ? 'Polymarket' : 'Kalshi'}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Probability Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-green-400 font-semibold">YES {market.yesPrice.toFixed(1)}%</span>
          <span className="text-red-400 font-semibold">NO {market.noPrice.toFixed(1)}%</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden">
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${yesWidth}%` }}
          />
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${noWidth}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Volume</p>
          <p className="text-white font-medium">{formatVolume(market.volume)}</p>
        </div>
        {market.liquidity && (
          <div>
            <p className="text-gray-500 text-xs">Liquidity</p>
            <p className="text-white font-medium">{formatVolume(market.liquidity)}</p>
          </div>
        )}
        {market.endTime && (
          <div>
            <p className="text-gray-500 text-xs">Closes</p>
            <p className="text-white font-medium">
              {new Date(market.endTime * 1000).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
