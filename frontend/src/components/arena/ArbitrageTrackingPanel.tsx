'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Clock, XCircle, TrendingUp, ExternalLink, RefreshCw } from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface ArbitrageTrackingPanelProps {
  arbitrageTradeId: string;
  polymarketId: string;
  kalshiId: string;
}

interface TradeData {
  id: string;
  market1Source: string;
  market1Id: string;
  market1OrderId: string | null;
  market1Filled: boolean;
  market1Shares: number | null;
  market1ExecutionPrice: number | null;
  market2Source: string;
  market2Id: string;
  market2OrderId: string | null;
  market2Filled: boolean;
  market2Shares: number | null;
  market2ExecutionPrice: number | null;
  investmentAmount: string;
  expectedProfit: number;
  actualProfit: string | null;
  status: string;
  settled: boolean;
}

interface MarketStatus {
  status: string;
  outcome: string | null;
  yesPrice: number;
  noPrice: number;
}

// ============================================
// COMPONENT
// ============================================

export default function ArbitrageTrackingPanel({
  arbitrageTradeId,
  polymarketId,
  kalshiId,
}: ArbitrageTrackingPanelProps) {
  const [tradeData, setTradeData] = useState<TradeData | null>(null);
  const [polymarketStatus, setPolymarketStatus] = useState<MarketStatus | null>(null);
  const [kalshiStatus, setKalshiStatus] = useState<MarketStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTradeData = async () => {
    try {
      setError(null);

      // Fetch trade data
      const tradeResponse = await fetch(`/api/arbitrage/trades/${arbitrageTradeId}`);
      const tradeJson = await tradeResponse.json();

      if (!tradeResponse.ok) {
        throw new Error(tradeJson.error || 'Failed to fetch trade data');
      }

      setTradeData(tradeJson.trade);

      // Fetch market statuses (in parallel)
      const [polyResponse, kalshiResponse] = await Promise.all([
        fetch(`/api/external/markets/${polymarketId}`),
        fetch(`/api/external/markets/${kalshiId}`),
      ]);

      if (polyResponse.ok) {
        const polyJson = await polyResponse.json();
        // API returns { success: true, data: UnifiedMarket }
        const market = polyJson.data || polyJson.market;
        if (market) {
          setPolymarketStatus({
            status: market.status,
            outcome: market.outcome || null,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
          });
        }
      }

      if (kalshiResponse.ok) {
        const kalshiJson = await kalshiResponse.json();
        // API returns { success: true, data: UnifiedMarket }
        const market = kalshiJson.data || kalshiJson.market;
        if (market) {
          setKalshiStatus({
            status: market.status,
            outcome: market.outcome || null,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
          });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTradeData();

    // Poll every 30 seconds for updates
    const interval = setInterval(fetchTradeData, 30000);
    return () => clearInterval(interval);
  }, [arbitrageTradeId, polymarketId, kalshiId]);

  const getOrderStatusIcon = (filled: boolean, orderId: string | null) => {
    if (filled) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    } else if (orderId) {
      return <Clock className="w-5 h-5 text-yellow-600 animate-pulse" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getMarketStatusBadge = (status: string, outcome: string | null) => {
    if (status === 'resolved' && outcome) {
      return (
        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
          Resolved: {outcome.toUpperCase()}
        </span>
      );
    } else if (status === 'closed') {
      return (
        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded">
          Closed
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
          Active
        </span>
      );
    }
  };

  const calculateCurrentPnL = () => {
    if (!tradeData || !polymarketStatus || !kalshiStatus) return null;

    const investment = Number(tradeData.investmentAmount) / 1e18;

    // Estimate current value based on market prices
    const polyShares = tradeData.market1Shares || 0;
    const kalshiShares = tradeData.market2Shares || 0;

    const polyValue = polyShares * (polymarketStatus.yesPrice / 100);
    const kalshiValue = kalshiShares * (kalshiStatus.noPrice / 100);

    const currentValue = polyValue + kalshiValue;
    const currentPnL = currentValue - investment;

    return {
      value: currentValue,
      pnl: currentPnL,
      pnlPercent: (currentPnL / investment) * 100,
    };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="ml-2 text-gray-600">Loading trade data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  if (!tradeData) {
    return null;
  }

  const pnl = calculateCurrentPnL();

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Arbitrage Trade Tracking
        </h3>
        <button
          onClick={fetchTradeData}
          className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-100 transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Order Status */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Order Status</p>

        {/* Polymarket Order */}
        <div className="bg-white rounded-lg p-3 border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getOrderStatusIcon(tradeData.market1Filled, tradeData.market1OrderId)}
              <div>
                <p className="font-medium text-gray-900">Polymarket</p>
                {tradeData.market1OrderId && (
                  <p className="text-xs text-gray-500">
                    Order #{tradeData.market1OrderId.slice(0, 8)}...
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              {tradeData.market1Filled ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">
                    {tradeData.market1Shares?.toFixed(2)} shares
                  </p>
                  <p className="text-xs text-gray-600">
                    @ {(tradeData.market1ExecutionPrice! * 100).toFixed(1)}¢
                  </p>
                </>
              ) : (
                <span className="text-sm text-yellow-600">Pending...</span>
              )}
            </div>
          </div>
        </div>

        {/* Kalshi Order */}
        <div className="bg-white rounded-lg p-3 border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getOrderStatusIcon(tradeData.market2Filled, tradeData.market2OrderId)}
              <div>
                <p className="font-medium text-gray-900">Kalshi</p>
                {tradeData.market2OrderId && (
                  <p className="text-xs text-gray-500">
                    Order #{tradeData.market2OrderId.slice(0, 8)}...
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              {tradeData.market2Filled ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">
                    {tradeData.market2Shares?.toFixed(2)} shares
                  </p>
                  <p className="text-xs text-gray-600">
                    @ {(tradeData.market2ExecutionPrice! * 100).toFixed(1)}¢
                  </p>
                </>
              ) : (
                <span className="text-sm text-yellow-600">Pending...</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Market Status */}
      {(polymarketStatus || kalshiStatus) && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Market Status</p>

          <div className="grid grid-cols-2 gap-2">
            {/* Polymarket */}
            {polymarketStatus && (
              <div className="bg-white rounded p-2 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">Polymarket</span>
                  {getMarketStatusBadge(polymarketStatus.status, polymarketStatus.outcome)}
                </div>
                <div className="flex justify-between text-xs">
                  <span>YES: {polymarketStatus.yesPrice}¢</span>
                  <span>NO: {polymarketStatus.noPrice}¢</span>
                </div>
              </div>
            )}

            {/* Kalshi */}
            {kalshiStatus && (
              <div className="bg-white rounded p-2 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">Kalshi</span>
                  {getMarketStatusBadge(kalshiStatus.status, kalshiStatus.outcome)}
                </div>
                <div className="flex justify-between text-xs">
                  <span>YES: {kalshiStatus.yesPrice}¢</span>
                  <span>NO: {kalshiStatus.noPrice}¢</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* P&L Summary */}
      <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Investment</span>
            <span className="font-semibold text-gray-900">
              {(Number(tradeData.investmentAmount) / 1e18).toFixed(2)} CRwN
            </span>
          </div>

          {pnl && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Current Value</span>
              <span className="font-semibold text-gray-900">
                {pnl.value.toFixed(2)} CRwN
              </span>
            </div>
          )}

          <div className="border-t border-gray-200 my-2"></div>

          {tradeData.settled && tradeData.actualProfit ? (
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Final Profit</span>
              <div className="text-right">
                <p className="text-lg font-bold text-green-600">
                  +{(Number(tradeData.actualProfit) / 1e18).toFixed(3)} CRwN
                </p>
                <p className="text-xs text-gray-600">Settled ✓</p>
              </div>
            </div>
          ) : pnl ? (
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Estimated P&L</span>
              <div className="text-right">
                <p
                  className={`text-lg font-bold ${
                    pnl.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {pnl.pnl >= 0 ? '+' : ''}
                  {pnl.pnl.toFixed(3)} CRwN
                </p>
                <p className="text-xs text-gray-600">
                  ({pnl.pnlPercent >= 0 ? '+' : ''}
                  {pnl.pnlPercent.toFixed(2)}%)
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Expected Profit</span>
              <div className="text-right">
                <p className="text-lg font-bold text-blue-600">
                  +{tradeData.expectedProfit.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-600">Projected</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* External Links */}
      <div className="flex items-center gap-2">
        <a
          href={`https://polymarket.com/market/${polymarketId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-purple-100 text-purple-700 rounded text-sm font-medium hover:bg-purple-200 transition"
        >
          View on Polymarket
          <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href={`https://kalshi.com/markets/${kalshiId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition"
        >
          View on Kalshi
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
