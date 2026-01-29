'use client';

import { useState } from 'react';
import { X, Check, Swords, Shield, Zap, Heart } from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Warrior {
  id: number;
  name?: string;
  attributes?: {
    attack?: number;
    defense?: number;
    speed?: number;
    health?: number;
  };
  image?: string;
  owner?: string;
}

interface DualWarriorSelectorProps {
  userWarriors: Warrior[];
  onSelectWarriors: (warrior1: Warrior, warrior2: Warrior) => void;
  selectedWarriors: [Warrior | null, Warrior | null];
  disabled?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export default function DualWarriorSelector({
  userWarriors,
  onSelectWarriors,
  selectedWarriors,
  disabled = false,
}: DualWarriorSelectorProps) {
  const [warrior1, warrior2] = selectedWarriors;

  const handleWarriorClick = (warrior: Warrior) => {
    if (disabled) return;

    // If clicking on already selected warrior, deselect it
    if (warrior1?.id === warrior.id) {
      if (warrior2) {
        onSelectWarriors(warrior2, null as any);
      } else {
        onSelectWarriors(null as any, null as any);
      }
      return;
    }

    if (warrior2?.id === warrior.id) {
      if (warrior1) {
        onSelectWarriors(warrior1, null as any);
      } else {
        onSelectWarriors(null as any, null as any);
      }
      return;
    }

    // Select warrior
    if (!warrior1) {
      onSelectWarriors(warrior, null as any);
    } else if (!warrior2) {
      onSelectWarriors(warrior1, warrior);
    } else {
      // Replace second warrior if both already selected
      onSelectWarriors(warrior1, warrior);
    }
  };

  const clearSelection = () => {
    onSelectWarriors(null as any, null as any);
  };

  const isSelected = (warrior: Warrior) => {
    return warrior1?.id === warrior.id || warrior2?.id === warrior.id;
  };

  const getSelectionBadge = (warrior: Warrior) => {
    if (warrior1?.id === warrior.id) return 1;
    if (warrior2?.id === warrior.id) return 2;
    return null;
  };

  // Get trait icon
  const getTraitIcon = (trait: string) => {
    switch (trait) {
      case 'attack':
        return <Swords className="w-3 h-3" />;
      case 'defense':
        return <Shield className="w-3 h-3" />;
      case 'speed':
        return <Zap className="w-3 h-3" />;
      case 'health':
        return <Heart className="w-3 h-3" />;
      default:
        return null;
    }
  };

  if (userWarriors.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-600 font-medium">No Warriors Found</p>
        <p className="text-sm text-gray-500 mt-1">
          You need to own at least 2 warriors to create an arbitrage battle
        </p>
      </div>
    );
  }

  if (userWarriors.length < 2) {
    return (
      <div className="text-center py-8 bg-yellow-50 rounded-lg border-2 border-dashed border-yellow-300">
        <p className="text-yellow-800 font-medium">Need More Warriors</p>
        <p className="text-sm text-yellow-600 mt-1">
          You own {userWarriors.length} warrior. You need at least 2 warriors for arbitrage battles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            Select 2 Warriors for Arbitrage Battle
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Both warriors will work together to execute arbitrage and debate
          </p>
        </div>

        {(warrior1 || warrior2) && (
          <button
            onClick={clearSelection}
            className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Selection Summary */}
      {(warrior1 || warrior2) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800 font-medium mb-2">
            Selected Warriors:
          </p>
          <div className="flex items-center gap-3">
            {warrior1 && (
              <div className="flex items-center gap-2 bg-white rounded px-3 py-1.5 border border-blue-300">
                <span className="text-xs font-bold text-blue-600">1</span>
                <span className="text-sm font-medium text-gray-900">
                  Warrior #{warrior1.id}
                </span>
              </div>
            )}
            {warrior2 && (
              <div className="flex items-center gap-2 bg-white rounded px-3 py-1.5 border border-blue-300">
                <span className="text-xs font-bold text-blue-600">2</span>
                <span className="text-sm font-medium text-gray-900">
                  Warrior #{warrior2.id}
                </span>
              </div>
            )}
            {!warrior2 && warrior1 && (
              <span className="text-sm text-gray-500 italic">
                Select one more warrior
              </span>
            )}
          </div>
        </div>
      )}

      {/* Warriors Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {userWarriors.map((warrior) => {
          const selected = isSelected(warrior);
          const badge = getSelectionBadge(warrior);

          return (
            <div
              key={warrior.id}
              onClick={() => handleWarriorClick(warrior)}
              className={`
                relative border-2 rounded-lg p-3 cursor-pointer transition-all
                ${
                  selected
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {/* Selection Badge */}
              {selected && badge && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  {badge}
                </div>
              )}

              {/* Warrior Image/Avatar */}
              <div className="aspect-square bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg mb-2 flex items-center justify-center">
                {warrior.image ? (
                  <img
                    src={warrior.image}
                    alt={`Warrior #${warrior.id}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <span className="text-3xl font-bold text-white">
                    {warrior.id}
                  </span>
                )}
              </div>

              {/* Warrior Info */}
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {warrior.name || `Warrior #${warrior.id}`}
                </p>

                {/* Attributes */}
                {warrior.attributes && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {Object.entries(warrior.attributes).map(([trait, value]) => (
                      <div
                        key={trait}
                        className="flex items-center gap-1 text-xs text-gray-600"
                      >
                        {getTraitIcon(trait)}
                        <span className="capitalize">{trait.slice(0, 3)}</span>
                        <span className="font-semibold text-gray-900">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Check Mark */}
              {selected && (
                <div className="absolute bottom-2 left-2">
                  <div className="bg-blue-600 rounded-full p-0.5">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-gray-600">
          💡 <strong>Tip:</strong> Both warriors will debate on opposite sides (YES vs NO)
          while executing the arbitrage trade. Choose warriors with complementary skills
          for maximum debate performance!
        </p>
      </div>
    </div>
  );
}
