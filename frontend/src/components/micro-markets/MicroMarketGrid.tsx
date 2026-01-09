'use client';

import React, { useState } from 'react';
import { type MicroMarketDisplay, type BattleMicroMarkets } from '@/services/microMarketService';
import { MicroMarketCard } from './MicroMarketCard';

interface MicroMarketGridProps {
  markets: MicroMarketDisplay[];
  groupedMarkets?: BattleMicroMarkets | null;
  onMarketSelect?: (market: MicroMarketDisplay) => void;
  selectedMarketId?: bigint | null;
}

export function MicroMarketGrid({
  markets,
  groupedMarkets,
  onMarketSelect,
  selectedMarketId
}: MicroMarketGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grouped');
  const [filterType, setFilterType] = useState<number | 'all'>('all');

  const filteredMarkets = filterType === 'all'
    ? markets
    : markets.filter(m => m.marketType === filterType);

  if (viewMode === 'grouped' && groupedMarkets) {
    return (
      <div className="space-y-6">
        {/* View Toggle */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 text-sm rounded-lg ${
              viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Grid View
          </button>
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1 text-sm rounded-lg ${
              viewMode === 'grouped' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Grouped View
          </button>
        </div>

        {/* Round Winners */}
        {groupedMarkets.roundWinners.length > 0 && (
          <MarketSection
            title="Round Winners"
            icon=""
            markets={groupedMarkets.roundWinners.map(m => markets.find(dm => dm.id === m.id)!).filter(Boolean)}
            onSelect={onMarketSelect}
            selectedId={selectedMarketId}
          />
        )}

        {/* Move Predictions */}
        {groupedMarkets.movePredictions.length > 0 && (
          <MarketSection
            title="Move Predictions"
            icon=""
            markets={groupedMarkets.movePredictions.map(m => markets.find(dm => dm.id === m.id)!).filter(Boolean)}
            onSelect={onMarketSelect}
            selectedId={selectedMarketId}
          />
        )}

        {/* Damage Thresholds */}
        {groupedMarkets.damageThresholds.length > 0 && (
          <MarketSection
            title="Damage Thresholds"
            icon=""
            markets={groupedMarkets.damageThresholds.map(m => markets.find(dm => dm.id === m.id)!).filter(Boolean)}
            onSelect={onMarketSelect}
            selectedId={selectedMarketId}
          />
        )}

        {/* Special Markets */}
        {groupedMarkets.specialMarkets.length > 0 && (
          <MarketSection
            title="Special Bets"
            icon=""
            markets={groupedMarkets.specialMarkets.map(m => markets.find(dm => dm.id === m.id)!).filter(Boolean)}
            onSelect={onMarketSelect}
            selectedId={selectedMarketId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setViewMode('grouped')}
          className={`px-3 py-1 text-sm rounded-lg ${
            viewMode === 'grouped' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Grouped View
        </button>
        <button
          onClick={() => setViewMode('grid')}
          className={`px-3 py-1 text-sm rounded-lg ${
            viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Grid View
        </button>
        <div className="h-4 w-px bg-gray-700 mx-2" />
        <FilterButton label="All" active={filterType === 'all'} onClick={() => setFilterType('all')} />
        <FilterButton label="Round Winner" active={filterType === 0} onClick={() => setFilterType(0)} />
        <FilterButton label="Move" active={filterType === 1} onClick={() => setFilterType(1)} />
        <FilterButton label="Damage" active={filterType === 2} onClick={() => setFilterType(2)} />
        <FilterButton label="Special" active={filterType === 3} onClick={() => setFilterType(3)} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredMarkets.map(market => (
          <MicroMarketCard
            key={market.id.toString()}
            market={market}
            onClick={() => onMarketSelect?.(market)}
            isSelected={selectedMarketId === market.id}
          />
        ))}
      </div>

      {filteredMarkets.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No markets found
        </div>
      )}
    </div>
  );
}

function MarketSection({
  title,
  icon,
  markets,
  onSelect,
  selectedId
}: {
  title: string;
  icon: string;
  markets: MicroMarketDisplay[];
  onSelect?: (market: MicroMarketDisplay) => void;
  selectedId?: bigint | null;
}) {
  if (markets.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        <span className="text-sm text-gray-400 font-normal">({markets.length})</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {markets.map(market => (
          <MicroMarketCard
            key={market.id.toString()}
            market={market}
            onClick={() => onSelect?.(market)}
            isSelected={selectedId === market.id}
          />
        ))}
      </div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

export default MicroMarketGrid;
