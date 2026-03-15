# WarriorsAI-rena — Technical Architecture

## Pivoted Project: AI-Powered DeFi Strategy NFTs on Flow

> Life stories become AI-generated trading strategy NFTs that autonomously execute DeFi moves on Flow and compete head-to-head in arenas where spectators bet on which strategy wins — all powered by Scheduled Transactions, Flow Actions, VRF, and 0G verified AI.

---

## Table of Contents

1. [Phase 1: Strategy NFT Minting](#phase-1-strategy-nft-minting)
2. [Phase 2: Vault Creation & Deposit](#phase-2-vault-creation--deposit)
3. [Phase 3: Autonomous Yield Execution](#phase-3-autonomous-yield-execution)
4. [Phase 4: Arena — Strategy vs Strategy](#phase-4-arena--strategy-vs-strategy)
5. [Phase 5: Copy Trading / Follow Strategies](#phase-5-copy-trading--follow-strategies)
6. [Phase 6: Breeding / Evolution](#phase-6-breeding--evolution)
7. [Full System Overview](#full-system-overview)
8. [Contract Address Map](#contract-address-map)
9. [Build Priority](#what-to-build-prioritized-for-hackathon)

---

## Phase 1: Strategy NFT Minting

**What happens:** User's life story becomes a unique on-chain trading strategy.

```
User (Browser)
    │
    │  life story text input
    ▼
┌─────────────────────────────┐
│  Next.js 15 Frontend        │
│  /warriorsMinter page       │
│  Components: MintForm.tsx   │
│  Hook: useWarriorMint()     │
└─────────────┬───────────────┘
              │ POST /api/arena/mint
              ▼
┌─────────────────────────────┐
│  API Route Handler          │
│  /api/arena/mint/route.ts   │
│  Middleware: withRateLimit   │
│  + withValidation           │
└──────┬──────────────┬───────┘
       │              │
       │              │  send biography for analysis
       │              ▼
       │    ┌─────────────────────────┐
       │    │  0G GALILEO (Chain 16602)│
       │    │  Verified AI Compute     │
       │    │                          │
       │    │  Prompt:                 │
       │    │  "Extract trading        │
       │    │   behavior signals:      │
       │    │   - Risk conviction      │
       │    │   - Analytical depth     │
       │    │   - Reaction speed       │
       │    │   - Protective instinct  │
       │    │   - Chance relationship" │
       │    │                          │
       │    │  Output:                 │
       │    │  ALPHA: 88               │
       │    │  COMPLEXITY: 72          │
       │    │  MOMENTUM: 85            │
       │    │  HEDGE: 22               │
       │    │  TIMING: 90              │
       │    │  + cryptographic proof   │
       │    │    (inputHash,           │
       │    │     outputHash,          │
       │    │     providerAddr,        │
       │    │     modelHash)           │
       │    └────────────┬────────────┘
       │                 │ traits + proof returned
       │                 ▼
       │    ┌─────────────────────────┐
       │    │  Server Auth            │
       │    │  ECDSA P256 Signing     │
       │    │                         │
       │    │  Signs: keccak256(      │
       │    │    addr, alpha,         │
       │    │    complexity,          │
       │    │    momentum, hedge,     │
       │    │    timing, nonce        │
       │    │  )                      │
       │    └────────────┬────────────┘
       │                 │ signed trait payload
       │                 ▼
       │    ┌─────────────────────────────────────────┐
       │    │  FLOW EVM (Chain 545)                    │
       │    │  WarriorsNFT.sol                         │
       │    │  @ 0x3838510eCa30EdeF7b264499F2B590ab4  │
       │    │                                          │
       │    │  mint(                                   │
       │    │    to: userAddress,                      │
       │    │    alpha: 88,                            │
       │    │    complexity: 72,                       │
       │    │    momentum: 85,                         │
       │    │    hedge: 22,                            │
       │    │    timing: 90,                           │
       │    │    signature: 0x...                      │
       │    │  )                                       │
       │    │                                          │
       │    │  → tokenId #247 minted                   │
       │    └─────────────────────────────────────────┘
       │
       │  store metadata + visual
       ▼
┌──────────────────┐    ┌──────────────────┐
│  0G Storage      │    │  Pinata IPFS     │
│  - Trait data    │    │  - Backup URI    │
│  - Visual JSON   │    │  - Image         │
│  - 0G proof      │    │                  │
│  - Life history  │    │                  │
│    (encrypted)   │    │                  │
└──────────────────┘    └──────────────────┘
```

### Strategy Traits (replacing STR/WIT/CHA/DEF/LCK)

| Trait | Name | DeFi Meaning | Low Score | High Score |
|-------|------|-------------|-----------|------------|
| **ALPHA** | Conviction Strength | Position concentration | Diversified across 5 pools | 80% in single best pool |
| **COMPLEXITY** | Strategy Depth | Protocol hop count | Single deposit | Multi-hop Source→Swap→LP→Borrow |
| **MOMENTUM** | Trend Sensitivity | Rebalance frequency | Buy and hold | Rebalance every cycle |
| **HEDGE** | Downside Protection | Stablecoin allocation | Fully exposed | 60% in stables |
| **TIMING** | Entry/Exit Precision | VRF randomization range | Wide window, random | Tight window, precise |

### Example: Trauma Surgeon Who Rock Climbs

```
Life story: "I'm a trauma surgeon who rock climbs and day-traded through 2008"

AI Extraction:
  - Makes life-or-death decisions fast     → MOMENTUM: 85
  - High conviction under pressure          → ALPHA: 88
  - Precise hand movements                  → TIMING: 90
  - Analytical but not overly cautious      → COMPLEXITY: 72
  - Thrives on risk, minimal protection     → HEDGE: 22

Strategy Profile: AGGRESSIVE
  → Concentrated positions, fast rebalancing, precise entries, low hedging
```

**Output:** Strategy NFT #247 exists on-chain with immutable traits ALPHA:88 / COMPLEXITY:72 / MOMENTUM:85 / HEDGE:22 / TIMING:90

**Code status:** ✅ Entire pipeline exists. Change = AI prompt reframe + trait label rename.

---

## Phase 2: Vault Creation & Deposit

**What happens:** The strategy NFT activates and starts managing real capital.

```
User (has Strategy NFT #247)
    │
    │  select NFT + deposit amount
    ▼
┌─────────────────────────────┐
│  Next.js 15 Frontend        │
│  /vault/create page         │
│  Hook: useVaultCreate()     │
└─────────────┬───────────────┘
              │ POST /api/vault/create
              ▼
┌─────────────────────────────┐
│  API Route Handler          │
│  Reads NFT traits from      │
│  WarriorsNFT.sol on-chain   │
│                             │
│  Fetches current pool state:│
│  - High-Yield Pool APY      │
│  - Stable Pool APY          │
│  - LP Pool APY              │
└──────┬──────────────────────┘
       │ traits + pool data
       ▼
┌─────────────────────────────────┐
│  0G GALILEO — Strategy Engine   │
│                                 │
│  Input:                         │
│    traits: {A:88,C:72,M:85,    │
│             H:22,T:90}          │
│    pools: [                     │
│      {name:"HighYield",apy:18%},│
│      {name:"Stable", apy:4%},  │
│      {name:"LP", apy:11%}      │
│    ]                            │
│                                 │
│  Constraint enforcement:        │
│    ALPHA:88 → concentrate max   │
│      68% in best pool           │
│    HEDGE:22 → min 5% stable     │
│    COMPLEXITY:72 → can compose  │
│      up to 3-hop strategies     │
│                                 │
│  Output (with proof):           │
│    allocation: {                │
│      HighYield: 68%,            │
│      LP: 27%,                   │
│      Stable: 5%                 │
│    }                            │
└────────────────┬────────────────┘
                 │ verified allocation
                 ▼
┌────────────────────────────────────────────────┐
│  USER REVIEWS & APPROVES                        │
│                                                 │
│  "Strategy #247 proposes:"                      │
│  ┌──────────────────────────────────────────┐   │
│  │  68% → High-Yield Pool (18% APY)        │   │
│  │  27% → LP Pool (11% APY)                │   │
│  │   5% → Stable Pool (4% APY)             │   │
│  │                                          │   │
│  │  Projected blended APY: ~15.2%           │   │
│  │  Risk level: AGGRESSIVE                  │   │
│  │  0G Proof: ✓ Verified                    │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  [Deposit 500 CRwN]  [Adjust]  [Cancel]         │
└────────────────────────┬────────────────────────┘
                         │ user confirms deposit
                         ▼
┌─────────────────────────────────────────────────────┐
│  FLOW EVM — Token Transfer + Escrow                  │
│                                                      │
│  1. CrownToken.sol.transferFrom(user, vault, 500)    │
│     @ 0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6    │
│                                                      │
│  2. StrategyVault.sol.deposit(                        │
│       nftId: 247,                                    │
│       amount: 500 CRwN,                              │
│       allocation: [68, 27, 5],                       │
│       proof: 0x...                                   │
│     )                                                │
│                                                      │
│  3. Internal pool deposits:                          │
│     → HighYieldPool.deposit(340 CRwN)                │
│     → LPPool.deposit(135 CRwN)                       │
│     → StablePool.deposit(25 CRwN)                    │
└──────────────────────────┬──────────────────────────┘
                           │ vault is funded
                           ▼
┌─────────────────────────────────────────────────────┐
│  FLOW CADENCE — Activate Scheduled Execution         │
│                                                      │
│  ScheduledVault.cdc                                  │
│  @ 0xb4f445e1abc955a8                                │
│                                                      │
│  transaction {                                       │
│    prepare(signer: auth(Storage) &Account) {         │
│      let handler <- ScheduledVault.createHandler(    │
│        nftId: 247,                                   │
│        vaultAddr: 0x...,                             │
│        cycleInterval: 86400  // daily                │
│      )                                               │
│      signer.storage.save(<-handler,                  │
│        to: /storage/vault247Handler)                 │
│                                                      │
│      FlowCallbackScheduler.schedule(                 │
│        capability,                                   │
│        executeAfter: getCurrentBlock().timestamp      │
│                      + 86400.0                       │
│      )                                               │
│    }                                                 │
│  }                                                   │
└─────────────────────────────────────────────────────┘
```

### Internal DeFi Pools (self-contained for hackathon demo)

| Pool | Risk | APY Model | Purpose |
|------|------|-----------|---------|
| **HighYieldPool.sol** | High | Variable (12-25%) | Simulates volatile farm |
| **StablePool.sol** | Low | Fixed (3-5%) | Simulates stablecoin vault |
| **LPPool.sol** | Medium | Variable (8-15%) | Simulates LP position |

> Pitch: "Architecture is protocol-agnostic via Flow Actions connectors. Internal pools for demo — integrates with KittyPunch/Increment.fi/StableKitty in production."

**Output:** Vault is live. 500 CRwN deployed across 3 pools. Scheduled TX will fire in 24 hours for first cycle.

**Code status:** ✅ FULLY IMPLEMENTED & DEPLOYED. StrategyVault.sol @ `0xc0c6ccdcd869347a7106756f091912c5598d88d1`, HighYieldPool @ `0xf06b6957a4675b41309152d3835a1500b6314b92`, StablePool @ `0x9f97edf841be7aeef3a63f5e1d33ad247f9bc94c`, LPPool @ `0xbaf2d9019e2955ab4171d5fae221e3be057738ad`. Frontend: `/vault/create` page + `useVaultCreate()` hook + 3 API routes + `vaultService.ts`. Cadence: `ScheduledVault.cdc` + `schedule_vault.cdc` + `query_vault_status.cdc`.

---

## Phase 3: Autonomous Yield Execution

**What happens:** The strategy earns yield by itself, cycle after cycle, with zero human intervention.

```
┌─────────────────────────────────────────────────────┐
│  CADENCE SCHEDULED TX FIRES (every cycle)            │
│                                                      │
│  FlowCallbackScheduler triggers:                     │
│  ScheduledVault.Handler.executeCallback()            │
│                                                      │
│  1. Read NFT #247 traits from WarriorsNFT.sol        │
│     via EVMBridge.cdc (COA call)                     │
│  2. Read current pool states (APYs, balances)        │
│  3. Pass to API for AI evaluation                    │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  0G GALILEO — Cycle Evaluation                       │
│                                                      │
│  Input:                                              │
│    current_allocation: {HY:68%, LP:27%, S:5%}        │
│    current_apys: {HY:14%, LP:12%, S:4%}             │
│    traits: {A:88, C:72, M:85, H:22, T:90}           │
│    market_conditions: { volatility: HIGH }           │
│                                                      │
│  AI Decision (verified):                             │
│    move: REBALANCE                                   │
│    reason: "HY APY dropped from 18→14%.              │
│            LP now competitive. MOMENTUM:85            │
│            permits aggressive rebalance."             │
│    new_allocation: {HY:45%, LP:48%, S:7%}            │
│    proof: { inputHash, outputHash, modelHash }       │
│                                                      │
│  Constraint check:                                   │
│    ✓ ALPHA:88 → max single position 68% (45% OK)    │
│    ✓ HEDGE:22 → min stable 5% (7% OK)               │
│    ✓ MOMENTUM:85 → can shift up to 30%/cycle (23% OK)│
│    ✓ COMPLEXITY:72 → simple rebalance (OK)           │
└──────────────────────────┬──────────────────────────┘
                           │ verified move + allocation
                           ▼
┌─────────────────────────────────────────────────────┐
│  FLOW CADENCE — Flow Actions Composition             │
│                                                      │
│  Atomic transaction via EVMBridge.cdc:               │
│                                                      │
│  Step 1 — SOURCE                                     │
│    HighYieldPool.withdraw(115 CRwN)                  │
│    // pulling from 340→225 (68%→45%)                 │
│                                                      │
│  Step 2 — SWAP (if needed)                           │
│    // no swap needed, same CRwN token                │
│                                                      │
│  Step 3 — SINK                                       │
│    LPPool.deposit(105 CRwN)                          │
│    // adding to 135→240 (27%→48%)                    │
│    StablePool.deposit(10 CRwN)                       │
│    // adding to 25→35 (5%→7%)                        │
│                                                      │
│  ALL THREE STEPS = ONE ATOMIC TX                     │
│  All succeed or all revert.                          │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  UPDATE ON-CHAIN STATE                               │
│                                                      │
│  AIAgentINFT.sol.recordTrade(                        │
│    tokenId: 247,                                     │
│    cycleNum: 3,                                      │
│    move: REBALANCE,                                  │
│    pnlDelta: +12.4 CRwN,                            │
│    newAllocation: [45, 48, 7]                        │
│  )                                                   │
│                                                      │
│  Updated state:                                      │
│    totalPnL: +38.7 CRwN (cumulative)                 │
│    accuracyBps: 7500 (75% profitable cycles)         │
│    tier: SILVER → GOLD (auto-upgraded)               │
│                                                      │
│  Store audit on 0G Storage:                          │
│    cycle_data, move, proof, allocation, pnl          │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  RESCHEDULE NEXT CYCLE                               │
│                                                      │
│  FlowCallbackScheduler.schedule(                     │
│    capability,                                       │
│    executeAfter: getCurrentBlock().timestamp + 86400  │
│  )                                                   │
│                                                      │
│  → Cycle repeats forever until user withdraws        │
└─────────────────────────────────────────────────────┘
```

**Output:** Strategy #247 rebalanced. P&L updated. Next cycle scheduled. No human intervention.

**Code status:** ✅ FULLY IMPLEMENTED. `StrategyVault.rebalance()` added on-chain (withdraw old allocation → re-deposit new). `defiConstraints.ts` enforces ALPHA/HEDGE/MOMENTUM limits. `/api/vault/evaluate-cycle` calls 0G AI with trait-constrained cycle prompt. `/api/cron/execute-yield-cycles` cron job orchestrates batch execution (query active vaults → evaluate → rebalance → record P&L). `VaultCycle` Prisma model tracks per-cycle move, allocation delta, yield earned, AI proof. `vaultYieldService.ts` handles server-wallet rebalance execution. Flow Actions composition = 🆕 new Cadence code (deferred to production).

---

## Phase 4: Arena — Strategy vs Strategy

**What happens:** Two Strategy NFTs compete head-to-head with real capital over 5 execution cycles.

### Arena Setup

```
┌───────────────────────┐     ┌───────────────────────┐
│  STRATEGY #247         │     │  STRATEGY #102         │
│  "The Surgeon"         │     │  "The Actuary"         │
│                        │     │                        │
│  ALPHA:     88 ████▓░  │     │  ALPHA:     25 ██░░░░  │
│  COMPLEXITY: 72 ███▓░░ │     │  COMPLEXITY: 90 █████░ │
│  MOMENTUM:  85 ████▓░  │     │  MOMENTUM:  30 ██░░░░  │
│  HEDGE:     22 █▓░░░░  │     │  HEDGE:     88 ████▓░  │
│  TIMING:    90 █████░  │     │  TIMING:    45 ██▓░░░  │
│                        │     │                        │
│  Style: Aggressive     │     │  Style: Conservative   │
│  Win Rate: 73%         │     │  Win Rate: 68%         │
│  Cumul PnL: +382 CRwN  │     │  Cumul PnL: +241 CRwN  │
└───────────┬─────────────┘     └───────────┬─────────────┘
            │                               │
            │     ARENA CREATED             │
            ▼                               ▼
┌─────────────────────────────────────────────────────┐
│  ArenaFactory.sol — createArena()                    │
│  @ 0xf77840febD42325F83cB93F9deaE0F8b14Eececf       │
│                                                      │
│  1. Verify both NFTs exist (WarriorsNFT.ownerOf)     │
│  2. Lock stakes: 100 CRwN each into escrow           │
│     CrownToken.transferFrom(user1, escrow, 100)      │
│     CrownToken.transferFrom(user2, escrow, 100)      │
│  3. Create arena instance with 5-cycle config        │
│  4. Open spectator betting market (AMM)              │
│  5. Schedule first cycle via Cadence                 │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  SPECTATOR BETTING OPENS                             │
│                                                      │
│  PredictionMarketAMM.sol                             │
│  @ 0x1b26203A2752557ecD4763a9A8A26119AC5e18e4       │
│                                                      │
│  createMarket(                                       │
│    question: "Strategy #247 vs #102",                │
│    endTime: arena.endTime,                           │
│    initialLiquidity: 50 CRwN                         │
│  )                                                   │
│                                                      │
│  → YES token = "#247 wins"                           │
│  → NO token = "#102 wins"                            │
│  → ERC-1155 OutcomeTokens minted                     │
│  → Constant-product AMM: x * y = k                   │
│                                                      │
│  Spectators buy YES/NO with CRwN                     │
└─────────────────────────────────────────────────────┘
```

### Arena Moves (replacing STRIKE/TAUNT/DODGE/SPECIAL/RECOVER)

| Move | Primary Trait | DeFi Action | When Used |
|------|--------------|-------------|-----------|
| **REBALANCE** | MOMENTUM | Shift allocation between pools based on APY changes | Standard cycle adjustment |
| **CONCENTRATE** | ALPHA | Double down on highest-performing position | High conviction play |
| **HEDGE UP** | HEDGE | Move capital to stables/defensive positions | Market downturn detected |
| **COMPOSE** | COMPLEXITY | Multi-hop Flow Actions: Source→Swap→LP→Borrow | Complex yield extraction |
| **FLASH** | TIMING | VRF-optimized entry/exit for precise execution | Time-sensitive opportunity |

### 5 Execution Cycles

```
═══════════════════════════════════════════════════════
  5 EXECUTION CYCLES (each triggered by Scheduled TX)
═══════════════════════════════════════════════════════

CYCLE 1
┌─────────────────────────────────────────────────────┐
│  Cadence ScheduledArena.cdc fires                    │
│  → calls 0G AI for BOTH strategies                   │
│  → AI picks move for each based on traits + market   │
│                                                      │
│  STRATEGY #247 (The Surgeon):                        │
│    AI move: CONCENTRATE                              │
│    Primary trait: ALPHA:88                            │
│    Action: Push 75% into High-Yield Pool             │
│    Rationale: "High conviction, APY is strong"       │
│                                                      │
│  STRATEGY #102 (The Actuary):                        │
│    AI move: HEDGE UP                                 │
│    Primary trait: HEDGE:88                            │
│    Action: Move 60% to Stable Pool                   │
│    Rationale: "Volatility detected, protect capital"  │
│                                                      │
│  → Flow Actions execute BOTH atomically              │
│  → P&L recorded for both                             │
│  → Cycle 1 result: #247 +8.2 CRwN, #102 +1.1 CRwN  │
└─────────────────────────────────────────────────────┘

CYCLE 2
┌─────────────────────────────────────────────────────┐
│  STRATEGY #247: REBALANCE (MOMENTUM:85)              │
│    Shift 20% from HY→LP (APY shifted)                │
│    Result: +5.1 CRwN                                 │
│                                                      │
│  STRATEGY #102: COMPOSE (COMPLEXITY:90)              │
│    Multi-hop: Stable→Swap→LP→Borrow→Redeploy        │
│    3-step Flow Actions composition                   │
│    Result: +4.8 CRwN                                 │
└─────────────────────────────────────────────────────┘

CYCLE 3 — MARKET DOWNTURN
┌─────────────────────────────────────────────────────┐
│  High-Yield Pool APY crashes 18%→6%                  │
│                                                      │
│  STRATEGY #247: CONCENTRATE (ALPHA:88)               │
│    Stays concentrated — takes the hit                │
│    Result: -14.3 CRwN                                │
│                                                      │
│  STRATEGY #102: HEDGE UP (HEDGE:88)                  │
│    Already 60% in stables — barely affected          │
│    Result: -0.8 CRwN                                 │
│                                                      │
│  Spectator AMM: YES (#247) price drops 62%→41%       │
│  Spectators buying NO (#102) tokens                  │
└─────────────────────────────────────────────────────┘

CYCLE 4 — RECOVERY
┌─────────────────────────────────────────────────────┐
│  STRATEGY #247: FLASH (TIMING:90)                    │
│    VRF-optimized entry into recovering HY pool       │
│    Tight timing window (TIMING:90) = precise entry   │
│    FlowVRFOracle.requestRandom() → timing offset     │
│    Result: +11.7 CRwN (caught the bounce)            │
│                                                      │
│  STRATEGY #102: REBALANCE (MOMENTUM:30)              │
│    Low momentum = slow to react to recovery          │
│    Only minor rebalance permitted                    │
│    Result: +2.1 CRwN                                 │
└─────────────────────────────────────────────────────┘

CYCLE 5 — FINAL
┌─────────────────────────────────────────────────────┐
│  STRATEGY #247: REBALANCE (close positions)          │
│    Unwind all → calculate final balance              │
│    Result: +3.2 CRwN                                 │
│                                                      │
│  STRATEGY #102: COMPOSE (final optimization)         │
│    Multi-hop exit with yield harvesting              │
│    Result: +2.9 CRwN                                 │
└─────────────────────────────────────────────────────┘
```

### Arena Resolution

```
┌─────────────────────────────────────────────────────┐
│  ON-CHAIN P&L COMPARISON                             │
│                                                      │
│  Strategy #247 "The Surgeon":                        │
│  Cycle 1: +8.2  (CONCENTRATE)                        │
│  Cycle 2: +5.1  (REBALANCE)                         │
│  Cycle 3: -14.3 (CONCENTRATE — got rekt)             │
│  Cycle 4: +11.7 (FLASH — caught bounce)              │
│  Cycle 5: +3.2  (REBALANCE)                         │
│  ─────────────────────────                           │
│  TOTAL: +13.9 CRwN                                   │
│                                                      │
│  Strategy #102 "The Actuary":                        │
│  Cycle 1: +1.1  (HEDGE UP)                           │
│  Cycle 2: +4.8  (COMPOSE)                            │
│  Cycle 3: -0.8  (HEDGE UP — protected)               │
│  Cycle 4: +2.1  (REBALANCE)                         │
│  Cycle 5: +2.9  (COMPOSE)                            │
│  ─────────────────────────                           │
│  TOTAL: +10.1 CRwN                                   │
│                                                      │
│  ══════════════════════════════                       │
│  WINNER: Strategy #247 (+13.9 > +10.1)               │
│  ══════════════════════════════                       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  SETTLEMENT (StrategyArena.sol)                      │
│                                                      │
│  1. WINNER (#247):                                   │
│     → Receives 200 CRwN staked pot                   │
│       (100 own + 100 opponent)                       │
│     → Keeps earned yield (+13.9 CRwN)                │
│     → Rank UP via AIAgentINFT._updateTier()          │
│     → Traits preserved                               │
│                                                      │
│  2. LOSER (#102):                                    │
│     → Original deposit returned to depositors        │
│     → Loses 100 CRwN stake                           │
│     → DEFLUENCE: traits degrade by 3-5 points        │
│       HEDGE: 88→85, COMPLEXITY: 90→86                │
│     → Rank DOWN                                      │
│                                                      │
│  3. SPECTATOR PAYOUT:                                │
│     → PredictionMarketAMM resolves YES               │
│     → YES token holders claim winnings               │
│     → 2% fee → CreatorRevenueShare.sol               │
│                                                      │
│  4. AUDIT:                                           │
│     → Full battle data → 0G Storage                  │
│     → TradeAuditLog updated in Prisma DB             │
└─────────────────────────────────────────────────────┘
```

**Code status:** ArenaFactory + PredictionArena = ✅ exists (refactor resolution). AMM + OutcomeTokens = ✅ unchanged. Escrow + settlement = ✅ exists. Defluence = ✅ exists.

---

## Phase 5: Copy Trading / Follow Strategies

**What happens:** Users follow top-performing strategies and auto-mirror their moves.

```
┌─────────────────────────────────────────────────────┐
│  LEADERBOARD (existing /leaderboard page)            │
│                                                      │
│  Rank │ Strategy        │ PnL      │ Win% │ Followers│
│  ─────┼─────────────────┼──────────┼──────┼──────────│
│  #1   │ #247 Surgeon    │ +382 CRwN│ 73%  │ 47       │
│  #2   │ #089 Gambler    │ +341 CRwN│ 81%  │ 32       │
│  #3   │ #102 Actuary    │ +241 CRwN│ 68%  │ 85       │
│  #4   │ #415 Artist     │ +198 CRwN│ 62%  │ 12       │
│                                                      │
│  Data source: AIAgentINFT.sol (on-chain P&L + tier)  │
└──────────────────────────┬──────────────────────────┘
                           │
                           │  User clicks "Follow #247"
                           ▼
┌─────────────────────────────────────────────────────┐
│  COPY TRADING ACTIVATION                             │
│                                                      │
│  POST /api/copy-trade/execute                        │
│                                                      │
│  1. WhaleFollow.create(                              │
│       follower: userAddr,                            │
│       strategyNftId: 247,                            │
│       amount: 200 CRwN,                              │
│       maxPerTrade: 50 CRwN                           │
│     )                                                │
│                                                      │
│  2. CrownToken.transferFrom(user, mirrorEscrow, 200) │
│                                                      │
│  3. VRF timing offset generated                      │
│     FlowVRFOracle.requestRandom()                    │
│     → offset: 47 seconds                             │
│     → follower executes 47s after strategy           │
│     → prevents front-running                         │
│                                                      │
│  4. Every time #247 executes a move:                 │
│     → Scheduled TX fires follower's mirrored move    │
│     → proportionally sized (200/500 = 40% of #247)   │
│     → VRF-delayed by 47 seconds                      │
│     → MirrorCopyTrade record created                 │
└─────────────────────────────────────────────────────┘
```

**Code status:** ✅ Entire copy trading pipeline exists — WhaleFollow, MirrorCopyTrade, VRF timing, 3 API routes, hooks. Change = "follow whale" → "follow strategy NFT."

---

## Phase 6: Breeding / Evolution

**What happens:** Top strategies breed to create evolved children. Bad strategies die.

```
┌───────────────────┐           ┌───────────────────┐
│  PARENT A (#247)   │           │  PARENT B (#089)   │
│  Rank: #1          │           │  Rank: #2          │
│  A:88 C:72 M:85    │           │  A:70 C:45 M:92    │
│  H:22 T:90         │           │  H:35 T:78         │
└────────┬──────────┘           └────────┬──────────┘
         │                               │
         │  Both top 20% + 3 arena wins  │
         ▼                               ▼
┌─────────────────────────────────────────────────────┐
│  BREEDING CONTRACT                                   │
│                                                      │
│  1. Burn breeding fee: 50 CRwN → CrownToken.burn()  │
│                                                      │
│  2. VRF Crossover:                                   │
│     FlowVRFOracle.requestRandom() → seed: 0x7f3a... │
│                                                      │
│     ALPHA:      seed[0] < 128 ? parentA : parentB    │
│                 seed[0] = 201 → Parent A → 88        │
│     COMPLEXITY: seed[1] < 128 ? parentA : parentB    │
│                 seed[1] = 54  → Parent B → 45        │
│     MOMENTUM:   seed[2] < 128 ? parentA : parentB    │
│                 seed[2] = 189 → Parent A → 85        │
│     HEDGE:      seed[3] < 128 ? parentA : parentB    │
│                 seed[3] = 12  → Parent B → 35        │
│     TIMING:     seed[4] < 128 ? parentA : parentB    │
│                 seed[4] = 240 → Parent A → 90        │
│                                                      │
│  3. VRF Mutation (15% chance per trait):              │
│     ALPHA: 88 → no mutation                          │
│     COMPLEXITY: 45 → MUTATED → 45+11 = 56           │
│     MOMENTUM: 85 → no mutation                       │
│     HEDGE: 35 → no mutation                          │
│     TIMING: 90 → MUTATED → 90-7 = 83                │
│                                                      │
│  4. CHILD: A:88 C:56 M:85 H:35 T:83                 │
│     A novel strategy that never existed before        │
│                                                      │
│  5. WarriorsNFT.mint(child traits + signatures)      │
│     → Strategy #512 born                             │
└─────────────────────────────────────────────────────┘
```

### Natural Selection (Epoch Cron)

```
┌─────────────────────────────────────────────────────┐
│  NATURAL SELECTION (Scheduled TX — weekly epoch)     │
│                                                      │
│  1. Rank all active strategies by cumulative P&L     │
│                                                      │
│  2. Bottom 10% get AUTO-DEFLUENCED:                  │
│     → Each trait degrades by 5-10 points             │
│     → Strategy becomes weaker each epoch             │
│     → Eventually unusable (all traits near 0)        │
│     → Owner can burn NFT or attempt arena recovery   │
│                                                      │
│  3. Top 20% eligible for breeding                    │
│                                                      │
│  4. Leaderboard updates                              │
│                                                      │
│  → Bad strategies die, good strategies reproduce     │
│  → Darwinian evolution of DeFi strategies            │
└─────────────────────────────────────────────────────┘
```

### Breeding Rules

| Rule | Detail |
|------|--------|
| **Eligibility** | Both parents top 20% by P&L + minimum 3 arena wins |
| **Trait Inheritance** | VRF selects which parent per trait (50/50) |
| **Mutation** | 15% chance per trait, ±5-20 points |
| **Cooldown** | 7 days between breeds (existing defluence timer) |
| **Cost** | CRwN burned (deflationary pressure) |
| **Natural Selection** | Bottom 10% auto-defluenced each epoch via Scheduled TX |

**Code status:** Defluence = ✅ exists. CRwN burn = ✅ exists. VRF = ✅ deployed. Breeding crossover = 🆕 new (small contract).

---

## Full System Overview

```
USER LIFE STORY
     │
     ▼
┌──────────┐    ┌──────────┐    ┌──────────────┐
│  0G AI   │───▶│ 5 TRAITS │───▶│ STRATEGY NFT │
│ verified │    │ on-chain │    │   ERC-721    │
└──────────┘    └──────────┘    └──────┬───────┘
                                       │
                            ┌──────────┴──────────┐
                            ▼                     ▼
                    ┌──────────────┐      ┌──────────────┐
                    │  VAULT       │      │  ARENA       │
                    │  (solo earn) │      │  (vs battle) │
                    └──────┬───────┘      └──────┬───────┘
                           │                     │
                    ┌──────┴───────┐      ┌──────┴───────┐
                    │ Scheduled TX │      │  5 Cycles    │
                    │ auto-execute │      │  move-based  │
                    │ yield cycles │      │  competition │
                    └──────┬───────┘      └──────┬───────┘
                           │                     │
                    ┌──────┴───────┐      ┌──────┴───────┐
                    │ Flow Actions │      │ Spectator    │
                    │ Source→Swap  │      │ Betting      │
                    │ →Sink atomic │      │ via AMM      │
                    └──────┬───────┘      └──────┬───────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────────────────────────┐
                    │  P&L TRACKING                    │
                    │  AIAgentINFT.sol                 │
                    │  totalPnL + tier + accuracy      │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            ┌──────────────┐              ┌──────────────┐
            │ LEADERBOARD  │              │ COPY TRADING │
            │ rank by P&L  │              │ follow + VRF │
            └──────┬───────┘              └──────────────┘
                   │
                   ▼
            ┌──────────────┐
            │  BREEDING    │
            │  VRF cross   │
            │  + mutation  │
            │  → new NFT   │
            └──────┬───────┘
                   │
                   ▼
            ┌──────────────┐
            │  EVOLUTION   │
            │  top breed   │
            │  bottom die  │
            │  (Scheduled) │
            └──────────────┘
```

---

## Contract Address Map

### Existing Deployed (unchanged)

| Contract | Address | Status |
|----------|---------|--------|
| CrownToken (CRwN) | `0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6` | ✅ unchanged |
| WarriorsNFT | `0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1` | ✅ unchanged |
| ArenaFactory | `0xf77840febD42325F83cB93F9deaE0F8b14Eececf` | ✅ unchanged |
| PredictionMarketAMM | `0x1b26203A2752557ecD4763a9A8A26119AC5e18e4` | ✅ unchanged |
| FlowVRFOracle | `0xd81373eEd88FacE56c21CFA4787c80C325e0bC6E` | ✅ unchanged |
| ExternalMarketMirror | `0x7485019de6Eca5665057bAe08229F9E660ADEfDa` | ✅ unchanged |
| AIAgentINFT | deployed | ✅ unchanged |
| AIAgentRegistry | deployed | ✅ unchanged |
| CreatorRevenueShare | deployed | ✅ unchanged |

### Cadence (refactored)

| Contract | Address | Status |
|----------|---------|--------|
| ScheduledBattle.cdc → ScheduledVault.cdc | `0xb4f445e1abc955a8` | ~ minor refactor |
| ScheduledMarketResolver → PnLResolver.cdc | `0xb4f445e1abc955a8` | ~ minor refactor |
| EVMBridge.cdc | `0xb4f445e1abc955a8` | ✅ unchanged |

### New Deploys (Phase 2 — Deployed to Flow Testnet)

| Contract | Address | Status |
|----------|---------|--------|
| StrategyVault.sol | `0xc0c6ccdcd869347a7106756f091912c5598d88d1` | ✅ deployed |
| HighYieldPool.sol | `0xf06b6957a4675b41309152d3835a1500b6314b92` | ✅ deployed |
| StablePool.sol | `0x9f97edf841be7aeef3a63f5e1d33ad247f9bc94c` | ✅ deployed |
| LPPool.sol | `0xbaf2d9019e2955ab4171d5fae221e3be057738ad` | ✅ deployed |
| FlowActionsComposer.cdc | Source→Swap→Sink atomic TX | 🆕 new (Phase 3) |
| BreedingEngine.sol | VRF crossover + mutation | 🆕 new (Phase 6 bonus) |

---

## Cron Job Mapping

| Current | Pivoted | Schedule | Purpose |
|---------|---------|----------|---------|
| execute-battles | **execute-yield-cycles** | 00:00 UTC | Trigger arena round execution |
| execute-resolutions | **evaluate-pnl** | 04:00 UTC | Compare strategy yields |
| sync-markets | **sync-defi-rates** | 06:00 UTC | Pull APYs from pools |
| detect-arbitrage | **detect-breeding-pairs** | 06:30 UTC | Find complementary traits |
| settle-arbitrage | **settle-arenas** | 12:00 UTC | Distribute yield + stakes |
| sync-whale-trades | **sync-top-strategies** | 18:00 UTC | Track top performers |

---

## Flow Features Showcased

| Feature | Concrete Usage |
|---------|---------------|
| **Scheduled Transactions** | Vault auto-execution, arena cycles, defluence epochs, breeding cooldowns |
| **Flow Actions** | Source→Swap→Sink atomic strategy composition for COMPOSE moves |
| **VRF Oracle** | TIMING trait execution, breeding crossover, copy trade anti-MEV |
| **Fix128** | 24-decimal precision for yield calculations and P&L tracking |
| **Cadence Resources** | Strategy NFTs can't be duplicated, must be moved — real scarcity |
| **Cross-VM Bridge** | Cadence scheduled triggers → EVM vault execution via COA |
| **MEV Resistance** | Strategy rebalances can't be sandwiched |
| **WebAuthn** | Mainstream users manage vaults with phone biometrics |

---

## Code Reuse Summary

### Zero changes — direct reuse (10 components)

- WarriorsNFT.sol — 5 traits, ranking, ERC721
- AIAgentINFT.sol — PnL tracking, accuracy, tiers
- CrownToken.sol — 1:1 FLOW, mint/burn
- FlowVRFOracle.sol — randomness
- EVMBridge.cdc — Cadence↔EVM bridge
- CreatorRevenueShare.sol — 2% fees
- AIAgentRegistry.sol — authorization
- PredictionMarketAMM.sol — YES/NO outcome tokens
- All 14 middleware functions
- Rate limiting + hash ring infra

### Minor refactor — same structure (8 components)

- PredictionArena.sol → StrategyArena.sol (resolution logic)
- ScheduledBattle.cdc → ScheduledVault.cdc
- ScheduledMarketResolver.cdc → PnLResolver.cdc
- debateService.ts → strategyService.ts (prompt change)
- ExternalMarketService → DeFiPoolService (data source)
- ArbitrageMarketMatcher → BreedingMatcher (trait pairing)
- 6 cron jobs (same structure, different triggers)
- 29 frontend pages (rename + minor UI pivots)

### New code (4 components)

- 3 internal DeFi pool contracts
- FlowActionsComposer.cdc
- DeFi rate oracle reads
- Breeding crossover logic

**~82% code reuse from existing codebase.**

---

## What to Build (Prioritized for Hackathon)

### Must Have (demo-critical)

| Task | Estimate |
|------|----------|
| 3 internal pool contracts (HighYield, Stable, LP) | ~2 days |
| StrategyVault.sol (refactor PredictionArena) | ~1 day |
| ScheduledVault.cdc (refactor ScheduledBattle) | ~1 day |
| AI prompt reframe for strategy traits | ~2 hours |
| Frontend rename/rebrand (pages + components) | ~1 day |

### Should Have (strengthens demo)

| Task | Estimate |
|------|----------|
| Flow Actions composition in Cadence | ~1-2 days |
| Arena move execution logic (5 moves) | ~1 day |
| Live P&L dashboard for arena battles | ~1 day |

### Nice to Have (bonus points)

| Task | Estimate |
|------|----------|
| Breeding contract + crossover logic | ~1 day |
| Natural selection epoch cron | ~half day |

---

## Pitch Structure (3 minutes)

**Opening (20 sec):** "Every hedge fund has a personality shaped by its founders. We turned that insight into a protocol. Your life story becomes an AI-generated trading strategy that competes autonomously on Flow."

**Demo (2 min):** Mint a strategy NFT from a life story → show AI trait generation → deposit CRwN into vault → show Scheduled TX activation → show arena with two strategies competing → live P&L updating → spectators betting → leaderboard → copy trading.

**Tech callout (30 sec):** "Every vault operation runs via Flow Scheduled Transactions — zero bots, zero keepers. Every AI decision has a cryptographic proof from 0G. Every arena move executes atomically via Flow Actions. This is only possible on Flow."

**Close (10 sec):** "We're not gamifying DeFi. We're making DeFi strategies social, competitive, and autonomous. The game is real — the money is real — the strategies are real."
