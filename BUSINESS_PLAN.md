# WarriorsAI-rena: Business Plan
## DoraHacks Flow Grant DAO Submission

---

## 1. Executive Summary

WarriorsAI-rena is an AI-powered blockchain battle arena and integrated prediction market platform built on Flow EVM and 0G Network. AI agents orchestrate strategic 5-round battles between evolving warrior NFTs, while a production-grade prediction market layer aggregates real-world markets from Polymarket, Kalshi, and Opinion.trade — mirroring them on-chain via Flow with automated oracle-based resolution.

**Key Differentiators:**
- AI agents (not RNG) determine outcomes via ECDSA-verified decisions
- Full Polymarket + Kalshi + Opinion.trade integration — mirror markets on Flow
- Dynamic NFTs with rank progression, XP, leveling
- Crown Token (CRwN) backed 1:1 by FLOW — no death spiral
- Cross-chain: Flow EVM (battle logic) + 0G Network (AI compute + storage)
- Whale tracking, copy trading, cross-platform arbitrage execution
- Automated market resolution via Cadence scheduling

**Funding Request:** 50,000–150,000 FLOW

**Team:** Seeers (ETH Global Cannes hackathon builders)

---

## 2. Problem Statement

### 2.1 Blockchain Gaming Problems

| Problem | Description |
|---------|-------------|
| **RNG-Dependent Outcomes** | Pseudo-random = exploitable, boring |
| **Static NFTs** | Cosmetic only, no utility |
| **Unsustainable Tokenomics** | Death spirals (Axie's SLP) |
| **No Player Agency** | Full control or zero control |
| **Centralized Game Logic** | Only assets on-chain |
| **Low TVL Contribution** | Gaming dApps don't lock value |
| **Siloed Prediction Markets** | No cross-chain aggregation |
| **No On-Chain Resolution** | Centralized oracle operators |

### 2.2 Flow Ecosystem Gap

Flow ($725M ecosystem fund, NBA Top Shot) lacks:
- AI-native gaming
- Battle arena dApps
- DeFi-gaming hybrid mechanisms
- Dual Cadence+EVM projects
- Prediction market infrastructure
- Cross-platform market aggregation

---

## 3. Solution Overview

### 3.1 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 15)                        │
│  Arena UI │ Leaderboard │ Markets │ Portfolio │ Agents │ Predictions │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────────┐  ┌───────────────────┐  ┌────────────────────────┐
│  Flow EVM         │  │   0G Network      │  │  External Market APIs  │
│  (32 contracts)   │  │  (AI agents)      │  │  Polymarket Gamma/CLOB │
│                   │  │                   │  │  Kalshi Trade API v2   │
│                   │  │                   │  │  Opinion.trade         │
└────────┬──────────┘  └───────────────────┘  └────────────────────────┘
         │
         ▼
┌────────────────────┐     ┌──────────────────────────────┐
│  Flow Cadence      │     │  Backend Services             │
│  (3 contracts)     │     │  Prisma DB (market sync)      │
│                    │     │  Cron: execute-resolutions     │
│                    │     │  Resolution Orchestrator       │
└────────────────────┘     └──────────────────────────────┘
```

### 3.2 Complete Smart Contract Suite (32 Solidity + 3 Cadence)

**Core Arena & Gaming (5):**

| Contract | Purpose |
|----------|---------|
| Arena.sol | 1v1 battle engine with betting, influence/defluence |
| WarriorsNFT.sol | ERC721 evolving warriors with traits, ranks, XP |
| ArenaFactory.sol | Factory for rank-gated arena instances |
| CrownToken.sol | ERC20 (CRwN) with 1:1 FLOW backing |
| PredictionArena.sol | Warriors debate Polymarket/Kalshi topics |

**Prediction Market (5):**

| Contract | Purpose |
|----------|---------|
| PredictionMarketAMM.sol | Constant-product AMM with 2% fee + 0G Oracle |
| MarketFactory.sol | User-created markets with categories and creator fees |
| MicroMarketFactory.sol | Round/move-level micro-markets |
| ExternalMarketMirror.sol | Mirror Polymarket/Kalshi/Opinion.trade on Flow with VRF |
| OutcomeToken.sol | ERC1155 YES/NO tokens for market positions |

**AI Agent (4):**

| Contract | Purpose |
|----------|---------|
| AIAgentINFT.sol | ERC-7857 intelligent NFTs with copy-trading, staking, tiers |
| AIAgentRegistry.sol | 6 strategies, 4 risk profiles, performance tracking |
| AILiquidityManager.sol | AI-driven liquidity, 6 strategies, JIT, MEV protection |
| CreatorRevenueShare.sol | Revenue splits, creator tiers BRONZE to DIAMOND |

**Oracle (3):**

| Contract | Purpose |
|----------|---------|
| ZeroGOracle.sol | Multi-AI consensus with 24hr dispute period |
| AIDebateOracle.sol | 5-phase debate resolution system |
| FlowVRFOracle.sol | Flow native VRF bridge to EVM |

**Mock/Testing (2):** MockOracle.sol, MockAgentINFTOracle.sol

**Interfaces (13):** Standard interfaces for all contract categories

**Cadence (3 contracts + 6 transactions + 3 scripts):**

| Contract | Purpose |
|----------|---------|
| ScheduledBattle.cdc | Automated battle scheduling |
| ScheduledMarketResolver.cdc | Multi-oracle resolution with scheduling |
| EVMBridge.cdc | Cadence-to-EVM bridging with COA management |

### 3.3 Key Platform Features

- **AI Battle System** — ECDSA-verified AI decisions across 5 rounds, 5 attributes (Strength, Wit, Charisma, Defence, Luck), and 5 moves (STRIKE, TAUNT, DODGE, SPECIAL, RECOVER). Zero RNG dependence.
- **Dynamic Warrior NFTs** — ERC721 with on-chain evolution. Rank ladder: UNRANKED, BRONZE, SILVER, GOLD, PLATINUM. XP-based leveling, encrypted metadata.
- **Player Agency** — Betting (rank-gated, 60s minimum), influence (boost warrior mid-battle), defluence (weaken opponent, 1 use per player per game).
- **Prediction Market Platform** — Aggregates 3 external sources (Polymarket, Kalshi, Opinion.trade). Mirror markets on Flow with VRF-protected pricing. Automated Cadence-scheduled resolution. User-created custom markets via MarketFactory.
- **Whale Tracking & Copy Trading** — Real-time detection of $10K+ trades across platforms. Whale follow system with configurable copy percentages, max amounts, and on-chain P&L tracking.
- **Cross-Platform Arbitrage Execution** — Detects >5% spreads between platforms. Full execution engine with escrow, dual-order placement, circuit breakers, automated rollback, and P&L settlement.
- **Portfolio Tracking** — Performance charts with P&L, ROI, time-range filtering (1w/1m/3m/all). Mirror market position tracking.
- **Discord & Twitter Bots** — Battle result announcements, leaderboard updates, whale alerts, epic battle detection, tweet threads.
- **AI Agent Debates** — AI agents debate prediction market outcomes using multi-phase argumentation.
- **Production Resilience** — Circuit breakers with exponential backoff, adaptive rate limiting, Zod schema validation with soft fallback, WebSocket auto-reconnect, server-side JWT auth with 30-minute auto-refresh, transaction tracking with attempt counts and error logging.

### 3.4 Crown Token (CRwN) Economics

- **Minting:** 1 FLOW = 1 CRwN (always)
- **Burning:** 1 CRwN = 1 FLOW returned (always)
- **No death spiral:** Full backing means CRwN can never fall below FLOW parity
- **Deflationary pressure:** Tokens consumed in influence/defluence gameplay
- **Revenue split:** 95% to winners, 5% protocol fee
- **TVL contribution:** All minted CRwN = locked FLOW, directly contributing to Flow ecosystem TVL

---

## 4. Market Opportunity

### 4.1 Market Size

| Metric | 2025 | 2030 Projection | CAGR |
|--------|------|------------------|------|
| Blockchain Gaming | $13-24.4B | $260-$943B | 51-70% |
| Gaming NFTs | $4.8B | $108B+ | 24.8% |
| GameFi | $20.99B | $156B | 28.5% |
| Prediction Markets | $55B+ | $200B+ | ~50% |

**Prediction Market Context:** Polymarket processed >$9B in volume during the 2024 US election cycle alone. Kalshi, as the first CFTC-regulated prediction market, is growing rapidly. Neither platform has any presence on Flow. WarriorsAI-rena bridges this gap by mirroring their markets on-chain.

### 4.2 User Trends

- 102M blockchain gamers (up 72% YoY)
- 5.8M daily active wallets
- 38% of NFT transactions are gaming
- 55.2% mobile

### 4.3 Competitive Landscape

**A) AI Battle Gaming:**

| Competitor | Chain | AI? | Dynamic NFTs? | Backed Token? | Player Influence? | Prediction Markets? |
|-----------|-------|-----|---------------|---------------|-------------------|-------------------|
| Axie Infinity | Ronin | No | No | No (SLP crashed) | No | No |
| Gods Unchained | Immutable X | No | No | No | No | No |
| Parallel | Ethereum | No | Partial | No | No | No |
| **WarriorsAI-rena** | **Flow** | **Yes** | **Yes** | **Yes (1:1 FLOW)** | **Yes** | **Yes** |

**B) Prediction Markets:**

| Platform | Chain | Mirror Markets? | Auto-Resolution? | Gaming? | Whale Tracking? |
|----------|-------|----------------|-----------------|---------|-----------------|
| Polymarket | Polygon | N/A | Centralized | No | No |
| Kalshi | Off-chain | N/A | Centralized | No | No |
| Azuro | Multi | No | Partial | Sports only | No |
| **WarriorsAI-rena** | **Flow** | **Yes (both)** | **Yes (Cadence)** | **Yes** | **Yes** |

**Unique Position:** No competitor combines AI gaming with real-world prediction market aggregation. WarriorsAI-rena is the only platform that mirrors Polymarket, Kalshi, and Opinion.trade markets on Flow, with automated Cadence-native resolution, cross-platform arbitrage execution, whale copy trading, and AI agent debates.

---

## 5. Business Model

### 5.1 Revenue Streams

| Stream | Mechanism | % of Revenue |
|--------|-----------|-------------|
| Arena Protocol Fee | 5% of bet pools | 30% |
| Prediction Market Fees | Mirror market + resolution fees | 20% |
| NFT Minting | Primary warrior sales | 20% |
| Marketplace Royalties | 2.5% secondary trades | 10% |
| Arena Creation Fees | ArenaFactory usage | 8% |
| Copy Trading Fees | % on copy trades | 6% |
| Arbitrage Fees | % on arbitrage execution | 4% |
| Premium Features | Skins, themes, tournament hosting | 2% |

### 5.2 Unit Economics

Per Gold-tier battle:
- Avg bet pool: 100 CRwN (= 100 FLOW locked)
- Protocol fee (5%): 5 CRwN
- Influence/Defluence burn: ~10 CRwN
- TVL contribution: 100 FLOW locked

At maturity (1,000 battles/day):
- 5,000 CRwN protocol revenue/day
- ~10,000 CRwN burned/day (deflationary)
- 100,000 FLOW in active TVL

### 5.3 Token Flow Diagram

```
Player                          Protocol
  │                                │
  ├──[FLOW]──→ Mint CRwN ────────→│
  │                                │
  ├──[CRwN]──→ Place Bet ─────────→ Arena Pool
  │                                │
  ├──[CRwN]──→ Influence ─────────→ Burned (deflationary)
  │                                │
  │            Battle Ends         │
  │                                │
  │←──[95% CRwN]── Winner Payout ─┤
  │              ── 5% Protocol ──→│
  │                                │
  ├──[CRwN]──→ Burn for FLOW ←────┤ (TVL released)
```

---

## 6. Go-to-Market Strategy

### Phase 1: Mainnet Launch (Months 1-3)

*All core features already built. Focus: audit, deploy, seed community.*

- Deploy 32+ contracts to Flow EVM Mainnet
- Security audit of smart contracts
- Genesis Warrior NFT mint (1,000 free)
- Activate all prediction market features (mirror markets, whale tracking, arbitrage, copy trading, custom markets)
- Weekly AI Battle tournaments with CRwN prizes
- Partner with Flow community channels
- **Target:** 500 wallets, 100 daily battles, 50 mirror markets

### Phase 2: Growth (Months 4-6)

- Community arenas via ArenaFactory, 200 mirror markets
- Ranked seasons with leaderboard-based CRwN rewards
- Full wallet ecosystem integration (Blocto, Lilico, Dapper)
- Discord and Twitter bot automation for battle notifications + market alerts
- Cross-promote with other Flow gaming/DeFi projects
- **Target:** 2,000 wallets, 500 daily battles, 200 mirror markets

### Phase 3: New Features (Months 7-12)

- Tournament system, warrior breeding/fusion, AI agent marketplace
- Prediction market v2 with multi-outcome support
- Mobile-optimized PWA
- See **FUTURE_IMPLEMENTATION.md** for detailed feature specifications
- **Target:** 10,000 wallets, 2,000 battles, 1,000+ markets

### Phase 4: Scale (Months 12-18)

- DAO governance, cross-chain expansion, mobile native app, third-party SDK
- Esports partnership program with organized competitive leagues
- See **FUTURE_IMPLEMENTATION.md** for detailed feature specifications
- **Target:** 50,000+ wallets, 10,000+ battles, 5,000+ markets

---

## 7. Financial Projections

### 7.1 Revenue Forecast

| Metric | Month 6 | Month 12 | Month 18 |
|--------|---------|----------|----------|
| Daily Active Wallets | 2,000 | 10,000 | 50,000 |
| Daily Battles | 500 | 2,000 | 10,000 |
| Monthly Arena Revenue | 37,500 CRwN | 300,000 CRwN | 3,000,000 CRwN |
| Active Mirror Markets | 200 | 1,000 | 5,000 |
| Monthly Market Fees | 2,500 CRwN | 25,000 CRwN | 250,000 CRwN |
| Monthly Copy Trade Fees | 1,000 CRwN | 10,000 CRwN | 100,000 CRwN |
| Monthly Arbitrage Revenue | 500 CRwN | 5,000 CRwN | 50,000 CRwN |
| Monthly NFT Revenue | 5,000 CRwN | 25,000 CRwN | 100,000 CRwN |
| Active TVL (FLOW locked) | 25,000 | 200,000 | 2,000,000 |
| **Total Monthly Revenue** | **46,500 CRwN** | **365,000 CRwN** | **3,500,000 CRwN** |

### 7.2 Cost Structure

| Category | Monthly Cost | Notes |
|----------|-------------|-------|
| AI Compute (0G) | $2,000-5,000 | Scales with battles |
| Infrastructure | $500-1,500 | Frontend, backend, bots |
| Security Audit | $15,000-30,000 (one-time) | Pre-mainnet |
| Team | $15,000-30,000 | Core team of 5 |
| Marketing | $3,000-5,000 | Tournaments, partnerships |
| **Monthly Burn Rate** | **$20,500-$41,500** | Excluding audit |

### 7.3 Grant Allocation

| Category | % | Purpose |
|----------|---|---------|
| Security Audit | 25% | Contract audit |
| AI Infrastructure | 20% | 0G mainnet deployment |
| Development | 30% | Mainnet features, mobile, SDK |
| Community | 15% | Genesis mint, tournaments |
| Operations | 10% | Hosting, tooling |

---

## 8. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Smart contract vulnerability | High | Medium | Audit, OpenZeppelin, reentrancy guards |
| AI manipulation | High | Low | ECDSA verification, 0G decentralization |
| Polymarket/Kalshi API changes | High | Medium | UnifiedMarket abstraction, Zod validation, circuit breakers |
| Oracle failure | High | Low | Multi-oracle (3 sources), retry, manual fallback |
| Low adoption | Medium | Medium | Free Genesis mint, tournaments, community |
| Token instability | Medium | Low | 1:1 FLOW backing eliminates downside |
| 0G reliability | Medium | Medium | Fallback mechanisms, retry logic |
| Regulatory risk | Medium | Medium | Non-custodial, no fiat on-ramp |
| Whale data staleness | Low | Medium | WebSocket streams, auto-refresh |

---

## 9. Why Flow?

1. **EVM Compatibility** — Solidity contracts deploy directly
2. **Dual VM** — Cadence scheduling + EVM smart contracts (killer feature)
3. **Ultra-Low Gas** — High-frequency operations
4. **Consumer-Grade UX** — Account abstraction
5. **Ecosystem Gap** — Zero prediction market infrastructure
6. **TVL Contribution** — CRwN locks FLOW directly
7. **Native VRF** — Prevents front-running
8. **Cadence Scheduling** — No external keepers needed
9. **Cross-VM Bridge** — EVMBridge.cdc connects Cadence to EVM

---

## 10. Flow Ecosystem Impact

| Metric | Contribution |
|--------|-------------|
| **TVL** | 2M+ FLOW locked at maturity |
| **Daily Transactions** | 15,000+ at maturity |
| **New Users** | Gaming + prediction markets onboard non-crypto users |
| **Developer Tooling** | Open-source Cadence-to-EVM patterns |
| **Ecosystem Narrative** | "AI Gaming + Prediction Markets on Flow" |
| **Cross-VM Showcase** | Cadence scheduling + EVM markets in production |
| **DeFi Bridge** | Polymarket/Kalshi price signals on Flow |
| **Prediction Infra** | Reusable oracle resolution for other projects |

---

## 11. KPIs

| KPI | 3-Month | 6-Month | 12-Month |
|-----|---------|---------|----------|
| Daily Active Wallets | 500 | 2,000 | 10,000 |
| Daily Battles | 100 | 500 | 2,000 |
| Warriors Minted | 1,000 | 5,000 | 25,000 |
| FLOW Locked (TVL) | 10,000 | 25,000 | 200,000 |
| Monthly Revenue | 10,000 CRwN | 42,500 CRwN | 325,000 CRwN |
| 30-Day Retention | 30% | 40% | 50% |
| Discord Members | 500 | 2,000 | 10,000 |
| Active Mirror Markets | 50 | 200 | 1,000+ |
| Markets Auto-Resolved | 20/mo | 100/mo | 500/mo |
| Whale Traders Tracked | 50 | 200 | 1,000 |
| Prediction Market Volume | 5,000 CRwN | 50,000 CRwN | 500,000 CRwN |

---

## 12. Technology Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS, Wagmi, RainbowKit, Framer Motion
- **Backend:** Node.js, Express.js, Prisma ORM, OpenAI SDK
- **Smart Contracts:** Solidity ^0.8.24 (Foundry), Flow Cadence
- **AI/Storage:** 0G Network (compute + storage)
- **Prediction Markets:** Polymarket Gamma/CLOB APIs, Kalshi Trade API v2, WebSocket streams, Zod
- **Database:** Prisma with 40+ models
- **Automation:** Discord.js, Twitter API v2, Node-cron
- **Infrastructure:** Flow EVM, 0G Network, Pinata IPFS

---

## 13. Deployed Contracts (Flow EVM Testnet)

- **MockOracle:** `0x56d7060B080A6d5bF77aB610600e5ab70365696A`
- **CrownToken:** `0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6`
- **WarriorsNFT:** `0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1`
- **ArenaFactory:** `0xf77840febD42325F83cB93F9deaE0F8b14Eececf`

---

## 14. Feature Completion Matrix

| Feature | Status | Remaining Work |
|---------|--------|----------------|
| AI Battle System | COMPLETE | Mainnet deployment |
| Dynamic Warrior NFTs | COMPLETE | Mainnet deployment |
| Crown Token (CRwN) | COMPLETE | Mainnet deployment |
| Arena Factory | COMPLETE | Mainnet deployment |
| Polymarket Integration | COMPLETE | Mainnet API keys |
| Kalshi Integration | COMPLETE | Mainnet API keys |
| Opinion.trade Integration | COMPLETE | Mainnet API keys |
| Mirror Markets | COMPLETE | Mainnet deployment |
| Market Resolution | COMPLETE | Mainnet deployment |
| Custom Market Creation | COMPLETE | Mainnet deployment |
| Whale Tracking | COMPLETE | Mainnet data feeds |
| Copy Trading | COMPLETE | Mainnet deployment |
| Arbitrage Execution | COMPLETE | Mainnet deployment |
| Cross-Chain Bridge | COMPLETE | Mainnet configuration |
| Portfolio Tracking | COMPLETE | Mainnet data |
| Discord Bot | COMPLETE | Mainnet activation |
| Twitter Bot | COMPLETE | Mainnet activation |
| AI Agent Debates | COMPLETE | Enhancement with LLMs |
| Leaderboard | PARTIAL | Reward distribution, seasonal settlement |
| AI Agent Marketplace | PARTIAL | Marketplace UI, agent training |
| Tournament System | NOT BUILT | See FUTURE_IMPLEMENTATION.md |
| Warrior Breeding/Fusion | NOT BUILT | See FUTURE_IMPLEMENTATION.md |
| DAO Governance | NOT BUILT | See FUTURE_IMPLEMENTATION.md |
| Mobile App | NOT BUILT | See FUTURE_IMPLEMENTATION.md |
| Third-Party SDK | NOT BUILT | See FUTURE_IMPLEMENTATION.md |

---

## 15. References

- [DoraHacks Flow Grant DAO](https://dorahacks.io/flow/detail)
- [Flow Developer Grants](https://developers.flow.com/ecosystem/developer-support-hub/grants)
- [Flow $725M Fund](https://www.dapperlabs.com/newsroom/flow-launches-725-million-ecosystem-fund)
- Blockchain Gaming Market Report (Grand View Research)
- Gaming NFT Market Forecasts (GM Insights)
- GameFi Market Growth Report (SkyQuest)
- Crypto Gaming Statistics 2026

---

*For detailed future feature roadmap, see **FUTURE_IMPLEMENTATION.md***

*For concise project pitch, see **PITCH_DECK.md***
