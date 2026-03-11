// Display mapping layer: contract field names → DeFi strategy labels
// The on-chain contract stores traits as strength/wit/charisma/defence/luck.
// This mapping translates them to ALPHA/COMPLEXITY/MOMENTUM/HEDGE/TIMING for the UI.

export const TRAIT_MAP = {
  strength: {
    display: 'ALPHA',
    description: 'Conviction strength — position concentration',
    lowLabel: 'Diversified across pools',
    highLabel: 'Concentrated in best pool',
  },
  wit: {
    display: 'COMPLEXITY',
    description: 'Strategy depth — protocol hop count',
    lowLabel: 'Single deposit',
    highLabel: 'Multi-hop compose',
  },
  charisma: {
    display: 'MOMENTUM',
    description: 'Trend sensitivity — rebalance frequency',
    lowLabel: 'Buy and hold',
    highLabel: 'Rebalance every cycle',
  },
  defence: {
    display: 'HEDGE',
    description: 'Downside protection — stablecoin allocation',
    lowLabel: 'Fully exposed',
    highLabel: 'Heavy stablecoin hedge',
  },
  luck: {
    display: 'TIMING',
    description: 'Entry/exit precision — VRF randomization range',
    lowLabel: 'Wide window, random',
    highLabel: 'Tight window, precise',
  },
} as const;

export const MOVE_MAP = {
  strike_attack: {
    display: 'REBALANCE',
    description: 'Shift allocation between pools based on APY changes',
    primaryTrait: 'MOMENTUM',
  },
  taunt_attack: {
    display: 'CONCENTRATE',
    description: 'Double down on highest-performing position',
    primaryTrait: 'ALPHA',
  },
  dodge: {
    display: 'HEDGE UP',
    description: 'Move capital to stables/defensive positions',
    primaryTrait: 'HEDGE',
  },
  special_move: {
    display: 'COMPOSE',
    description: 'Multi-hop Flow Actions: Source→Swap→LP→Borrow',
    primaryTrait: 'COMPLEXITY',
  },
  recover: {
    display: 'FLASH',
    description: 'VRF-optimized entry/exit for precise execution',
    primaryTrait: 'TIMING',
  },
} as const;

export type ContractTraitKey = keyof typeof TRAIT_MAP;
export type ContractMoveKey = keyof typeof MOVE_MAP;

export const CONTRACT_TRAIT_KEYS: ContractTraitKey[] = ['strength', 'wit', 'charisma', 'defence', 'luck'];
export const CONTRACT_MOVE_KEYS: ContractMoveKey[] = ['strike_attack', 'taunt_attack', 'dodge', 'special_move', 'recover'];

export function contractTraitToDisplay(key: string): string {
  const entry = TRAIT_MAP[key as ContractTraitKey];
  return entry ? entry.display : key;
}

export function contractMoveToDisplay(key: string): string {
  const entry = MOVE_MAP[key as ContractMoveKey];
  return entry ? entry.display : key;
}

// Strategy profile classification based on dominant traits
export function classifyStrategyProfile(traits: Record<string, number>): string {
  const alpha = traits.strength ?? 0;
  const hedge = traits.defence ?? 0;
  const complexity = traits.wit ?? 0;
  const momentum = traits.charisma ?? 0;

  if (alpha > 7000 && hedge < 3000) return 'AGGRESSIVE';
  if (hedge > 7000 && alpha < 3000) return 'CONSERVATIVE';
  if (complexity > 7000) return 'COMPLEX';
  if (momentum > 7000) return 'REACTIVE';
  return 'BALANCED';
}
