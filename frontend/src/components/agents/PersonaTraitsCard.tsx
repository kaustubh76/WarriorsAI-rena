'use client';

import React from 'react';
import { type PersonaTraits } from '@/services/aiAgentService';

interface PersonaTraitsCardProps {
  traits?: PersonaTraits;
}

const defaultTraits: PersonaTraits = {
  patience: 50,
  conviction: 50,
  contrarian: 50,
  momentum: 50,
};

export function PersonaTraitsCard({ traits }: PersonaTraitsCardProps) {
  const safeTraits = traits ?? defaultTraits;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-6">Persona Traits</h3>

      <div className="space-y-6">
        <TraitBar
          label="Patience"
          value={safeTraits.patience}
          icon=""
          description="Willingness to wait for optimal entry points"
          lowLabel="Aggressive"
          highLabel="Patient"
        />
        <TraitBar
          label="Conviction"
          value={safeTraits.conviction}
          icon=""
          description="Position sizing based on confidence"
          lowLabel="Cautious"
          highLabel="Bold"
        />
        <TraitBar
          label="Contrarian"
          value={safeTraits.contrarian}
          icon=""
          description="Tendency to bet against crowd consensus"
          lowLabel="Follows Crowd"
          highLabel="Contrarian"
        />
        <TraitBar
          label="Momentum"
          value={safeTraits.momentum}
          icon=""
          description="Following recent trends vs mean reversion"
          lowLabel="Reversal"
          highLabel="Momentum"
        />
      </div>

      {/* Trait Summary */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <p className="text-sm text-gray-400">
          {getTraitSummary(safeTraits)}
        </p>
      </div>
    </div>
  );
}

function TraitBar({
  label,
  value,
  icon,
  description,
  lowLabel,
  highLabel
}: {
  label: string;
  value: number;
  icon: string;
  description: string;
  lowLabel: string;
  highLabel: string;
}) {
  const percentage = value;
  const color = getTraitColor(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-white font-medium">{label}</span>
        </div>
        <span className="text-sm text-gray-400">{value}/100</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  );
}

function getTraitColor(value: number): string {
  if (value >= 70) return 'bg-gradient-to-r from-purple-500 to-purple-400';
  if (value >= 40) return 'bg-gradient-to-r from-blue-500 to-blue-400';
  return 'bg-gradient-to-r from-gray-500 to-gray-400';
}

function getTraitSummary(traits: PersonaTraits): string {
  const summaries: string[] = [];

  if (traits.patience >= 70) {
    summaries.push('waits for high-confidence opportunities');
  } else if (traits.patience <= 30) {
    summaries.push('acts quickly on market signals');
  }

  if (traits.conviction >= 70) {
    summaries.push('takes strong positions when confident');
  } else if (traits.conviction <= 30) {
    summaries.push('prefers smaller, diversified positions');
  }

  if (traits.contrarian >= 70) {
    summaries.push('often bets against consensus');
  } else if (traits.contrarian <= 30) {
    summaries.push('aligns with market sentiment');
  }

  if (traits.momentum >= 70) {
    summaries.push('rides trending markets');
  } else if (traits.momentum <= 30) {
    summaries.push('looks for reversal opportunities');
  }

  if (summaries.length === 0) {
    return 'A balanced agent with no extreme tendencies.';
  }

  return `This agent ${summaries.join(', ')}.`;
}

export default PersonaTraitsCard;
