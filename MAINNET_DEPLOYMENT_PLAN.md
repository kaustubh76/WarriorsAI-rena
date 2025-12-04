# WarriorsAI-rena: Mainnet Deployment Plan

**Project:** WarriorsAI Arena Battle System
**Date:** 2025-12-03
**Status:** Pre-Mainnet Preparation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Overview](#2-current-architecture-overview)
3. [Critical Security Issues](#3-critical-security-issues)
4. [Contract-by-Contract Analysis](#4-contract-by-contract-analysis)
5. [Hardcoded Values Inventory](#5-hardcoded-values-inventory)
6. [Environment Configuration Required](#6-environment-configuration-required)
7. [Deployment Steps](#7-deployment-steps)
8. [Post-Deployment Configuration](#8-post-deployment-configuration)
9. [Testing Checklist](#9-testing-checklist)
10. [Mainnet Readiness Checklist](#10-mainnet-readiness-checklist)

---

## 1. Executive Summary

### Project Overview
WarriorsAI-rena is an AI-powered blockchain battle arena where:
- AI agents make strategic battle decisions (not pure RNG)
- NFT Warriors have 5 dynamic traits: Strength, Wit, Charisma, Defence, Luck
- Crown Token (CRwN) is backed 1:1 by native FLOW
- Players bet, influence, and participate in 5-round battles

### Current Deployment (Flow Testnet - Chain ID: 545)

| Contract | Testnet Address |
|----------|----------------|
| MockOracle | `0x56d7060B080A6d5bF77aB610600e5ab70365696A` |
| CrownToken | `0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6` |
| WarriorsNFT | `0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1` |
| ArenaFactory | `0xf77840febD42325F83cB93F9deaE0F8b14Eececf` |

### Mainnet Readiness Status: **NOT READY**

**Critical Blockers:**
- 6 Critical security vulnerabilities requiring fixes
- Hardcoded localhost URLs throughout codebase
- Missing deployment scripts
- No production environment configuration

---

## 2. Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 15)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Home      │  │   Arena     │  │   Warriors Minter       │  │
│  │  (Token)    │  │  (Battle)   │  │   (NFT Creation)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                            │                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    SERVICES LAYER                          │ │
│  │  arenaService │ warriorsNFTService │ gameMasterSigning     │ │
│  │  arenaBackendService │ arenaAutomation │ ipfsService       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────────┐
│ Arena Backend │    │  0G Storage   │    │  Flow Blockchain  │
│  (Port 3002)  │    │  (Port 3001)  │    │    (Testnet)      │
│               │    │               │    │                   │
│ - Commands    │    │ - Upload      │    │ - Arena.sol       │
│ - Status      │    │ - Download    │    │ - WarriorsNFT.sol │
│ - Timing      │    │ - Merkle      │    │ - CrownToken.sol  │
└───────────────┘    └───────────────┘    │ - ArenaFactory    │
                                          └───────────────────┘
```

### Data Flow
```
1. INITIALIZE → User selects 2 Warriors → initializeGame()
2. BETTING (70s) → Players bet CRwN tokens → betOnWarriorsOne/Two()
3. BATTLE (5 rounds × 60s) → AI picks moves → Game Master signs → battle()
4. FINISH → Winner determined → finishGame() → 95% to winners
5. CLAIM → Players withdraw → burn CRwN for FLOW
```

---

## 3. Critical Security Issues

### MUST FIX BEFORE MAINNET

#### C1: Signature Replay Attack (CRITICAL)
**Location:** `src/Arena.sol:485-494`
```solidity
// CURRENT - VULNERABLE
bytes32 dataHash = keccak256(abi.encodePacked(_WarriorsOneMove, _WarriorsTwoMove));
```

**Problem:** Signature only includes moves, not round/arena/nonce. Attacker can replay battle moves.

**Fix Required:**
```solidity
// FIXED VERSION
bytes32 dataHash = keccak256(abi.encodePacked(
    _WarriorsOneMove,
    _WarriorsTwoMove,
    s_currentRound,           // Include round
    address(this),            // Include arena address
    block.timestamp / 60      // Include time window
));
```

---

#### C2: Reentrancy in CrownToken.burn() (CRITICAL)
**Location:** `src/CrownToken.sol:102-117`
```solidity
// CURRENT - VULNERABLE
function burn(uint256 _amount) public override {
    require(_amount != 0);
    require(balanceOf(msg.sender) >= _amount);
    super.burn(_amount);  // State change AFTER potential reentrancy point
    (bool success,) = payable(msg.sender).call{value: _amount}(""); // VULNERABLE
    require(success, "TransferFailed");
}
```

**Fix Required:**
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CrownToken is ERC20, ERC20Burnable, ReentrancyGuard {
    function burn(uint256 _amount) public override nonReentrant {
        require(_amount != 0);
        require(balanceOf(msg.sender) >= _amount);

        // Effects before interactions (Checks-Effects-Interactions pattern)
        super.burn(_amount);

        // Interaction last
        (bool success,) = payable(msg.sender).call{value: _amount}("");
        require(success, "TransferFailed");
    }
}
```

---

#### C3: No Access Control on initializeGame() (HIGH)
**Location:** `src/Arena.sol:267`
```solidity
// CURRENT - Anyone can initialize with any warriors
function initializeGame(uint256 _WarriorsOneNFTId, uint256 _WarriorsTwoNFTId) external {
```

**Fix Required:**
```solidity
// Add modifier or require owner check
function initializeGame(uint256 _WarriorsOneNFTId, uint256 _WarriorsTwoNFTId) external {
    // Option 1: Only warrior owners can initialize
    require(
        IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(_WarriorsOneNFTId) == msg.sender ||
        IWarriorsNFT(i_WarriorsNFTCollection).ownerOf(_WarriorsTwoNFTId) == msg.sender,
        "Must own one of the warriors"
    );
    // ... rest of function
}
```

---

#### C4: No Access Control on makeNewArena() (HIGH)
**Location:** `src/ArenaFactory.sol:220`
```solidity
// CURRENT - Anyone can create unlimited arenas
function makeNewArena(...) public returns (address) {
```

**Fix Required:**
```solidity
// Add DAO/owner control
address public immutable i_dao;

modifier onlyDAO() {
    require(msg.sender == i_dao, "Only DAO");
    _;
}

function makeNewArena(...) public onlyDAO returns (address) {
```

---

#### C5: No Nonce in Trait Assignment Signature (MEDIUM)
**Location:** `src/WarriorsNFT.sol:329-339`
```solidity
// CURRENT - Could replay trait assignments
bytes32 dataHash = keccak256(abi.encodePacked(_tokenId, _traits, _moves));
```

**Fix Required:**
```solidity
// Include timestamp or nonce
bytes32 dataHash = keccak256(abi.encodePacked(
    _tokenId,
    _traits,
    _moves,
    block.timestamp / 300  // 5-minute window
));
```

---

#### C6: Missing Fallback for Oracle Failure (MEDIUM)
**Location:** `src/Arena.sol:852-859`
```solidity
// CURRENT - Reverts if oracle unavailable
function _revertibleRandom() internal view returns (uint64) {
    (bool ok, bytes memory data) = i_cadenceArch.staticcall(
        abi.encodeWithSignature("revertibleRandom()")
    );
    require(ok, "Failed");
    return abi.decode(data, (uint64));
}
```

**Fix Required:**
```solidity
// Add fallback mechanism
function _revertibleRandom() internal view returns (uint64) {
    (bool ok, bytes memory data) = i_cadenceArch.staticcall(
        abi.encodeWithSignature("revertibleRandom()")
    );

    if (ok && data.length >= 8) {
        return abi.decode(data, (uint64));
    }

    // Fallback: Use block-based pseudo-randomness (less secure but functional)
    return uint64(uint256(keccak256(abi.encodePacked(
        block.timestamp,
        block.prevrandao,
        msg.sender,
        s_currentRound
    ))));
}
```

---

## 4. Contract-by-Contract Analysis

### 4.1 Arena.sol (1,028 lines)
**Purpose:** Core battle engine

| Component | Lines | Notes |
|-----------|-------|-------|
| State Variables | 117-152 | 25+ variables for game state |
| Constants | 154-156 | Betting: 60s, Battle interval: 30s, Cut: 5% |
| Constructor | 166-210 | Takes 8 parameters |
| initializeGame() | 267-299 | Starts new battle |
| betOnWarriorsOne/Two() | 305-352 | Betting mechanism |
| startGame() | 358-384 | Ends betting, begins battle |
| influence/defluence() | 389-460 | Player influence mechanics |
| battle() | 469-541 | Main battle execution |
| finishGame() | 751-833 | Distribute winnings |
| _executeWarriorsMove() | 548-679 | Move logic (5 types) |
| _calculateDamage() | 714-746 | Damage formula |

**Immutable Values (set at deployment):**
- `i_rankCategory` - Arena rank tier
- `i_CrownToken` - Token contract address
- `i_ArenaFactory` - Factory address
- `i_cadenceArch` - Oracle address
- `i_costToInfluence` - Base influence cost
- `i_costToDefluence` - Base defluence cost
- `i_AiPublicKey` - Move signature verifier
- `i_WarriorsNFTCollection` - NFT contract
- `i_betAmount` - Base bet size

---

### 4.2 WarriorsNFT.sol (534 lines)
**Purpose:** ERC721 with trait system

| Component | Lines | Notes |
|-----------|-------|-------|
| Traits struct | 101-109 | 5 uint16 values (0-10000) |
| Moves struct | 111-118 | 5 string move names |
| State Variables | 120-138 | Mappings for traits, ranks, winnings |
| Constructor | 178-183 | DAO, AI key, oracle |
| setGurukul() | 199-210 | One-time setter |
| setArenaFactory() | 216-225 | One-time setter |
| mintNft() | 233-252 | Create warrior |
| assignTraitsAndMoves() | 296-347 | Assign traits with signature |
| promoteNFT() | 400-446 | Rank promotion logic |
| demoteNFT() | 453-468 | DAO-only demotion |

**Promotion Requirements:**
| From | To | Total Winnings Required |
|------|-----|------------------------|
| UNRANKED | BRONZE | >= 1 ether |
| BRONZE | SILVER | >= 3 ether |
| SILVER | GOLD | >= 6 ether |
| GOLD | PLATINUM | >= 10 ether |

---

### 4.3 CrownToken.sol (117 lines)
**Purpose:** ERC20 game currency

| Component | Lines | Notes |
|-----------|-------|-------|
| Constructor | 76-79 | Name: "Crown Token", Symbol: "CRwN" |
| mint() | 86-96 | 1:1 with msg.value |
| burn() | 102-117 | Returns ETH, **REENTRANCY RISK** |

---

### 4.4 ArenaFactory.sol (301 lines)
**Purpose:** Creates rank-specific arenas

| Component | Lines | Notes |
|-----------|-------|-------|
| State Variables | 74-80 | Arena tracking |
| Constructor | 98-204 | Creates 5 initial arenas |
| makeNewArena() | 220-244 | **NO ACCESS CONTROL** |
| updateWinnings() | 252-254 | Arenas-only |

**Initial Arena Configuration (set in constructor):**
| Rank | Cost Multiplier | Bet Multiplier |
|------|-----------------|----------------|
| UNRANKED | 1x | 1x |
| BRONZE | 2x | 2x |
| SILVER | 3x | 3x |
| GOLD | 4x | 4x |
| PLATINUM | 5x | 5x |

---

## 5. Hardcoded Values Inventory

### Smart Contracts (Require Redeployment to Change)

#### Arena.sol
| Line | Value | Purpose |
|------|-------|---------|
| 154 | `60` | MIN_Warriors_BETTING_PERIOD (seconds) |
| 155 | `30` | MIN_BATTLE_ROUNDS_INTERVAL (seconds) |
| 156 | `5` | Warriors_ONE_CUT (percentage) |
| 686-704 | `5000, 10000` | Success rate formula constants |
| 720-745 | `80, 200, 90` | Damage formula caps |

#### WarriorsNFT.sol
| Line | Value | Purpose |
|------|-------|---------|
| 120 | `2` | TRAITS_DECIMAL_PRECISION |
| 121 | `1 ether` | TOTAL_WINNINGS_NEEDED_FOR_PROMOTION |

#### CrownToken.sol
| Line | Value | Purpose |
|------|-------|---------|
| 77 | `"Crown Token"` | Token name |
| 77 | `"CRwN"` | Token symbol |
| 90 | `1:1 ratio` | ETH to token ratio |

---

### Frontend (Environment Variables Needed)

#### constants.ts - Line 20-28
```typescript
// CURRENT - Hardcoded testnet
chainsToContracts: {
  545: {  // Flow testnet chain ID
    mockOracle: "0x56d7060B080A6d5bF77aB610600e5ab70365696A",
    crownToken: "0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6",
    warriorsNFT: "0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1",
    ArenaFactory: "0xf77840febD42325F83cB93F9deaE0F8b14Eececf"
  }
}
```

**Required Change:**
```typescript
// MAINNET - Add new entry
chainsToContracts: {
  545: { /* testnet addresses */ },
  747: {  // Flow mainnet chain ID
    mockOracle: process.env.NEXT_PUBLIC_MOCK_ORACLE_ADDRESS,
    crownToken: process.env.NEXT_PUBLIC_CROWN_TOKEN_ADDRESS,
    warriorsNFT: process.env.NEXT_PUBLIC_WARRIORS_NFT_ADDRESS,
    ArenaFactory: process.env.NEXT_PUBLIC_ARENA_FACTORY_ADDRESS
  }
}
```

---

#### Hardcoded URLs (MUST CHANGE)

| File | Current Value | Change To |
|------|---------------|-----------|
| `frontend/src/app/warriorsMinter/page.tsx` | `http://localhost:3001/download/` | `${process.env.NEXT_PUBLIC_STORAGE_API_URL}/download/` |
| `frontend/src/app/arena/page.tsx` | `http://localhost:3002/api/arena/commands` | `${process.env.NEXT_PUBLIC_BACKEND_API_URL}/api/arena/commands` |
| `frontend/src/app/api/files/route.ts` | `http://localhost:3001/upload` | `${process.env.NEXT_PUBLIC_STORAGE_API_URL}/upload` |
| `frontend/src/services/arenaBackendService.ts` | `http://localhost:3002` | `${process.env.NEXT_PUBLIC_BACKEND_API_URL}` |
| `arena-backend/src/index.ts` | `localhost:3000` fallback | Remove fallback, require env |

---

## 6. Environment Configuration Required

### Frontend (.env.local / .env.production)
```bash
# Wallet Connection
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<your_walletconnect_project_id>

# Contract Addresses (Mainnet)
NEXT_PUBLIC_MOCK_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_CROWN_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_WARRIORS_NFT_ADDRESS=0x...
NEXT_PUBLIC_ARENA_FACTORY_ADDRESS=0x...

# API URLs
NEXT_PUBLIC_BASE_URL=https://your-domain.com
NEXT_PUBLIC_BACKEND_API_URL=https://api.your-domain.com
NEXT_PUBLIC_STORAGE_API_URL=https://storage.your-domain.com

# Game Master (KEEP SECRET - Server-side only)
GAME_MASTER_PRIVATE_KEY=0x...

# Network
NEXT_PUBLIC_FLOW_RPC_URL=https://mainnet.evm.nodes.onflow.org
NEXT_PUBLIC_CHAIN_ID=747

# IPFS/Storage
PINATA_JWT=<your_pinata_jwt>
PINATA_GATEWAY_URL=<your_gateway_url>

# 0G Network
ZEROG_PRIVATE_KEY=0x...
ZEROG_RPC_URL=https://evmrpc-mainnet.0g.ai
ZEROG_INDEXER_URL=https://indexer-storage-mainnet.0g.ai
```

### Arena Backend (.env)
```bash
PORT=3002
FRONTEND_URL=https://your-domain.com
NODE_ENV=production

# Game Master Signing
GAME_MASTER_PRIVATE_KEY=0x...

# Blockchain
FLOW_RPC_URL=https://mainnet.evm.nodes.onflow.org
CHAIN_ID=747

# Contract Addresses
ARENA_FACTORY_ADDRESS=0x...
CROWN_TOKEN_ADDRESS=0x...
WARRIORS_NFT_ADDRESS=0x...
```

### 0G Storage Service (.env)
```bash
PORT=3001
ZEROG_PRIVATE_KEY=0x...
ZEROG_RPC_URL=https://evmrpc-mainnet.0g.ai
ZEROG_INDEXER_URL=https://indexer-storage-mainnet.0g.ai
```

---

## 7. Deployment Steps

### Phase 1: Smart Contract Deployment

#### Step 1: Deploy CrownToken
```bash
forge create src/CrownToken.sol:CrownToken \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify
```
**Parameters:** None
**Save:** `CROWN_TOKEN_ADDRESS`

---

#### Step 2: Deploy MockOracle (or use Flow's production oracle)
```bash
# Option A: Deploy mock oracle
forge create src/mocks/MockOracle.sol:MockOracle \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

# Option B: Use Flow Cadence Arch (recommended for mainnet)
# Get address from Flow documentation
ORACLE_ADDRESS=<flow_cadence_arch_mainnet_address>
```
**Save:** `ORACLE_ADDRESS`

---

#### Step 3: Deploy WarriorsNFT
```bash
forge create src/WarriorsNFT.sol:WarriorsNFT \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args $DAO_ADDRESS $AI_PUBLIC_KEY $ORACLE_ADDRESS
```
**Parameters:**
- `_dao`: DAO multisig address for governance
- `_AiPublicKey`: Public key for trait signature verification
- `_oracle`: Proof verification oracle

**Save:** `WARRIORS_NFT_ADDRESS`

---

#### Step 4: Deploy ArenaFactory
```bash
forge create src/ArenaFactory.sol:ArenaFactory \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    $BASE_COST_TO_INFLUENCE \
    $BASE_COST_TO_DEFLUENCE \
    $CROWN_TOKEN_ADDRESS \
    $AI_PUBLIC_KEY \
    $ORACLE_ADDRESS \
    $WARRIORS_NFT_ADDRESS \
    $BASE_BET_AMOUNT
```
**Parameters (example values):**
- `_costToInfluence`: `100000000000000000000` (100 CRwN)
- `_costToDefluence`: `100000000000000000000` (100 CRwN)
- `_CrownTokenAddress`: From Step 1
- `_AiPublicKey`: AI move signing public key
- `_cadenceArch`: Oracle from Step 2
- `_WarriorsNFTCollection`: From Step 3
- `_betAmount`: `50000000000000000000` (50 CRwN)

**Save:** `ARENA_FACTORY_ADDRESS`

---

### Phase 2: Contract Configuration

#### Step 5: Configure WarriorsNFT
```bash
# Set Gurukul (if training system exists)
cast send $WARRIORS_NFT_ADDRESS \
  "setGurukul(address)" $GURUKUL_ADDRESS \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

# Set Arena Factory
cast send $WARRIORS_NFT_ADDRESS \
  "setArenaFactory(address)" $ARENA_FACTORY_ADDRESS \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

---

### Phase 3: Frontend Deployment

#### Step 6: Update Frontend Configuration
1. Create `.env.production` with all addresses
2. Update `constants.ts` with mainnet chain ID (747)
3. Add mainnet contract addresses
4. Deploy to Vercel/Netlify/your hosting

```bash
cd frontend
npm run build
# Deploy build output
```

---

### Phase 4: Backend Deployment

#### Step 7: Deploy Arena Backend
```bash
cd arena-backend
# Set environment variables
# Deploy to cloud provider (AWS/GCP/Heroku/Railway)
npm run build
npm start
```

#### Step 8: Deploy 0G Storage Service
```bash
cd frontend/0g-storage
# Set environment variables
npm run build
npm start
```

---

## 8. Post-Deployment Configuration

### Verification Checklist

#### Contracts
- [ ] CrownToken verified on Flow explorer
- [ ] WarriorsNFT verified on Flow explorer
- [ ] ArenaFactory verified on Flow explorer
- [ ] 5 initial Arena contracts deployed (check ArenaFactory)

#### Configuration
- [ ] WarriorsNFT.gurukul is set
- [ ] WarriorsNFT.arenaFactory is set
- [ ] ArenaFactory has correct references

#### Access Control
- [ ] DAO address can demote NFTs
- [ ] Only arenas can update winnings
- [ ] Game master key matches AI public key

---

### Initial Operations

#### Mint Test Warriors
```bash
# Mint first warrior
cast send $WARRIORS_NFT_ADDRESS \
  "mintNft(string,bytes32)" \
  "encrypted_metadata_uri" \
  $METADATA_HASH \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $USER_PRIVATE_KEY
```

#### Test Token Minting
```bash
# Mint CRwN tokens
cast send $CROWN_TOKEN_ADDRESS \
  "mint(uint256)" \
  1000000000000000000 \
  --value 1000000000000000000 \
  --rpc-url $FLOW_MAINNET_RPC \
  --private-key $USER_PRIVATE_KEY
```

---

## 9. Testing Checklist

### Pre-Mainnet Testing (on Testnet)

#### Token Operations
- [ ] Mint CRwN with FLOW (1:1 ratio)
- [ ] Burn CRwN and receive FLOW back
- [ ] Transfer CRwN between accounts
- [ ] Approve CRwN for Arena contract

#### NFT Operations
- [ ] Mint new Warrior NFT
- [ ] Assign traits with valid signature
- [ ] Reject traits with invalid signature
- [ ] Transfer NFT with proof
- [ ] Promote NFT after winnings threshold

#### Arena Operations
- [ ] Initialize game with two warriors
- [ ] Place bets on both sides
- [ ] Cannot bet after betting period
- [ ] Influence warrior (check costs)
- [ ] Defluence opponent (one-time only)
- [ ] Execute 5 battle rounds
- [ ] Finish game and distribute winnings
- [ ] Claim winnings correctly

#### Edge Cases
- [ ] Refund when only one side has bets
- [ ] Draw scenario handling
- [ ] Maximum influence/defluence limits
- [ ] Round timing enforcement
- [ ] Signature replay prevention (after fix)

#### Integration
- [ ] Frontend connects to correct network
- [ ] Backend commands execute correctly
- [ ] 0G storage uploads/downloads work
- [ ] Game master signing works

---

## 10. Mainnet Readiness Checklist

### Security (MUST COMPLETE)
- [ ] **C1 FIXED:** Signature includes round + arena + timestamp
- [ ] **C2 FIXED:** ReentrancyGuard added to CrownToken
- [ ] **C3 FIXED:** Access control on initializeGame
- [ ] **C4 FIXED:** Access control on makeNewArena
- [ ] **C5 FIXED:** Nonce in trait assignment signature
- [ ] **C6 FIXED:** Oracle fallback implemented
- [ ] Professional audit completed (recommended)

### Configuration (MUST COMPLETE)
- [ ] All localhost URLs replaced with env vars
- [ ] Production environment files created
- [ ] Mainnet contract addresses added
- [ ] CORS configured for production domain
- [ ] SSL/TLS configured for all services

### Infrastructure (MUST COMPLETE)
- [ ] Frontend deployed to production
- [ ] Backend deployed with monitoring
- [ ] 0G storage service deployed
- [ ] Database/cache configured (if needed)
- [ ] Logging and alerting set up

### Operations (RECOMMENDED)
- [ ] Multisig for DAO address
- [ ] Private key security (HSM/KMS)
- [ ] Incident response plan
- [ ] Upgrade path documented
- [ ] User documentation ready

---

## Appendix A: Contract Constructor Parameters Reference

### CrownToken
```
No parameters
```

### WarriorsNFT
```
_dao: address           - DAO governance address
_AiPublicKey: address   - AI signature verification key
_oracle: address        - Proof verification oracle
```

### ArenaFactory
```
_costToInfluence: uint256      - Base cost in wei (e.g., 100e18)
_costToDefluence: uint256      - Base cost in wei (e.g., 100e18)
_CrownTokenAddress: address    - CrownToken contract
_AiPublicKey: address          - AI move signature key
_cadenceArch: address          - Random oracle
_WarriorsNFTCollection: address - WarriorsNFT contract
_betAmount: uint256            - Base bet in wei (e.g., 50e18)
```

---

## Appendix B: Key Addresses to Prepare

Before deployment, have these addresses ready:

| Purpose | Description | Security Level |
|---------|-------------|----------------|
| Deployer | Deploys all contracts | High (use cold wallet) |
| DAO | Governance multisig | Critical (3/5 multisig recommended) |
| Game Master | Signs AI moves | High (server-side only) |
| AI Public Key | Verifies move signatures | Public |
| Trait Signer | Signs trait assignments | High (server-side only) |
| Oracle | Cadence Arch on Flow mainnet | Public (Flow-provided) |

---

## Appendix C: Estimated Gas Costs

| Operation | Estimated Gas | Notes |
|-----------|---------------|-------|
| Deploy CrownToken | ~800,000 | One-time |
| Deploy WarriorsNFT | ~2,500,000 | One-time |
| Deploy ArenaFactory | ~5,000,000 | Creates 5 arenas |
| Mint CRwN | ~50,000 | Per user |
| Mint Warrior | ~150,000 | Per NFT |
| Assign Traits | ~200,000 | Per NFT |
| Initialize Game | ~100,000 | Per game |
| Place Bet | ~80,000 | Per bet |
| Battle Round | ~300,000 | Per round |
| Finish Game | ~400,000 | Distributes rewards |

---

**Document Version:** 1.0
**Last Updated:** 2025-12-03
**Next Review:** Before mainnet deployment
