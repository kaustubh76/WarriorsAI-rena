'use client';

import { TrendingUp, DollarSign, PieChart, ArrowRight } from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface ArbitrageProfitPreviewProps {
  polyPrice: number; // 0-100
  kalshiPrice: number; // 0-100
  totalStake: bigint; // In wei
  spread: number; // Percentage
  polymarketSide: 'YES' | 'NO';
  kalshiSide: 'YES' | 'NO';
}

// ============================================
// COMPONENT
// ============================================

export default function ArbitrageProfitPreview({
  polyPrice,
  kalshiPrice,
  totalStake,
  spread,
  polymarketSide,
  kalshiSide,
}: ArbitrageProfitPreviewProps) {
  // Convert wei to decimal CRwN
  const stakeInCRwN = Number(totalStake) / 1e18;

  // Calculate allocations
  const polyPriceDecimal = polyPrice / 100;
  const kalshiPriceDecimal = kalshiPrice / 100;
  const totalCost = polyPriceDecimal + kalshiPriceDecimal;

  const polyAllocation = (polyPriceDecimal / totalCost) * stakeInCRwN;
  const kalshiAllocation = (kalshiPriceDecimal / totalCost) * stakeInCRwN;

  // Calculate shares
  const polyShares = polyAllocation / polyPriceDecimal;
  const kalshiShares = kalshiAllocation / kalshiPriceDecimal;

  // Guaranteed return (both positions pay $1 per share)
  const guaranteedReturn = Math.min(polyShares, kalshiShares);

  // Profit calculation
  const expectedProfit = guaranteedReturn - stakeInCRwN;
  const profitPercentage = (expectedProfit / stakeInCRwN) * 100;

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          Profit Projection
        </h3>
        <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
          +{profitPercentage.toFixed(2)}%
        </div>
      </div>

      {/* Investment Allocation */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Investment Allocation</p>

        {/* Polymarket Position */}
        <div className="bg-white rounded-lg p-3 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">
                Polymarket {polymarketSide}
              </span>
            </div>
            <span className="text-xs text-gray-500">@ {polyPrice}¢</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900">
              {polyAllocation.toFixed(2)} CRwN
            </span>
            <span className="text-sm text-gray-600">
              = {polyShares.toFixed(2)} shares
            </span>
          </div>
        </div>

        {/* Kalshi Position */}
        <div className="bg-white rounded-lg p-3 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-900">
                Kalshi {kalshiSide}
              </span>
            </div>
            <span className="text-xs text-gray-500">@ {kalshiPrice}¢</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900">
              {kalshiAllocation.toFixed(2)} CRwN
            </span>
            <span className="text-sm text-gray-600">
              = {kalshiShares.toFixed(2)} shares
            </span>
          </div>
        </div>
      </div>

      {/* Profit Breakdown */}
      <div className="bg-white rounded-lg p-4 border-2 border-green-300">
        <div className="space-y-2">
          {/* Total Investment */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total Investment</span>
            <span className="font-semibold text-gray-900">
              {stakeInCRwN.toFixed(2)} CRwN
            </span>
          </div>

          {/* Guaranteed Return */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Guaranteed Return</span>
            <span className="font-semibold text-gray-900">
              {guaranteedReturn.toFixed(2)} CRwN
            </span>
          </div>

          <div className="border-t border-gray-200 my-2"></div>

          {/* Expected Profit */}
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">Expected Profit</span>
            <div className="text-right">
              <p className="text-xl font-bold text-green-600">
                +{expectedProfit.toFixed(3)} CRwN
              </p>
              <p className="text-xs text-gray-600">
                ({profitPercentage.toFixed(2)}% return)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How it Works */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <p className="text-xs font-medium text-blue-900 mb-2">
          📊 How Arbitrage Works:
        </p>
        <div className="space-y-1 text-xs text-blue-800">
          <div className="flex items-start gap-2">
            <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              Buy {polymarketSide} on Polymarket for {polyPrice}¢ per share
            </span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              Buy {kalshiSide} on Kalshi for {kalshiPrice}¢ per share
            </span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              No matter the outcome, one position pays $1.00 per share
            </span>
          </div>
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-600" />
            <span className="font-semibold text-green-700">
              Profit = $1.00 - ${totalCost.toFixed(4)} = ${(1 - totalCost).toFixed(4)} per set
            </span>
          </div>
        </div>
      </div>

      {/* Risk Disclaimer */}
      <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
        <p className="text-xs text-yellow-800">
          ⚠️ <strong>Note:</strong> Profit assumes both orders fill at displayed prices.
          Actual profit may vary due to price movement or partial fills. Arbitrage profit
          is split equally between both warriors.
        </p>
      </div>

      {/* Additional Earnings */}
      <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
        <p className="text-xs font-medium text-purple-900 mb-1">
          💰 Additional Earnings:
        </p>
        <ul className="text-xs text-purple-800 space-y-0.5 ml-4 list-disc">
          <li>Arbitrage profit split 50/50 between warriors</li>
          <li>Debate winner gets bonus from spectator pool</li>
          <li>Both warriors earn from external market payouts</li>
        </ul>
      </div>
    </div>
  );
}
