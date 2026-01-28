'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

interface ExternalTrade {
  id: string;
  marketId: string;
  mirrorKey: string;
  source: string;
  marketQuestion: string;
  externalId: string | null;
  isYes: boolean;
  amount: string;
  sharesReceived: string;
  pnl: string;
  won: boolean | null;
  txHash: string;
  timestamp: Date;
  resolvedAt: Date | null;
}

interface PerformanceBreakdown {
  enabled: boolean;
  count: number;
  wins: number;
  pnl: string;
  winRate: number;
}

interface BreakdownData {
  polymarket: PerformanceBreakdown;
  kalshi: PerformanceBreakdown;
}

export default function AgentExternalTradingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: agentId } = use(params);

  const [trades, setTrades] = useState<ExternalTrade[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [tradesRes, breakdownRes] = await Promise.all([
          fetch(`/api/agents/${agentId}/external-trades`),
          fetch(`/api/agents/${agentId}/external-breakdown`),
        ]);

        const tradesData = await tradesRes.json();
        const breakdownData = await breakdownRes.json();

        if (!tradesData.success) {
          throw new Error(tradesData.error || 'Failed to fetch trades');
        }

        if (!breakdownData.success) {
          throw new Error(breakdownData.error || 'Failed to fetch breakdown');
        }

        setTrades(tradesData.trades || []);
        setBreakdown(breakdownData.data.breakdown);
      } catch (err) {
        console.error('[ExternalTrading] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [agentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading external trades...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded-lg"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/agents/${agentId}`}
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Agent
          </Link>
          <h1 className="text-4xl font-bold text-white mb-3">External Market Trading</h1>
          <p className="text-gray-400">
            Agent #{agentId}'s trading activity on Polymarket and Kalshi
          </p>
        </div>

      {/* Performance Breakdown by Source */}
      {breakdown && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Polymarket Card */}
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Polymarket</h3>
              {breakdown.polymarket.enabled ? (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">
                  Enabled
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 text-sm rounded-full">
                  Disabled
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Trades:</span>
                <span className="text-white font-semibold">{breakdown.polymarket.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Wins:</span>
                <span className="text-white font-semibold">{breakdown.polymarket.wins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Win Rate:</span>
                <span className={breakdown.polymarket.winRate > 50 ? 'text-green-400' : 'text-red-400'}>
                  {breakdown.polymarket.winRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total PnL:</span>
                <span className={parseFloat(breakdown.polymarket.pnl) > 0 ? 'text-green-400' : 'text-red-400'}>
                  {parseFloat(breakdown.polymarket.pnl).toFixed(2)} CRwN
                </span>
              </div>
            </div>
          </div>

          {/* Kalshi Card */}
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Kalshi</h3>
              {breakdown.kalshi.enabled ? (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">
                  Enabled
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 text-sm rounded-full">
                  Disabled
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Trades:</span>
                <span className="text-white font-semibold">{breakdown.kalshi.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Wins:</span>
                <span className="text-white font-semibold">{breakdown.kalshi.wins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Win Rate:</span>
                <span className={breakdown.kalshi.winRate > 50 ? 'text-green-400' : 'text-red-400'}>
                  {breakdown.kalshi.winRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total PnL:</span>
                <span className={parseFloat(breakdown.kalshi.pnl) > 0 ? 'text-green-400' : 'text-red-400'}>
                  {parseFloat(breakdown.kalshi.pnl).toFixed(2)} CRwN
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade History */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Trade History</h2>
        {trades.length === 0 ? (
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-8 text-center">
            <span className="text-4xl mb-4 block">📊</span>
            <h3 className="text-white font-medium mb-2">No External Trades Yet</h3>
            <p className="text-gray-400 text-sm">
              This agent hasn't executed any trades on external markets yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-lg font-semibold text-white">{trade.marketQuestion}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        trade.source === 'polymarket'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {trade.source}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
                      <div>
                        <span className="mr-2">Position:</span>
                        <span className={trade.isYes ? 'text-green-400' : 'text-red-400'}>
                          {trade.isYes ? 'YES' : 'NO'}
                        </span>
                      </div>
                      <div>
                        <span className="mr-2">Amount:</span>
                        <span className="text-white">{parseFloat(trade.amount).toFixed(2)} CRwN</span>
                      </div>
                      <div>
                        <span className="mr-2">Shares:</span>
                        <span className="text-white">{parseFloat(trade.sharesReceived).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-400 mb-2">
                      {new Date(trade.timestamp).toLocaleDateString()} {new Date(trade.timestamp).toLocaleTimeString()}
                    </div>
                    {trade.resolvedAt && trade.won !== null && (
                      <div className={`text-lg font-bold ${
                        parseFloat(trade.pnl) > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {parseFloat(trade.pnl) > 0 ? '+' : ''}{parseFloat(trade.pnl).toFixed(2)} CRwN
                      </div>
                    )}
                    {!trade.resolvedAt && (
                      <div className="text-sm text-yellow-400">Pending</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                  <a
                    href={`https://flowscan.io/tx/${trade.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    View Transaction →
                  </a>
                  {trade.externalId && (
                    <Link
                      href={`/external/${trade.source}/${trade.externalId}`}
                      className="text-purple-400 hover:text-purple-300 text-sm"
                    >
                      View Market →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
