/**
 * ABI for StrategyBattleManager.sol
 * On-chain battle lifecycle: creation, betting, scoring, settlement, ELO
 */
export const BATTLE_MANAGER_ABI = [
  // ── Battle Lifecycle ──────────────────────────
  {
    name: 'createBattle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'warrior1Id', type: 'uint256' },
      { name: 'warrior2Id', type: 'uint256' },
      { name: 'stakes', type: 'uint256' },
    ],
    outputs: [{ name: 'battleId', type: 'uint256' }],
  },
  {
    name: 'recordCycleScore',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'battleId', type: 'uint256' },
      { name: 'w1RoundScore', type: 'uint256' },
      { name: 'w2RoundScore', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'settleBattle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'battleId', type: 'uint256' }],
    outputs: [],
  },

  // ── Betting ───────────────────────────────────
  {
    name: 'placeBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'battleId', type: 'uint256' },
      { name: 'betOnWarrior1', type: 'bool' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'closeBetting',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'battleId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'battleId', type: 'uint256' }],
    outputs: [],
  },

  // ── Views ─────────────────────────────────────
  {
    name: 'getBattle',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'battleId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'warrior1Id', type: 'uint256' },
          { name: 'warrior2Id', type: 'uint256' },
          { name: 'warrior1Owner', type: 'address' },
          { name: 'warrior2Owner', type: 'address' },
          { name: 'stakes', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'result', type: 'uint8' },
          { name: 'currentRound', type: 'uint256' },
          { name: 'warrior1Score', type: 'uint256' },
          { name: 'warrior2Score', type: 'uint256' },
          { name: 'totalW1Bets', type: 'uint256' },
          { name: 'totalW2Bets', type: 'uint256' },
          { name: 'bettingOpen', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getBettingOdds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'battleId', type: 'uint256' }],
    outputs: [
      { name: 'w1Odds', type: 'uint256' },
      { name: 'w2Odds', type: 'uint256' },
      { name: 'totalPool', type: 'uint256' },
    ],
  },
  {
    name: 'getUserBet',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'battleId', type: 'uint256' },
      { name: 'bettor', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'bettor', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'betOnWarrior1', type: 'bool' },
          { name: 'claimed', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getWarriorRating',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'warriorId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'rating', type: 'uint256' },
          { name: 'totalBattles', type: 'uint256' },
          { name: 'wins', type: 'uint256' },
          { name: 'losses', type: 'uint256' },
          { name: 'draws', type: 'uint256' },
          { name: 'currentStreak', type: 'uint256' },
          { name: 'peakRating', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getBattleCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ── Events ────────────────────────────────────
  {
    name: 'BattleCreated',
    type: 'event',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
      { name: 'warrior1Id', type: 'uint256', indexed: true },
      { name: 'warrior2Id', type: 'uint256', indexed: true },
      { name: 'stakes', type: 'uint256', indexed: false },
      { name: 'warrior1Owner', type: 'address', indexed: false },
      { name: 'warrior2Owner', type: 'address', indexed: false },
    ],
  },
  {
    name: 'CycleScored',
    type: 'event',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
      { name: 'round', type: 'uint256', indexed: false },
      { name: 'w1RoundScore', type: 'uint256', indexed: false },
      { name: 'w2RoundScore', type: 'uint256', indexed: false },
      { name: 'w1TotalScore', type: 'uint256', indexed: false },
      { name: 'w2TotalScore', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BattleSettled',
    type: 'event',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
      { name: 'result', type: 'uint8', indexed: false },
      { name: 'winnerId', type: 'uint256', indexed: false },
      { name: 'w1NewRating', type: 'uint256', indexed: false },
      { name: 'w2NewRating', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BetPlaced',
    type: 'event',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
      { name: 'bettor', type: 'address', indexed: true },
      { name: 'betOnWarrior1', type: 'bool', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BettingClosed',
    type: 'event',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
    ],
  },
  {
    name: 'BetClaimed',
    type: 'event',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
      { name: 'bettor', type: 'address', indexed: true },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'won', type: 'bool', indexed: false },
    ],
  },

  {
    name: 'RatingUpdated',
    type: 'event',
    inputs: [
      { name: 'warriorId', type: 'uint256', indexed: true },
      { name: 'oldRating', type: 'uint256', indexed: false },
      { name: 'newRating', type: 'uint256', indexed: false },
    ],
  },

  // ── Admin ───────────────────────────────────
  {
    name: 'setResolver',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_resolver', type: 'address' }],
    outputs: [],
  },
  {
    name: 'setStakingContract',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_staking', type: 'address' }],
    outputs: [],
  },
  {
    name: 'setStakingFeePercent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_percent', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdrawFees',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
  },
  {
    name: 'withdrawInsurance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
  },
  {
    name: 'cancelBattle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'battleId', type: 'uint256' }],
    outputs: [],
  },

  // ── State Views ─────────────────────────────
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'stakingContract',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'totalFeesCollected',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'insuranceReserve',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
