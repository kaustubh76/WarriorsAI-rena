# Polymarket & Kalshi Integration Plan - Warriors AI dApp

> **Inspired by [Simmer Markets](https://www.simmer.markets/) - AI-Native Prediction Markets**
>
> **Dual-Chain Architecture**: 0G (AI Compute + Storage + iNFT) + Flow (Trading + VRF)

---

## Executive Summary

Build a comprehensive external market aggregation system that:
- **Imports** markets from Polymarket and Kalshi
- **Analyzes** them using 0G verified AI compute
- **Stores** market snapshots in 0G decentralized storage
- **Trades** on Flow chain with VRF-enhanced randomness
- **Enables** AI Agent iNFTs to trade across platforms
- **Tracks** whale movements with copy trading

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  /markets    │  │  /external   │  │  /portfolio  │  │   /whale-tracker        │  │
│  │  (unified)   │  │  (poly/kal)  │  │  (multi-src) │  │   (alerts + copy)       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────────┬─────────────┘  │
│         │                 │                 │                      │                │
│  ┌──────┴─────────────────┴─────────────────┴──────────────────────┴──────────────┐ │
│  │                              HOOKS LAYER                                        │ │
│  │  useUnifiedMarkets │ useExternalTrade │ useWhaleAlerts │ use0GMarketAnalysis   │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────┬──────────────────────────────────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────────────────────────┐
│                              API ROUTES      │                                       │
│  ┌───────────────────────────────────────────┴────────────────────────────────────┐ │
│  │  /api/external/polymarket  │  /api/external/kalshi  │  /api/external/trade     │ │
│  │  /api/0g/market-inference  │  /api/0g/market-store  │  /api/whale-alerts       │ │
│  │  /api/flow/vrf-trade       │  /api/flow/execute     │  /api/copy-trade/ext     │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────┬──────────────────────────────────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────────────────────────┐
│                           SERVICES LAYER     │                                       │
│                                              │                                       │
│   ┌──────────────────────────────────────────┴─────────────────────────────────┐    │
│   │                     0G INTEGRATION LAYER                                    │    │
│   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │    │
│   │  │ 0G Compute     │  │ 0G Storage     │  │ iNFT Market Agents         │    │    │
│   │  │ - Market AI    │  │ - Snapshots    │  │ - Cross-platform trading   │    │    │
│   │  │ - Predictions  │  │ - History      │  │ - Verified predictions     │    │    │
│   │  │ - Verification │  │ - RAG Context  │  │ - Copy trading enabled     │    │    │
│   │  └────────────────┘  └────────────────┘  └────────────────────────────┘    │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                              │                                       │
│   ┌──────────────────────────────────────────┴─────────────────────────────────┐    │
│   │                     FLOW CHAIN LAYER                                        │    │
│   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │    │
│   │  │ VRF Oracle     │  │ Mirror Markets │  │ Trade Execution            │    │    │
│   │  │ - Randomness   │  │ - Poly mirrors │  │ - All txns on Flow         │    │    │
│   │  │ - Fair pricing │  │ - Kalshi sync  │  │ - Gas efficient            │    │    │
│   │  │ - Provable     │  │ - Real-time    │  │ - Copy trade cascade       │    │    │
│   │  └────────────────┘  └────────────────┘  └────────────────────────────┘    │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
│                                              │                                       │
│   ┌──────────────────────────────────────────┴─────────────────────────────────┐    │
│   │                     EXTERNAL MARKET LAYER                                   │    │
│   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │    │
│   │  │ PolymarketSvc  │  │ KalshiSvc      │  │ WhaleTrackerSvc            │    │    │
│   │  │ - Gamma API    │  │ - Trade API    │  │ - WebSocket streams        │    │    │
│   │  │ - CLOB API     │  │ - Auth/JWT     │  │ - Alert system             │    │    │
│   │  │ - WebSocket    │  │ - WebSocket    │  │ - Copy trading             │    │    │
│   │  └────────────────┘  └────────────────┘  └────────────────────────────┘    │    │
│   └────────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────┬──────────────────────────────────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────────────────────────┐
│                           DATA LAYER         │                                       │
│  ┌─────────────────────┐  ┌─────────────────┴───────┐  ┌─────────────────────────┐  │
│  │ Prisma + SQLite     │  │ 0G Decentralized Storage│  │ Flow Chain State        │  │
│  │ - Market cache      │  │ - Market snapshots      │  │ - Mirror market state   │  │
│  │ - Whale trades      │  │ - Prediction history    │  │ - Position tracking     │  │
│  │ - User prefs        │  │ - RAG indexes           │  │ - VRF results           │  │
│  └─────────────────────┘  └─────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Chain Architecture

### Dual-Chain Design Philosophy

| Chain | Purpose | Why |
|-------|---------|-----|
| **0G Galileo (16602)** | AI Compute, Storage, iNFT Agents | Verified AI inference, decentralized storage, ERC-7857 iNFTs |
| **Flow Testnet (545)** | All Trading Transactions | Fast finality, low gas, native VRF, existing market contracts |

### Transaction Flow

```
External Market Data (Polymarket/Kalshi)
         │
         ▼
┌─────────────────────────────────────┐
│  0G COMPUTE: AI Analysis            │  Chain: 0G Galileo (16602)
│  - Generate verified predictions    │
│  - Cryptographic proofs             │
│  - Store in 0G Storage              │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  0G STORAGE: Market Snapshots       │  Network: 0G Storage
│  - Historical data for RAG          │
│  - Prediction audit trail           │
│  - Whale trade history              │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  FLOW CHAIN: Trade Execution        │  Chain: Flow Testnet (545)
│  - Mirror market creation           │
│  - VRF-enhanced pricing             │
│  - All buy/sell transactions        │
│  - Copy trade cascade               │
└─────────────────────────────────────┘
```

---

## Key Features

### 1. 0G Verified Market Analysis

**AI agents analyze external markets using 0G Compute with cryptographic proofs:**

```typescript
// Market Analysis via 0G Compute
interface MarketAnalysisRequest {
  marketId: string;
  source: 'polymarket' | 'kalshi';
  marketData: {
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
    endTime: number;
  };
  historicalContext: string; // From 0G Storage RAG
}

interface VerifiedMarketPrediction {
  outcome: 'yes' | 'no';
  confidence: number;           // 0-100
  reasoning: string;
  isVerified: boolean;          // MUST be true for trading
  proof: {
    inputHash: string;          // keccak256(prompt)
    outputHash: string;         // keccak256(prediction)
    providerAddress: Address;   // 0G compute provider
    modelHash: string;
  };
  timestamp: number;
  chatId: string;               // 0G session ID
}
```

### 2. 0G Storage for Market History

**Store market snapshots for RAG-enhanced predictions:**

```typescript
// Market Snapshot stored in 0G
interface ExternalMarketSnapshot {
  marketId: string;
  source: MarketSource;
  question: string;
  timestamp: number;

  // Price data
  yesPrice: number;
  noPrice: number;
  volume: string;
  liquidity: string;

  // Predictions made
  predictions: {
    agentId: bigint;
    outcome: 'yes' | 'no';
    confidence: number;
    isVerified: boolean;
    proof: string;
  }[];

  // Whale activity
  whaleTradesInWindow: WhaleTrade[];

  // Resolution (if resolved)
  resolved?: boolean;
  actualOutcome?: 'yes' | 'no';
}

// RAG Query for context
async function getMarketContext(
  marketQuestion: string,
  source: MarketSource,
  maxSnapshots: number = 10
): Promise<ExternalMarketSnapshot[]> {
  // Query 0G Storage index for similar markets
  // Returns historical context for AI analysis
}
```

### 3. iNFT Agents for Cross-Platform Trading

**Extend AIAgentINFT to trade on external markets:**

```solidity
// New fields in AgentOnChainData
struct AgentOnChainData {
    AgentTier tier;
    uint256 stakedAmount;
    bool isActive;
    bool copyTradingEnabled;

    // NEW: External market permissions
    bool polymarketEnabled;      // Can trade Polymarket mirrors
    bool kalshiEnabled;          // Can trade Kalshi mirrors
    uint256 externalTradeCount;  // Track external trades
    int256 externalPnL;          // External market P&L

    uint256 createdAt;
    uint256 lastUpdatedAt;
}

// New function to enable external trading
function enableExternalTrading(
    uint256 tokenId,
    bool polymarket,
    bool kalshi
) external onlyTokenOwnerOrAuthorized(tokenId);

// Track external trades
function recordExternalTrade(
    uint256 tokenId,
    string calldata source,      // "polymarket" or "kalshi"
    string calldata marketId,
    bool won,
    int256 pnl
) external onlyOracle;
```

### 4. Flow VRF Integration

**Use Flow's native VRF for fair market pricing and randomness:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@flow/contracts/FlowRandomness.sol";

contract ExternalMarketMirror is FlowRandomConsumer {

    // VRF-enhanced market creation
    function createMirrorMarket(
        string calldata externalId,
        string calldata source,      // "polymarket" or "kalshi"
        string calldata question,
        uint256 externalYesPrice,    // External market price
        uint256 externalNoPrice,
        uint256 endTime,
        uint256 initialLiquidity
    ) external returns (uint256 marketId) {
        // Request VRF for initial price variance
        uint256 requestId = requestRandomness();

        pendingMarkets[requestId] = PendingMarket({
            externalId: externalId,
            source: source,
            question: question,
            externalYesPrice: externalYesPrice,
            externalNoPrice: externalNoPrice,
            endTime: endTime,
            initialLiquidity: initialLiquidity,
            creator: msg.sender
        });

        emit MirrorMarketRequested(requestId, externalId, source);
    }

    // VRF callback - create market with fair initial price
    function fulfillRandomness(
        uint256 requestId,
        uint256 randomness
    ) internal override {
        PendingMarket memory pending = pendingMarkets[requestId];

        // Use VRF to add slight variance to prevent front-running
        // Variance: ±2% of external price
        uint256 variance = (randomness % 400) - 200; // -200 to +199 bps

        uint256 adjustedYesPrice = pending.externalYesPrice +
            (pending.externalYesPrice * variance / 10000);

        // Clamp to valid range
        if (adjustedYesPrice < 100) adjustedYesPrice = 100;   // 1%
        if (adjustedYesPrice > 9900) adjustedYesPrice = 9900; // 99%

        uint256 marketId = _createMarket(
            pending.question,
            pending.endTime,
            adjustedYesPrice,
            10000 - adjustedYesPrice,
            pending.initialLiquidity,
            pending.creator
        );

        // Link to external market
        mirrorToExternal[marketId] = ExternalLink({
            externalId: pending.externalId,
            source: pending.source,
            lastSyncPrice: adjustedYesPrice,
            lastSyncTime: block.timestamp
        });

        emit MirrorMarketCreated(marketId, pending.externalId, pending.source);

        delete pendingMarkets[requestId];
    }

    // VRF-enhanced trade execution for copy trades
    function executeVRFCopyTrade(
        uint256 agentId,
        uint256 marketId,
        bool isYes,
        uint256 amount
    ) external returns (uint256 requestId) {
        // Request randomness for execution timing variance
        requestId = requestRandomness();

        pendingCopyTrades[requestId] = PendingCopyTrade({
            agentId: agentId,
            marketId: marketId,
            isYes: isYes,
            amount: amount,
            follower: msg.sender
        });

        emit CopyTradeRequested(requestId, agentId, marketId);
    }

    // Sync mirror market with external source
    function syncMirrorPrice(
        uint256 marketId,
        uint256 newExternalYesPrice,
        bytes calldata oracleProof
    ) external onlyOracle {
        // Verify oracle proof (0G signed attestation)
        require(verifyOracleProof(oracleProof), "Invalid proof");

        ExternalLink storage link = mirrorToExternal[marketId];

        // Only sync if significant price change (>5%)
        uint256 priceDiff = newExternalYesPrice > link.lastSyncPrice
            ? newExternalYesPrice - link.lastSyncPrice
            : link.lastSyncPrice - newExternalYesPrice;

        if (priceDiff * 100 / link.lastSyncPrice >= 5) {
            // Apply gradual price adjustment
            _adjustMarketPrice(marketId, newExternalYesPrice);

            link.lastSyncPrice = newExternalYesPrice;
            link.lastSyncTime = block.timestamp;

            emit MirrorPriceSynced(marketId, link.externalId, newExternalYesPrice);
        }
    }
}
```

### 5. Whale Tracking with Copy Trading

**Real-time whale monitoring with automated copy trading:**

```typescript
// Whale Trade Detection
interface WhaleTradeAlert {
  id: string;
  source: MarketSource;
  marketId: string;
  marketQuestion: string;

  // Trade details
  traderAddress?: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  amountUsd: string;
  shares: string;
  price: number;

  // Timing
  timestamp: number;
  detectedAt: number;           // When we detected it
  latencyMs: number;            // Detection latency

  // Verification (stored in 0G)
  storageRootHash?: string;     // 0G Storage reference
}

// Copy Trade Configuration for External Markets
interface ExternalCopyTradeConfig {
  traderAddress: string;
  source: MarketSource;

  // Limits
  maxAmountPerTrade: string;    // Max USD per trade
  maxDailyAmount: string;       // Daily limit

  // Filters
  minTradeSize: string;         // Only copy trades above this
  allowedCategories?: string[]; // Market categories to copy

  // Execution
  executionDelay: number;       // Delay in seconds (0 = immediate)
  useVRF: boolean;              // Use VRF for timing variance

  // Flow chain execution
  flowWalletApproved: boolean;  // CRwN approved for mirror markets
}
```

---

## Smart Contracts (Flow Chain - 545)

### New Contract: ExternalMarketMirror.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IFlowVRF.sol";
import "./interfaces/IPredictionMarket.sol";

/**
 * @title ExternalMarketMirror
 * @notice Creates mirror markets on Flow for Polymarket/Kalshi markets
 * @dev Uses Flow VRF for fair pricing and 0G oracle for price sync
 */
contract ExternalMarketMirror is Ownable, ReentrancyGuard {

    // ============ STATE ============

    IERC20 public immutable crwnToken;
    IPredictionMarket public immutable predictionMarket;
    IFlowVRF public immutable flowVRF;

    // External market source tracking
    enum MarketSource { POLYMARKET, KALSHI }

    struct ExternalLink {
        string externalId;
        MarketSource source;
        uint256 lastSyncPrice;
        uint256 lastSyncTime;
        bool isActive;
    }

    struct MirrorMarket {
        uint256 flowMarketId;       // ID in PredictionMarketAMM
        ExternalLink external_;
        uint256 totalMirrorVolume;
        uint256 createdAt;
    }

    // Mappings
    mapping(bytes32 => MirrorMarket) public mirrorMarkets;  // keccak256(source, externalId) => MirrorMarket
    mapping(uint256 => bytes32) public flowToMirror;        // flowMarketId => mirrorKey

    // VRF pending requests
    mapping(uint256 => PendingMarketCreate) public pendingCreates;
    mapping(uint256 => PendingCopyTrade) public pendingCopyTrades;

    struct PendingMarketCreate {
        string externalId;
        MarketSource source;
        string question;
        uint256 externalYesPrice;
        uint256 endTime;
        uint256 initialLiquidity;
        address creator;
    }

    struct PendingCopyTrade {
        bytes32 mirrorKey;
        uint256 agentId;
        bool isYes;
        uint256 amount;
        address follower;
    }

    // Oracle address (0G verified signer)
    address public oracleAddress;

    // ============ EVENTS ============

    event MirrorMarketRequested(uint256 indexed requestId, string externalId, MarketSource source);
    event MirrorMarketCreated(bytes32 indexed mirrorKey, uint256 flowMarketId, string externalId);
    event MirrorPriceSynced(bytes32 indexed mirrorKey, uint256 newPrice, uint256 timestamp);
    event MirrorTradeExecuted(bytes32 indexed mirrorKey, address trader, bool isYes, uint256 amount);
    event VRFCopyTradeExecuted(uint256 indexed requestId, bytes32 mirrorKey, address follower);

    // ============ CONSTRUCTOR ============

    constructor(
        address _crwnToken,
        address _predictionMarket,
        address _flowVRF,
        address _oracle
    ) {
        crwnToken = IERC20(_crwnToken);
        predictionMarket = IPredictionMarket(_predictionMarket);
        flowVRF = IFlowVRF(_flowVRF);
        oracleAddress = _oracle;
    }

    // ============ MIRROR MARKET CREATION ============

    /**
     * @notice Create a mirror market for an external Polymarket/Kalshi market
     * @param externalId The market ID on the external platform
     * @param source POLYMARKET or KALSHI
     * @param question The market question
     * @param externalYesPrice Current YES price on external (0-10000 = 0-100%)
     * @param endTime Market end timestamp
     * @param initialLiquidity Initial CRwN liquidity
     */
    function createMirrorMarket(
        string calldata externalId,
        MarketSource source,
        string calldata question,
        uint256 externalYesPrice,
        uint256 endTime,
        uint256 initialLiquidity
    ) external nonReentrant returns (uint256 requestId) {
        require(bytes(externalId).length > 0, "Empty external ID");
        require(externalYesPrice > 0 && externalYesPrice < 10000, "Invalid price");
        require(endTime > block.timestamp, "Invalid end time");
        require(initialLiquidity >= 100 ether, "Min 100 CRwN liquidity");

        // Check not already mirrored
        bytes32 mirrorKey = getMirrorKey(source, externalId);
        require(!mirrorMarkets[mirrorKey].external_.isActive, "Already mirrored");

        // Transfer liquidity
        crwnToken.transferFrom(msg.sender, address(this), initialLiquidity);

        // Request VRF for fair initial pricing
        requestId = flowVRF.requestRandomness();

        pendingCreates[requestId] = PendingMarketCreate({
            externalId: externalId,
            source: source,
            question: question,
            externalYesPrice: externalYesPrice,
            endTime: endTime,
            initialLiquidity: initialLiquidity,
            creator: msg.sender
        });

        emit MirrorMarketRequested(requestId, externalId, source);
    }

    /**
     * @notice VRF callback to finalize mirror market creation
     */
    function fulfillRandomness(uint256 requestId, uint256 randomness) external {
        require(msg.sender == address(flowVRF), "Only VRF");

        PendingMarketCreate memory pending = pendingCreates[requestId];
        require(pending.creator != address(0), "Unknown request");

        // Apply VRF variance: ±2% to prevent front-running
        int256 variance = int256(randomness % 400) - 200;
        uint256 adjustedPrice = uint256(int256(pending.externalYesPrice) + variance);

        // Clamp to valid range
        if (adjustedPrice < 100) adjustedPrice = 100;
        if (adjustedPrice > 9900) adjustedPrice = 9900;

        // Approve and create market
        crwnToken.approve(address(predictionMarket), pending.initialLiquidity);

        uint256 flowMarketId = predictionMarket.createMarket(
            pending.question,
            pending.endTime,
            pending.initialLiquidity
        );

        // Store mirror link
        bytes32 mirrorKey = getMirrorKey(pending.source, pending.externalId);
        mirrorMarkets[mirrorKey] = MirrorMarket({
            flowMarketId: flowMarketId,
            external_: ExternalLink({
                externalId: pending.externalId,
                source: pending.source,
                lastSyncPrice: adjustedPrice,
                lastSyncTime: block.timestamp,
                isActive: true
            }),
            totalMirrorVolume: 0,
            createdAt: block.timestamp
        });

        flowToMirror[flowMarketId] = mirrorKey;

        emit MirrorMarketCreated(mirrorKey, flowMarketId, pending.externalId);

        delete pendingCreates[requestId];
    }

    // ============ TRADING ============

    /**
     * @notice Trade on a mirror market
     */
    function tradeMirror(
        bytes32 mirrorKey,
        bool isYes,
        uint256 amount,
        uint256 minSharesOut
    ) external nonReentrant returns (uint256 sharesOut) {
        MirrorMarket storage mirror = mirrorMarkets[mirrorKey];
        require(mirror.external_.isActive, "Mirror not active");

        crwnToken.transferFrom(msg.sender, address(this), amount);
        crwnToken.approve(address(predictionMarket), amount);

        sharesOut = predictionMarket.buy(
            mirror.flowMarketId,
            isYes,
            amount,
            minSharesOut
        );

        mirror.totalMirrorVolume += amount;

        emit MirrorTradeExecuted(mirrorKey, msg.sender, isYes, amount);
    }

    /**
     * @notice VRF-enhanced copy trade for followers
     * @dev Uses VRF to add timing variance, preventing front-running
     */
    function vrfCopyTrade(
        bytes32 mirrorKey,
        uint256 agentId,
        bool isYes,
        uint256 amount
    ) external nonReentrant returns (uint256 requestId) {
        require(mirrorMarkets[mirrorKey].external_.isActive, "Mirror not active");

        crwnToken.transferFrom(msg.sender, address(this), amount);

        requestId = flowVRF.requestRandomness();

        pendingCopyTrades[requestId] = PendingCopyTrade({
            mirrorKey: mirrorKey,
            agentId: agentId,
            isYes: isYes,
            amount: amount,
            follower: msg.sender
        });
    }

    function fulfillCopyTradeRandomness(uint256 requestId, uint256 randomness) external {
        require(msg.sender == address(flowVRF), "Only VRF");

        PendingCopyTrade memory pending = pendingCopyTrades[requestId];
        require(pending.follower != address(0), "Unknown request");

        MirrorMarket storage mirror = mirrorMarkets[pending.mirrorKey];

        crwnToken.approve(address(predictionMarket), pending.amount);

        // Execute with slight slippage based on VRF
        uint256 slippageBps = randomness % 100; // 0-0.99% variance
        uint256 minOut = pending.amount * (10000 - slippageBps) / 10000;

        predictionMarket.buy(
            mirror.flowMarketId,
            pending.isYes,
            pending.amount,
            minOut
        );

        mirror.totalMirrorVolume += pending.amount;

        emit VRFCopyTradeExecuted(requestId, pending.mirrorKey, pending.follower);

        delete pendingCopyTrades[requestId];
    }

    // ============ ORACLE FUNCTIONS ============

    /**
     * @notice Sync mirror market price with external source
     * @dev Only callable by 0G oracle with valid proof
     */
    function syncPrice(
        bytes32 mirrorKey,
        uint256 newExternalPrice,
        bytes calldata oracleSignature
    ) external {
        // Verify 0G oracle signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            mirrorKey,
            newExternalPrice,
            block.chainid
        ));
        require(verifySignature(messageHash, oracleSignature), "Invalid oracle sig");

        ExternalLink storage link = mirrorMarkets[mirrorKey].external_;
        require(link.isActive, "Mirror not active");

        // Only sync if >5% price change
        uint256 priceDiff = newExternalPrice > link.lastSyncPrice
            ? newExternalPrice - link.lastSyncPrice
            : link.lastSyncPrice - newExternalPrice;

        if (priceDiff * 100 / link.lastSyncPrice >= 5) {
            link.lastSyncPrice = newExternalPrice;
            link.lastSyncTime = block.timestamp;

            emit MirrorPriceSynced(mirrorKey, newExternalPrice, block.timestamp);
        }
    }

    /**
     * @notice Resolve mirror market based on external outcome
     */
    function resolveMirror(
        bytes32 mirrorKey,
        bool yesWon,
        bytes calldata oracleSignature
    ) external {
        bytes32 messageHash = keccak256(abi.encodePacked(
            mirrorKey,
            yesWon,
            "RESOLVE",
            block.chainid
        ));
        require(verifySignature(messageHash, oracleSignature), "Invalid oracle sig");

        MirrorMarket storage mirror = mirrorMarkets[mirrorKey];
        require(mirror.external_.isActive, "Not active");

        predictionMarket.resolveMarket(mirror.flowMarketId, yesWon);
        mirror.external_.isActive = false;
    }

    // ============ HELPERS ============

    function getMirrorKey(MarketSource source, string memory externalId)
        public pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(uint8(source), externalId));
    }

    function verifySignature(bytes32 messageHash, bytes memory signature)
        internal view returns (bool)
    {
        bytes32 ethHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            messageHash
        ));

        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethHash, v, r, s) == oracleAddress;
    }

    function splitSignature(bytes memory sig)
        internal pure returns (bytes32 r, bytes32 s, uint8 v)
    {
        require(sig.length == 65, "Invalid sig length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
```

### New Contract: FlowVRFConsumer.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlowVRFConsumer
 * @notice Interface for Flow's native VRF (Verifiable Random Function)
 * @dev Flow provides native randomness through Cadence - this is the EVM bridge
 */
interface IFlowVRF {
    function requestRandomness() external returns (uint256 requestId);
    function getRandomness(uint256 requestId) external view returns (uint256);
}

/**
 * @title FlowVRFOracle
 * @notice Oracle contract that bridges Flow's native randomness to EVM
 */
contract FlowVRFOracle is IFlowVRF {

    uint256 private nonce;
    mapping(uint256 => uint256) public randomResults;
    mapping(uint256 => address) public requestToConsumer;
    mapping(uint256 => bool) public fulfilled;

    event RandomnessRequested(uint256 indexed requestId, address consumer);
    event RandomnessFulfilled(uint256 indexed requestId, uint256 randomness);

    // Authorized fulfiller (bridge from Cadence)
    address public fulfiller;

    constructor(address _fulfiller) {
        fulfiller = _fulfiller;
    }

    function requestRandomness() external returns (uint256 requestId) {
        requestId = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            nonce++
        )));

        requestToConsumer[requestId] = msg.sender;

        emit RandomnessRequested(requestId, msg.sender);
    }

    /**
     * @notice Fulfill randomness from Flow Cadence layer
     * @dev Called by the authorized bridge
     */
    function fulfillRandomness(uint256 requestId, uint256 randomness) external {
        require(msg.sender == fulfiller, "Only fulfiller");
        require(!fulfilled[requestId], "Already fulfilled");
        require(requestToConsumer[requestId] != address(0), "Unknown request");

        randomResults[requestId] = randomness;
        fulfilled[requestId] = true;

        // Callback to consumer
        address consumer = requestToConsumer[requestId];
        (bool success,) = consumer.call(
            abi.encodeWithSignature("fulfillRandomness(uint256,uint256)", requestId, randomness)
        );
        require(success, "Callback failed");

        emit RandomnessFulfilled(requestId, randomness);
    }

    function getRandomness(uint256 requestId) external view returns (uint256) {
        require(fulfilled[requestId], "Not fulfilled");
        return randomResults[requestId];
    }
}
```

---

## Services Implementation

### 1. External Market Service with 0G Integration

**File: `frontend/src/services/externalMarkets/externalMarketService.ts`**

```typescript
import { zeroGComputeService } from '../zeroGComputeService';
import { zeroGStorageService } from '../zeroGStorageService';
import { polymarketService } from './polymarketService';
import { kalshiService } from './kalshiService';

/**
 * External Market Service
 * Integrates Polymarket/Kalshi with 0G AI and Flow trading
 */
class ExternalMarketService {

  // ============ 0G VERIFIED MARKET ANALYSIS ============

  /**
   * Analyze external market using 0G verified AI
   * Returns cryptographically verified prediction
   */
  async analyzeMarket(
    market: UnifiedMarket,
    agentId: bigint
  ): Promise<VerifiedMarketPrediction> {

    // 1. Get historical context from 0G Storage (RAG)
    const historicalContext = await this.getMarketContext(market);

    // 2. Build analysis prompt
    const prompt = this.buildAnalysisPrompt(market, historicalContext);

    // 3. Call 0G Compute for verified inference
    const response = await fetch('/api/0g/market-inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketId: market.id,
        source: market.source,
        prompt,
        agentId: agentId.toString(),
      }),
    });

    const result = await response.json();

    if (!result.isVerified) {
      throw new Error('0G verification failed - cannot use for trading');
    }

    // 4. Store prediction in 0G for audit trail
    await this.storePrediction(market, result);

    return {
      marketId: market.id,
      outcome: result.prediction.outcome,
      confidence: result.prediction.confidence,
      reasoning: result.prediction.reasoning,
      isVerified: result.isVerified,
      proof: result.proof,
      timestamp: Date.now(),
      chatId: result.chatId,
    };
  }

  /**
   * Get historical market context from 0G Storage
   */
  async getMarketContext(market: UnifiedMarket): Promise<string> {
    try {
      // Query 0G Storage for similar markets
      const response = await fetch('/api/0g/market-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: market.question,
          source: market.source,
          category: market.category,
          maxResults: 10,
        }),
      });

      const { snapshots } = await response.json();

      // Format context for AI
      return this.formatContextForAI(snapshots);
    } catch (error) {
      console.warn('Failed to get 0G context, proceeding without:', error);
      return '';
    }
  }

  /**
   * Store market snapshot and prediction in 0G
   */
  async storePrediction(
    market: UnifiedMarket,
    prediction: VerifiedMarketPrediction
  ): Promise<string> {
    const snapshot: ExternalMarketSnapshot = {
      marketId: market.id,
      source: market.source,
      question: market.question,
      timestamp: Date.now(),
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      liquidity: market.liquidity,
      predictions: [{
        agentId: prediction.agentId,
        outcome: prediction.outcome,
        confidence: prediction.confidence,
        isVerified: prediction.isVerified,
        proof: JSON.stringify(prediction.proof),
      }],
      whaleTradesInWindow: [],
    };

    const response = await fetch('/api/0g/market-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });

    const { rootHash } = await response.json();
    return rootHash;
  }

  // ============ MARKET DATA ============

  async getAllMarkets(filters?: MarketFilters): Promise<UnifiedMarket[]> {
    const [polyMarkets, kalshiMarkets] = await Promise.all([
      this.fetchPolymarketMarkets(filters),
      this.fetchKalshiMarkets(filters),
    ]);

    return [...polyMarkets, ...kalshiMarkets].sort((a, b) =>
      parseFloat(b.volume) - parseFloat(a.volume)
    );
  }

  async fetchPolymarketMarkets(filters?: MarketFilters): Promise<UnifiedMarket[]> {
    if (filters?.source && !filters.source.includes(MarketSource.POLYMARKET)) {
      return [];
    }

    const markets = await polymarketService.getActiveMarkets();
    return markets.map(m => polymarketService.normalizeMarket(m));
  }

  async fetchKalshiMarkets(filters?: MarketFilters): Promise<UnifiedMarket[]> {
    if (filters?.source && !filters.source.includes(MarketSource.KALSHI)) {
      return [];
    }

    const { markets } = await kalshiService.getMarkets('open');
    return markets.map(m => kalshiService.normalizeMarket(m));
  }

  // ============ FLOW MIRROR MARKET ============

  /**
   * Create a mirror market on Flow chain
   * Uses VRF for fair initial pricing
   */
  async createMirrorMarket(
    market: UnifiedMarket,
    initialLiquidity: string,
    walletClient: WalletClient
  ): Promise<{ txHash: string; requestId: bigint }> {

    const source = market.source === MarketSource.POLYMARKET ? 0 : 1;

    const { request } = await publicClient.simulateContract({
      address: EXTERNAL_MARKET_MIRROR_ADDRESS,
      abi: ExternalMarketMirrorABI,
      functionName: 'createMirrorMarket',
      args: [
        market.externalId,
        source,
        market.question,
        BigInt(Math.round(market.yesPrice * 100)), // Convert to bps
        BigInt(market.endTime),
        parseEther(initialLiquidity),
      ],
      account: walletClient.account,
    });

    const txHash = await walletClient.writeContract(request);

    // Wait for VRF fulfillment
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse requestId from event
    const requestId = this.parseRequestIdFromLogs(receipt.logs);

    return { txHash, requestId };
  }

  /**
   * Trade on a mirror market via Flow
   */
  async tradeMirrorMarket(
    mirrorKey: string,
    isYes: boolean,
    amount: string,
    minSharesOut: string,
    walletClient: WalletClient
  ): Promise<string> {

    const { request } = await publicClient.simulateContract({
      address: EXTERNAL_MARKET_MIRROR_ADDRESS,
      abi: ExternalMarketMirrorABI,
      functionName: 'tradeMirror',
      args: [
        mirrorKey as `0x${string}`,
        isYes,
        parseEther(amount),
        parseEther(minSharesOut),
      ],
      account: walletClient.account,
    });

    return walletClient.writeContract(request);
  }

  // ============ HELPERS ============

  private buildAnalysisPrompt(
    market: UnifiedMarket,
    context: string
  ): string {
    return `
You are an expert prediction market analyst. Analyze this external market:

MARKET DETAILS:
- Source: ${market.source}
- Question: ${market.question}
- Current YES Price: ${market.yesPrice}%
- Current NO Price: ${market.noPrice}%
- Volume: $${market.volume}
- Ends: ${new Date(market.endTime).toISOString()}

${context ? `HISTORICAL CONTEXT:\n${context}\n` : ''}

Provide your prediction in this exact JSON format:
{
  "outcome": "yes" or "no",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}

Base your analysis on market dynamics, volume patterns, and any relevant context.
`;
  }

  private formatContextForAI(snapshots: ExternalMarketSnapshot[]): string {
    if (!snapshots.length) return '';

    return `
Previous predictions on similar markets:
${snapshots.map(s => `
- "${s.question}" (${s.source})
  Predicted: ${s.predictions[0]?.outcome} at ${s.predictions[0]?.confidence}% confidence
  Actual: ${s.resolved ? s.actualOutcome : 'pending'}
  ${s.resolved && s.predictions[0]?.outcome === s.actualOutcome ? '✓ Correct' : ''}
`).join('\n')}
`;
  }
}

export const externalMarketService = new ExternalMarketService();
```

### 2. Whale Tracker Service with 0G Storage

**File: `frontend/src/services/externalMarkets/whaleTrackerService.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const WHALE_THRESHOLD = parseInt(process.env.WHALE_THRESHOLD_USD || '10000');

/**
 * Whale Tracker Service
 * Real-time monitoring with 0G Storage audit trail
 */
class WhaleTrackerService {
  private db: PrismaClient;
  private wsConnections: Map<string, WebSocket> = new Map();
  private alertCallbacks: Set<(trade: WhaleTrade) => void> = new Set();

  constructor() {
    this.db = new PrismaClient();
  }

  // ============ REAL-TIME TRACKING ============

  async connectPolymarketStream(): Promise<void> {
    const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/user');

    ws.onopen = () => {
      console.log('Connected to Polymarket whale stream');
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
      }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'trade') {
        const amountUsd = parseFloat(data.size) * parseFloat(data.price);

        if (amountUsd >= WHALE_THRESHOLD) {
          const whaleTrade = this.normalizePolymarketTrade(data);
          await this.handleWhaleTrade(whaleTrade);
        }
      }
    };

    this.wsConnections.set('polymarket', ws);
  }

  async connectKalshiStream(): Promise<void> {
    // Kalshi WebSocket connection
    const ws = new WebSocket('wss://trading-api.kalshi.com/trade-api/ws/v2');

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'trade') {
        const amountUsd = data.count * data.yes_price / 100;

        if (amountUsd >= WHALE_THRESHOLD) {
          const whaleTrade = this.normalizeKalshiTrade(data);
          await this.handleWhaleTrade(whaleTrade);
        }
      }
    };

    this.wsConnections.set('kalshi', ws);
  }

  // ============ WHALE TRADE HANDLING ============

  private async handleWhaleTrade(trade: WhaleTrade): Promise<void> {
    // 1. Store in local database
    await this.db.whaleTrade.create({
      data: {
        source: trade.source,
        marketId: trade.marketId,
        marketQuestion: trade.marketQuestion,
        traderAddress: trade.traderAddress,
        side: trade.side,
        outcome: trade.outcome,
        amountUsd: trade.amountUsd,
        shares: trade.shares,
        price: Math.round(trade.price * 100),
        timestamp: new Date(trade.timestamp),
        txHash: trade.txHash,
      },
    });

    // 2. Store in 0G for permanent audit trail
    await this.storeIn0G(trade);

    // 3. Notify all alert subscribers
    this.alertCallbacks.forEach(callback => {
      try {
        callback(trade);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    });

    // 4. Trigger copy trades for followers
    await this.triggerCopyTrades(trade);
  }

  /**
   * Store whale trade in 0G decentralized storage
   */
  private async storeIn0G(trade: WhaleTrade): Promise<string> {
    try {
      const response = await fetch('/api/0g/market-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'whale_trade',
          data: trade,
        }),
      });

      const { rootHash } = await response.json();

      // Update local record with 0G reference
      await this.db.whaleTrade.update({
        where: { id: trade.id },
        data: { storageRootHash: rootHash },
      });

      return rootHash;
    } catch (error) {
      console.error('Failed to store whale trade in 0G:', error);
      return '';
    }
  }

  /**
   * Trigger copy trades for users following this whale
   */
  private async triggerCopyTrades(trade: WhaleTrade): Promise<void> {
    if (!trade.traderAddress) return;

    // Get followers of this whale
    const followers = await this.db.whaleFollower.findMany({
      where: {
        whaleAddress: trade.traderAddress,
        source: trade.source,
        isActive: true,
      },
    });

    for (const follower of followers) {
      try {
        // Calculate copy amount (respect max per trade)
        const copyAmount = Math.min(
          parseFloat(trade.amountUsd),
          parseFloat(follower.maxAmountPerTrade)
        );

        // Execute copy trade via Flow mirror market
        await fetch('/api/copy-trade/external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerAddress: follower.userAddress,
            whaleTrade: trade,
            copyAmount: copyAmount.toString(),
            useVRF: follower.useVRF,
          }),
        });
      } catch (error) {
        console.error(`Copy trade failed for ${follower.userAddress}:`, error);
      }
    }
  }

  // ============ ALERT SYSTEM ============

  onWhaleAlert(callback: (trade: WhaleTrade) => void): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  // ============ HISTORICAL DATA ============

  async getRecentWhaleTrades(
    limit = 50,
    source?: MarketSource
  ): Promise<WhaleTrade[]> {
    const trades = await this.db.whaleTrade.findMany({
      where: source ? { source } : {},
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return trades.map(this.dbToWhaleTrade);
  }

  /**
   * Get whale trades from 0G Storage (verified historical)
   */
  async getVerifiedWhaleHistory(
    marketId: string,
    source: MarketSource
  ): Promise<WhaleTrade[]> {
    const response = await fetch('/api/0g/market-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'whale_trades',
        marketId,
        source,
      }),
    });

    const { trades } = await response.json();
    return trades;
  }

  // ============ NORMALIZERS ============

  private normalizePolymarketTrade(data: any): WhaleTrade {
    return {
      id: `poly_${data.id || Date.now()}`,
      source: MarketSource.POLYMARKET,
      marketId: data.asset_id,
      marketQuestion: data.market_slug || 'Unknown',
      traderAddress: data.maker,
      side: data.side.toLowerCase() as 'buy' | 'sell',
      outcome: data.outcome || 'yes',
      amountUsd: (parseFloat(data.size) * parseFloat(data.price)).toString(),
      shares: data.size,
      price: parseFloat(data.price),
      timestamp: Date.now(),
      txHash: data.transaction_hash,
    };
  }

  private normalizeKalshiTrade(data: any): WhaleTrade {
    return {
      id: `kalshi_${data.trade_id || Date.now()}`,
      source: MarketSource.KALSHI,
      marketId: data.ticker,
      marketQuestion: data.ticker,
      side: data.taker_side as 'buy' | 'sell',
      outcome: data.taker_side === 'yes' ? 'yes' : 'no',
      amountUsd: ((data.count * data.yes_price) / 100).toString(),
      shares: data.count.toString(),
      price: data.yes_price / 100,
      timestamp: Date.now(),
    };
  }

  private dbToWhaleTrade(db: any): WhaleTrade {
    return {
      id: db.id,
      source: db.source as MarketSource,
      marketId: db.marketId,
      marketQuestion: db.marketQuestion,
      traderAddress: db.traderAddress,
      side: db.side as 'buy' | 'sell',
      outcome: db.outcome as 'yes' | 'no',
      amountUsd: db.amountUsd,
      shares: db.shares,
      price: db.price / 100,
      timestamp: new Date(db.timestamp).getTime(),
      txHash: db.txHash,
    };
  }
}

export const whaleTrackerService = new WhaleTrackerService();
```

---

## API Routes

### 1. 0G Market Inference

**File: `frontend/src/app/api/0g/market-inference/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { keccak256, toBytes } from 'viem';

// Rate limiting
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketId, source, prompt, agentId } = body;

    // Rate limit check
    const clientKey = `${agentId}_market_${marketId}`;
    if (!checkRateLimit(clientKey)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', isVerified: false },
        { status: 429 }
      );
    }

    // Initialize 0G broker
    const broker = await initialize0GBroker();

    // List available providers
    const providers = await broker.inference.listService();
    const healthyProvider = selectHealthyProvider(providers);

    if (!healthyProvider) {
      // Fallback to OpenAI but mark as unverified
      return handleFallback(prompt, marketId);
    }

    // Get auth headers for 0G provider
    await broker.inference.acknowledgeProviderSigner(healthyProvider.provider);
    const headers = await broker.inference.getRequestHeaders(
      healthyProvider.provider,
      healthyProvider.model
    );

    // Call 0G inference
    const inferenceResponse = await fetch(healthyProvider.endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: healthyProvider.model,
        messages: [
          { role: 'system', content: 'You are an expert prediction market analyst.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    const result = await inferenceResponse.json();

    // Process response and generate proof
    await broker.inference.processResponse(
      healthyProvider.provider,
      result.content,
      result.usage?.total_tokens || 0
    );

    // Parse prediction from response
    const prediction = parsePrediction(result.choices[0].message.content);

    // Generate cryptographic proof
    const inputHash = keccak256(toBytes(prompt));
    const outputHash = keccak256(toBytes(JSON.stringify(prediction)));

    const proof = {
      inputHash,
      outputHash,
      providerAddress: healthyProvider.provider,
      modelHash: keccak256(toBytes(healthyProvider.model)),
      timestamp: Date.now(),
    };

    return NextResponse.json({
      success: true,
      chatId: `0g_market_${Date.now()}`,
      prediction,
      proof,
      isVerified: true,
      fallbackMode: false,
      usage: {
        inputTokens: result.usage?.prompt_tokens || 0,
        outputTokens: result.usage?.completion_tokens || 0,
      },
    });

  } catch (error) {
    console.error('0G market inference error:', error);
    return NextResponse.json(
      { error: 'Inference failed', isVerified: false },
      { status: 500 }
    );
  }
}

function parsePrediction(content: string): { outcome: string; confidence: number; reasoning: string } {
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Parse manually if JSON fails
  }

  return {
    outcome: content.toLowerCase().includes('yes') ? 'yes' : 'no',
    confidence: 50,
    reasoning: content,
  };
}

async function handleFallback(prompt: string, marketId: string) {
  // Use OpenAI but explicitly mark as unverified
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const result = await response.json();
  const prediction = parsePrediction(result.choices[0].message.content);

  return NextResponse.json({
    success: true,
    chatId: `fallback_${Date.now()}`,
    prediction,
    proof: null,
    isVerified: false,  // CRITICAL: Mark unverified
    fallbackMode: true,
    warning: 'Using fallback AI - NOT suitable for real trading',
  });
}
```

### 2. 0G Market Storage

**File: `frontend/src/app/api/0g/market-store/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data, snapshot } = body;

    // Dynamically import 0G SDK
    const { ZgFile, getFlowContract, Indexer } = await import('@0glabs/0g-ts-sdk');
    const { ethers } = await import('ethers');

    // Initialize 0G
    const privateKey = process.env.ZEROG_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('0G private key not configured');
    }

    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_0G_STORAGE_RPC);
    const signer = new ethers.Wallet(privateKey, provider);

    // Prepare data
    const storeData = type === 'whale_trade'
      ? { type: 'whale_trade', trade: data, timestamp: Date.now() }
      : { type: 'market_snapshot', snapshot, timestamp: Date.now() };

    const jsonData = JSON.stringify(storeData, null, 2);

    // Write to temp file
    const tempPath = join(os.tmpdir(), `0g_market_${Date.now()}.json`);
    await writeFile(tempPath, jsonData);

    // Create ZgFile and upload
    const zgFile = await ZgFile.fromFilePath(tempPath);
    const [tree, treeErr] = await zgFile.merkleTree();

    if (treeErr) {
      throw new Error(`Merkle tree error: ${treeErr}`);
    }

    const rootHash = tree.rootHash();

    // Check if already exists
    const indexer = new Indexer(process.env.NEXT_PUBLIC_0G_STORAGE_INDEXER!);
    const existing = await indexer.getFile(rootHash).catch(() => null);

    if (existing) {
      await unlink(tempPath);
      return NextResponse.json({
        success: true,
        rootHash,
        exists: true,
        message: 'Data already stored',
      });
    }

    // Upload to 0G
    const flowContract = getFlowContract(
      process.env.NEXT_PUBLIC_0G_FLOW_CONTRACT!,
      signer
    );

    const [txHash, uploadErr] = await zgFile.uploadFile(flowContract, 0, {
      tags: type === 'whale_trade'
        ? `whale,${data.source},${data.marketId}`
        : `snapshot,${snapshot.source},${snapshot.marketId}`,
    });

    if (uploadErr) {
      throw new Error(`Upload error: ${uploadErr}`);
    }

    // Cleanup
    await unlink(tempPath);

    // Index for querying
    await indexMarketData(rootHash, storeData);

    return NextResponse.json({
      success: true,
      rootHash,
      txHash,
      indexed: true,
    });

  } catch (error) {
    console.error('0G market store error:', error);
    return NextResponse.json(
      { error: 'Storage failed', details: error.message },
      { status: 500 }
    );
  }
}

async function indexMarketData(rootHash: string, data: any) {
  // Store index in Prisma for fast local queries
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  if (data.type === 'whale_trade') {
    await prisma.whaleTrade.update({
      where: { id: data.trade.id },
      data: { storageRootHash: rootHash },
    });
  } else if (data.type === 'market_snapshot') {
    await prisma.marketSnapshot.create({
      data: {
        rootHash,
        marketId: data.snapshot.marketId,
        source: data.snapshot.source,
        question: data.snapshot.question,
        timestamp: new Date(data.snapshot.timestamp),
      },
    });
  }
}
```

### 3. Flow VRF Trade Execution

**File: `frontend/src/app/api/flow/vrf-trade/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from '@/config/chains';

const EXTERNAL_MARKET_MIRROR = process.env.EXTERNAL_MARKET_MIRROR_ADDRESS!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mirrorKey,
      agentId,
      isYes,
      amount,
      useVRF = true,
      prediction
    } = body;

    // Validate prediction is verified (unless test mode)
    if (!process.env.ALLOW_TEST_MODE && !prediction?.isVerified) {
      return NextResponse.json(
        { error: 'Only 0G verified predictions allowed for trading' },
        { status: 400 }
      );
    }

    // Initialize server wallet
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      chain: flowTestnet,
      transport: http(),
    });

    let txHash: string;

    if (useVRF) {
      // VRF-enhanced copy trade (prevents front-running)
      txHash = await walletClient.writeContract({
        address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
        abi: ExternalMarketMirrorABI,
        functionName: 'vrfCopyTrade',
        args: [
          mirrorKey as `0x${string}`,
          BigInt(agentId),
          isYes,
          parseEther(amount),
        ],
      });
    } else {
      // Direct trade (no VRF)
      txHash = await walletClient.writeContract({
        address: EXTERNAL_MARKET_MIRROR as `0x${string}`,
        abi: ExternalMarketMirrorABI,
        functionName: 'tradeMirror',
        args: [
          mirrorKey as `0x${string}`,
          isYes,
          parseEther(amount),
          parseEther('0'), // minSharesOut
        ],
      });
    }

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Store trade in 0G for audit
    if (prediction?.proof) {
      await fetch('/api/0g/market-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trade_execution',
          data: {
            mirrorKey,
            agentId,
            isYes,
            amount,
            txHash,
            prediction,
            useVRF,
            timestamp: Date.now(),
          },
        }),
      });
    }

    return NextResponse.json({
      success: true,
      txHash,
      useVRF,
      blockNumber: receipt.blockNumber.toString(),
    });

  } catch (error) {
    console.error('Flow VRF trade error:', error);
    return NextResponse.json(
      { error: 'Trade execution failed', details: error.message },
      { status: 500 }
    );
  }
}
```

---

## Database Schema

**File: `frontend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ============ EXTERNAL MARKETS ============

model ExternalMarket {
  id            String   @id // "poly_xxx" or "kalshi_xxx"
  source        String   // 'polymarket' | 'kalshi'
  externalId    String
  question      String
  description   String?
  category      String?

  yesPrice      Int      // 0-10000 (bps)
  noPrice       Int
  volume        String
  liquidity     String

  endTime       DateTime
  status        String   // 'active' | 'closed' | 'resolved'
  outcome       String?  // 'yes' | 'no'

  sourceUrl     String

  // 0G Storage reference
  latestSnapshotHash String?

  // Flow mirror market
  flowMirrorKey      String?
  flowMarketId       BigInt?

  lastSyncAt    DateTime @default(now())
  createdAt     DateTime @default(now())

  @@unique([source, externalId])
  @@index([source])
  @@index([status])
  @@index([flowMirrorKey])
}

// ============ MARKET SNAPSHOTS (0G Index) ============

model MarketSnapshot {
  id          String   @id @default(cuid())
  rootHash    String   @unique  // 0G Storage root hash
  marketId    String
  source      String
  question    String
  timestamp   DateTime

  yesPrice    Int?
  noPrice     Int?
  volume      String?

  @@index([marketId, source])
  @@index([timestamp])
}

// ============ WHALE TRADES ============

model WhaleTrade {
  id              String   @id @default(cuid())
  source          String
  marketId        String
  marketQuestion  String
  traderAddress   String?
  side            String   // 'buy' | 'sell'
  outcome         String   // 'yes' | 'no'
  amountUsd       String
  shares          String
  price           Int      // bps
  timestamp       DateTime
  txHash          String?

  // 0G Storage reference
  storageRootHash String?

  @@index([source])
  @@index([timestamp])
  @@index([traderAddress])
}

// ============ WHALE FOLLOWING ============

model WhaleFollower {
  id                String   @id @default(cuid())
  userAddress       String
  whaleAddress      String
  source            String

  maxAmountPerTrade String
  maxDailyAmount    String
  useVRF            Boolean  @default(true)
  isActive          Boolean  @default(true)

  totalCopied       String   @default("0")
  tradesExecuted    Int      @default(0)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([userAddress, whaleAddress, source])
  @@index([whaleAddress, source])
}

// ============ VERIFIED PREDICTIONS ============

model VerifiedPrediction {
  id              String   @id @default(cuid())
  marketId        String
  source          String
  agentId         String

  outcome         String   // 'yes' | 'no'
  confidence      Int      // 0-100
  reasoning       String

  // 0G Verification
  isVerified      Boolean
  inputHash       String
  outputHash      String
  providerAddress String
  modelHash       String
  chatId          String

  // 0G Storage
  storageRootHash String?

  // Resolution
  actualOutcome   String?
  wasCorrect      Boolean?

  timestamp       DateTime @default(now())

  @@index([marketId, source])
  @@index([agentId])
  @@index([isVerified])
}

// ============ SYNC LOGS ============

model SyncLog {
  id        String   @id @default(cuid())
  source    String
  action    String
  status    String
  count     Int      @default(0)
  duration  Int
  error     String?
  createdAt DateTime @default(now())

  @@index([source, createdAt])
}
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-3)
- [ ] Setup Prisma + SQLite database
- [ ] Create type definitions with 0G/Flow types
- [ ] Implement PolymarketService (API integration)
- [ ] Implement KalshiService (API integration)
- [ ] Create basic API routes for market fetching

### Phase 2: 0G Integration (Days 4-6)
- [ ] Implement `/api/0g/market-inference` (verified AI)
- [ ] Implement `/api/0g/market-store` (storage)
- [ ] Implement `/api/0g/market-context` (RAG queries)
- [ ] Create `useMarketAnalysis` hook
- [ ] Add prediction storage and indexing

### Phase 3: Flow Contracts (Days 7-9)
- [ ] Deploy `FlowVRFOracle.sol` on Flow Testnet
- [ ] Deploy `ExternalMarketMirror.sol` on Flow Testnet
- [ ] Implement mirror market creation with VRF
- [ ] Implement `/api/flow/vrf-trade` route
- [ ] Test VRF-enhanced trading flow

### Phase 4: Whale Tracking (Days 10-12)
- [ ] Implement WhaleTrackerService
- [ ] Setup WebSocket connections (Poly + Kalshi)
- [ ] Implement whale trade storage in 0G
- [ ] Create whale alert API routes
- [ ] Build whale alert UI components

### Phase 5: UI Integration (Days 13-15)
- [ ] Create `ExternalMarketCard` component
- [ ] Create `MarketSourceFilter` component
- [ ] Modify `/markets` page for unified display
- [ ] Create `/external` page for browsing
- [ ] Create `/whale-tracker` page

### Phase 6: Copy Trading (Days 16-18)
- [ ] Implement external copy trade service
- [ ] Add whale following database tables
- [ ] Create VRF-enhanced copy trade flow
- [ ] Build copy trade configuration UI
- [ ] Test end-to-end copy trading

### Phase 7: iNFT Extensions (Days 19-20)
- [ ] Update AIAgentINFT for external markets
- [ ] Add external trading permissions
- [ ] Track external P&L on-chain
- [ ] Update agent tier calculations

### Phase 8: Testing & Polish (Days 21-24)
- [ ] End-to-end testing all flows
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Documentation
- [ ] Security audit

---

## Files Summary

### New Smart Contracts (2)
- `src/ExternalMarketMirror.sol` - Mirror markets with VRF
- `src/FlowVRFOracle.sol` - VRF oracle bridge

### New Services (5)
- `frontend/src/services/externalMarkets/polymarketService.ts`
- `frontend/src/services/externalMarkets/kalshiService.ts`
- `frontend/src/services/externalMarkets/externalMarketService.ts`
- `frontend/src/services/externalMarkets/whaleTrackerService.ts`
- `frontend/src/services/externalMarkets/copyTradeService.ts`

### New API Routes (8)
- `frontend/src/app/api/external/polymarket/route.ts`
- `frontend/src/app/api/external/kalshi/route.ts`
- `frontend/src/app/api/0g/market-inference/route.ts`
- `frontend/src/app/api/0g/market-store/route.ts`
- `frontend/src/app/api/0g/market-context/route.ts`
- `frontend/src/app/api/flow/vrf-trade/route.ts`
- `frontend/src/app/api/whale-alerts/route.ts`
- `frontend/src/app/api/copy-trade/external/route.ts`

### New Hooks (6)
- `frontend/src/hooks/useExternalMarkets.ts`
- `frontend/src/hooks/useMarketAnalysis.ts`
- `frontend/src/hooks/useWhaleAlerts.ts`
- `frontend/src/hooks/useMirrorMarket.ts`
- `frontend/src/hooks/useExternalCopyTrade.ts`
- `frontend/src/hooks/useUnifiedPortfolio.ts`

### New Pages (2)
- `frontend/src/app/external/page.tsx`
- `frontend/src/app/whale-tracker/page.tsx`

### Modified Files (7)
- `frontend/src/app/markets/page.tsx` - Unified display
- `frontend/src/app/markets/[id]/page.tsx` - External support
- `frontend/src/app/portfolio/page.tsx` - Multi-source
- `frontend/src/components/Header.tsx` - Whale alert badge
- `frontend/src/constants.ts` - New contract addresses
- `src/AIAgentINFT.sol` - External trading support
- `frontend/prisma/schema.prisma` - New tables

---

## Environment Variables

```bash
# Database
DATABASE_URL="file:./prisma/dev.db"

# 0G Configuration
NEXT_PUBLIC_0G_COMPUTE_RPC=https://evmrpc-testnet.0g.ai
NEXT_PUBLIC_0G_CHAIN_ID=16602
NEXT_PUBLIC_0G_STORAGE_RPC=https://rpc-storage-testnet.0g.ai
NEXT_PUBLIC_0G_STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
NEXT_PUBLIC_0G_FLOW_CONTRACT=0x...
ZEROG_PRIVATE_KEY=0x...

# Flow Configuration
NEXT_PUBLIC_FLOW_RPC=https://testnet.evm.nodes.onflow.org
NEXT_PUBLIC_FLOW_CHAIN_ID=545
EXTERNAL_MARKET_MIRROR_ADDRESS=0x...
FLOW_VRF_ORACLE_ADDRESS=0x...

# Trading
PRIVATE_KEY=0x...
ALLOW_TEST_MODE=false
MIN_CONFIDENCE=60
MAX_TRADE_AMOUNT=100

# Whale Tracking
WHALE_THRESHOLD_USD=10000

# External APIs
POLYMARKET_ENABLED=true
KALSHI_API_KEY_ID=
KALSHI_API_PRIVATE_KEY=

# Fallback (for development only)
OPENAI_API_KEY=sk-...
```

---

## Success Metrics

- [ ] Browse 1000+ markets from Polymarket + Kalshi
- [ ] 0G verified AI predictions for all markets
- [ ] All predictions stored in 0G decentralized storage
- [ ] Mirror markets created on Flow with VRF pricing
- [ ] All trades executed on Flow chain
- [ ] Whale alerts within 30 seconds
- [ ] VRF-enhanced copy trading prevents front-running
- [ ] iNFT agents can trade external markets
- [ ] Complete audit trail in 0G Storage

---

## Key Differentiators

### Why This Architecture Impresses Both Chains

**0G Benefits:**
1. **Verified AI** - All market predictions use 0G Compute with cryptographic proofs
2. **Decentralized Storage** - Complete audit trail of predictions, trades, whale activity
3. **RAG Context** - Historical data powers smarter AI predictions
4. **iNFT Integration** - AI agents as tradeable, ownable NFTs

**Flow Benefits:**
1. **All Trading on Flow** - Fast finality, low gas, great UX
2. **Native VRF** - Fair pricing, prevents front-running
3. **Mirror Markets** - External liquidity on Flow chain
4. **Copy Trading** - VRF-enhanced timing variance

**Synergy:**
- 0G handles intelligence (AI + Storage)
- Flow handles execution (Trading + Randomness)
- Perfect separation of concerns
- Both chains showcased for their strengths

---

## Detailed UI Components

### 1. ExternalMarketCard Component

**File: `frontend/src/components/markets/ExternalMarketCard.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UnifiedMarket, MarketSource } from '@/types/externalMarket';
import { MarketSourceBadge } from './MarketSourceBadge';
import { formatDistanceToNow } from 'date-fns';

interface ExternalMarketCardProps {
  market: UnifiedMarket;
  onAnalyze?: (market: UnifiedMarket) => void;
  showAnalyzeButton?: boolean;
}

export function ExternalMarketCard({
  market,
  onAnalyze,
  showAnalyzeButton = true
}: ExternalMarketCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const yesWidth = Math.max(5, Math.min(95, market.yesPrice));
  const noWidth = 100 - yesWidth;

  return (
    <div
      className={`
        relative bg-gray-900/50 border border-gray-700 rounded-xl p-4
        hover:border-purple-500/50 transition-all duration-200
        ${isHovered ? 'shadow-lg shadow-purple-500/10' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Source Badge */}
      <div className="absolute top-3 right-3">
        <MarketSourceBadge source={market.source} />
      </div>

      {/* Question */}
      <Link href={`/external/${market.id}`}>
        <h3 className="text-white font-medium mb-3 pr-20 hover:text-purple-400 transition-colors line-clamp-2">
          {market.question}
        </h3>
      </Link>

      {/* Category */}
      {market.category && (
        <span className="inline-block px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400 mb-3">
          {market.category}
        </span>
      )}

      {/* Probability Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-green-400">Yes {market.yesPrice.toFixed(1)}%</span>
          <span className="text-red-400">No {market.noPrice.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
          <div
            className="bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
            style={{ width: `${yesWidth}%` }}
          />
          <div
            className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-300"
            style={{ width: `${noWidth}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-400 mb-3">
        <div>
          <span className="text-gray-500">Volume:</span>{' '}
          <span className="text-white">${formatVolume(market.volume)}</span>
        </div>
        <div>
          <span className="text-gray-500">Liquidity:</span>{' '}
          <span className="text-white">${formatVolume(market.liquidity)}</span>
        </div>
      </div>

      {/* End Time */}
      <div className="text-xs text-gray-500 mb-3">
        Ends {formatDistanceToNow(new Date(market.endTime), { addSuffix: true })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link
          href={market.sourceUrl}
          target="_blank"
          className="flex-1 text-center py-2 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          View on {market.source === MarketSource.POLYMARKET ? 'Polymarket' : 'Kalshi'}
        </Link>

        {showAnalyzeButton && onAnalyze && (
          <button
            onClick={() => onAnalyze(market)}
            className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-1"
          >
            <span>🤖</span> AI Analyze
          </button>
        )}
      </div>

      {/* 0G Verified Badge (if has prediction) */}
      {market.latestPrediction?.isVerified && (
        <div className="absolute bottom-3 left-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-400">
            <span>✓</span> 0G Verified
          </span>
        </div>
      )}
    </div>
  );
}

function formatVolume(value: string): string {
  const num = parseFloat(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}
```

### 2. MarketSourceBadge Component

**File: `frontend/src/components/markets/MarketSourceBadge.tsx`**

```tsx
import { MarketSource } from '@/types/externalMarket';

interface MarketSourceBadgeProps {
  source: MarketSource;
  size?: 'sm' | 'md' | 'lg';
}

const sourceConfig = {
  [MarketSource.NATIVE]: {
    label: 'Warriors',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    icon: '⚔️',
  },
  [MarketSource.POLYMARKET]: {
    label: 'Polymarket',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-400',
    icon: '🟣',
  },
  [MarketSource.KALSHI]: {
    label: 'Kalshi',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    icon: '🔵',
  },
};

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export function MarketSourceBadge({ source, size = 'sm' }: MarketSourceBadgeProps) {
  const config = sourceConfig[source];

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full border
        ${config.bgColor} ${config.borderColor} ${config.textColor}
        ${sizeClasses[size]}
      `}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
```

### 3. MarketSourceFilter Component

**File: `frontend/src/components/markets/MarketSourceFilter.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { MarketSource } from '@/types/externalMarket';

interface MarketSourceFilterProps {
  selected: MarketSource[];
  onChange: (sources: MarketSource[]) => void;
  showCounts?: {
    [MarketSource.NATIVE]?: number;
    [MarketSource.POLYMARKET]?: number;
    [MarketSource.KALSHI]?: number;
  };
}

export function MarketSourceFilter({
  selected,
  onChange,
  showCounts
}: MarketSourceFilterProps) {
  const allSelected = selected.length === 0 ||
    selected.length === Object.keys(MarketSource).length;

  const toggleSource = (source: MarketSource) => {
    if (selected.includes(source)) {
      onChange(selected.filter(s => s !== source));
    } else {
      onChange([...selected, source]);
    }
  };

  const selectAll = () => onChange([]);

  return (
    <div className="flex flex-wrap gap-2">
      {/* All Button */}
      <button
        onClick={selectAll}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all
          ${allSelected
            ? 'bg-white text-black'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }
        `}
      >
        All Markets
        {showCounts && (
          <span className="ml-1.5 text-xs opacity-70">
            ({(showCounts[MarketSource.NATIVE] || 0) +
              (showCounts[MarketSource.POLYMARKET] || 0) +
              (showCounts[MarketSource.KALSHI] || 0)})
          </span>
        )}
      </button>

      {/* Native */}
      <button
        onClick={() => toggleSource(MarketSource.NATIVE)}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
          ${selected.includes(MarketSource.NATIVE) && !allSelected
            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }
        `}
      >
        <span>⚔️</span> Warriors
        {showCounts && (
          <span className="text-xs opacity-70">({showCounts[MarketSource.NATIVE] || 0})</span>
        )}
      </button>

      {/* Polymarket */}
      <button
        onClick={() => toggleSource(MarketSource.POLYMARKET)}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
          ${selected.includes(MarketSource.POLYMARKET) && !allSelected
            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }
        `}
      >
        <span>🟣</span> Polymarket
        {showCounts && (
          <span className="text-xs opacity-70">({showCounts[MarketSource.POLYMARKET] || 0})</span>
        )}
      </button>

      {/* Kalshi */}
      <button
        onClick={() => toggleSource(MarketSource.KALSHI)}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
          ${selected.includes(MarketSource.KALSHI) && !allSelected
            ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }
        `}
      >
        <span>🔵</span> Kalshi
        {showCounts && (
          <span className="text-xs opacity-70">({showCounts[MarketSource.KALSHI] || 0})</span>
        )}
      </button>
    </div>
  );
}
```

### 4. WhaleAlertFeed Component

**File: `frontend/src/components/whale/WhaleAlertFeed.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { WhaleTrade, MarketSource } from '@/types/externalMarket';
import { WhaleAlertCard } from './WhaleAlertCard';
import { useWhaleAlerts } from '@/hooks/useWhaleAlerts';

interface WhaleAlertFeedProps {
  maxAlerts?: number;
  sourceFilter?: MarketSource;
  onTradeClick?: (trade: WhaleTrade) => void;
}

export function WhaleAlertFeed({
  maxAlerts = 20,
  sourceFilter,
  onTradeClick
}: WhaleAlertFeedProps) {
  const { alerts, isConnected } = useWhaleAlerts();
  const feedRef = useRef<HTMLDivElement>(null);

  // Filter by source if specified
  const filteredAlerts = sourceFilter
    ? alerts.filter(a => a.source === sourceFilter)
    : alerts;

  const displayedAlerts = filteredAlerts.slice(0, maxAlerts);

  // Auto-scroll to new alerts
  useEffect(() => {
    if (feedRef.current && displayedAlerts.length > 0) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [displayedAlerts.length]);

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐋</span>
          <h3 className="text-white font-semibold">Whale Alerts</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-gray-400">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="max-h-[500px] overflow-y-auto"
      >
        {displayedAlerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <span className="text-4xl mb-2 block">🐋</span>
            <p>Waiting for whale trades...</p>
            <p className="text-xs mt-1">Trades over $10,000 will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {displayedAlerts.map((trade, index) => (
              <WhaleAlertCard
                key={trade.id}
                trade={trade}
                onClick={() => onTradeClick?.(trade)}
                isNew={index === 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
        <span>Showing {displayedAlerts.length} trades</span>
        <span>Threshold: $10,000+</span>
      </div>
    </div>
  );
}
```

### 5. WhaleAlertCard Component

**File: `frontend/src/components/whale/WhaleAlertCard.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { WhaleTrade, MarketSource } from '@/types/externalMarket';
import { MarketSourceBadge } from '../markets/MarketSourceBadge';
import { formatDistanceToNow } from 'date-fns';

interface WhaleAlertCardProps {
  trade: WhaleTrade;
  onClick?: () => void;
  isNew?: boolean;
}

export function WhaleAlertCard({ trade, onClick, isNew }: WhaleAlertCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isBuy = trade.side === 'buy';
  const isYes = trade.outcome === 'yes';

  return (
    <div
      className={`
        p-4 hover:bg-gray-800/50 cursor-pointer transition-all
        ${isNew ? 'animate-pulse-once bg-purple-500/10' : ''}
      `}
      onClick={() => {
        setShowDetails(!showDetails);
        onClick?.();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: Trade Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <MarketSourceBadge source={trade.source} size="sm" />
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(trade.timestamp, { addSuffix: true })}
            </span>
          </div>

          <p className="text-white text-sm font-medium truncate mb-1">
            {trade.marketQuestion}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <span className={isBuy ? 'text-green-400' : 'text-red-400'}>
              {isBuy ? '📈 BUY' : '📉 SELL'}
            </span>
            <span className={isYes ? 'text-green-400' : 'text-red-400'}>
              {isYes ? 'YES' : 'NO'}
            </span>
            <span className="text-gray-400">@</span>
            <span className="text-white">{(trade.price * 100).toFixed(1)}¢</span>
          </div>
        </div>

        {/* Right: Amount */}
        <div className="text-right">
          <div className="text-lg font-bold text-white">
            ${formatAmount(trade.amountUsd)}
          </div>
          <div className="text-xs text-gray-400">
            {formatAmount(trade.shares)} shares
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2 text-sm">
          {trade.traderAddress && (
            <div className="flex justify-between">
              <span className="text-gray-400">Trader:</span>
              <span className="text-white font-mono">
                {trade.traderAddress.slice(0, 6)}...{trade.traderAddress.slice(-4)}
              </span>
            </div>
          )}
          {trade.txHash && (
            <div className="flex justify-between">
              <span className="text-gray-400">Tx:</span>
              <a
                href={getExplorerUrl(trade.source, trade.txHash)}
                target="_blank"
                className="text-purple-400 hover:text-purple-300 font-mono"
                onClick={e => e.stopPropagation()}
              >
                {trade.txHash.slice(0, 8)}...
              </a>
            </div>
          )}
          {trade.storageRootHash && (
            <div className="flex items-center gap-1 text-green-400 text-xs">
              <span>✓</span>
              <span>Stored in 0G</span>
            </div>
          )}

          {/* Copy Trade Button */}
          <button
            className="w-full mt-2 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm transition-colors"
            onClick={e => {
              e.stopPropagation();
              // Handle copy trade
            }}
          >
            Copy This Trade
          </button>
        </div>
      )}
    </div>
  );
}

function formatAmount(value: string): string {
  const num = parseFloat(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function getExplorerUrl(source: MarketSource, txHash: string): string {
  if (source === MarketSource.POLYMARKET) {
    return `https://polygonscan.com/tx/${txHash}`;
  }
  return `#`; // Kalshi doesn't have public tx explorer
}
```

---

## Detailed React Hooks

### 1. useExternalMarkets Hook (Full Implementation)

**File: `frontend/src/hooks/useExternalMarkets.ts`**

```typescript
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UnifiedMarket,
  MarketSource,
  ExternalMarketStatus,
  MarketFilters,
} from '@/types/externalMarket';

// ============ FETCH ALL MARKETS ============

export function useExternalMarkets(filters?: MarketFilters) {
  const queryClient = useQueryClient();

  const queryKey = ['externalMarkets', filters];

  const {
    data: markets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters?.source?.length) {
        params.set('sources', filters.source.join(','));
      }
      if (filters?.status) {
        params.set('status', filters.status);
      }
      if (filters?.category) {
        params.set('category', filters.category);
      }
      if (filters?.search) {
        params.set('search', filters.search);
      }
      if (filters?.limit) {
        params.set('limit', filters.limit.toString());
      }

      const response = await fetch(`/api/external/markets?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch external markets');
      }

      const data = await response.json();
      return data.markets as UnifiedMarket[];
    },
    staleTime: 30_000, // 30 seconds
    refetchInterval: 30_000, // Auto-refresh every 30s
  });

  // Prefetch next page
  const prefetchMore = useCallback(
    async (offset: number) => {
      await queryClient.prefetchQuery({
        queryKey: ['externalMarkets', { ...filters, offset }],
        queryFn: async () => {
          const params = new URLSearchParams();
          params.set('offset', offset.toString());
          const response = await fetch(`/api/external/markets?${params}`);
          return (await response.json()).markets;
        },
      });
    },
    [queryClient, filters]
  );

  return {
    markets,
    isLoading,
    error: error?.message || null,
    refetch,
    prefetchMore,
  };
}

// ============ FETCH SINGLE MARKET ============

export function useExternalMarket(marketId: string | null) {
  const {
    data: market,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['externalMarket', marketId],
    queryFn: async () => {
      if (!marketId) return null;

      const response = await fetch(`/api/external/markets/${marketId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch market');
      }

      const data = await response.json();
      return data.market as UnifiedMarket;
    },
    enabled: !!marketId,
    staleTime: 5_000, // 5 seconds for single market
    refetchInterval: 5_000, // More frequent updates
  });

  return {
    market,
    isLoading,
    error: error?.message || null,
  };
}

// ============ UNIFIED MARKETS (Native + External) ============

export function useUnifiedMarkets(filters?: MarketFilters) {
  const { markets: externalMarkets, isLoading: extLoading } = useExternalMarkets(filters);
  const { markets: nativeMarkets, loading: nativeLoading } = useMarkets(); // Existing hook

  const allMarkets = useMemo(() => {
    // Normalize native markets to unified format
    const normalizedNative: UnifiedMarket[] = nativeMarkets.map(m => ({
      id: `native_${m.id}`,
      source: MarketSource.NATIVE,
      externalId: m.id.toString(),
      question: m.question,
      yesPrice: Number(m.yesTokens) / (Number(m.yesTokens) + Number(m.noTokens)) * 100,
      noPrice: Number(m.noTokens) / (Number(m.yesTokens) + Number(m.noTokens)) * 100,
      volume: m.totalVolume.toString(),
      liquidity: m.liquidity.toString(),
      endTime: Number(m.endTime) * 1000,
      createdAt: Number(m.createdAt) * 1000,
      status: m.status === 0 ? ExternalMarketStatus.ACTIVE : ExternalMarketStatus.RESOLVED,
      sourceUrl: `/markets/${m.id}`,
      lastSyncAt: Date.now(),
    }));

    // Combine and sort by volume
    return [...normalizedNative, ...externalMarkets].sort(
      (a, b) => parseFloat(b.volume) - parseFloat(a.volume)
    );
  }, [nativeMarkets, externalMarkets]);

  // Calculate counts by source
  const counts = useMemo(() => ({
    [MarketSource.NATIVE]: allMarkets.filter(m => m.source === MarketSource.NATIVE).length,
    [MarketSource.POLYMARKET]: allMarkets.filter(m => m.source === MarketSource.POLYMARKET).length,
    [MarketSource.KALSHI]: allMarkets.filter(m => m.source === MarketSource.KALSHI).length,
  }), [allMarkets]);

  return {
    markets: allMarkets,
    counts,
    isLoading: extLoading || nativeLoading,
  };
}

// ============ MARKET STATS ============

export function useExternalMarketStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['externalMarketStats'],
    queryFn: async () => {
      const response = await fetch('/api/external/stats');
      return response.json();
    },
    staleTime: 60_000, // 1 minute
  });

  return { stats, isLoading };
}

// ============ SEARCH MARKETS ============

export function useMarketSearch(query: string, sources?: MarketSource[]) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['marketSearch', debouncedQuery, sources],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];

      const params = new URLSearchParams({ q: debouncedQuery });
      if (sources?.length) {
        params.set('sources', sources.join(','));
      }

      const response = await fetch(`/api/external/search?${params}`);
      return (await response.json()).markets;
    },
    enabled: debouncedQuery.length >= 2,
  });

  return { results, isLoading, query: debouncedQuery };
}
```

### 2. useMarketAnalysis Hook (0G Integration)

**File: `frontend/src/hooks/useMarketAnalysis.ts`**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UnifiedMarket,
  VerifiedMarketPrediction,
} from '@/types/externalMarket';

interface UseMarketAnalysisOptions {
  agentId?: bigint;
  autoAnalyze?: boolean;
}

export function useMarketAnalysis(
  market: UnifiedMarket | null,
  options: UseMarketAnalysisOptions = {}
) {
  const { agentId, autoAnalyze = false } = options;
  const queryClient = useQueryClient();
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Fetch existing prediction if available
  const {
    data: existingPrediction,
    isLoading: loadingExisting,
  } = useQuery({
    queryKey: ['marketPrediction', market?.id],
    queryFn: async () => {
      if (!market) return null;

      const response = await fetch(
        `/api/external/predictions?marketId=${market.id}`
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.prediction as VerifiedMarketPrediction | null;
    },
    enabled: !!market,
    staleTime: 60_000, // 1 minute
  });

  // Analyze market mutation
  const analyzeMutation = useMutation({
    mutationFn: async (marketToAnalyze: UnifiedMarket) => {
      if (!agentId) {
        throw new Error('Agent ID required for analysis');
      }

      const response = await fetch('/api/0g/market-inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: marketToAnalyze.id,
          source: marketToAnalyze.source,
          marketData: {
            question: marketToAnalyze.question,
            yesPrice: marketToAnalyze.yesPrice,
            noPrice: marketToAnalyze.noPrice,
            volume: marketToAnalyze.volume,
            endTime: marketToAnalyze.endTime,
          },
          agentId: agentId.toString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const result = await response.json();

      if (!result.isVerified) {
        throw new Error('0G verification failed');
      }

      return result as VerifiedMarketPrediction;
    },
    onSuccess: (prediction) => {
      // Update cache
      queryClient.setQueryData(['marketPrediction', market?.id], prediction);
      setAnalysisError(null);
    },
    onError: (error: Error) => {
      setAnalysisError(error.message);
    },
  });

  // Auto-analyze on mount if enabled
  useEffect(() => {
    if (autoAnalyze && market && !existingPrediction && !analyzeMutation.isPending) {
      analyzeMutation.mutate(market);
    }
  }, [autoAnalyze, market, existingPrediction]);

  const analyze = useCallback(() => {
    if (market) {
      analyzeMutation.mutate(market);
    }
  }, [market, analyzeMutation]);

  // Get confidence level description
  const confidenceLevel = useMemo(() => {
    const confidence = existingPrediction?.confidence || analyzeMutation.data?.confidence;
    if (!confidence) return null;

    if (confidence >= 80) return { label: 'Very High', color: 'text-green-400' };
    if (confidence >= 60) return { label: 'High', color: 'text-green-300' };
    if (confidence >= 40) return { label: 'Medium', color: 'text-yellow-400' };
    return { label: 'Low', color: 'text-red-400' };
  }, [existingPrediction, analyzeMutation.data]);

  return {
    prediction: analyzeMutation.data || existingPrediction,
    isAnalyzing: analyzeMutation.isPending,
    isLoading: loadingExisting,
    error: analysisError,
    analyze,
    confidenceLevel,
    isVerified: (analyzeMutation.data || existingPrediction)?.isVerified || false,
  };
}

// ============ BATCH ANALYSIS ============

export function useBatchMarketAnalysis(agentId: bigint | null) {
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<Map<string, VerifiedMarketPrediction>>(new Map());

  const analyzeMultiple = useCallback(
    async (markets: UnifiedMarket[]) => {
      if (!agentId) return;

      setProgress({ current: 0, total: markets.length });
      const newResults = new Map<string, VerifiedMarketPrediction>();

      for (let i = 0; i < markets.length; i++) {
        const market = markets[i];

        try {
          const response = await fetch('/api/0g/market-inference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              marketId: market.id,
              source: market.source,
              marketData: {
                question: market.question,
                yesPrice: market.yesPrice,
                noPrice: market.noPrice,
                volume: market.volume,
                endTime: market.endTime,
              },
              agentId: agentId.toString(),
            }),
          });

          if (response.ok) {
            const prediction = await response.json();
            if (prediction.isVerified) {
              newResults.set(market.id, prediction);
            }
          }
        } catch (error) {
          console.error(`Failed to analyze ${market.id}:`, error);
        }

        setProgress({ current: i + 1, total: markets.length });
      }

      setResults(newResults);
      return newResults;
    },
    [agentId]
  );

  return {
    analyzeMultiple,
    progress,
    results,
    isAnalyzing: progress.current < progress.total && progress.total > 0,
  };
}
```

### 3. useWhaleAlerts Hook (Full Implementation)

**File: `frontend/src/hooks/useWhaleAlerts.ts`**

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  WhaleTrade,
  MarketSource,
  TrackedTrader,
} from '@/types/externalMarket';

// ============ REAL-TIME WHALE ALERTS ============

export function useWhaleAlerts(threshold?: number) {
  const [alerts, setAlerts] = useState<WhaleTrade[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/whale-alerts/ws`);

    ws.onopen = () => {
      console.log('Connected to whale alerts');
      setIsConnected(true);

      // Set threshold if provided
      if (threshold) {
        ws.send(JSON.stringify({ type: 'setThreshold', threshold }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'trade') {
          setAlerts(prev => [data.trade, ...prev].slice(0, 100));
        } else if (data.type === 'connected') {
          console.log('Whale alert stream active');
        }
      } catch (error) {
        console.error('Failed to parse whale alert:', error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Attempt to reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };

    wsRef.current = ws;
  }, [threshold]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const setThreshold = useCallback((newThreshold: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setThreshold', threshold: newThreshold }));
    }
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    isConnected,
    setThreshold,
    clearAlerts,
  };
}

// ============ WHALE TRADE HISTORY ============

export function useWhaleHistory(options?: {
  limit?: number;
  source?: MarketSource;
  traderAddress?: string;
}) {
  const { limit = 50, source, traderAddress } = options || {};

  const { data: trades = [], isLoading, error, refetch } = useQuery({
    queryKey: ['whaleHistory', limit, source, traderAddress],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('action', 'recent');
      params.set('limit', limit.toString());
      if (source) params.set('source', source);
      if (traderAddress) params.set('trader', traderAddress);

      const response = await fetch(`/api/whale-alerts?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch whale history');
      }

      const data = await response.json();
      return data.trades as WhaleTrade[];
    },
    staleTime: 30_000,
  });

  return { trades, isLoading, error: error?.message, refetch };
}

// ============ TRACKED TRADERS ============

export function useTrackedTraders() {
  const queryClient = useQueryClient();

  const { data: traders = [], isLoading, refetch } = useQuery({
    queryKey: ['trackedTraders'],
    queryFn: async () => {
      const response = await fetch('/api/whale-alerts?action=tracked');

      if (!response.ok) {
        throw new Error('Failed to fetch tracked traders');
      }

      const data = await response.json();
      return data.traders as TrackedTrader[];
    },
    staleTime: 60_000,
  });

  const trackMutation = useMutation({
    mutationFn: async ({
      address,
      source,
      alias,
    }: {
      address: string;
      source: MarketSource;
      alias?: string;
    }) => {
      const response = await fetch('/api/whale-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track', address, source, alias }),
      });

      if (!response.ok) {
        throw new Error('Failed to track trader');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackedTraders'] });
    },
  });

  const untrackMutation = useMutation({
    mutationFn: async ({
      address,
      source,
    }: {
      address: string;
      source: MarketSource;
    }) => {
      const response = await fetch('/api/whale-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'untrack', address, source }),
      });

      if (!response.ok) {
        throw new Error('Failed to untrack trader');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trackedTraders'] });
    },
  });

  return {
    traders,
    isLoading,
    refetch,
    trackTrader: trackMutation.mutateAsync,
    untrackTrader: untrackMutation.mutateAsync,
    isTracking: trackMutation.isPending,
    isUntracking: untrackMutation.isPending,
  };
}

// ============ COPY TRADE FROM WHALE ============

export function useWhaleCopyTrade() {
  const [lastCopyResult, setLastCopyResult] = useState<{
    success: boolean;
    txHash?: string;
    error?: string;
  } | null>(null);

  const copyMutation = useMutation({
    mutationFn: async ({
      whaleTrade,
      amount,
      useVRF = true,
    }: {
      whaleTrade: WhaleTrade;
      amount: string;
      useVRF?: boolean;
    }) => {
      const response = await fetch('/api/copy-trade/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whaleTrade,
          amount,
          useVRF,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Copy trade failed');
      }

      return response.json();
    },
    onSuccess: (result) => {
      setLastCopyResult({ success: true, txHash: result.txHash });
    },
    onError: (error: Error) => {
      setLastCopyResult({ success: false, error: error.message });
    },
  });

  return {
    copyTrade: copyMutation.mutateAsync,
    isCopying: copyMutation.isPending,
    lastResult: lastCopyResult,
    clearResult: () => setLastCopyResult(null),
  };
}
```

---

## Testing Strategy

### 1. Unit Tests

**File: `frontend/src/__tests__/services/polymarketService.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { polymarketService } from '@/services/externalMarkets/polymarketService';

describe('PolymarketService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getActiveMarkets', () => {
    it('should fetch and normalize markets', async () => {
      const mockResponse = {
        markets: [{
          id: 'test-market-1',
          conditionId: '0x123',
          question: 'Will BTC hit 100k?',
          outcomes: '["Yes", "No"]',
          outcomePrices: '["0.65", "0.35"]',
          volume: '1000000',
          liquidity: '500000',
          endDateIso: '2025-12-31T00:00:00Z',
          active: true,
          closed: false,
          category: 'crypto',
          slug: 'btc-100k',
        }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const markets = await polymarketService.getActiveMarkets(10, 0);

      expect(markets).toHaveLength(1);
      expect(markets[0].question).toBe('Will BTC hit 100k?');
      expect(markets[0].yesPrice).toBeCloseTo(65);
      expect(markets[0].noPrice).toBeCloseTo(35);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(polymarketService.getActiveMarkets()).rejects.toThrow();
    });
  });

  describe('normalizeMarket', () => {
    it('should correctly normalize Polymarket data to UnifiedMarket', () => {
      const polyMarket = {
        id: 'test',
        conditionId: '0x456',
        question: 'Test market?',
        outcomes: '["Yes", "No"]',
        outcomePrices: '["0.80", "0.20"]',
        volume: '50000',
        liquidity: '25000',
        endDateIso: '2025-06-15T12:00:00Z',
        active: true,
        closed: false,
        category: 'politics',
        slug: 'test-market',
      };

      const unified = polymarketService.normalizeMarket(polyMarket);

      expect(unified.id).toBe('poly_0x456');
      expect(unified.source).toBe('polymarket');
      expect(unified.yesPrice).toBe(80);
      expect(unified.noPrice).toBe(20);
      expect(unified.sourceUrl).toContain('polymarket.com');
    });
  });
});
```

### 2. Integration Tests

**File: `frontend/src/__tests__/integration/externalMarkets.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

describe('External Markets Integration', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    const app = next({ dev: true });
    await app.prepare();
    const handle = app.getRequestHandler();

    server = createServer((req, res) => {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  it('should fetch external markets from API', async () => {
    const response = await fetch(`${baseUrl}/api/external/markets`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data.markets)).toBe(true);
  });

  it('should search markets', async () => {
    const response = await fetch(`${baseUrl}/api/external/search?q=bitcoin`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data.markets)).toBe(true);
  });

  it('should return whale trade history', async () => {
    const response = await fetch(`${baseUrl}/api/whale-alerts?action=recent&limit=10`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data.trades)).toBe(true);
  });
});
```

### 3. E2E Tests

**File: `frontend/e2e/externalMarkets.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('External Markets Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/external');
  });

  test('should display external markets', async ({ page }) => {
    // Wait for markets to load
    await page.waitForSelector('[data-testid="market-card"]', { timeout: 10000 });

    const marketCards = await page.locator('[data-testid="market-card"]').count();
    expect(marketCards).toBeGreaterThan(0);
  });

  test('should filter by source', async ({ page }) => {
    // Click Polymarket filter
    await page.click('button:has-text("Polymarket")');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // All visible cards should be Polymarket
    const badges = await page.locator('[data-testid="source-badge"]').allTextContents();
    badges.forEach(badge => {
      expect(badge).toContain('Polymarket');
    });
  });

  test('should search markets', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('bitcoin');
    await searchInput.press('Enter');

    // Wait for search results
    await page.waitForTimeout(500);

    const marketTitles = await page.locator('[data-testid="market-question"]').allTextContents();
    const hasRelevantResults = marketTitles.some(title =>
      title.toLowerCase().includes('bitcoin') || title.toLowerCase().includes('btc')
    );
    expect(hasRelevantResults).toBe(true);
  });

  test('should open AI analysis modal', async ({ page }) => {
    // Click analyze button on first market
    await page.click('[data-testid="analyze-button"]:first-child');

    // Modal should appear
    await expect(page.locator('[data-testid="analysis-modal"]')).toBeVisible();

    // Should show loading or result
    await expect(
      page.locator('[data-testid="analysis-loading"], [data-testid="analysis-result"]')
    ).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Whale Tracker Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/whale-tracker');
  });

  test('should display whale alert feed', async ({ page }) => {
    await expect(page.locator('[data-testid="whale-feed"]')).toBeVisible();
  });

  test('should show connection status', async ({ page }) => {
    const statusIndicator = page.locator('[data-testid="connection-status"]');
    await expect(statusIndicator).toBeVisible();
  });

  test('should allow tracking a whale address', async ({ page }) => {
    // Open track modal
    await page.click('button:has-text("Track Whale")');

    // Fill form
    await page.fill('input[name="address"]', '0x1234567890abcdef1234567890abcdef12345678');
    await page.selectOption('select[name="source"]', 'polymarket');
    await page.fill('input[name="alias"]', 'Test Whale');

    // Submit
    await page.click('button[type="submit"]');

    // Should show success
    await expect(page.locator('text=Successfully tracking')).toBeVisible({ timeout: 5000 });
  });
});
```

---

## Security Considerations

### 1. API Security

```typescript
// Rate limiting middleware
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimit.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

// Input validation
function validateMarketId(id: string): boolean {
  return /^(poly|kalshi|native)_[a-zA-Z0-9_-]+$/.test(id);
}

function sanitizeSearchQuery(query: string): string {
  return query.replace(/[<>'"&]/g, '').slice(0, 100);
}
```

### 2. Smart Contract Security

```solidity
// Reentrancy protection
modifier nonReentrant() {
    require(!locked, "Reentrant call");
    locked = true;
    _;
    locked = false;
}

// Oracle verification
function verifyOracleSignature(
    bytes32 messageHash,
    bytes memory signature
) internal view returns (bool) {
    bytes32 ethHash = keccak256(abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        messageHash
    ));
    address signer = ecrecover(ethHash, v, r, s);
    return signer == oracleAddress;
}

// Amount limits
uint256 public constant MAX_TRADE_AMOUNT = 1000 ether;
uint256 public constant MIN_TRADE_AMOUNT = 0.1 ether;

require(amount >= MIN_TRADE_AMOUNT && amount <= MAX_TRADE_AMOUNT, "Invalid amount");
```

### 3. 0G Verification

```typescript
// Always verify 0G predictions before trading
function validatePrediction(prediction: VerifiedMarketPrediction): {
  valid: boolean;
  reason?: string;
} {
  // Must be verified
  if (!prediction.isVerified) {
    return { valid: false, reason: 'Prediction not verified by 0G' };
  }

  // Must not be fallback
  if (prediction.fallbackMode) {
    return { valid: false, reason: 'Fallback predictions not allowed for trading' };
  }

  // Must have valid proof
  if (!prediction.proof?.inputHash || !prediction.proof?.outputHash) {
    return { valid: false, reason: 'Missing cryptographic proof' };
  }

  // Must meet confidence threshold
  if (prediction.confidence < 60) {
    return { valid: false, reason: 'Confidence below threshold' };
  }

  // Must be recent (within 5 minutes)
  if (Date.now() - prediction.timestamp > 5 * 60 * 1000) {
    return { valid: false, reason: 'Prediction too old' };
  }

  return { valid: true };
}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Prisma migrations applied (`npx prisma migrate deploy`)
- [ ] Smart contracts verified on explorers
- [ ] API rate limits tested
- [ ] WebSocket connections tested
- [ ] 0G broker initialized and funded
- [ ] Flow VRF oracle deployed and configured

### Post-Deployment

- [ ] Verify market syncing works
- [ ] Test whale alert WebSocket
- [ ] Confirm 0G inference working
- [ ] Test mirror market creation
- [ ] Verify copy trading flow
- [ ] Monitor error rates
- [ ] Check gas usage on Flow

### Monitoring

```typescript
// Health check endpoint
app.get('/api/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    polymarket: await checkPolymarketAPI(),
    kalshi: await checkKalshiAPI(),
    zeroG: await check0GCompute(),
    flow: await checkFlowRPC(),
    websocket: checkWebSocketConnections(),
  };

  const allHealthy = Object.values(checks).every(c => c.healthy);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

---

## Performance Optimization

### 1. Caching Strategy

```typescript
// Multi-tier caching
const cache = {
  // L1: In-memory (hot data)
  memory: new Map<string, { data: any; expiry: number }>(),

  // L2: Redis (shared across instances)
  redis: redisClient,

  // L3: Database (persistent)
  db: prismaClient,

  async get<T>(key: string): Promise<T | null> {
    // Check memory first
    const memEntry = this.memory.get(key);
    if (memEntry && memEntry.expiry > Date.now()) {
      return memEntry.data;
    }

    // Check Redis
    const redisData = await this.redis.get(key);
    if (redisData) {
      const data = JSON.parse(redisData);
      this.memory.set(key, { data, expiry: Date.now() + 30000 });
      return data;
    }

    return null;
  },

  async set(key: string, data: any, ttlMs: number): Promise<void> {
    this.memory.set(key, { data, expiry: Date.now() + ttlMs });
    await this.redis.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(data));
  },
};
```

### 2. Batch Operations

```typescript
// Batch market fetches
async function fetchMarketsInBatches(
  marketIds: string[],
  batchSize = 50
): Promise<UnifiedMarket[]> {
  const batches = chunk(marketIds, batchSize);
  const results: UnifiedMarket[] = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(id => externalMarketService.getMarket(id))
    );
    results.push(...batchResults.filter(Boolean));

    // Rate limit between batches
    await sleep(100);
  }

  return results;
}
```

### 3. WebSocket Optimization

```typescript
// Connection pooling for WebSockets
class WebSocketPool {
  private connections: Map<string, WebSocket> = new Map();
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();

  subscribe(channel: string, callback: (data: any) => void): () => void {
    if (!this.connections.has(channel)) {
      this.connect(channel);
    }

    const subs = this.subscribers.get(channel) || new Set();
    subs.add(callback);
    this.subscribers.set(channel, subs);

    return () => {
      subs.delete(callback);
      if (subs.size === 0) {
        this.disconnect(channel);
      }
    };
  }

  private connect(channel: string): void {
    const ws = new WebSocket(getWebSocketUrl(channel));
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.subscribers.get(channel)?.forEach(cb => cb(data));
    };
    this.connections.set(channel, ws);
  }

  private disconnect(channel: string): void {
    this.connections.get(channel)?.close();
    this.connections.delete(channel);
    this.subscribers.delete(channel);
  }
}
```
