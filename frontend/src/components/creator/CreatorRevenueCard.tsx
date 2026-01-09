'use client';

import React from 'react';
import { type CreatorDisplay, type RevenueBreakdown } from '@/services/creatorService';

interface CreatorRevenueCardProps {
  creator: CreatorDisplay;
  breakdown?: RevenueBreakdown[];
}

export function CreatorRevenueCard({ creator, breakdown }: CreatorRevenueCardProps) {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Revenue Overview</h3>
        <TierBadge tier={creator.tier} label={creator.tierLabel} color={creator.tierColor} />
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Total Earned"
          value={`${creator.totalFeesEarnedFormatted} CRwN`}
          icon=""
          color="text-green-400"
        />
        <StatCard
          label="Pending Rewards"
          value={`${creator.pendingRewardsFormatted} CRwN`}
          icon=""
          color="text-yellow-400"
        />
        <StatCard
          label="Total Claimed"
          value={`${creator.totalClaimedFormatted} CRwN`}
          icon=""
          color="text-blue-400"
        />
        <StatCard
          label="Volume Generated"
          value={creator.totalVolumeFormatted}
          icon=""
          color="text-purple-400"
        />
      </div>

      {/* Revenue Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-400 mb-4">Revenue by Source</h4>
          <div className="space-y-3">
            {breakdown.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-400 flex-1">{item.source}</span>
                <span className="text-sm text-white font-medium">
                  {item.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creator Stats */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <span className="text-gray-400 block">Markets</span>
          <span className="text-white font-medium">{Number(creator.marketsCreated)}</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 block">Warriors</span>
          <span className="text-white font-medium">{Number(creator.warriorsCreated)}</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 block">Agents</span>
          <span className="text-white font-medium">{Number(creator.agentsOperated)}</span>
        </div>
      </div>

      {/* Member Since */}
      <div className="mt-6 pt-4 border-t border-gray-700 text-sm text-gray-400 text-center">
        Member since {creator.memberSince}
      </div>
    </div>
  );
}

function TierBadge({ tier, label, color }: { tier: number; label: string; color: string }) {
  const colorMap: Record<string, string> = {
    bronze: 'bg-orange-500/20 text-orange-400',
    silver: 'bg-gray-400/20 text-gray-300',
    gold: 'bg-yellow-500/20 text-yellow-400',
    platinum: 'bg-cyan-500/20 text-cyan-400',
    diamond: 'bg-purple-500/20 text-purple-400'
  };

  const icons: Record<string, string> = {
    bronze: '',
    silver: '',
    gold: '',
    platinum: '',
    diamond: ''
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorMap[color] ?? colorMap.bronze}`}>
      {icons[color]} {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  color
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span>{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default CreatorRevenueCard;
