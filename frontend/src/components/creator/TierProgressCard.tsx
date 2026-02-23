'use client';

import React from 'react';
import { formatEther } from 'viem';
import { type CreatorDisplay, TIER_THRESHOLDS, getTierBenefits, getTierLabel, getNextTier, type CreatorTier } from '@/services/creatorService';

interface TierProgressCardProps {
  creator: CreatorDisplay;
}

export function TierProgressCard({ creator }: TierProgressCardProps) {
  const currentTier = creator.tier;
  const progress = creator.nextTierProgress;
  const nextThreshold = creator.nextTierThreshold;
  const currentVolume = creator.totalVolumeGenerated;

  const isMaxTier = currentTier === 4; // DIAMOND
  const nextTier = getNextTier(currentTier);
  const nextTierLabel = nextTier !== null ? getTierLabel(nextTier) : null;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-6">Tier Progress</h3>

      {/* Current Tier */}
      <div className="flex items-center justify-center mb-6">
        <div className="text-center">
          <TierIcon tier={currentTier} />
          <h4 className="text-xl font-bold text-white mt-2">{creator.tierLabel}</h4>
          <p className="text-sm text-gray-400">Current Tier</p>
        </div>
      </div>

      {/* Progress to Next Tier */}
      {!isMaxTier && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Progress to {nextTierLabel}</span>
            <span className="text-white">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatVolume(currentVolume)}</span>
            <span>{formatVolume(nextThreshold)}</span>
          </div>
        </div>
      )}

      {isMaxTier && (
        <div className="text-center mb-6 py-4 bg-purple-500/10 rounded-lg">
          <p className="text-purple-400 font-medium">Maximum Tier Achieved!</p>
        </div>
      )}

      {/* Tier Benefits */}
      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-4">Current Benefits</h4>
        <div className="space-y-2">
          {getTierBenefits(currentTier).map((benefit, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <span className="text-green-400">*</span>
              <span className="text-gray-300">{benefit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All Tiers Preview */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <h4 className="text-sm font-medium text-gray-400 mb-4">Tier Roadmap</h4>
        <div className="flex justify-between">
          {[0, 1, 2, 3, 4].map((tier) => (
            <div
              key={tier}
              className={`text-center ${tier <= currentTier ? 'opacity-100' : 'opacity-40'}`}
            >
              <TierIconSmall tier={tier} isActive={tier === currentTier} />
              <p className="text-xs text-gray-400 mt-1">{getTierLabel(tier as CreatorTier)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TierIcon({ tier }: { tier: number }) {
  const colors = ['text-orange-400', 'text-gray-300', 'text-yellow-400', 'text-cyan-400', 'text-purple-400'];
  const icons = ['🥉', '🥈', '🥇', '💎', '👑'];

  return (
    <div className={`text-6xl ${colors[tier] ?? 'text-gray-400'}`}>
      {icons[tier] ?? '⭐'}
    </div>
  );
}

function TierIconSmall({ tier, isActive }: { tier: number; isActive: boolean }) {
  const colors = ['text-orange-400', 'text-gray-300', 'text-yellow-400', 'text-cyan-400', 'text-purple-400'];
  const icons = ['🥉', '🥈', '🥇', '💎', '👑'];

  return (
    <div className={`text-2xl ${colors[tier] ?? 'text-gray-400'} ${isActive ? 'animate-pulse' : ''}`}>
      {icons[tier] ?? '⭐'}
    </div>
  );
}


function formatVolume(volume: bigint): string {
  const num = Number(formatEther(volume));
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(2);
}

export default TierProgressCard;
