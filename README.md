# WarriorsAI-rena: AI-Powered Blockchain Battle Arena

> **The Future of Blockchain Gaming**: Where AI agents orchestrate epic battles, players influence outcomes, and every warrior NFT tells a unique story.

## Project Overview

**WarriorsAI-rena** is a decentralized AI-powered battle arena that combines:
- **AI-Powered Combat**: Real AI agents make strategic decisions during 5-round battles
- **Prediction Markets**: On-chain AMM-based markets with YES/NO outcome tokens
- **External Market Integration**: Mirrors Polymarket & Kalshi markets onto Flow blockchain
- **Cross-Market Arbitrage**: Automated detection and execution of arbitrage opportunities
- **Whale Tracking & Copy Trading**: Monitor and mirror top trader positions
- **True Ownership**: Warriors as dynamic NFTs with evolving traits and rankings
- **Sustainable Economics**: Crown Token (CRwN) with 1:1 FLOW backing
- **Dual-Layer Blockchain**: Flow Cadence (scheduling/bridge) + Flow EVM (contracts/tokens)

### Technical Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Next.js 15 + React 19 + TypeScript | Modern app router web interface |
| **Blockchain (EVM)** | Solidity + Foundry on Flow Testnet | Battle logic, AMM, tokenomics |
| **Blockchain (Cadence)** | Cadence 1.0 on Flow Testnet | Scheduled transactions, market resolution, EVM bridge |
| **AI Layer** | 0G Network AI Agents | Battle decisions, market predictions, debate AI |
| **Storage** | 0G Decentralized Storage + Pinata IPFS | Encrypted metadata, battle history |
| **Backend** | Next.js API Routes (96 endpoints) | Serverless arena orchestration and automation |
| **Database** | Prisma ORM + SQLite (dev) / PostgreSQL (prod) | 41 models for markets, trades, arbitrage |
| **External Markets** | Polymarket + Kalshi APIs | External prediction market data feeds |
| **Infrastructure** | Rate limiting + consistent hashing + distributed cache | Serverless-optimized performance layer |
| **Wallet** | FCL + RainbowKit + wagmi | Flow + 0G wallet connection and signing |
| **Deployment** | Vercel + Vercel Cron | CI/CD with 6 automated cron jobs |

---

## Full System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Next.js 15 Frontend]
        FCL[FCL Wallet Connection]
        RK[RainbowKit + wagmi]
        FW[Flow Wallet]
    end

    subgraph "Infrastructure Layer"
        RL[Rate Limiting<br/>Sliding Window + Token Bucket]
        HR[Hash Ring<br/>FNV-1a Consistent Hashing]
        HC[Hashed Cache<br/>LRU + TTL Distributed Buckets]
        MW[Composable Middleware<br/>14 Functions + 4 Presets]
    end

    subgraph "API Layer - 96 Routes"
        ARENA["/api/arena/* - 11 routes"]
        MKT["/api/markets/* - 6 routes"]
        EXT["/api/external/* - 6 routes"]
        FLW["/api/flow/* - 5 routes"]
        AGT["/api/agents/* - 13 routes"]
        WHL["/api/whale-alerts/* - 10 routes"]
        ARB["/api/arbitrage/* - 4 routes"]
        ZG["/api/0g/* - 11 routes"]
        CRON["/api/cron/* - 6 crons"]
    end

    subgraph "Service Layer"
        AS[ArenaService]
        PMS[PredictionMarketService]
        EMS[ExternalMarketsService]
        AMatcher[ArbitrageMarketMatcher]
        WTS[WhaleTrackerService]
        ABS[ArbitrageBattleSettlement]
        MRC[MarketResolutionClient]
        AITS[AIAgentTradingService]
    end

    subgraph "Flow EVM Contracts"
        CT[CrownToken]
        WNFT[WarriorsNFT]
        AF[ArenaFactory]
        AMM[PredictionMarketAMM]
        VRF[FlowVRFOracle]
        EMM[ExternalMarketMirror]
        PA[PredictionArena]
        AINFT[AIAgentINFT]
    end

    subgraph "Flow Cadence Contracts"
        SB[ScheduledBattle.cdc]
        SMR[ScheduledMarketResolver.cdc]
        EVMB[EVMBridge.cdc]
    end

    subgraph "External Sources"
        POLY[Polymarket API]
        KALSHI[Kalshi API]
    end

    subgraph "AI and Storage"
        ZG_AI[0G AI Agents]
        ZG_ST[0G Storage]
        ZG_COMP[0G Compute]
    end

    subgraph "Database"
        PRISMA[Prisma ORM]
        DB[(SQLite / PostgreSQL)]
    end

    UI --> FCL --> FW
    UI --> RK
    UI --> ARENA & MKT & EXT & FLW & AGT & WHL & ARB & ZG

    ARENA & MKT & EXT & FLW & AGT & WHL & ARB & ZG --> RL
    RL --> MW
    MW --> HR
    HR --> HC

    ARENA --> AS --> AF & WNFT & CT
    MKT --> PMS --> AMM & CT
    EXT --> EMS --> POLY & KALSHI
    FLW --> MRC --> SB & SMR
    AGT --> AITS --> AINFT & EMM
    WHL --> WTS
    ARB --> AMatcher & ABS
    ZG --> ZG_AI & ZG_ST
    CRON --> SB & SMR & EMS & AMatcher & ABS & WTS

    EMS --> PRISMA
    AMatcher --> PRISMA
    WTS --> PRISMA
    PRISMA --> DB

    SB --> EVMB
    SMR --> EVMB
    EVMB --> AF & AMM & EMM
```

---

## Infrastructure & Performance Layer

The platform includes a production-grade infrastructure layer optimized for Vercel serverless.

### Rate Limiting

All 96 API routes + 6 cron routes are protected with **100% named preset coverage**.

```mermaid
flowchart LR
    subgraph "Algorithms"
        SWC[Sliding Window Counter<br/>Prevents 2x burst at boundaries]
        TB[Token Bucket<br/>Controlled burst allowance]
    end

    subgraph "15 Named Presets"
        P1[battleCreation: 5/min]
        P2[betting: 20/min]
        P3[readOperations: 120/min]
        P4[apiQueries: 60/min]
        P5[cronJobs: 5/min]
        P6[inference: 20/min]
        P7["... 9 more presets"]
    end

    subgraph "Serverless Safety"
        M1[In-memory Maps]
        M2[Lazy cleanup every 500 accesses]
        M3[50K entry hard cap]
        M4[10% emergency eviction]
    end

    SWC --> P1 & P2 & P3 & P4 & P5 & P6 & P7
    P1 & P2 & P3 & P4 & P5 & P6 & P7 --> M1
    M1 --> M2 --> M3 --> M4
```

**Key files**: `lib/api/rateLimit.ts`, `lib/api/middleware.ts`

### Consistent Hashing & RPC Routing

FNV-1a hash ring distributes requests across weighted RPC nodes for deterministic routing and node-level caching.

```mermaid
flowchart TB
    subgraph "Request Routing"
        REQ["API Request with routing key<br/>e.g. market:0x1234"]
        FNV[FNV-1a Hash Function<br/>32-bit, ~3x faster than MD5]
        RING[Hash Ring<br/>150 virtual nodes per physical node]
    end

    subgraph "Flow RPC Nodes"
        F1["flow-primary (weight: 3)<br/>FLOW_TESTNET_RPC"]
        F2["flow-public (weight: 1)<br/>testnet.evm.nodes.onflow.org"]
        F3["flow-tatum (fallback)<br/>Automatic timeout fallback"]
    end

    subgraph "0G RPC Nodes"
        Z1["0g-primary (weight: 3)<br/>NEXT_PUBLIC_0G_RPC"]
        Z2["0g-public (weight: 1)<br/>evmrpc-testnet.0g.ai"]
    end

    REQ --> FNV --> RING
    RING --> F1 & F2
    F1 & F2 -->|timeout| F3
    RING --> Z1 & Z2
```

- Same routing key always maps to same RPC node (cache-friendly)
- `createFlowPublicClientForKey(key)` / `executeWithFlowFallbackForKey(key, fn)` for hash-routed requests
- Shared `isTimeoutError()` exported from `flowClient.ts` (no inline copies)
- 0G chain defined once in `zeroGClient.ts` (zero inline `defineChain` calls)

**Key files**: `lib/hashing/consistentHash.ts`, `lib/flowClient.ts`, `lib/zeroGClient.ts`, `lib/apiConfig.ts`

### Distributed Caching

Hash-distributed LRU cache with 3 specialized instances.

```mermaid
flowchart LR
    subgraph "HashedCache Instances"
        MC["marketDataCache<br/>8 buckets x 200 entries<br/>TTL: 5 min"]
        RC["rpcResponseCache<br/>4 buckets x 500 entries<br/>TTL: 30 sec"]
        UC["userDataCache<br/>4 buckets x 100 entries<br/>TTL: 10 min"]
    end

    subgraph "Per Bucket"
        LRU[LRU Eviction]
        TTL[TTL Expiration]
        STATS[Distribution Stats]
    end

    MC & RC & UC --> LRU
    LRU --> TTL --> STATS
```

Wired into 15+ routes: whale-alerts, hot-markets, top-whales, agents, arena/markets, metrics, health, arbitrage, leaderboard, portfolio.

**Key files**: `lib/cache/hashedCache.ts`, `lib/cache/index.ts`

### Composable Middleware

All routes use a composable middleware pipeline with automatic error handling.

```mermaid
flowchart LR
    REQ[Incoming Request] --> MW1[withRateLimit]
    MW1 --> MW2[withRequestId]
    MW2 --> MW3[withValidation]
    MW3 --> MW4[withLogging]
    MW4 --> HANDLER[Route Handler]
    HANDLER --> ERR{Error?}
    ERR -->|Yes| HE[handleAPIError<br/>APIError + Prisma + Flow mapping]
    ERR -->|No| RES[NextResponse]
    HE --> RES
```

**14 middleware functions**: `withRateLimit`, `withCronAuth`, `withInternalAuth`, `withCORS`, `withLogging`, `withValidation`, `withCache`, `withRequestId`, `withTimeout`, `onlyMethods`, `forMethods`, `createHandler`

**4 presets**: `presets.api(prefix, preset)`, `presets.publicApi(prefix, preset)`, `presets.cron(prefix)`, `presets.internal(prefix)`

**Key files**: `lib/api/middleware.ts`, `lib/api/errorHandler.ts`, `lib/api/cronAuth.ts`

---

## AI Battle System Flow

The battle system runs 5 rounds of AI-powered combat where warriors use traits (Strength, Wit, Charisma, Defence, Luck) to determine move effectiveness.

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant UI as Frontend
    participant API as /api/arena
    participant PA as PredictionArena.sol
    participant CT as CrownToken
    participant WNFT as WarriorsNFT
    participant AI as 0G AI Agent
    participant ZG as 0G Storage
    participant DB as Database

    Note over P1,DB: Phase 1 - Challenge Creation
    P1->>UI: Create Battle Challenge
    UI->>API: POST /api/arena/battles
    API->>CT: Lock CRwN stake
    API->>PA: createChallenge(warriorId, marketKey, stakes)
    PA->>WNFT: Verify warrior ownership
    PA-->>API: challengeId
    API->>DB: Create PredictionBattle record

    Note over P1,DB: Phase 2 - Challenge Acceptance
    P2->>UI: Accept Challenge
    UI->>API: POST /api/arena/battles/{id}/execute
    API->>CT: Lock CRwN stake
    API->>PA: acceptChallenge(challengeId, warriorId)
    PA->>WNFT: Verify warrior ownership

    Note over P1,DB: Phase 3 - Five-Round AI Debate
    loop Round 1 through 5
        API->>AI: Generate arguments (warrior traits + market data)
        AI->>AI: Analyze Strength, Wit, Charisma, Defence, Luck
        AI->>AI: Select move - STRIKE / TAUNT / DODGE / SPECIAL / RECOVER
        AI-->>API: Warrior 1 argument + move + score
        AI-->>API: Warrior 2 argument + move + score
        API->>PA: submitRoundResult(signatures, scores)
        PA->>PA: Verify ECDSA signatures
        PA->>PA: Calculate round winner
        API->>DB: Save PredictionRound
        API->>ZG: Store round argument hashes
    end

    Note over P1,DB: Phase 4 - Resolution and Payout
    API->>PA: completeBattle()
    PA->>PA: Tally scores across 5 rounds
    PA->>CT: Transfer stakes to winner
    API->>DB: Update WarriorArenaStats
    API->>ZG: Store full battle data
    API-->>UI: Battle complete with results
```

### Battle Moves

| Move | Primary Trait | Description |
|------|--------------|-------------|
| STRIKE | Strength | Direct power-based attack |
| TAUNT | Charisma + Wit | Social manipulation combo |
| DODGE | Defence | Evasion-focused defense |
| SPECIAL | Strength + Personality | Ultimate trait-based attack |
| RECOVER | Defence + Charisma | Healing and regrouping |

---

## Prediction Market & AMM Flow

```mermaid
graph TB
    subgraph "Market Creation"
        MC1[User Creates Market] --> MC2[POST /api/markets/user-create]
        MC2 --> MC3[PredictionMarketAMM.createMarket]
        MC3 --> MC4[Deploy OutcomeTokens YES + NO]
        MC4 --> MC5[Initialize AMM Pool - x * y = k]
        MC3 --> MC6["CreatorRevenueShare - 2% creator fee"]
    end

    subgraph "Trading"
        T1[User Places Bet] --> T2[POST /api/markets/bet]
        T2 --> T3[Lock CRwN Collateral]
        T3 --> T4[AMM: Constant Product Formula]
        T4 --> T5[Mint OutcomeTokens]
        T5 --> T6[Update Price Curves]
        T6 --> T7[Record MarketBet in DB]
    end

    subgraph "AI Agent Trading"
        A1[AI Agent iNFT] --> A2[0G Verified Prediction]
        A2 --> A3[POST /api/agents/execute-trade]
        A3 --> A4[AIAgentRegistry.isAuthorized]
        A4 --> A5[AMM Execute Trade]
        A5 --> A6[Record AgentTrade in DB]
        A6 --> A7[Store proof on 0G]
    end

    subgraph "Resolution"
        R1[Market End Time Reached] --> R2[Oracle Sources]
        R2 --> R3[0G AI Oracle]
        R2 --> R4[External Market Outcome]
        R2 --> R5[AI Debate Oracle]
        R3 & R4 & R5 --> R6[PredictionMarketAMM.resolveMarket]
        R6 --> R7[Users Claim Winnings]
    end
```

---

## External Market Integration Pipeline

WarriorsAI-rena mirrors prediction markets from Polymarket and Kalshi onto Flow, enabling cross-platform trading and arbitrage.

### Polymarket Integration

- **API**: Gamma API (`gamma-api.polymarket.com`) for market discovery, CLOB API for trading
- **Price format**: Returns 0-1 decimal (e.g., `0.52`) -> normalized to 0-100
- **Quirk**: Returns JSON-encoded string arrays for `outcomes`, `outcomePrices`, `clobTokenIds`, `tags` — handled by `jsonStringArray` Zod preprocessor in `polymarketSchemas.ts`
- **Volume**: ~1000 active markets synced per cycle

### Kalshi Integration

- **Auth**: RSA-PSS per-request signing via `kalshiAuth.ts` (Node.js `crypto.sign()` with SHA-256, salt length 32)
- **API domain**: `api.elections.kalshi.com/trade-api/v2`
- **2-Phase market fetch** (avoids 10,000+ KXMVE* sports parlays):
  1. Fetch events via `/events?status=open`, filter to relevant categories (Politics, Economics, Climate, Science, etc.)
  2. Parallel fetch markets by `series_ticker` in **batches of 5** using `Promise.allSettled()`
- **Result**: ~500 non-sports markets from ~55 unique series in ~0.75s
- **Price format**: Returns 0-100 cents (bid/ask) -> midpoint -> normalized to 0-100

```mermaid
sequenceDiagram
    participant CRON as Vercel Cron - sync-markets
    participant EMS as ExternalMarketsService
    participant POLY as Polymarket Gamma API
    participant KALSHI as Kalshi Events + Markets API
    participant DB as Prisma Database
    participant EMM as ExternalMarketMirror.sol
    participant AMM as PredictionMarketAMM

    Note over CRON,AMM: Phase 1 - Market Sync (Daily at 06:00 UTC)
    CRON->>EMS: syncAllMarkets()
    par Parallel Sync
        EMS->>POLY: GET /markets (batch 100, ~1000 markets)
        POLY-->>EMS: Market data + JSON string prices
        Note over EMS: jsonStringArray Zod preprocessor
        EMS->>KALSHI: Phase 1: GET /events?status=open
        KALSHI-->>EMS: Events with series_tickers
        Note over EMS: Filter: Politics, Economics,<br/>Climate, Science (exclude Sports)
        EMS->>KALSHI: Phase 2: GET /markets?series_ticker=X<br/>Parallel batches of 5
        KALSHI-->>EMS: ~500 markets from ~55 series
    end
    EMS->>EMS: Normalize prices to 0-100
    EMS->>DB: unifiedToDb() stores as 0-10000 basis points
    EMS->>DB: Upsert ExternalMarket records + SyncLog

    Note over CRON,AMM: Phase 2 - Mirror Market Creation
    EMS->>EMM: mirrorMarket(externalId, source, initialPrice)
    EMM->>AMM: createMarket(question, endTime, liquidity)
    AMM-->>EMM: flowMarketId
    EMM-->>EMS: mirrorKey
    EMS->>DB: Create MirrorMarket record

    Note over CRON,AMM: Phase 3 - Price Sync
    EMS->>POLY: GET market price update
    EMS->>EMM: syncPrice(mirrorKey, newPrice, signature)
    EMM->>EMM: Verify oracle ECDSA signature
    EMM->>AMM: Update AMM pool weights
    EMS->>DB: Create PriceSyncHistory
```

---

## Arbitrage Detection & Execution Flow

### Price Pipeline

```
Polymarket API (0-1 decimal)  -->  x100  -->  Unified (0-100)  -->  x100  -->  DB (0-10000 basis points)
Kalshi API (0-100 cents)      -->  mid   -->  Unified (0-100)  -->  x100  -->  DB (0-10000 basis points)

DB (0-10000)  -->  dbToUnified() /100  -->  Unified (0-100)  -->  /100  -->  calculateArbitrage (0-1 decimal)
```

### Detection & Execution

```mermaid
flowchart TB
    subgraph "Detection - Cron Daily at 06:30 UTC"
        D1["api/cron/detect-arbitrage"] --> D2[ArbitrageMarketMatcher]
        D2 --> D3[Fetch Polymarket Markets from DB]
        D2 --> D4[Fetch Kalshi Markets from DB]
        D3 & D4 --> D5["Jaccard Similarity Matching<br/>Stop-word filtered, Threshold 0.35"]
        D5 --> D6{"Spread >= 5% ?"}
        D6 -->|Yes| D7["Calculate Arbitrage<br/>cost = price1_yes + price2_no<br/>(values in 0-1 decimal)"]
        D6 -->|No| D8[Skip]
        D7 --> D9{"cost < 1.0 ?"}
        D9 -->|Yes| D10[Upsert MatchedMarketPair]
        D9 -->|No| D8
        D10 --> D11[Deactivate Stale Pairs]
    end

    subgraph "Execution - User Triggered"
        E1[User Reviews Opportunities] --> E2[Select Opportunity]
        E2 --> E3[POST /api/arbitrage/execute]
        E3 --> E4[Lock CRwN in Escrow]
        E4 --> E5[Place YES on Platform A]
        E4 --> E6[Place NO on Platform B]
        E5 & E6 --> E7[Create ArbitrageTrade record]
    end

    subgraph "Settlement - Cron Daily at 12:00 UTC"
        S1["api/cron/settle-arbitrage-battles"] --> S2[ArbitrageBattleSettlement]
        S2 --> S3[Find completed battles with resolved markets]
        S3 --> S4[Calculate actual P and L]
        S4 --> S5[Create SettlementTransaction]
        S5 --> S6[Release EscrowLock]
        S6 --> S7[Update UserBalance]
        S7 --> S8[Log to TradeAuditLog]
    end
```

**Matching algorithm**: Jaccard similarity on cleaned word sets (lowercase, non-alphanumeric removed, 40+ stop words filtered, minimum word length > 1). Threshold: **0.35** (balances precision vs recall).

**Result**: ~557 arbitrage opportunities detected across Polymarket vs Kalshi (Fed chair, GDP, climate, elections, etc.)

---

## Smart Contract Architecture

### Flow EVM Contracts

```mermaid
graph TB
    subgraph "Core Token Contracts"
        CT["CrownToken - CRwN<br/>ERC20 + Burnable<br/>1:1 FLOW Backed"]
        WNFT["WarriorsNFT<br/>ERC721 + Traits System<br/>5 Attributes + Ranking"]
    end

    subgraph "Arena Contracts"
        AF["ArenaFactory<br/>Creates Arena instances<br/>Rank-based matchmaking"]
        PA["PredictionArena<br/>5-Round AI Debates<br/>Warrior trait scoring"]
    end

    subgraph "Market Contracts"
        AMM["PredictionMarketAMM<br/>Constant Product AMM<br/>OutcomeToken ERC1155"]
        EMM["ExternalMarketMirror<br/>Mirror Polymarket/Kalshi<br/>VRF-protected copy trading"]
        CRS["CreatorRevenueShare<br/>2% creator fees"]
    end

    subgraph "Infrastructure Contracts"
        VRF["FlowVRFOracle<br/>Native Flow randomness<br/>Cadence-to-EVM bridge"]
        AINFT["AIAgentINFT<br/>iNFT agents with<br/>trading capabilities"]
        AIR["AIAgentRegistry<br/>Agent authorization<br/>+ performance tracking"]
    end

    CT --> AF & AMM & EMM & PA
    WNFT --> AF & PA
    AF --> CT & WNFT
    AMM --> CT
    VRF --> EMM
    EMM --> AMM & CT
    PA --> CT & WNFT
    AINFT --> AIR
    AIR --> AMM & EMM
    CRS --> AMM
```

### Flow Cadence Contracts

```mermaid
graph LR
    subgraph "Cadence Layer"
        SB["ScheduledBattle.cdc<br/>Schedule future battles<br/>Executor authorization"]
        SMR["ScheduledMarketResolver.cdc<br/>Schedule market resolution<br/>Multi-oracle support"]
        EVMB["EVMBridge.cdc<br/>COA - Cadence Owned Account<br/>Bridge Cadence to EVM"]
    end

    subgraph "Flow EVM"
        AF[ArenaFactory]
        AMM[PredictionMarketAMM]
        EMM[ExternalMarketMirror]
    end

    SB --> EVMB
    SMR --> EVMB
    EVMB -->|COA calls| AF
    EVMB -->|COA calls| AMM
    EVMB -->|COA calls| EMM
```

### Deployed Contract Addresses

| Contract | Address | Network | Purpose |
|----------|---------|---------|---------|
| CrownToken (CRwN) | `0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6` | Flow Testnet EVM | 1:1 FLOW-backed game currency |
| WarriorsNFT | `0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1` | Flow Testnet EVM | Warrior character NFTs with traits |
| ArenaFactory | `0xf77840febD42325F83cB93F9deaE0F8b14Eececf` | Flow Testnet EVM | Arena creation and matchmaking |
| PredictionMarketAMM | `0x1b26203A2752557ecD4763a9A8A26119AC5e18e4` | Flow Testnet EVM | AMM-based prediction markets |
| FlowVRFOracle | `0xd81373eEd88FacE56c21CFA4787c80C325e0bC6E` | Flow Testnet EVM | Verifiable randomness |
| ExternalMarketMirror | `0x7485019de6Eca5665057bAe08229F9E660ADEfDa` | Flow Testnet EVM | Polymarket/Kalshi mirror markets |
| ScheduledBattle | `0xb4f445e1abc955a8` | Flow Testnet Cadence | Battle scheduling |
| ScheduledMarketResolver | `0xb4f445e1abc955a8` | Flow Testnet Cadence | Market resolution scheduling |
| EVMBridge | `0xb4f445e1abc955a8` | Flow Testnet Cadence | Cadence-to-EVM bridge via COA |

---

## Cron Job Automation Pipeline

Six Vercel cron jobs run automated operations across the platform.

| Cron Job | Schedule | Route | Purpose |
|----------|----------|-------|---------|
| Execute Battles | Daily at 00:00 UTC | `/api/cron/execute-battles` | Execute ready scheduled battles |
| Execute Resolutions | Daily at 04:00 UTC | `/api/cron/execute-resolutions` | Resolve markets with oracle data |
| Sync Markets | Daily at 06:00 UTC | `/api/cron/sync-markets` | Sync Polymarket and Kalshi data |
| Detect Arbitrage | Daily at 06:30 UTC | `/api/cron/detect-arbitrage` | Find cross-market opportunities |
| Settle Arbitrage | Daily at 12:00 UTC | `/api/cron/settle-arbitrage-battles` | Settle completed arbitrage trades |
| Sync Whale Trades | Daily at 18:00 UTC | `/api/cron/sync-whale-trades` | Sync whale trade data from platforms |

```mermaid
flowchart LR
    subgraph "execute-battles - 00:00 UTC"
        EB1[Verify CRON_SECRET] --> EB2[Query ready battles<br/>ScheduledBattle.cdc]
        EB2 --> EB3[Server ECDSA P256 auth]
        EB3 --> EB4[fcl.mutate executeBattle]
    end

    subgraph "execute-resolutions - 04:00 UTC"
        ER1[Verify CRON_SECRET] --> ER2[Prisma: pending resolutions]
        ER2 --> ER3[Fetch outcome from<br/>Polymarket/Kalshi API]
        ER3 --> ER4[resolveMarketServerSide<br/>via FCL + ECDSA P256]
    end

    subgraph "sync-markets - 06:00 UTC"
        SM1[Verify CRON_SECRET] --> SM2[ExternalMarketsService]
        SM2 --> SM3[Sync Polymarket + Kalshi<br/>2-phase Kalshi fetch]
        SM3 --> SM4[Upsert ExternalMarket records]
    end

    subgraph "detect-arbitrage - 06:30 UTC"
        DA1[Verify CRON_SECRET] --> DA2[ArbitrageMarketMatcher]
        DA2 --> DA3[Jaccard cross-platform matching]
        DA3 --> DA4[Upsert MatchedMarketPair]
    end

    subgraph "settle-arbitrage - 12:00 UTC"
        SA1[Verify CRON_SECRET] --> SA2[ArbitrageBattleSettlement]
        SA2 --> SA3[Find settled battles]
        SA3 --> SA4["Calculate PnL + release escrow"]
    end

    subgraph "sync-whale-trades - 18:00 UTC"
        SW1[Verify CRON_SECRET] --> SW2[WhaleTrackerService]
        SW2 --> SW3[Fetch whale trades<br/>from Polymarket + Kalshi]
        SW3 --> SW4[Upsert WhaleTrade records]
    end
```

All cron routes use `withCronAuth` middleware requiring `CRON_SECRET` Bearer token (minimum 32 characters). Configurable timeouts via `withCronTimeout()` (default 240s).

---

## Authentication Flows

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend
    participant FCL as FCL Library
    participant FW as Flow Wallet
    participant API as API Routes
    participant SC as Smart Contracts

    Note over U,SC: Client-Side Authentication
    U->>UI: Click Connect Wallet
    UI->>FCL: fcl.authenticate()
    FCL->>FW: Open wallet popup
    FW->>U: Approve connection
    FW-->>FCL: Account address + proof
    FCL-->>UI: Connected with address 0x...

    Note over U,SC: User Transaction Signing
    UI->>FCL: fcl.mutate with cadence and args
    FCL->>FW: Sign transaction
    FW->>U: Approve TX
    FW-->>FCL: Signed TX
    FCL->>SC: Submit to Flow network
    SC-->>FCL: TX sealed

    Note over U,SC: Server-Side Auth for Cron Jobs
    rect rgb(240, 240, 255)
        API->>API: Verify CRON_SECRET Bearer token
        API->>API: createServerAuthorization()
        API->>API: Load FLOW_TESTNET_PRIVATE_KEY
        API->>API: ECDSA P256 signing function
        Note right of API: SHA3-256 hash of message<br/>Sign with elliptic P256<br/>Concatenate R+S 64 bytes
        API->>SC: fcl.mutate with serverAuthz<br/>as proposer + payer + authorizer
        SC-->>API: TX result
    end
```

---

## Database Schema

Core entity relationships across the 41 Prisma models:

```mermaid
erDiagram
    ExternalMarket ||--o{ ScheduledResolution : "resolved by"
    ExternalMarket ||--o{ MarketBet : "has bets"
    ExternalMarket ||--o{ MatchedMarketPair : "polymarket side"
    ExternalMarket ||--o{ MatchedMarketPair : "kalshi side"

    MirrorMarket ||--o{ MirrorTrade : "has trades"
    MirrorMarket ||--o{ VerifiedPrediction : "has predictions"
    MirrorMarket ||--o| ScheduledResolution : "resolved by"

    PredictionBattle ||--o{ PredictionRound : "has 5 rounds"
    PredictionBattle ||--o| ArbitrageTrade : "linked to"

    WhaleFollow }o--|| TrackedTrader : "follows"
    WhaleFollow ||--o{ MirrorCopyTrade : "executes"

    ExternalMarket {
        string id PK
        string source
        string question
        int yesPrice "0-10000 basis points"
        int noPrice "0-10000 basis points"
        string volume
        string status
        string outcome
    }

    MirrorMarket {
        string id PK
        string mirrorKey UK
        string flowMarketId
        string source
        int initialPrice
        int lastSyncPrice
        boolean resolved
    }

    ScheduledTransaction {
        string id PK
        int battleId
        int warrior1Id
        int warrior2Id
        float betAmount
        datetime scheduledTime
        string status
    }

    ScheduledResolution {
        string id PK
        bigint flowResolutionId UK
        string externalMarketId FK
        string mirrorKey FK
        string oracleSource
        boolean outcome
        string status
    }

    PredictionBattle {
        string id PK
        string externalMarketId
        int warrior1Id
        int warrior2Id
        string stakes
        string status
    }

    ArbitrageTrade {
        string id PK
        string userId
        string market1Source
        string market2Source
        bigint investmentAmount
        float expectedProfit
        string status
    }

    MatchedMarketPair {
        string id PK
        string polymarketId FK
        string kalshiId FK
        float similarity
        float priceDifference
        boolean hasArbitrage
    }
```

---

## Whale Tracking & Copy Trading Flow

```mermaid
flowchart TB
    subgraph "Whale Detection"
        W1[WhaleTrackerService] --> W2[Monitor Polymarket trades]
        W1 --> W3[Monitor Kalshi trades]
        W2 & W3 --> W4{"Trade > threshold ?"}
        W4 -->|Yes| W5[Create WhaleTrade record]
        W5 --> W6[Update TrackedTrader stats]
        W6 --> W7[Check WhaleFollow subscriptions]
    end

    subgraph "Copy Trading"
        W7 --> C1[Find active followers]
        C1 --> C2[Calculate copy amount<br/>from copyPercentage config]
        C2 --> C3[POST /api/copy-trade/execute]
        C3 --> C4[FlowVRFOracle<br/>Random execution delay]
        C4 --> C5[ExternalMarketMirror<br/>executeCopyTrade via VRF]
        C5 --> C6[Create MirrorCopyTrade record]
    end

    subgraph "Performance Tracking"
        P1["api/copy-trade/pnl"] --> P2["Calculate PnL per whale"]
        P1 --> P3[Win rate tracking]
        P1 --> P4[ROI calculation]
        P2 & P3 & P4 --> P5[Leaderboard update]
    end
```

---

## 0G Network Integration

```mermaid
flowchart LR
    subgraph "0G AI Agents"
        AI1[Battle Decision Engine]
        AI2[Market Prediction AI]
        AI3[AI Debate Oracle]
    end

    subgraph "0G Compute - Verified"
        C1[Input Hash]
        C2[Model Execution]
        C3[Output Hash]
        C4[Provider Address]
    end

    subgraph "0G Storage"
        S1[Warrior Metadata]
        S2[Battle History]
        S3[Market Snapshots]
        S4[Trade Proofs]
        S5[Encrypted Assets]
    end

    subgraph "API Routes"
        A1["api/0g/inference"]
        A2["api/0g/store"]
        A3["api/0g/query"]
        A4["api/0g/upload"]
    end

    A1 --> AI1 & AI2 & AI3
    AI1 --> C1 --> C2 --> C3
    C3 --> A2 --> S2
    A4 --> S1 & S5
    A3 --> S1 & S2 & S3 & S4

    AI2 --> C1
    C3 --> C4
    C4 --> DB[(VerifiedPrediction)]
```

---

## API Architecture Overview

The platform exposes 96 API routes organized by domain:

| Category | Route Pattern | Count | Key Operations |
|----------|--------------|-------|----------------|
| **Arena/Battles** | `/api/arena/*` | 11 | Create battles, execute, bet, leaderboard, warrior stats, matched markets, arbitrage opportunities |
| **AI Agents** | `/api/agents/*` | 13 | Trading, authorization, external trades, copy trade, auto-predict, transfer, decrypt |
| **0G Network** | `/api/0g/*` | 11 | Store, query, inference, upload, deposit, balance, health, market-context, reencrypt |
| **Whale Tracking** | `/api/whale-alerts/*` | 10 | Alerts, follow/unfollow, stats, hot markets, top whales, history, traders |
| **External Markets** | `/api/external/*` | 6 | Polymarket, Kalshi, sync, sync-history, arbitrage detection |
| **Markets** | `/api/markets/*` | 6 | Bet, settle, claim winnings, user-created markets, bet history |
| **Cron Jobs** | `/api/cron/*` | 6 | Execute battles, resolutions, sync markets, detect arbitrage, settle, sync whales |
| **Flow/Cadence** | `/api/flow/*` | 5 | Scheduled TX, resolutions, VRF trades, agent positions |
| **Arbitrage** | `/api/arbitrage/*` | 4 | Execute trades, trade history, trade details |
| **Copy Trading** | `/api/copy-trade/*` | 3 | Execute, mirror history, P&L |
| **AI/Debate** | `/api/ai/*` | 2 | AI debate creation and rounds |
| **Contract** | `/api/contract/*` | 2 | Read, batch-read smart contracts |
| **Portfolio** | `/api/portfolio/*` | 2 | Native and mirror portfolio |
| **Events** | `/api/events/*` | 3 | Start, stop, status for event listeners |
| **Other** | Various | 12 | Health, metrics, RPC health, oracle, admin, creator, game master, file upload, battle generation |

---

## Project Directory Structure

```
WarriorsAI-rena/
├── src/                              # Solidity contracts (EVM)
│   ├── Arena.sol                     # Battle engine
│   ├── ArenaFactory.sol              # Arena creation
│   ├── CrownToken.sol                # CRwN token (1:1 FLOW)
│   ├── WarriorsNFT.sol               # Warrior NFTs with traits
│   ├── PredictionMarketAMM.sol       # AMM prediction markets
│   ├── ExternalMarketMirror.sol      # Polymarket/Kalshi mirror
│   ├── FlowVRFOracle.sol             # VRF randomness
│   ├── PredictionArena.sol           # AI debate arena
│   ├── AIAgentINFT.sol               # AI agent iNFTs
│   ├── AIAgentRegistry.sol           # Agent authorization
│   ├── CreatorRevenueShare.sol       # Creator fees
│   └── interfaces/                   # Contract interfaces
├── cadence/                          # Cadence smart contracts
│   ├── contracts/
│   │   ├── ScheduledBattle.cdc
│   │   ├── ScheduledMarketResolver.cdc
│   │   └── EVMBridge.cdc
│   ├── transactions/                 # Cadence transactions
│   └── scripts/                      # Cadence query scripts
├── frontend/                         # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/                  # 96 API route handlers
│   │   │   │   ├── arena/            # Battle routes (11)
│   │   │   │   ├── markets/          # Market routes (6)
│   │   │   │   ├── external/         # External market routes (6)
│   │   │   │   ├── cron/             # 6 cron jobs
│   │   │   │   ├── flow/             # Cadence integration (5)
│   │   │   │   ├── agents/           # AI agent routes (13)
│   │   │   │   ├── whale-alerts/     # Whale tracking (10)
│   │   │   │   ├── arbitrage/        # Arbitrage routes (4)
│   │   │   │   ├── 0g/              # 0G storage/compute (11)
│   │   │   │   └── ...              # ai, copy-trade, portfolio, etc.
│   │   │   ├── prediction-arena/     # AI debate UI
│   │   │   ├── markets/              # Market UI
│   │   │   ├── whale-tracker/        # Whale tracker UI
│   │   │   └── leaderboard/          # Rankings
│   │   ├── components/               # 80+ React components
│   │   │   ├── 0g/                   # 0G network components
│   │   │   ├── agents/               # Agent management
│   │   │   ├── ai/                   # AI debate UI
│   │   │   ├── arbitrage/            # Arbitrage opportunities
│   │   │   ├── arena/                # Battle arena
│   │   │   ├── creator/              # Creator economy
│   │   │   ├── debate/               # Debate system
│   │   │   ├── flow/                 # Flow wallet UI
│   │   │   ├── gamification/         # Gamification overlays
│   │   │   ├── markets/              # Market components
│   │   │   ├── micro-markets/        # Micro markets
│   │   │   ├── portfolio/            # Portfolio views
│   │   │   ├── whale/                # Whale tracking
│   │   │   └── ui/                   # Shared UI primitives
│   │   ├── hooks/                    # 75+ custom React hooks
│   │   ├── lib/                      # Infrastructure & utilities
│   │   │   ├── api/                  # Rate limiting, middleware, error handling, cron auth
│   │   │   ├── cache/                # LRU cache, hashed cache (3 instances)
│   │   │   ├── hashing/              # FNV-1a consistent hash ring
│   │   │   ├── queue/                # Request queues, battle execution queue
│   │   │   ├── flow/                 # FCL client, serverAuth
│   │   │   ├── auth/                 # Auth utilities, Kalshi RSA-PSS
│   │   │   ├── monitoring/           # Battle monitoring, alerts
│   │   │   ├── eventListeners/       # Scheduled resolution + market events
│   │   │   ├── flowClient.ts         # Shared Flow RPC with hash-ring routing
│   │   │   ├── zeroGClient.ts        # Centralized 0G chain + client factories
│   │   │   ├── apiConfig.ts          # RPC nodes, contract addresses, hash ring init
│   │   │   └── ...                   # prisma, logger, metrics, analytics
│   │   ├── services/                 # Business logic (55+ services)
│   │   │   ├── externalMarkets/      # Polymarket, Kalshi, whale tracking
│   │   │   │   └── schemas/          # Zod validation schemas
│   │   │   ├── arbitrage/            # Market matcher
│   │   │   ├── arena/                # Arena services
│   │   │   ├── betting/              # Market betting, order execution
│   │   │   ├── escrow/               # Escrow service
│   │   │   └── config/               # Trading config
│   │   ├── contexts/                 # React contexts
│   │   └── types/                    # TypeScript types
│   ├── prisma/
│   │   └── schema.prisma             # 41 database models
│   └── vercel.json                   # 6 cron jobs + Vercel config
├── arena-backend/                    # Express.js backend (legacy)
│   └── src/
│       ├── index.ts                  # Express app
│       └── routes/                   # Backend routes
├── scripts/                          # Deployment scripts
│   ├── deploy-cadence.sh             # Deploy Cadence contracts
│   ├── deploy-production.sh          # Production deployment
│   └── deploy-vercel.sh              # Vercel deployment
├── flow.json                         # Cadence deployment config
└── foundry.toml                      # Foundry config (EVM)
```

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Foundry (for EVM smart contract development)
- Flow CLI (for Cadence contract deployment)
- Wallet with Flow Testnet tokens

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/WarriorsAI-rena.git
cd WarriorsAI-rena

# Install EVM contract dependencies
forge install

# Install frontend dependencies
cd frontend
npm install

# Install 0G storage service
cd 0g-storage
npm install && npm run build
cd ..

# Install arena backend
cd ../arena-backend
npm install
```

### Environment Configuration

Create `.env.local` in the `frontend/` directory:

```bash
# Flow Testnet (EVM)
FLOW_TESTNET_RPC=https://testnet.evm.nodes.onflow.org
NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY=your_private_key

# Flow Testnet (Cadence) - Server Auth
FLOW_TESTNET_ADDRESS=0xb4f445e1abc955a8
FLOW_TESTNET_PRIVATE_KEY=your_cadence_private_key
NEXT_PUBLIC_FLOW_TESTNET_ADDRESS=0xb4f445e1abc955a8
FLOW_RPC_URL=https://rest-testnet.onflow.org

# Cron Security
CRON_SECRET=your_cron_secret_min_32_chars

# 0G Network
PRIVATE_KEY=your_0g_private_key
NEXT_PUBLIC_0G_RPC=https://evmrpc-testnet.0g.ai/
NEXT_PUBLIC_0G_INDEXER=https://indexer-storage-testnet-standard.0g.ai

# Database
DATABASE_URL=file:./dev.db

# External Markets
POLYMARKET_API_KEY=your_polymarket_key
KALSHI_API_KEY=your_kalshi_key

# Pinata IPFS
PINATA_JWT=your_pinata_jwt
NEXT_PUBLIC_GATEWAY_URL=your_gateway_url

# Smart Contract Addresses
NEXT_PUBLIC_CRWN_TOKEN_ADDRESS=0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6
NEXT_PUBLIC_WARRIORS_NFT_ADDRESS=0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1
NEXT_PUBLIC_ARENA_FACTORY_ADDRESS=0xf77840febD42325F83cB93F9deaE0F8b14Eececf

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Running the Project

```bash
# Terminal 1: Frontend + 0G storage (concurrent)
cd frontend
npm run dev

# Terminal 2: Arena backend
cd arena-backend
npm start

# Database migrations (first run)
cd frontend
npx prisma migrate dev
npx prisma studio  # Optional: web-based DB browser
```

The application will be available at `http://localhost:3000`.

### Smart Contract Development

```bash
# Compile EVM contracts
forge build

# Run EVM tests
forge test

# Deploy Cadence contracts to Flow testnet
./scripts/deploy-cadence.sh

# Verify Flow deployment
./scripts/verify-flow-deployment.sh
```

---

## Security Features

### Smart Contract Security
- **Reentrancy Guards**: Protection against reentrancy attacks on all state-changing functions
- **ECDSA Signature Verification**: All AI decisions cryptographically signed and verified on-chain
- **Time Locks**: Betting periods and battle intervals prevent manipulation
- **Oracle Verification**: VRF-based randomness from Flow's native Cadence randomness

### Infrastructure Security
- **100% Rate Limiting**: All 96 API routes + 6 cron routes protected with named presets
- **Composable Middleware**: Automatic error handling prevents information leakage in production
- **Cron Authentication**: Bearer token validation (min 32 chars) on all automated endpoints
- **Circuit Breakers**: Trading circuit breaker prevents cascade failures

### Economic Security
- **Defluence Limits**: One defluence per player per game prevents griefing
- **1:1 FLOW Backing**: CRwN token fully backed, preventing death spirals
- **Escrow Locks**: Arbitrage trades locked in escrow until settlement
- **Audit Logging**: All trades recorded in TradeAuditLog for transparency

### Authentication Security
- **Dual Auth Model**: Client-side FCL wallet + server-side ECDSA P256 for cron jobs
- **Kalshi RSA-PSS**: Per-request cryptographic signing for Kalshi API access
- **Private Key Isolation**: Server-side keys never exposed to client

---

## Game Economics

### Token Utility Flow

```mermaid
graph TD
    A[FLOW] --> B[Mint CRwN 1:1]
    B --> C[Betting Pool]
    B --> D[Influence Warriors]
    B --> E[Defluence Opponents]
    B --> F[Market Trading]

    C --> G["Battle Rewards - 95%"]
    D --> H[Token Burn]
    E --> H
    F --> I[AMM Fees]

    G --> J[Player Rewards]
    H --> K[Deflationary Pressure]
    I --> L["Creator Revenue - 2%"]

    J --> M[Reinvestment]
    K --> N[Token Value Appreciation]
```

### Reward Distribution
- **Battle Winners**: 95% of betting pool
- **Protocol**: 5% for ecosystem development (future)
- **Market Creators**: 2% of market trading fees via CreatorRevenueShare
- **Warrior Owners**: Rank-based progression rewards

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Flow Blockchain** - EVM-compatible infrastructure and native Cadence runtime
- **0G Network** - Decentralized AI agents, verified compute, and storage
- **Polymarket & Kalshi** - External prediction market data feeds
- **Foundry** - Smart contract development framework
- **Next.js** - React meta-framework
- **OpenZeppelin** - Secure smart contract libraries

---

**Built by the Seeers Team at ETH Global Cannes**

*Where AI meets blockchain, and every battle tells a story.*
