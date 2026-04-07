/**
 * ABI for StrategyVault contract
 *
 * Deposits CRwN across 3 DeFi pools based on AI-generated allocation.
 * One vault per Strategy NFT. Allocation in basis points summing to 10000.
 *
 * Chain ID: 43113 (Avalanche Fuji) (Flow Testnet)
 */

export const STRATEGY_VAULT_ABI = [
  // ─── Write Functions ──────────────────────────────────
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nftId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'allocation', type: 'uint256[3]' },
      { name: 'aiProofHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'nftId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'rebalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nftId', type: 'uint256' },
      { name: 'newAllocation', type: 'uint256[3]' },
    ],
    outputs: [],
  },
  // ─── View Functions ───────────────────────────────────
  {
    name: 'getVaultState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'nftId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'depositAmount', type: 'uint256' },
          { name: 'allocation', type: 'uint256[3]' },
          { name: 'active', type: 'bool' },
          { name: 'owner', type: 'address' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'aiProofHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    name: 'isVaultActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'nftId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getPoolAddresses',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
  },
  {
    name: 'crownToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'warriorsNFT',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // ─── Events ───────────────────────────────────────────
  {
    name: 'VaultCreated',
    type: 'event',
    inputs: [
      { name: 'nftId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'allocation', type: 'uint256[3]', indexed: false },
    ],
  },
  {
    name: 'VaultWithdrawn',
    type: 'event',
    inputs: [
      { name: 'nftId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'totalWithdrawn', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'VaultRebalanced',
    type: 'event',
    inputs: [
      { name: 'nftId', type: 'uint256', indexed: true },
      { name: 'newAllocation', type: 'uint256[3]', indexed: false },
    ],
  },
  // ─── Errors ───────────────────────────────────────────
  { name: 'StrategyVault__NotNFTOwner', type: 'error', inputs: [] },
  { name: 'StrategyVault__VaultAlreadyActive', type: 'error', inputs: [] },
  { name: 'StrategyVault__VaultNotActive', type: 'error', inputs: [] },
  { name: 'StrategyVault__InvalidAllocation', type: 'error', inputs: [] },
  { name: 'StrategyVault__InvalidAmount', type: 'error', inputs: [] },
  { name: 'StrategyVault__TransferFailed', type: 'error', inputs: [] },
  { name: 'StrategyVault__WithdrawFailed', type: 'error', inputs: [] },
] as const;
