/**
 * ABI for CRwNStaking.sol
 * Stake CRwN → receive stCRwN receipt token. Protocol fees increase exchange rate.
 */
export const STAKING_ABI = [
  // ── Write Functions ────────────────────────────
  {
    name: 'stake',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'requestUnstake',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'stCrwnAmount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'completeUnstake',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'distributeFees',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'stakeWarrior',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'nftId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'unstakeWarrior',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // ── View Functions ─────────────────────────────
  {
    name: 'getExchangeRate',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getTotalStaked',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getStakedBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getWarriorBoost',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'nftId', type: 'uint256' },
      { name: 'boostBps', type: 'uint256' },
    ],
  },
  {
    name: 'unstakeRequests',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'crwnAmount', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
    ],
  },
  {
    name: 'COOLDOWN_PERIOD',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalCRwNStaked',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'authorizedFeeSources',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  // ── Events ─────────────────────────────────────
  {
    name: 'Staked',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'crwnAmount', type: 'uint256', indexed: false },
      { name: 'stCrwnMinted', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'UnstakeRequested',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'stCrwnAmount', type: 'uint256', indexed: false },
      { name: 'crwnAmount', type: 'uint256', indexed: false },
      { name: 'unlockTime', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'UnstakeCompleted',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'crwnAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'FeesDistributed',
    type: 'event',
    inputs: [
      { name: 'source', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'WarriorStaked',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'nftId', type: 'uint256', indexed: true },
      { name: 'boostBps', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'WarriorUnstaked',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'nftId', type: 'uint256', indexed: true },
    ],
  },
  // ── Errors ─────────────────────────────────────
  { name: 'Staking__InvalidAmount', type: 'error', inputs: [] },
  { name: 'Staking__NoUnstakeRequest', type: 'error', inputs: [] },
  { name: 'Staking__CooldownNotMet', type: 'error', inputs: [] },
  { name: 'Staking__TransferFailed', type: 'error', inputs: [] },
  { name: 'Staking__NotWarriorOwner', type: 'error', inputs: [] },
  { name: 'Staking__WarriorAlreadyStaked', type: 'error', inputs: [] },
  { name: 'Staking__NoWarriorStaked', type: 'error', inputs: [] },
  { name: 'Staking__Unauthorized', type: 'error', inputs: [] },
] as const;

/**
 * ABI for stCRwN.sol — Receipt token (ERC20)
 * Only CRwNStaking can mint/burn.
 */
export const STCRWN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
