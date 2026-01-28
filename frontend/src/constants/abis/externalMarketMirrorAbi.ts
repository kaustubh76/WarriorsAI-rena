/**
 * Complete ABI for ExternalMarketMirror Contract
 *
 * Contract Address (Flow Testnet): 0x7485019de6Eca5665057bAe08229F9E660ADEfDa
 * Chain ID: 545
 * Deployed: January 2026
 *
 * This is the SINGLE SOURCE OF TRUTH for the ExternalMarketMirror ABI.
 * All API routes should import from this file.
 *
 * Version: 1.0.0
 * Last Updated: 2026-01-26
 */

export const EXTERNAL_MARKET_MIRROR_ABI = [
  // ============================================================================
  // MARKET CREATION
  // ============================================================================
  {
    name: 'createMirrorMarket',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'externalId', type: 'string' },
      { name: 'source', type: 'uint8' }, // 0 = Polymarket, 1 = Kalshi
      { name: 'question', type: 'string' },
      { name: 'externalYesPrice', type: 'uint256' }, // 0-10000 bps
      { name: 'endTime', type: 'uint256' },
      { name: 'initialLiquidity', type: 'uint256' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },

  // ============================================================================
  // TRADING FUNCTIONS
  // ============================================================================
  {
    name: 'tradeMirror',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
      { name: 'minSharesOut', type: 'uint256' },
    ],
    outputs: [{ name: 'sharesOut', type: 'uint256' }],
  },
  {
    name: 'tradeWithVerifiedPrediction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      {
        name: 'prediction',
        type: 'tuple',
        components: [
          { name: 'outcome', type: 'string' },
          { name: 'confidence', type: 'uint256' },
          { name: 'inputHash', type: 'bytes32' },
          { name: 'outputHash', type: 'bytes32' },
          { name: 'providerAddress', type: 'address' },
          { name: 'isVerified', type: 'bool' },
        ],
      },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [{ name: 'sharesOut', type: 'uint256' }],
  },
  {
    name: 'vrfCopyTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'agentId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },

  // ============================================================================
  // AGENT TRADING FUNCTIONS
  // ============================================================================
  {
    name: 'agentTradeMirror',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'agentId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      {
        name: 'prediction',
        type: 'tuple',
        components: [
          { name: 'outcome', type: 'string' },
          { name: 'confidence', type: 'uint256' },
          { name: 'inputHash', type: 'bytes32' },
          { name: 'outputHash', type: 'bytes32' },
          { name: 'providerAddress', type: 'address' },
          { name: 'isVerified', type: 'bool' },
        ],
      },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [{ name: 'sharesOut', type: 'uint256' }],
  },
  {
    name: 'batchAgentTrade',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKeys', type: 'bytes32[]' },
      { name: 'agentId', type: 'uint256' },
      { name: 'amounts', type: 'uint256[]' },
      {
        name: 'predictions',
        type: 'tuple[]',
        components: [
          { name: 'outcome', type: 'string' },
          { name: 'confidence', type: 'uint256' },
          { name: 'inputHash', type: 'bytes32' },
          { name: 'outputHash', type: 'bytes32' },
          { name: 'providerAddress', type: 'address' },
          { name: 'isVerified', type: 'bool' },
        ],
      },
      { name: 'oracleSignatures', type: 'bytes[]' },
    ],
    outputs: [{ name: 'totalSharesOut', type: 'uint256' }],
  },

  // ============================================================================
  // ORACLE FUNCTIONS
  // ============================================================================
  {
    name: 'syncPrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'newExternalPrice', type: 'uint256' },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'resolveMirror',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32' },
      { name: 'yesWon', type: 'bool' },
      { name: 'oracleSignature', type: 'bytes' },
    ],
    outputs: [],
  },

  // ============================================================================
  // VIEW FUNCTIONS
  // ============================================================================
  {
    name: 'getMirrorKey',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'source', type: 'uint8' },
      { name: 'externalId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'getMirrorMarket',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'flowMarketId', type: 'uint256' },
          {
            name: 'externalLink',
            type: 'tuple',
            components: [
              { name: 'externalId', type: 'string' },
              { name: 'source', type: 'uint8' },
              { name: 'lastSyncPrice', type: 'uint256' },
              { name: 'lastSyncTime', type: 'uint256' },
              { name: 'isActive', type: 'bool' },
            ],
          },
          { name: 'totalMirrorVolume', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'creator', type: 'address' },
        ],
      },
    ],
  },
  {
    name: 'getMirrorKeyByFlowId',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'flowMarketId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'isMirrored',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'source', type: 'uint8' },
      { name: 'externalId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getVerifiedPrediction',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'mirrorKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'outcome', type: 'string' },
          { name: 'confidence', type: 'uint256' },
          { name: 'inputHash', type: 'bytes32' },
          { name: 'outputHash', type: 'bytes32' },
          { name: 'providerAddress', type: 'address' },
          { name: 'isVerified', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'totalMirrors',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalMirrorVolume',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'oracleAddress',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },

  // ============================================================================
  // ADMIN FUNCTIONS
  // ============================================================================
  {
    name: 'setOracle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_oracle', type: 'address' }],
    outputs: [],
  },
  {
    name: 'setAgentContract',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_agentContract', type: 'address' }],
    outputs: [],
  },

  // ============================================================================
  // VRF CALLBACK (Internal - included for completeness)
  // ============================================================================
  {
    name: 'fulfillRandomness',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'uint256' },
      { name: 'randomness', type: 'uint256' },
    ],
    outputs: [],
  },

  // ============================================================================
  // EVENTS
  // ============================================================================
  {
    name: 'MirrorMarketRequested',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'externalId', type: 'string', indexed: false },
      { name: 'source', type: 'uint8', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
    ],
  },
  {
    name: 'MirrorMarketCreated',
    type: 'event',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'flowMarketId', type: 'uint256', indexed: false },
      { name: 'externalId', type: 'string', indexed: false },
      { name: 'source', type: 'uint8', indexed: false },
      { name: 'adjustedPrice', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'MirrorPriceSynced',
    type: 'event',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'oldPrice', type: 'uint256', indexed: false },
      { name: 'newPrice', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'MirrorTradeExecuted',
    type: 'event',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'tokensReceived', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'VRFCopyTradeRequested',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'mirrorKey', type: 'bytes32', indexed: false },
      { name: 'agentId', type: 'uint256', indexed: false },
      { name: 'follower', type: 'address', indexed: true },
    ],
  },
  {
    name: 'VRFCopyTradeExecuted',
    type: 'event',
    inputs: [
      { name: 'requestId', type: 'uint256', indexed: true },
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'follower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'MirrorResolved',
    type: 'event',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'yesWon', type: 'bool', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'OracleUpdated',
    type: 'event',
    inputs: [
      { name: 'oldOracle', type: 'address', indexed: true },
      { name: 'newOracle', type: 'address', indexed: true },
    ],
  },
  {
    name: 'PredictionStored',
    type: 'event',
    inputs: [
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'outcome', type: 'string', indexed: false },
      { name: 'confidence', type: 'uint256', indexed: false },
      { name: 'isVerified', type: 'bool', indexed: false },
    ],
  },
  {
    name: 'AgentContractUpdated',
    type: 'event',
    inputs: [
      { name: 'oldContract', type: 'address', indexed: true },
      { name: 'newContract', type: 'address', indexed: true },
    ],
  },
  {
    name: 'AgentTradeExecuted',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'mirrorKey', type: 'bytes32', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'sharesOut', type: 'uint256', indexed: false },
      { name: 'predictionHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

// Type exports for TypeScript
export type ExternalMarketMirrorABI = typeof EXTERNAL_MARKET_MIRROR_ABI;
