# WarriorsAI-rena

### AI-Powered Blockchain Battle Arena + Prediction Market Platform

**The first AI-native blockchain game with real-world prediction market integration on Flow.**

Built on **Flow EVM + 0G Network** | Seeers Team | DoraHacks Flow Grant DAO

---

## The Problem

**Blockchain gaming is broken. Prediction markets are siloed. Nobody is connecting them.**

| Problem | Why It Matters |
|---------|---------------|
| **Games use RNG, not AI** | Outcomes are exploitable, boring, and lack strategic depth. Players leave. |
| **NFTs are static cosmetics** | No gameplay utility, no evolution, no reason to hold long-term. |
| **Prediction markets are isolated** | Polymarket, Kalshi, Opinion.trade — no cross-chain aggregation, no gaming integration, no on-chain resolution on Flow. **Flow has ZERO prediction market infrastructure today.** |

---

## The Solution

**WarriorsAI-rena merges AI-driven competitive gaming with a full prediction market platform — all on Flow.**

### AI Battle Arena
- **AI agents** hosted on 0G Network orchestrate 5-round battles between evolving warrior NFTs
- **ECDSA-verified decisions** — zero RNG, fully transparent, cryptographically provable
- **Dynamic NFTs** that rank up (UNRANKED > BRONZE > SILVER > GOLD > PLATINUM), gain XP, and level through combat
- **Player agency** — bet on outcomes, boost warriors you believe in, weaken opponents through strategic defluence

### Prediction Market Platform
- **Full Polymarket + Kalshi + Opinion.trade integration** — mirror real-world markets on Flow EVM
- **Automated on-chain resolution** via Cadence scheduling — no centralized oracle dependency
- **Whale tracking** with real-time detection of $10K+ trades
- **Copy trading** with on-chain P&L tracking
- **Cross-platform arbitrage detection** and execution
- **Custom market creation** by users

### Stable Token Economics
- **Crown Token (CRwN)** backed **1:1 by FLOW** — no algorithmic minting, no death spiral
- Every CRwN in circulation = 1 FLOW locked, directly contributing to Flow TVL

---

## What We Have Already Built

**This is not a whitepaper. The product exists.**

| Category | Scale |
|----------|-------|
| Smart Contracts (Solidity) | **32 contracts** deployed on Flow EVM Testnet |
| Smart Contracts (Cadence) | **3 contracts** — ScheduledBattle, ScheduledMarketResolver, EVMBridge |
| Frontend | **27 pages**, **84 React components**, **69 hooks** |
| API Layer | **89 API routes**, **26+ services** |
| Polymarket Integration | Full API integration — market mirroring, resolution, whale tracking |
| Kalshi Integration | Full API integration — event mirroring, settlement, arbitrage |
| Arbitrage Engine | Escrow, dual-order execution, rollback, settlement |
| Production Infrastructure | Circuit breakers, rate limiting, Zod validation, WebSocket auto-reconnect |
| Notifications | Discord + Twitter bots |
| AI System | Agent debate system for battle orchestration |

**Deployed and verified on Flow EVM Testnet:**

| Contract | Address |
|----------|---------|
| MockOracle | `0x56d7060B080A6d5bF77aB610600e5ab70365696A` |
| CrownToken | `0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6` |
| WarriorsNFT | `0x3838510eCa30EdeF7b264499F2B590ab4ED4afB1` |
| ArenaFactory | `0xf77840febD42325F83cB93F9deaE0F8b14Eececf` |

---

## Market Opportunity

| Metric | Value |
|--------|-------|
| Blockchain Gaming Market (2025) | **$13-24B** |
| Blockchain Gaming Market (2030) | **$260-943B** (51-70% CAGR) |
| Prediction Market Volume | **$55B+** combined (Polymarket + Kalshi) |
| Blockchain Gamers Worldwide | **102 million** (up 72% YoY) |
| Daily Active Wallets (Gaming) | **5.8 million** |
| Gaming NFTs Share | **38%** of all NFT transactions globally |

**Flow has zero prediction market infrastructure. WarriorsAI-rena fills this gap entirely.**

---

## Competitive Landscape

| Feature | Axie Infinity | Gods Unchained | Polymarket | Kalshi | **WarriorsAI-rena** |
|---------|:---:|:---:|:---:|:---:|:---:|
| AI-Powered Combat | No | No | N/A | N/A | **Yes** |
| Dynamic NFTs | No | No | N/A | N/A | **Yes** |
| Backed Token | No (SLP crashed) | No | N/A | N/A | **Yes (1:1 FLOW)** |
| Mirror External Markets | N/A | N/A | Native only | Native only | **Yes (both)** |
| Auto-Resolution On-Chain | N/A | N/A | Centralized | Centralized | **Yes (Cadence)** |
| Whale Tracking | No | No | No | No | **Yes** |
| Gaming + Markets Combined | No | No | No | No | **Yes** |

**No project in the market combines AI gaming with prediction markets. We are the only one.**

---

## Why Flow?

| Advantage | How We Use It |
|-----------|---------------|
| **EVM + Cadence dual VM** | Solidity contracts for game logic + Cadence for scheduled resolution and cross-VM bridging — a capability unique to Flow |
| **Ultra-low gas** | High-frequency battle transactions and market operations stay economically viable |
| **Native VRF** | Front-running prevention for fair market pricing |
| **Empty prediction market niche** | No existing prediction market infrastructure on Flow — we are first movers |
| **Direct TVL contribution** | Every CRwN locks 1 FLOW — our growth is Flow's growth |

---

## Team

**Seeers Team** — ETH Global Cannes hackathon builders

| Role | Focus |
|------|-------|
| Smart Contract Lead | Solidity + Cadence dual-VM architecture |
| AI / Backend Lead | 0G Network integration, battle orchestration logic |
| Frontend Lead | Next.js 15, Flow wallet integration, real-time dashboards |
| Game Design Lead | Battle mechanics, tokenomics, player progression |
| DevOps / Infrastructure | Deployment pipelines, Discord/Twitter bots, monitoring |

---

## The Ask

### Requesting: 50,000 FLOW

| Allocation | Share | FLOW | Purpose |
|------------|:-----:|------|---------|
| Security Audit | **40%** | 20,000 | Professional audit of 32 Solidity + 3 Cadence contracts before mainnet |
| Mainnet Deployment | **15%** | 7,500 | Flow EVM + 0G mainnet deployment, Genesis Warrior mint (1,000 NFTs) |
| Operations (4 months) | **20%** | 10,000 | Infrastructure, database, 0G compute, RPC, API costs to self-sustainability |
| Community Growth | **15%** | 7,500 | Genesis mint gas subsidies, tournament prizes, early adopter rewards |
| Team (3-month sprint) | **10%** | 5,000 | Critical engineering for deployment, testing, and launch support |

**All core features are already built.** Grant funds take us from testnet to mainnet, from prototype to product.

---

## Impact on Flow

| Metric | Target |
|--------|--------|
| **FLOW Locked (TVL)** | 2M+ FLOW locked via CRwN backing |
| **Daily Transactions** | 15,000+ at maturity |
| **Prediction Markets** | First-ever prediction market infrastructure on Flow |
| **Ecosystem Contribution** | Open-source Cadence-to-EVM bridge patterns for other builders |
| **New User Segment** | Brings prediction market users and competitive gamers to Flow for the first time |

---

## Summary

WarriorsAI-rena is **not a concept** — it is **32 deployed contracts**, **27 pages of live UI**, and **89 API routes** running on Flow EVM Testnet today. We combine two massive markets — blockchain gaming and prediction markets — into a single platform that does not exist anywhere else. We are first movers on Flow for prediction market infrastructure, and every unit of growth directly locks FLOW and grows the ecosystem.

**We are asking for funding to ship to mainnet. The product is built. The gap on Flow is real. We are ready.**

---

*For detailed financials and go-to-market strategy, see [BUSINESS_PLAN.md](./BUSINESS_PLAN.md).*
*For technical roadmap and implementation specifications, see [FUTURE_IMPLEMENTATION.md](./FUTURE_IMPLEMENTATION.md).*
