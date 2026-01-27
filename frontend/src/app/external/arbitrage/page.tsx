import { ArbitrageOpportunityList } from '@/components/arbitrage/ArbitrageOpportunityList';
import { Suspense } from 'react';

export default function ArbitragePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">Arbitrage Opportunities</h1>
          <p className="text-gray-400 text-lg">
            Cross-market price differences between Polymarket, Kalshi, and Flow mirror markets.
            Capitalize on price discrepancies to maximize profits.
          </p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading arbitrage opportunities...</p>
            </div>
          </div>
        }>
          <ArbitrageOpportunityList />
        </Suspense>
      </div>
    </div>
  );
}
