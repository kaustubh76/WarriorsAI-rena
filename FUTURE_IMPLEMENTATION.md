# WarriorsAI-rena: Complete Platform Capabilities & Future Implementation Roadmap

> **A comprehensive proposal document detailing every platform capability — what is fully built, what is partially built, and what will be built next.** This document provides grant reviewers with a complete understanding of the technical depth, system design, and forward-looking roadmap of WarriorsAI-rena.
>
> For business model, financial projections, and market analysis, see [BUSINESS_PLAN.md](./BUSINESS_PLAN.md). For a concise project pitch, see [PITCH_DECK.md](./PITCH_DECK.md).

---

## Table of Contents

1. [Feature Completion Matrix](#1-feature-completion-matrix)
2. [Complete Features — Full Platform Capabilities](#2-complete-features--full-platform-capabilities)
3. [Partially Built Features — What Exists and What Remains](#3-partially-built-features--what-exists-and-what-remains)
4. [Unbuilt Features — Detailed Specifications](#4-unbuilt-features--detailed-specifications)
5. [Platform Data Infrastructure](#5-platform-data-infrastructure)
6. [Platform API Surface](#6-platform-api-surface)
7. [Quarterly Implementation Timeline](#7-quarterly-implementation-timeline)
8. [Dependencies & Prerequisites](#8-dependencies--prerequisites)

---

## 1. Feature Completion Matrix

WarriorsAI-rena consists of 28 distinct features across three completion tiers. Each feature is described in full detail in the sections that follow.

### COMPLETE — 18 Features (Production-Ready, Awaiting Mainnet Deployment)

| # | Feature | Summary |
|---|---------|---------|
| 1 | AI-Powered Battle System | Fully autonomous AI agents make strategic 5-round battle decisions with cryptographic verification |
| 2 | Dynamic Warrior NFTs | Evolving ERC-721 tokens with rank progression, XP, leveling, and encrypted metadata |
| 3 | Crown Token (CRwN) Economy | ERC-20 game currency backed 1:1 by FLOW with mint, burn, and deflationary mechanics |
| 4 | Arena Factory | Community-created custom arenas with configurable betting rules and rank requirements |
| 5 | Polymarket Integration | Full Gamma API, CLOB orderbook, and real-time WebSocket streaming with circuit breaker protection |
| 6 | Kalshi Integration | Trade API v2 with JWT authentication, WebSocket streaming, and compliance module |
| 7 | Opinion.trade Integration | REST API with price history, interval-based charting, and unified data normalization |
| 8 | Mirror Markets on Flow | On-chain copies of external prediction markets with VRF-protected fair pricing |
| 9 | Automated Market Resolution | Cadence-native scheduled resolution with multi-oracle support and cron-based execution |
| 10 | Custom Market Creation | User-created prediction markets with automated market maker pricing and dedicated creation interface |
| 11 | Whale Tracking & Alerts | Real-time detection of high-value trades across platforms with dashboard, history, and hot market analysis |
| 12 | Copy Trading System | Follow AI agents with configurable copy percentages, max amounts, and on-chain P&L tracking |
| 13 | Cross-Platform Arbitrage Engine | Full arbitrage lifecycle from detection through escrow, execution, monitoring, and settlement |
| 14 | Cross-Chain Bridge | Flow Cadence-to-EVM bridge with Cadence-owned account management and scheduled cross-VM calls |
| 15 | Portfolio Management | Comprehensive tracking with P&L charts, ROI calculation, time-range filtering, and position breakdown |
| 16 | Discord Bot | Automated battle result announcements, leaderboard commands, warrior stats, and blockchain event listeners |
| 17 | Twitter/X Bot | Scheduled content posting, epic battle alerts, AI-generated tweet threads, and engagement monitoring |
| 18 | AI Agent Prediction Debates | AI agents debate real-world prediction market outcomes with round-by-round scoring |

### PARTIALLY BUILT — 4 Features

| # | Feature | What Exists | What Remains |
|---|---------|-------------|--------------|
| 1 | Leaderboard Reward Distribution | Full leaderboard UI, user statistics tracking in smart contracts, reward tier structure defined | Seasonal settlement logic, CRwN claiming mechanism, reward distribution smart contract |
| 2 | AI Agent Marketplace | Intelligent NFT smart contract (ERC-7857 standard), agent trading functions, follower system, position tracking | Marketplace browsing UI, agent training interface, search and filter capabilities |
| 3 | AI-Powered Market Analysis | Agent debate system, prediction scoring framework, OpenAI integration present | LLM-powered automated insights, natural language summaries, trading signal generation |
| 4 | Native Social Features | Discord and Twitter bots for external notifications, social database models for comments and shares already in schema | In-app user profiles, following system, discussion threads, social activity feed |

### NOT YET BUILT — 6 Features

| # | Feature | Target Quarter |
|---|---------|----------------|
| 1 | Tournament System | Q2 2026 |
| 2 | Warrior Breeding & Fusion | Q2 2026 |
| 3 | DAO Governance | Q3 2026 |
| 4 | Mobile Application | Q4 2026 |
| 5 | Third-Party Developer SDK | Q4 2026 |
| 6 | Esports Partnership Program | Q4 2026 |

---

## 2. Complete Features — Full Platform Capabilities

This section provides comprehensive descriptions of all 18 fully built features, including system design, user-facing capabilities, and technical depth that grant reviewers should understand.

---

### 2.1 AI-Powered Battle System

The battle system is the core gameplay loop of WarriorsAI-rena. Unlike traditional blockchain games that rely on random number generators, every battle outcome is determined by real AI agents hosted on the 0G decentralized compute network.

**How Battles Work:**

Each battle consists of exactly 5 rounds. In each round, two AI agents — one controlling each warrior — independently analyze the current battle state and select a strategic move. The AI agents consider warrior attributes, battle history, remaining health, and opponent tendencies before making their decision.

**Warrior Attributes:**

Every warrior has 5 core attributes that determine their effectiveness:

| Attribute | Role in Battle |
|-----------|---------------|
| Strength | Determines base damage output from physical attacks |
| Wit | Influences effectiveness of tactical moves like taunts and special attacks |
| Charisma | Affects influence resistance and social-based move effectiveness |
| Defence | Reduces incoming damage and improves dodge success rates |
| Luck | Introduces controlled variance in outcomes and affects critical hit chances |

**Available Battle Moves:**

AI agents select from 5 strategic moves each round:

| Move | Description |
|------|-------------|
| STRIKE | Direct physical attack dealing damage based on Strength vs opponent Defence |
| TAUNT | Wit-based move that debuffs opponent's next action effectiveness |
| DODGE | Defence-based evasion attempt that, if successful, completely negates incoming damage |
| SPECIAL | High-risk, high-reward move influenced by multiple attributes |
| RECOVER | Healing move that restores a portion of lost health at the cost of offense |

**Cryptographic Verification:**

Every AI decision is cryptographically signed using ECDSA (Elliptic Curve Digital Signature Algorithm). When a battle concludes, the AI agent's signature is verified on-chain, ensuring that:
- The decision was made by the registered AI agent (not tampered with)
- The decision cannot be altered after the fact
- Anyone can independently verify the authenticity of every battle outcome

This eliminates the possibility of outcome manipulation. The battle result is deterministic given the warrior attributes and AI decisions — there is zero RNG dependence.

**Player Agency Mechanics:**

While AI agents control warriors directly, players influence outcomes through three mechanisms:

- **Betting**: Players wager CRwN on battle outcomes. Betting periods last a minimum of 60 seconds, with fixed amounts per rank category to prevent whale domination at lower tiers
- **Influence**: Spend CRwN tokens to boost a warrior's performance mid-battle, temporarily enhancing one or more attributes. Influence tokens are burned (consumed permanently), creating deflationary pressure on the CRwN supply
- **Defluence**: Strategically weaken an opponent warrior by spending CRwN. Limited to 1 use per player per game to prevent griefing. Defluence tokens are also burned permanently

**Smart Contract Architecture:**

The battle system uses multiple coordinated smart contracts:
- A core arena contract manages battle state, betting pools, round tracking, and winner determination
- A factory contract allows community members to deploy custom arena instances with configurable rules
- An oracle contract provides verifiable randomness for tiebreaker scenarios only
- A scheduled battle contract on Flow's Cadence VM enables automated timed battle progression without external keepers

**Battle Resolution and Payouts:**

When a battle concludes:
1. The winner is determined by cumulative damage dealt across all 5 rounds
2. The betting pool distributes: 95% to the winning side (proportional to bet size) and 5% as protocol fee
3. XP is awarded to both warriors (more to the winner), contributing to rank progression
4. Battle results are permanently recorded on-chain with full round-by-round data

---

### 2.2 Dynamic Warrior NFTs

Warriors are ERC-721 NFTs that evolve through gameplay. Unlike static collectible NFTs, warrior tokens have on-chain metadata that changes as they battle, win, lose, and rank up.

**Rank Progression System:**

Warriors progress through 5 ranks based on battle performance:

| Rank | Requirements | Arena Access |
|------|-------------|--------------|
| UNRANKED | Newly minted warrior | Open arenas only |
| BRONZE | Win threshold reached | Bronze and open arenas |
| SILVER | Sustained positive win rate | Silver-tier arenas with higher stakes |
| GOLD | Consistent high performance | Gold-tier arenas with significant wagers |
| PLATINUM | Elite win rate and battle count | Platinum-tier arenas with maximum stakes |

**Experience and Leveling:**

- Warriors earn XP from every battle (win or loss, with winners earning more)
- XP accumulates on-chain and contributes to level progression
- Higher-level warriors have enhanced base attributes
- Level is displayed as part of the NFT metadata and reflected in the visual representation

**Custom Attributes and Metadata:**

- Each warrior has custom move names (personalized STRIKE, TAUNT, etc.)
- Encrypted metadata stored on 0G Network allows private strategy configurations
- Warriors maintain a permanent battle history record accessible on-chain
- Visual representation evolves with rank (different visual treatments per rank tier)

**Warrior NFT Minting:**

- Players mint warriors by paying a fee in CRwN
- Minted warriors receive randomly assigned base attributes within defined ranges
- Genesis mint events offer free or discounted minting to early adopters
- Total supply and minting are managed by the NFT smart contract with appropriate access controls

---

### 2.3 Crown Token (CRwN) Economy

CRwN is the platform's native ERC-20 utility token, designed with sustainable economics that prevent the death spirals common in GameFi projects.

**1:1 FLOW Backing:**

The fundamental innovation of CRwN is its full backing mechanism:
- **Minting**: 1 FLOW deposited → 1 CRwN received (always, at fixed rate)
- **Burning**: 1 CRwN burned → 1 FLOW returned (always, at fixed rate)
- This means CRwN can never fall below FLOW parity — eliminating the depegging risk that destroyed tokens like Axie Infinity's SLP

**Deflationary Pressure:**

Multiple mechanisms permanently remove CRwN from circulation:
- Influence actions burn CRwN (tokens are consumed, not transferred)
- Defluence actions burn CRwN
- Protocol fees are partially burned
- Breeding and fusion fees (when implemented) will burn CRwN
- This creates sustained deflationary pressure as the platform grows

**TVL Contribution:**

Every minted CRwN represents 1 FLOW locked in the contract. This directly contributes to Flow ecosystem TVL (Total Value Locked). At the projected 2M CRwN target, this means 2M+ FLOW locked — a significant TVL contribution for the Flow ecosystem.

**Revenue Distribution:**

| Recipient | Share | Mechanism |
|-----------|-------|-----------|
| Battle winners | 95% of betting pool | Proportional to bet size |
| Protocol | 5% of betting pool | Collected as protocol fee |
| Creators | Variable (2%, 1%, 0.5%) | Via creator revenue share system |
| LP Providers | 1% | Via creator revenue share system |

---

### 2.4 Arena Factory

The Arena Factory enables community-driven arena creation. Any user can deploy a custom arena instance with specific rules, creating a diverse ecosystem of battle environments.

**Configurable Arena Parameters:**

- Minimum and maximum bet amounts
- Required warrior rank tier for entry
- Betting period duration
- Custom arena names and descriptions
- Arena-specific rules (e.g., attribute restrictions, move limitations)

**Arena Management:**

- Arena creators earn a portion of the protocol fee from their arena
- Creators can pause or configure their arenas
- The factory maintains a registry of all active arenas for discovery
- Featured arenas are highlighted based on volume and community engagement

---

### 2.5 Polymarket Integration

WarriorsAI-rena includes a production-grade integration with Polymarket, the world's largest prediction market platform (over $9B in volume during the 2024 US election cycle alone).

**Three-Layer API Integration:**

| Layer | Purpose | Capabilities |
|-------|---------|-------------|
| Gamma API | Market discovery and browsing | Fetch all active markets, search by keyword, filter by category, retrieve market metadata, volume, and participant counts |
| CLOB API | Orderbook and trading data | Access real-time orderbook depth, individual trade history, price impact calculations, and order placement data |
| WebSocket | Real-time streaming | Live price updates, trade notifications, market creation events, and orderbook changes pushed in real-time |

**Data Normalization:**

All Polymarket data is transformed into a unified market format that standardizes:
- Prices in basis points (0–10,000 scale) for precision
- Volumes converted to USD equivalents
- Market status normalized across platforms (ACTIVE, CLOSED, RESOLVED, etc.)
- Outcome labels standardized to YES/NO or named outcomes
- Timestamps normalized to UTC

**Production Resilience:**

- Circuit breaker pattern prevents cascading failures if Polymarket's API becomes unavailable
- Adaptive rate limiting respects Polymarket's 60 requests-per-minute limit
- Schema validation with soft fallback ensures unexpected data formats don't crash the system
- WebSocket auto-reconnection with exponential backoff (never permanently disconnects)
- All API responses are validated against defined schemas before processing

---

### 2.6 Kalshi Integration

Kalshi is the first CFTC-regulated prediction market in the United States, and WarriorsAI-rena provides full integration with their trading platform.

**API Integration:**

| Component | Purpose |
|-----------|---------|
| Trade API v2 | Market browsing, orderbook access, trade history, event grouping, and market metadata |
| JWT Authentication | Server-side authentication with 30-minute auto-refresh tokens — credentials are never exposed to the client |
| WebSocket | Real-time trade streaming, price updates, and market state changes |
| Compliance Module | Handles Kalshi-specific regulatory requirements and data formatting |

**Key Capabilities:**

- Browse all active Kalshi markets with full metadata (question, category, expiry, rules)
- Access real-time orderbook data for accurate pricing
- Stream live trades for whale detection and volume monitoring
- Group related markets by event (e.g., all markets related to a specific election)
- Rate limiting automatically adapts based on Kalshi's response headers

**Server-Side Security:**

All Kalshi API interactions happen server-side. JWT tokens are generated and refreshed on the backend with a 30-minute rotation cycle. No authentication credentials or tokens are ever exposed to the client browser, ensuring full security compliance.

---

### 2.7 Opinion.trade Integration

Opinion.trade is the third prediction market source integrated into the platform, providing additional market coverage and arbitrage opportunities.

**Capabilities:**

- Full REST API integration for market browsing and discovery
- Price history endpoints with configurable intervals for charting
- Interval-based chart data for technical analysis views
- Complete data normalization to the same unified market format used for Polymarket and Kalshi
- Consistent error handling and retry logic matching the other platform integrations

---

### 2.8 Mirror Markets on Flow

The mirror market system is one of WarriorsAI-rena's most innovative features. It creates on-chain copies of external prediction markets from Polymarket, Kalshi, and Opinion.trade on the Flow blockchain, enabling Flow users to participate in real-world prediction markets.

**How Mirror Markets Work:**

1. **Selection**: A user selects an external market from the browsing interface (e.g., "Will candidate X win the 2026 election?" from Polymarket)
2. **VRF Request**: The system requests verifiable randomness from Flow's native VRF (Verifiable Random Function) to prevent front-running attacks on the initial price
3. **On-Chain Creation**: A mirror market is created on Flow EVM with the initial price synced from the external market, plus controlled variance (±2%) from VRF to prevent exploitation
4. **Trading**: Flow users can buy YES or NO positions using CRwN tokens
5. **Price Sync**: Mirror market prices are influenced by both local trading activity and external price feeds
6. **Resolution**: When the external market resolves, the mirror market automatically resolves with the same outcome

**Anti-Manipulation Protections:**

- VRF-protected initial pricing prevents front-running on market creation
- Price variance (±2%) from VRF makes it unprofitable to create and immediately exploit mirror markets
- Circuit breakers halt trading if prices diverge too far from external reference
- Rate limiting on market creation prevents spam

**Smart Contract Design:**

The mirror market contract is one of the most complex in the system, handling:
- Market creation with external market ID linking
- VRF integration for fair initial pricing
- Agent trade execution for AI-powered trading
- Oracle source tracking (which external platform provides resolution data)
- Position management for all participants
- Settlement and payout distribution upon resolution

---

### 2.9 Automated Market Resolution

WarriorsAI-rena's automated resolution system is a key differentiator. Unlike centralized prediction markets that rely on manual resolution by operators, WarriorsAI-rena uses Flow's Cadence VM to enable fully automated, scheduled market resolution.

**Resolution Flow (4 Steps):**

1. **Schedule**: When a mirror market is created, a resolution schedule is saved to the database with the expected resolution time and oracle source
2. **Monitor**: A cron job polls every 5 minutes, checking for markets that have reached their resolution time
3. **Fetch**: The system queries the external platform (Polymarket or Kalshi) API to retrieve the actual outcome
4. **Execute**: The resolution is executed on-chain via the Cadence ScheduledMarketResolver contract, which:
   - Verifies the outcome data
   - Resolves the mirror market on Flow EVM
   - Distributes winnings to participants
   - Records the transaction hash in the database

**Multi-Oracle Support:**

The Cadence resolution contract supports three oracle sources:
- **Polymarket Oracle**: Outcome fetched from Polymarket's resolution API
- **Kalshi Oracle**: Outcome fetched from Kalshi's settlement data
- **Internal Oracle**: Manual resolution by authorized platform operators (fallback for disputes)

**Robustness Features:**

- Attempt tracking: Each resolution records how many attempts were made, with error logging
- Retry logic: Failed resolutions are automatically retried on the next cron cycle
- Status tracking through 6 states: PENDING → SCHEDULED → EXECUTING → COMPLETED (or FAILED, CANCELLED)
- Dual settlement: Both the Cadence contract and EVM mirror market are settled in a coordinated transaction
- Transaction hash recording for full auditability

**Scheduled Resolution Dashboard:**

A dedicated frontend page provides real-time visibility into all scheduled resolutions:
- Filter by status (pending, scheduled, executing, completed, failed, cancelled)
- Manual execution trigger for authorized operators
- Manual cancellation capability
- 15-second auto-refresh for live monitoring
- Flow wallet connection for executing resolutions on-chain

---

### 2.10 Custom Market Creation

Beyond mirroring external markets, WarriorsAI-rena allows users to create their own prediction markets on any topic.

**Market Creation Capabilities:**

- Users define a market question (e.g., "Will Flow token reach $5 by Q3 2026?")
- Set market category, resolution criteria, and expiry date
- Choose pricing model via the automated market maker (AMM)
- Set initial liquidity amount

**Automated Market Maker (AMM):**

Custom markets use an on-chain AMM contract that:
- Provides continuous liquidity for buying and selling positions
- Adjusts prices based on demand (LMSR-style pricing for binary markets)
- Ensures there is always a counterparty for trades
- Manages the liquidity pool and fee distribution

**Market Factory:**

A factory contract manages the creation and registration of all custom markets:
- Deploys new market instances with standardized parameters
- Maintains a registry for market discovery
- Handles market category tagging
- Enforces minimum liquidity requirements

---

### 2.11 Whale Tracking & Alerts

The whale tracking system monitors high-value trades (exceeding $10,000) across both Polymarket and Kalshi in real-time, providing intelligence that helps users make informed prediction market decisions.

**Whale Detection:**

- Monitors all trades across Polymarket and Kalshi WebSocket streams
- Flags any trade exceeding the $10,000 threshold as a whale trade
- Records: trader address, platform source, market ID, trade amount (USD), position side (YES/NO), price (in basis points), and transaction hash

**Whale Tracker Dashboard:**

The dedicated whale tracker page provides:

| Feature | Description |
|---------|-------------|
| Live Feed | Real-time stream of whale trades as they happen across both platforms |
| Trade History | Searchable, filterable history of all detected whale trades |
| Hot Markets | Markets ranked by whale trading activity — shows where "smart money" is concentrating |
| Trader Profiles | Individual whale profiles with total volume, win rate, trade count, and platform preference |
| Trader Management | Add or remove tracked traders, assign custom aliases, filter by platform |

**Whale Alert API:**

A comprehensive set of API endpoints powers the whale tracking system:

| Endpoint | Purpose |
|----------|---------|
| Follow whale | Subscribe to a specific whale's trading activity |
| Unfollow whale | Remove subscription to a whale's trades |
| Following list | View all whales you are currently following |
| Tracked traders | Browse all tracked whale addresses with statistics |
| Hot markets | Retrieve markets with highest whale activity |
| Statistics | Aggregate whale trading statistics across platforms |
| Trade history | Historical whale trades with filtering and pagination |

---

### 2.12 Copy Trading System

The copy trading system allows users to automatically replicate trades made by AI agents, effectively letting users benefit from AI-driven market strategies without manually executing trades.

**How Copy Trading Works:**

1. **Browse Agents**: Users browse available AI agents on the copy trading page, viewing each agent's strategy type, historical performance, win rate, and current positions
2. **Follow Agent**: Users select an agent to follow and configure their copy settings:
   - Maximum amount per trade (in CRwN)
   - Copy percentage (what fraction of the agent's trade size to replicate)
   - Active/inactive toggle
3. **Automatic Execution**: When a followed agent makes a trade, the system automatically executes a proportional trade on behalf of the follower
4. **P&L Tracking**: Every copied trade is tracked with full profit/loss accounting, allowing users to see their return from each followed agent

**Agent Performance Visibility:**

The copy trading interface displays for each agent:
- Strategy name and type (e.g., SUPERFORECASTER, TREND_FOLLOWER)
- Historical win rate as a percentage
- Total followers and active copy traders
- Recent position history (last trades with outcomes)
- Running P&L for users who copy the agent

**On-Chain Execution:**

Copy trades execute on-chain through the AI Agent Intelligent NFT contract, which:
- Manages follower registrations and configurations
- Executes proportional trades when the parent agent trades
- Tracks all copy trade positions for accurate P&L calculation
- Supports cross-chain execution for agents operating on different networks

---

### 2.13 Cross-Platform Arbitrage Engine

The arbitrage engine is a sophisticated system that detects and executes arbitrage opportunities when price discrepancies exist between Polymarket, Kalshi, and Opinion.trade for the same real-world event.

**Arbitrage Detection:**

The system continuously monitors prices across all three platforms. When the price spread for the same event exceeds 5% (e.g., Polymarket YES at $0.62 and Kalshi YES at $0.47), an arbitrage opportunity is flagged.

**7-Step Execution Flow:**

| Step | Action | Details |
|------|--------|---------|
| 1. Detection | Identify spread | Cross-platform price comparison with >5% threshold |
| 2. Position Sizing | Calculate trade size | Optimal size based on available liquidity and spread magnitude |
| 3. Escrow Lock | Lock funds | CRwN funds locked in escrow to guarantee trade execution |
| 4. Dual-Order Placement | Execute both sides | Simultaneously place opposing positions on both platforms |
| 5. Trade Monitoring | Verify execution | Background monitoring with up to 60 retries over 5 minutes to confirm both orders filled |
| 6. Resolution Waiting | Wait for outcome | Monitoring continues with up to 720 retries over 1 hour for market resolution |
| 7. Settlement | Distribute profit | Automatic P&L calculation and profit distribution after market resolves |

**Safety Mechanisms:**

- **Automatic Rollback**: If one side of the arbitrage fails to execute, the system automatically unwinds the successful side to prevent unhedged exposure
- **Circuit Breaker Protection**: Per-platform circuit breakers halt execution if a platform's API becomes unreliable
- **Escrow System**: Funds are locked in escrow before any trade executes, with three escrow purpose types (ARBITRAGE, COPY_TRADE, STANDARD) and three status types (LOCKED, RELEASED, REFUNDED)
- **Trade Monitoring**: Background processes monitor open positions with configurable retry limits and timeout periods

**Settlement System:**

After market resolution:
- The system calculates profit/loss across both positions
- Settlement transactions are recorded with full audit trail
- Profits are distributed to the user's balance
- Escrow is released and funds become available

---

### 2.14 Cross-Chain Bridge

The EVMBridge is a Cadence contract that enables communication between Flow's native Cadence VM and Flow EVM. This is critical for coordinating between Cadence-based scheduling (market resolution, battle scheduling) and EVM-based smart contracts (mirror markets, arena, token).

**Bridge Capabilities:**

- **Cadence-Owned Account (COA) Management**: Creates and manages EVM accounts controlled by Cadence contracts
- **Scheduled EVM Calls**: Cadence can schedule function calls to EVM contracts at specific future times
- **Operator Authorization**: Role-based access control for bridge operations
- **Cross-VM Settlement**: When the Cadence resolution contract resolves a market, it can trigger settlement on the EVM mirror market contract through the bridge

This bridge is what makes automated market resolution possible — Cadence scheduling triggers the resolution, and the bridge propagates the result to EVM contracts.

---

### 2.15 Portfolio Management

The portfolio system provides comprehensive tracking of all user activity across battles, prediction markets, copy trading, and arbitrage.

**Portfolio Dashboard Features:**

| Feature | Description |
|---------|-------------|
| Performance Charts | Visual P&L curves showing profit/loss over time |
| ROI Calculation | Return on investment calculated across all activity types |
| Time-Range Filtering | View performance over 1 week, 1 month, 3 months, or all time |
| Position Breakdown | Detailed list of all open and closed positions across all market types |
| Mirror Portfolio | Separate tracking for positions on mirrored external markets |
| Activity History | Chronological list of all transactions, bets, and trades |

---

### 2.16 Discord Bot

The Discord bot provides automated community engagement and real-time platform notifications within Discord servers.

**Slash Commands (7 commands):**

| Command | Function |
|---------|----------|
| /warrior | Look up any warrior by ID — displays attributes, rank, level, battle history |
| /stats | View a player's overall statistics — win rate, total battles, earnings |
| /leaderboard | Display current leaderboard rankings with configurable filters |
| /battle | Get details on a specific battle — round-by-round breakdown, moves, damage |
| /help | Display all available commands and usage instructions |
| /mint | Initiate warrior minting directly from Discord |
| /tournament | View upcoming and active tournament information |

**Automated Features:**

- **Real-Time Blockchain Event Listeners**: The bot monitors on-chain events and automatically posts when notable actions occur (battles completed, large bets placed, warriors minted)
- **Battle Result Announcements**: Automatically posts battle outcomes with warrior names, final scores, and highlight moves
- **Leaderboard Updates**: Periodic posting of leaderboard changes and new top-ranking warriors
- **Auto-Posting**: Scheduled announcements for upcoming events, tournaments, and milestones

---

### 2.17 Twitter/X Bot

The Twitter bot maintains an active social media presence with both scheduled and event-driven content.

**Scheduled Content:**

| Frequency | Content Type |
|-----------|-------------|
| 4x daily | Battle highlights, warrior spotlights, market updates, and platform statistics |
| 2x weekly | Weekly battle roundup threads, top warrior rankings, and prediction market accuracy reports |

**Event-Driven Content:**

- **Epic Battle Alerts**: When a battle has exceptional outcomes (close margins, dramatic comebacks, high-value pools), the bot generates and posts a detailed battle recap
- **AI Content Generation**: The bot uses GPT-3.5-turbo to generate engaging, varied tweet content based on battle data — avoiding repetitive templated posts
- **Tweet Threads**: Multi-tweet threads for complex battle narratives or market analysis summaries
- **Engagement Monitoring**: Tracks likes, retweets, and replies to optimize posting times and content types

---

### 2.18 AI Agent Prediction Debates

The AI Agent Debate system allows AI agents to participate in structured debates about real-world prediction market outcomes, providing users with AI-generated analysis from multiple perspectives.

**How Debates Work:**

- **Prediction Battles**: AI agents are assigned opposing positions on a real-world prediction market question (e.g., one agent argues YES, another argues NO)
- **Round-by-Round Scoring**: Debates proceed through multiple rounds, with each round scored based on argument quality, evidence cited, and logical consistency
- **Prediction Scoring**: Agents earn prediction scores based on how often their argued position aligns with the eventual market outcome
- **PersonaTraits**: Each AI agent has configurable personality traits that influence their debate style:

| Trait | Range | Effect |
|-------|-------|--------|
| Patience | 0–100 | How willing the agent is to wait for long-term outcomes vs seeking quick resolution |
| Conviction | 0–100 | How strongly the agent defends its position vs adjusting based on new evidence |
| Contrarian | 0–100 | Tendency to take the opposing view from market consensus |
| Momentum | 0–100 | How much the agent weighs recent price movement in its analysis |

**Agent Staking Tiers:**

Users can stake CRwN to access different tiers of AI agent debate participation:

| Tier | CRwN Staked | Benefits |
|------|-------------|----------|
| NOVICE | 100 CRwN | Access to basic debate viewing and agent following |
| INITIATE | 500 CRwN | Ability to request debates on specific markets |
| ADEPT | 2,000 CRwN | Access to premium agent strategies and detailed analysis |
| ORACLE | 10,000 CRwN | Full agent customization and priority debate scheduling |

---

### 2.19 Gamification System (Fully Built — 10 Components)

The gamification system is a comprehensive engagement layer built across 10 dedicated components that reward consistent platform participation.

**Achievement System:**

Achievements are categorized by rarity, each with distinct visual treatment and CRwN reward value:

| Rarity | Examples | Difficulty |
|--------|----------|------------|
| Common | First Battle Won, First Market Bet, Profile Created | Easy — most players unlock these naturally |
| Rare | 10 Battles Won, First Arbitrage Profit, Follow 5 Whales | Moderate — requires sustained engagement |
| Epic | 50 Battle Win Streak, 10 Successful Arbitrages, Creator Gold Tier | Challenging — demonstrates mastery |
| Legendary | 100 Battle Win Streak, $100K+ Lifetime Volume, Top 10 Season Finish | Extremely rare — only elite players achieve these |

**Daily Quest System:**

Each day, players receive a rotating set of 3–5 quests with CRwN rewards:

| Quest | Reward |
|-------|--------|
| Win 3 battles | 50 CRwN |
| Place 5 prediction market bets | 30 CRwN |
| Follow 1 new whale | 10 CRwN |
| Create 1 custom market | 100 CRwN |

Quests rotate every 24 hours, ensuring variety and encouraging exploration of all platform features.

**Login Streak System:**

Consecutive daily logins earn escalating rewards with multiplier bonuses:

| Streak Length | Bonus | Multiplier Applied to All Earned CRwN |
|---------------|-------|---------------------------------------|
| 3 consecutive days | Base streak reward | 1.1x multiplier on all CRwN earned |
| 7 consecutive days | Enhanced streak reward | 1.25x multiplier on all CRwN earned |
| 30 consecutive days | Maximum streak reward | 1.5x multiplier on all CRwN earned |

Missing a day resets the streak to zero, incentivizing daily engagement.

**Additional Gamification Components:**

- Confetti and sound effects for achievement unlocks and battle victories
- Progress bars showing advancement toward next achievement or quest completion
- Achievement showcase on user profiles
- Seasonal challenges tied to platform events and tournaments
- XP system that feeds into warrior progression

---

### 2.20 Creator Economy (Fully Built)

The creator economy system enables users who create arenas, prediction markets, and AI agents to earn ongoing revenue from their creations.

**Revenue Share Structure:**

| Creator Type | Fee Rate | Description |
|-------------|----------|-------------|
| Market Creators | 2.0% | Earn 2% of all trading volume on markets they create |
| Warrior Creators | 1.0% | Earn 1% of arena fees when their warriors are used |
| AI Agent Operators | 0.5% | Earn 0.5% of all copy trade volume from their agents |
| Liquidity Providers | 1.0% | Earn 1% fee share for providing AMM liquidity |
| Protocol | 0.5% | Baseline protocol fee |

**Creator Tier System:**

Creators progress through tiers based on their cumulative CRwN revenue, unlocking enhanced benefits at each level:

| Tier | CRwN Threshold | Revenue Multiplier | Benefits |
|------|----------------|-------------------|----------|
| BRONZE | 0 CRwN | 1.0x | Basic creator tools, standard revenue share |
| SILVER | 1,000 CRwN | 1.2x | Enhanced analytics, priority market placement |
| GOLD | 10,000 CRwN | 1.4x | Verified creator badge, featured placement, early access to new features |
| PLATINUM | 100,000 CRwN | 1.7x | Custom branding, premium support, governance input |
| DIAMOND | 1,000,000 CRwN | 2.0x | Maximum revenue multiplier, exclusive creator events, advisory board access |

The revenue multiplier applies to all fee earnings — a DIAMOND creator earning 2% on market volume effectively earns 4% (2% × 2.0x multiplier).

**Four Creator Types:**

| Type | What They Create | Revenue Source |
|------|-----------------|----------------|
| Arena Creators | Custom battle arenas via ArenaFactory | Protocol fees from arena usage |
| Market Creators | Custom prediction markets via MarketFactory | Trading volume fees |
| Agent Creators | AI agents with custom strategies | Copy trading fees from followers |
| Content Creators | Battle commentary, market analysis | Engagement-based rewards (future) |

---

### 2.21 AI Liquidity Manager (Fully Built)

The AI Liquidity Manager is an automated system that manages liquidity positions across prediction markets using AI-driven strategies.

**Six Liquidity Strategies:**

| Strategy | Description |
|----------|-------------|
| PASSIVE | Simple liquidity provision with balanced YES/NO positions, minimal rebalancing |
| BALANCED | Active rebalancing to maintain 50/50 portfolio allocation, adjusts on price divergence |
| TREND_FOLLOWING | Increases position in the direction of price momentum, reduces opposing positions |
| MEAN_REVERSION | Takes contrarian positions when prices deviate significantly from historical averages |
| MARKET_MAKING | Professional-style market making with tight bid-ask spreads, earning from the spread |
| AI_OPTIMIZED | Fully AI-driven strategy that dynamically switches between other strategies based on market conditions |

**Advanced Features:**

- **JIT (Just-In-Time) Liquidity**: Provides liquidity precisely when large trades are about to execute, capturing maximum fees with minimal idle capital
- **MEV (Maximal Extractable Value) Protection**: Detects and avoids transaction ordering attacks that could extract value from liquidity positions
- **Position Management**: Automated monitoring and adjustment of all active liquidity positions across markets
- **Risk Controls**: Configurable maximum position sizes, stop-loss levels, and portfolio concentration limits

---

### 2.22 Micro-Market System (Fully Built — 8 Market Types)

The micro-market system creates short-duration prediction markets tied to specific battle events, offering granular betting opportunities beyond simply predicting the battle winner.

**Eight Micro-Market Types:**

| Market Type | Question | Duration |
|-------------|----------|----------|
| ROUND_WINNER | Who will win Round N? | Single round |
| MOVE_PREDICTION | What move will Warrior X make in Round N? | Single round |
| DAMAGE_THRESHOLD | Will total damage in this battle exceed X? | Full battle |
| FIRST_BLOOD | Which warrior will deal damage first? | First round |
| COMEBACK | Will the currently losing warrior win? | Remaining rounds |
| PERFECT_ROUND | Will any warrior take zero damage in a round? | Single round |
| CRITICAL_HIT | Will there be a critical hit in this battle? | Full battle |
| DOMINANT_WIN | Will the winner lead in all 5 rounds? | Full battle |

Each micro-market automatically creates, opens for betting, and resolves based on the actual battle outcome — fully automated with no manual intervention.

---

### 2.23 0G Network Integration (Fully Built)

0G Network provides the decentralized AI compute and encrypted storage layer that powers WarriorsAI-rena's AI capabilities.

**Compute Integration:**

- AI battle agents run on 0G's decentralized compute network, ensuring no single point of failure or manipulation
- AI inference requests are routed to 0G nodes, which execute the agent's strategy model and return cryptographically signed decisions
- Compute costs scale with battle volume and are paid in 0G native tokens

**Encrypted Storage:**

- Warrior metadata is encrypted and stored on 0G's decentralized storage layer
- Re-encryption proofs allow selective data sharing (e.g., revealing strategy details only to the warrior's owner)
- Battle history is stored with cryptographic integrity guarantees
- AI agent strategy configurations are encrypted to prevent reverse-engineering

**RAG (Retrieval-Augmented Generation):**

- AI agents can retrieve relevant context from stored battle history and market data during debates
- This allows agents to cite specific historical precedents when arguing for prediction market outcomes
- RAG integration enhances the depth and accuracy of AI agent debates

**Market Context Integration:**

- 0G stores and indexes market context data (historical prices, resolution outcomes, whale patterns)
- AI agents access this context when making trading decisions
- Decentralized storage ensures no central party can manipulate the data agents rely on

**On-Chain Ledger:**

- A dedicated on-chain ledger tracks all AI compute requests, responses, and verifications
- This provides a complete audit trail of every AI decision made on the platform
- Anyone can verify that a specific AI agent made a specific decision at a specific time

**API Surface:**

The 0G integration exposes 11 API endpoints covering:
- Agent registration and management
- Battle decision requests and verification
- Encrypted metadata storage and retrieval
- Strategy configuration updates
- Performance metrics and monitoring
- Debate participation and scoring

---

### 2.24 Market Betting System (Fully Built)

The market betting system handles all aspects of placing and managing bets across battle arenas and prediction markets.

**Trade Validation:**

Every trade undergoes comprehensive validation:

| Validation | Rule |
|-----------|------|
| Maximum trade size | 100 CRwN per individual trade |
| Maximum exposure | 1,000 CRwN total exposure across all active positions |
| Maximum slippage | 5% — trades are rejected if price moves more than 5% between submission and execution |
| Minimum bet period | 60 seconds — betting windows must remain open for at least 60 seconds |
| Rank requirements | Players can only bet in arenas matching their warrior's rank tier |

**Price Validation:**

- Prices are validated against the AMM's current state
- Stale price protection prevents betting on outdated odds
- Price impact calculation shows users how their trade will affect the market price before execution

---

### 2.25 Circuit Breaker System (Fully Built)

The circuit breaker system protects the platform from cascading failures when external services (Polymarket, Kalshi, Opinion.trade APIs) experience issues.

**Circuit Breaker States:**

| State | Behavior |
|-------|----------|
| CLOSED | Normal operation — all requests pass through to the external service |
| HALF_OPEN | Testing recovery — a limited number of requests are allowed through to test if the service has recovered |
| OPEN | Service unavailable — all requests are immediately rejected with a cached response or graceful degradation |

**Per-Platform Isolation:**

Each external platform has its own independent circuit breaker. If Polymarket's API goes down, Kalshi and Opinion.trade continue operating normally.

**Configuration:**

- Configurable failure thresholds (number of failures before circuit opens)
- Configurable timeout periods (how long to wait before testing recovery)
- Exponential backoff on retries to avoid overwhelming recovering services
- Automatic state transitions without manual intervention

---

### 2.26 Notification System (Fully Built)

The notification system manages user alert preferences across multiple channels.

**Notification Channels (4 channels):**

| Channel | Delivery Method |
|---------|----------------|
| Push Notifications | Browser-based push notifications for real-time alerts |
| Email | Email notifications for important events and digests |
| Discord | Notifications delivered via Discord DMs or channel mentions |
| Telegram | Notifications sent to configured Telegram accounts |

**Configurable Preferences:**

Users configure per-channel thresholds and notification types:
- Minimum trade size for whale alerts (e.g., only notify for trades > $50K)
- Battle notification preferences (all battles, only battles involving your warriors, only top-ranked battles)
- Market resolution notifications (all markets, only markets with your positions)
- Arbitrage opportunity alerts (configurable minimum spread threshold)
- Digest frequency (real-time, hourly, daily)

---

### 2.27 Cross-Platform Market Matching (Fully Built)

The market matching system identifies when the same real-world event is listed on multiple prediction market platforms, enabling cross-platform analysis and arbitrage.

**Matching Capabilities:**

- **Similarity Scoring**: Algorithm compares market questions, categories, expiry dates, and metadata across Polymarket, Kalshi, and Opinion.trade to identify matched pairs
- **Matched Market Pairs**: When a match is found, a MatchedMarketPair record links the two markets with a similarity confidence score
- **Arbitrage Strategy**: Each matched pair includes a JSON-serialized arbitrage strategy describing the optimal trade direction and expected profit
- **Continuous Monitoring**: The matching service runs continuously, identifying new matches as markets are created or updated

---

### 2.28 Platform Monitoring & Administration (Fully Built)

The platform includes comprehensive monitoring and administration capabilities for operational reliability.

**Monitoring Components:**

| Component | Purpose |
|-----------|---------|
| Admin Monitor | Dashboard for platform operators showing system health, active users, and market statistics |
| RPC Health Checks | Continuous monitoring of Flow RPC node connectivity and response times |
| Contract Event Listeners | Real-time monitoring of all on-chain events across all deployed smart contracts |
| API Health | Endpoint health checks across all 84 API routes with automatic alerting on failures |
| Bot Status | Discord and Twitter bot uptime and activity monitoring |

---

## 3. Partially Built Features — What Exists and What Remains

---

### 3.1 Leaderboard Reward Distribution

**What Exists:**

The leaderboard system has a complete frontend UI displaying player rankings. The core arena smart contract includes a UserStats data structure that tracks each player's total wins, losses, and cumulative earnings on-chain. A reward tier structure is defined in the codebase with specific amounts: 1st place receives 1,000 CRwN, 2nd place receives 500 CRwN, and 3rd place receives 250 CRwN.

**What Needs to Be Built:**

- **Seasonal Settlement System**: A new smart contract that captures player rankings at the end of each season (monthly or quarterly), takes a snapshot of the leaderboard state, and allocates reward pools. The season should have configurable start/end timestamps, with automated finalization via Cadence scheduling
- **Reward Distribution Logic**: Smart contract functions that calculate each player's reward based on their final seasonal ranking, with support for multiple leaderboard categories (Battle Arena, Prediction Markets, Copy Trading, Arbitrage) each with independent reward pools
- **CRwN Claiming Mechanism**: A claim function allowing qualified players to withdraw their earned seasonal rewards. Claim windows should last 30 days after season end, with unclaimed rewards returning to the protocol treasury. Anti-sybil protections should require minimum activity thresholds to qualify
- **Season History and Archive**: Frontend pages displaying past season results, historical winners, and payout records. Reward countdown timers showing time remaining in the current season
- **Top 10 Rewards Per Category**: Separate reward distributions for the top 10 players in each leaderboard category, with configurable payout tiers (e.g., 4th through 10th receiving 100 CRwN each)

---

### 3.2 AI Agent Marketplace

**What Exists:**

A sophisticated AI Agent Intelligent NFT smart contract is deployed implementing the ERC-7857 standard for intelligent NFTs. This contract supports:
- Six AI agent strategies: SUPERFORECASTER (high-accuracy general predictions), WARRIOR_ANALYST (battle-focused analysis), TREND_FOLLOWER (momentum-based trading), MEAN_REVERSION (contrarian positioning), MICRO_SPECIALIST (micro-market focused), and CUSTOM (user-defined parameters)
- Four risk profiles: CONSERVATIVE, MODERATE, AGGRESSIVE, and ULTRA_AGGRESSIVE
- Four agent tiers: NOVICE → INITIATE → ADEPT → ORACLE (progression based on performance)
- Follower tracking, position tracking, and copy trading execution functions
- PersonaTraits system with four adjustable parameters (patience, conviction, contrarian tendency, and momentum sensitivity) each on a 0–100 scale
- Agent staking tiers requiring 100, 500, 2,000, or 10,000 CRwN respectively
- Authorization system controlling which agents can execute trades
- Encrypted metadata storage on 0G Network for strategy configurations

**What Needs to Be Built:**

- **Marketplace Browsing UI**: A dedicated marketplace page where users can browse, search, and filter available AI agents. Grid view with agent cards displaying avatar, strategy type, win rate, tier, follower count, and price. Filters for strategy type, risk profile, agent tier, price range, and minimum win rate. Sorting by price, ROI, follower count, and recent performance
- **Agent Detail Pages**: Individual agent pages showing performance history charts (win rate over time, ROI curve), strategy description and risk profile breakdown, follower growth trends, position history (last 50 trades with outcomes), and head-to-head records against other agents
- **Agent Training Interface**: UI for agent owners to adjust strategy parameters — aggression sliders, risk tolerance controls, position sizing settings. Backtested simulations against historical market data showing projected impact of changes. Training costs CRwN to prevent spam parameter changes
- **Listing and Purchase Flow**: Agent owners set listing price (in CRwN), description, and terms with configurable listing duration (7, 14, 30 days, or indefinite). Optional ascending-price auction mode. Purchase flow includes escrow-protected payment, NFT transfer, and strategy data migration to the new owner
- **Revenue Sharing for Original Creators**: When a sold agent continues to generate copy trading revenue, the original creator earns a configurable percentage. Revenue share is tracked via the existing Creator Revenue Share contract and automatically distributed on each trade settlement

---

### 3.3 AI-Powered Market Analysis

**What Exists:**

The AI agent debate system enables agents to take positions on prediction market outcomes and argue for or against specific resolutions. A prediction scoring framework tracks agent accuracy over time. The OpenAI SDK is integrated into the project for AI content generation.

**What Needs to Be Built:**

- **LLM-Powered Automated Market Insights**: Integration with language models to generate natural language analysis for every mirrored market. Example: "This market has a 15% arbitrage opportunity — Polymarket YES is priced at $0.62 while Kalshi YES is at $0.47. Based on whale activity, 7 of the 10 largest traders are buying YES." Rate limiting and caching to control API costs, with fallback to cached analysis when the API is unavailable
- **Cross-Platform Spread Analysis**: Automated comparison of prices across all three platforms with directional recommendations. Volume anomaly detection: "Volume on this market spiked 340% in the last hour"
- **Whale Movement Pattern Analysis**: Historical pattern recognition: "Top 5 whales are all buying YES — last time this pattern occurred, the market resolved YES within 48 hours." Whale sentiment aggregation by market category with historical accuracy tracking
- **Natural Language Market Summaries**: Auto-generated daily summaries of top 10 markets by volume displayed on the market browsing page. Weekly digests of market resolution accuracy and platform performance
- **AI Trading Signal Generation**: Multi-source data fusion combining Polymarket, Kalshi, Opinion.trade, whale data, and volume trends. Signal output: BUY / SELL / HOLD with confidence percentage (0–100%). Signal history with accuracy tracking over time
- **Confidence Scoring System**: Each AI prediction receives a confidence score based on data source agreement, historical accuracy, volume patterns, and whale alignment. Displayed as a visual indicator on market cards in the browsing interface

---

### 3.4 Native Social Features

**What Exists:**

Discord and Twitter bots handle external community notifications. The database schema already includes models for market comments (MarketComment) and market shares (MarketShare), indicating social features were planned from the design phase.

**What Needs to Be Built:**

- **User Profile System**: Display name, avatar (uploadable or use warrior NFT image), and bio. Stats dashboard showing total battles, win rate, markets created, prediction accuracy. Badge display for achievements, seasonal rankings, and creator tier. Linked accounts for Discord and Twitter. Follower and following counts
- **In-App Following System**: Follow other players, whale traders, and AI agents with on-chain event emission for transparency. Following feed displays activity from all followed accounts. Configurable notification preferences per followed account: all activity, only trades, only battles
- **Discussion Threads**: Comment on battles (post-battle analysis and discussion), prediction markets (sharing reasoning and predictions), and AI agent debates (community input on debate quality). Threaded replies, upvote/downvote system, and report functionality. Markdown support for formatted comments
- **Social Activity Feed**: Real-time timeline of activity from followed accounts showing battles won/lost, positions opened/closed, markets created, achievements earned, and agents followed. Filterable by event type. Infinite scroll with WebSocket real-time updates
- **Share Functionality**: Share battle results as visual cards (generated image + link). Share predictions with written rationale. Share portfolio snapshots. Internal share to activity feed + external share to Twitter/Discord

---

## 4. Unbuilt Features — Detailed Specifications

---

### 4.1 Tournament System (Target: Q2 2026)

**Overview:**

A comprehensive tournament framework enabling structured competitive play with bracket-based elimination, automated progression, and integrated prize pools.

**Tournament Structure:**

- **Bracket Sizes**: 8, 16, 32, or 64 warrior brackets
- **Seeding Options**: Random seeding (fair) or rank-based seeding (top-ranked warriors face lowest-ranked first, similar to sports seedings)
- **Elimination Modes**:
  - Single elimination (default) — lose once and you are eliminated
  - Double elimination (advanced) — warriors enter a losers bracket after first loss, must lose twice to be eliminated
- **Entry Fees**: Configurable CRwN amount per tournament, set by the tournament creator
- **Prize Pool Aggregation**: Entry fees are pooled together, with optional sponsor contributions added on top

**Automated Progression:**

Leveraging the existing Cadence scheduling system (ScheduledBattle), tournament rounds progress automatically:
- Configurable delay between rounds (e.g., 1 hour, 1 day, 1 week)
- Auto-advance when an opponent forfeits or times out
- Bracket state updates in real-time as battles complete
- Spectators can watch any tournament battle live

**Prize Distribution:**

- Default split: 1st place 50%, 2nd place 25%, 3rd/4th place 12.5% each
- Configurable by tournament creator
- 5% protocol fee applied to total prize pool
- Automated payout on tournament completion — no manual distribution needed
- Multi-sig approval required for championship-level prize pools exceeding 10,000 CRwN

**Integrated Prediction Markets:**

- Auto-created prediction markets for each tournament round: "Who will win Round 2, Match 3?"
- Overall tournament winner market created when registration opens
- All tournament markets auto-resolve based on actual battle outcomes
- This creates an additional layer of engagement beyond direct participation

**Tournament Pages:**

- Browse active, upcoming, and completed tournaments with status filters
- Interactive bracket visualization showing live match progress
- Tournament creation interface for community members
- Historical tournament archive with past results and statistics

**Dependencies (All Complete):**

Tournament System builds on the existing Arena Factory (arena creation), Scheduled Battle (automated progression), and Prediction Market AMM (tournament betting markets).

---

### 4.2 Warrior Breeding & Fusion (Target: Q2 2026)

**Overview:**

A genetic system that allows warriors to combine traits and produce offspring, adding long-term progression and collector dynamics to the warrior ecosystem.

**Breeding Mechanics:**

- Two parent warriors produce one offspring warrior
- Both parents must be owned by the same wallet (or approved)
- Breeding fee in CRwN scales with parent generation (higher generation = more expensive)
- Maximum of 5 breeding attempts per warrior to maintain scarcity
- After 5 breeds, a warrior is marked as "retired breeder" but can still battle and participate in all other activities

**Genetic Trait Inheritance:**

For each of the 5 warrior attributes (Strength, Wit, Charisma, Defence, Luck):

| Inheritance Type | Probability | Mechanism |
|-----------------|-------------|-----------|
| Dominant Parent | 70% | Trait inherited from the parent with higher total stats |
| Recessive Parent | 25% | Trait inherited from the parent with lower total stats |
| Mutation | 5% | Random variation applied to the trait value |

- Offspring trait value is calculated as a weighted average of parent values, plus or minus a variance range
- Mutation range: -10% to +20% of the average parent trait value
- Rare "super mutation": 0.5% chance of a +50% boost on a single trait (creating exceptionally powerful warriors)

**Generation Tracking:**

- Gen 0: Originally minted warriors
- Gen 1: Offspring of two Gen 0 parents
- Gen N: Maximum generation of both parents + 1
- Higher generations have longer breeding cooldowns but can inherit refined trait combinations from selective breeding

**Breeding Cooldowns:**

| Generation | Base Cooldown | Additional Per Previous Breed |
|-----------|--------------|------------------------------|
| Gen 0 | 24 hours | +12 hours per previous breed |
| Gen 1 | 36 hours | +12 hours per previous breed |
| Gen 2 | 48 hours | +12 hours per previous breed |
| Gen N | 24 + (12 × N) hours | +12 hours per previous breed |

**Fusion System:**

Fusion is a separate mechanism from breeding that sacrifices two warriors to create one superior warrior:
- The fused warrior receives the maximum trait value from either parent for each of the 5 attributes, plus a 10% fusion bonus
- Both parent warrior NFTs are permanently burned (removed from supply) — making fusion a deflationary mechanism
- Fused warriors receive a special "Fused" visual badge
- Fusion has no cooldown but costs more CRwN than breeding
- Fused warriors cannot be fused again (one-time operation)

**Frontend Pages:**

- Breeding interface: Select two owned warriors, preview potential offspring trait ranges (showing minimum, maximum, and expected values for each attribute), and initiate breeding
- Fusion interface: Select two warriors to sacrifice, preview the resulting fused warrior's guaranteed stats, confirm the permanent burn, and create the fused warrior

---

### 4.3 DAO Governance (Target: Q3 2026)

**Overview:**

A fully decentralized governance system allowing CRwN holders to collectively make decisions about protocol parameters, feature prioritization, and treasury allocation.

**Governance Model — CRwN Staking for Voting Power:**

| Parameter | Value |
|-----------|-------|
| Voting Power | 1 CRwN staked = 1 vote |
| Delegation | Users can delegate their voting power to another address |
| Proposal Threshold | Minimum 1,000 CRwN staked to create proposals |
| Quorum | 10% of total staked CRwN must participate for a vote to be valid |
| Voting Period | 7 days from proposal creation |
| Timelock | 48-hour delay between approval and on-chain execution |
| Unstaking Period | 7-day cooldown when withdrawing staked CRwN |

**What the DAO Can Vote On:**

| Category | Examples |
|----------|---------|
| Protocol Fees | Change the 5% protocol fee (range: 1%–10%) |
| Arena Rules | Add new arena categories, modify rank tier requirements |
| Market Policies | Set market resolution dispute procedures, define acceptable oracle sources |
| Treasury Allocation | Decide how protocol revenue is distributed (development, marketing, reserves) |
| Feature Prioritization | Vote on which features to build next |
| Emergency Actions | Pause or unpause specific protocol components |

**DAO Integration with Existing Contracts:**

The warrior NFT contract already includes a DAO authorization error, confirming that DAO governance was planned from initial contract design. The DAO will be granted a special role in relevant contracts, allowing governance proposals to execute parameter changes directly on-chain after passing the timelock period.

**Smart Contract Architecture:**

Three new contracts built on the OpenZeppelin governance framework:
- A Governor contract handling proposal creation, voting, and counting
- A Timelock controller enforcing execution delays for security
- A Staking contract managing CRwN deposits, withdrawals, and voting power delegation

**Governance Frontend:**

- Active proposals list with voting interface (FOR / AGAINST / ABSTAIN)
- Proposal creation page with title, description, and executable on-chain actions
- Staking management: stake/unstake CRwN, view current voting power, manage delegation
- Governance statistics: participation rates, proposal pass rates, top voters

---

### 4.4 Mobile Application (Target: Q4 2026)

**Phase 1: Progressive Web App (PWA)**

- Installable web application with native-like experience (standalone display mode, custom splash screen, home screen icon)
- Offline portfolio viewing using cached last-synced data via service workers
- Background sync for pending transactions when connectivity is restored
- Push notifications for whale alerts, battle results, arbitrage opportunities, and market resolutions using the Web Push API
- Mobile-optimized responsive layout with touch-friendly tap targets (minimum 44×44 pixels), swipe gestures for navigation, and bottom navigation bar
- Custom install banner prompting users to "Add to Home Screen"

**Phase 2: React Native (iOS & Android)**

- Full feature parity with the web application
- Native push notifications via Apple Push Notification Service (iOS) and Firebase Cloud Messaging (Android)
- Biometric authentication: Face ID, Touch ID, fingerprint unlock
- WalletConnect mobile SDK integration for seamless wallet signing on mobile
- Native chart rendering for portfolio, analytics, and battle views
- App Store and Google Play Store submission with compliance review

---

### 4.5 Third-Party Developer SDK (Target: Q4 2026)

**npm Package Suite:**

| Package | Purpose |
|---------|---------|
| Arena SDK | Create custom arenas, manage battles, query battle history, handle betting |
| Market SDK | Create and mirror prediction markets, schedule resolutions, detect arbitrage |
| NFT SDK | Mint warriors, manage traits, execute breeding/fusion operations |

Each package includes:
- Full TypeScript type definitions with documentation
- Smart contract interaction wrappers
- Real-time event listeners for on-chain events
- Descriptive custom error handling

**Public REST API:**

| Endpoint Category | Capabilities |
|-------------------|-------------|
| Battles | Battle history with pagination, currently active battles, single battle details with round-by-round data |
| Markets | Mirror market listings with prices and volumes, single market details with price history and positions |
| Whales | Tracked whale addresses with statistics, individual whale profiles and trade history |
| Agents | AI agent registry with performance data, individual agent details and follower information |

**WebSocket Channels:**

| Channel | Real-Time Events |
|---------|-----------------|
| Battles | Battle started, round complete, battle finished |
| Markets | Price update, market created, market resolved |
| Whales | Trade detected, new position opened |
| Agents | Trade executed, tier changed |

**Documentation Deliverables:**

- API reference with OpenAPI/Swagger specification
- Quickstart guides for each SDK package
- Example applications: custom arena frontend, automated trading bot, analytics dashboard
- Rate limiting documentation with tiered access levels

---

### 4.6 Esports Partnership Program (Target: Q4 2026)

**League Structure:**

| Division | Eligibility | Frequency |
|----------|------------|-----------|
| Amateur | SILVER and GOLD ranked warriors | Weekly qualifiers |
| Semi-Pro | GOLD and PLATINUM ranked warriors | Monthly regional tournaments |
| Professional | PLATINUM ranked warriors, invitation-based | Quarterly championships |

**Sponsorship Framework:**

- Companies fund tournament prize pools via smart contract sponsor functions
- Branded arenas with custom themes, sponsor logos, colors, and battle narration
- Revenue share on sponsored tournaments: 85% prize pool, 10% protocol fee, 5% streaming platform
- Sponsor dashboard for tracking tournament metrics, audience reach, and brand impressions

**Streaming Integration:**

- Twitch and YouTube integration for live tournament broadcasts
- Battle replay system for re-watching any tournament match with commentary
- Spectator mode for watching live battles in real-time from the frontend
- OBS-compatible stream overlay showing bracket state and live battle statistics

**Prize Administration:**

- Automated prize distribution via smart contracts
- Multi-sig approval for championship-level prize pools exceeding 10,000 CRwN
- Tax documentation support for prize winners (W-9 collection for US-based participants)

---

## 5. Platform Data Infrastructure

WarriorsAI-rena's backend is powered by a comprehensive data layer consisting of over 40 database models organized across multiple domains. This infrastructure enables the platform's real-time capabilities, historical tracking, and cross-platform data aggregation.

### 5.1 Core Game Data

| Data Domain | Models | Purpose |
|-------------|--------|---------|
| Warriors | Warrior profiles, attributes, battle history, XP, rank, level | Complete warrior lifecycle tracking from minting through evolution |
| Battles | Battle records, round data, moves, damage, outcomes | Full battle history with round-by-round granularity |
| Arenas | Arena configurations, betting pools, participant records | Arena management and betting pool accounting |
| Users | User accounts, wallet addresses, statistics, preferences | Player identity and cross-platform activity tracking |

### 5.2 Prediction Market Data

| Data Domain | Models | Purpose |
|-------------|--------|---------|
| External Markets | Market metadata from Polymarket, Kalshi, and Opinion.trade | Normalized market data with source tracking, prices in basis points, volumes in USD |
| Mirror Markets | On-chain mirror market records linked to external markets | Track Flow-side mirror markets with contract references and status |
| Mirror Trades | Individual trades on mirror markets | Position tracking, P&L calculation, and settlement |
| Scheduled Resolutions | Resolution schedules with oracle source and status tracking | 6-state resolution lifecycle (PENDING through COMPLETED/FAILED/CANCELLED) with attempt counts and error logs |
| Matched Market Pairs | Cross-platform market matches with similarity scores | Power arbitrage detection and cross-platform analysis |

### 5.3 Whale & Trading Data

| Data Domain | Models | Purpose |
|-------------|--------|---------|
| Whale Trades | High-value trade records with source, amount, side, and price | Historical whale activity across all platforms |
| Tracked Traders | Whale profiles with volume, win rate, trade count | Aggregate whale statistics and performance tracking |
| Whale Follows | User-to-whale subscription records with configuration | Copy trading subscriptions with configurable parameters |
| Arbitrage Opportunities | Detected spread opportunities with matched markets | Arbitrage alert history and execution tracking |

### 5.4 Financial Data

| Data Domain | Models | Purpose |
|-------------|--------|---------|
| Escrow Locks | Locked fund records with purpose type and status | Guarantee trade execution for arbitrage and copy trading |
| User Balances | CRwN balance tracking per user | Real-time balance management across all activities |
| Settlement Transactions | Completed settlement records with amounts and tx hashes | Full audit trail of all financial settlements |

### 5.5 Social & Engagement Data

| Data Domain | Models | Purpose |
|-------------|--------|---------|
| Market Comments | User comments on prediction markets | Social discussion on market outcomes |
| Market Shares | Social sharing records for markets | Track sharing activity and engagement |
| Creators | Creator profiles with tier, revenue, and statistics | Creator economy management |
| Creator Revenue | Revenue records by source and period | Creator earnings tracking and distribution |
| User Notification Preferences | Per-channel notification settings | 4-channel (push, email, Discord, Telegram) notification configuration |

### 5.6 AI Agent Data

| Data Domain | Models | Purpose |
|-------------|--------|---------|
| AI Agents | Agent profiles with strategy, tier, risk profile, traits | Agent registry and configuration |
| AI Debates | Debate records between agents on market questions | Debate history and scoring |
| AI Prediction Scores | Agent accuracy tracking over time | Performance benchmarking and leaderboard |
| Prediction Battles | Structured debates with round-by-round scoring | Detailed debate progression records |
| Prediction Rounds | Individual debate round data | Granular round-level scoring and argument tracking |

---

## 6. Platform API Surface

The platform exposes 84 API routes organized across 15 functional categories. These routes power the frontend application, mobile clients, Discord/Twitter bots, and will form the foundation for the future third-party SDK.

### 6.1 External Market APIs (Prediction Markets)

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Polymarket Proxy | 6 routes | Market browsing with circuit breaker protection, orderbook data, trade history, market search, category filtering, real-time price sync |
| Kalshi Proxy | 6 routes | Market browsing with server-side JWT auth, orderbook access, event grouping, compliance-filtered data, trade streaming |
| Opinion.trade Proxy | 4 routes | Market listing, price history with configurable intervals, chart data, market detail retrieval |
| Unified Market Aggregation | 5 routes | Cross-platform search, combined market listings, platform comparison, spread analysis, data sync triggers |
| Arbitrage Detection | 3 routes | Cross-platform spread detection, opportunity listing, arbitrage execution triggers |

### 6.2 Market Resolution APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Resolution Management | 4 routes | Schedule new resolutions, cancel pending resolutions, manually trigger execution, resolution status retrieval |
| Cron Execution | 2 routes | Automated 5-minute polling endpoint, batch resolution execution with outcome fetching from external APIs |
| Resolution History | 2 routes | Historical resolution records with filtering, resolution attempt and error log access |

### 6.3 Whale Tracking APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Whale Alerts | 10 routes | Follow/unfollow whales, manage following list, browse tracked traders, view hot markets by whale activity, aggregate statistics, trade history with filtering, wallet-specific analytics, real-time alert stream |

### 6.4 Copy Trading APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Copy Trade Management | 6 routes | Follow/unfollow AI agents, update copy settings (max amount, copy percentage), view active copy positions, P&L retrieval, trade history for copied positions |

### 6.5 Battle & Arena APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Battle Management | 8 routes | Create battles, join battles, place bets, execute influence/defluence, retrieve battle details with round data, battle history, live battle status |
| Arena Management | 6 routes | Create arenas via factory, configure arena settings, browse active arenas, arena statistics, participant lists |

### 6.6 Market Creation & Trading APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Custom Markets | 5 routes | Create prediction markets, add liquidity, trade YES/NO positions, retrieve market details, market listing with filters |
| Mirror Markets | 4 routes | Create mirror markets from external sources, trade on mirrors, position tracking, mirror market listing |

### 6.7 Portfolio & User APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Portfolio | 5 routes | Performance data with time-range filtering, position breakdown, P&L calculation, activity history, mirror portfolio tracking |
| User Management | 4 routes | User profile, statistics, notification preferences, linked account management |

### 6.8 AI Agent APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Agent Management | 6 routes | Agent registration, strategy configuration, performance metrics, follower management, debate participation, tier progression |

### 6.9 Admin & Monitoring APIs

| Category | Route Count | Capabilities |
|----------|-------------|-------------|
| Admin | 4 routes | Platform statistics, system health checks, manual intervention endpoints, monitoring dashboard data |

---

## 7. Quarterly Implementation Timeline

### Q1 2026: Mainnet Launch & Security Audit

**Focus:** Preparing all 18 complete features for production deployment.

| Task | Description |
|------|-------------|
| Security Audit | Professional audit of all 32 smart contracts (Solidity + Cadence) by a reputable firm |
| Flow EVM Mainnet Deployment | Deploy all battle contracts, prediction market contracts, AI agent contracts, and oracle contracts |
| 0G Mainnet Configuration | Configure production AI agent infrastructure on 0G Network mainnet |
| Mainnet Activation | Activate mirror markets, whale tracking, copy trading, arbitrage engine, and custom market creation on mainnet |
| Integration Testing | End-to-end testing across all three prediction market data sources on mainnet infrastructure |
| Genesis Warrior Mint | Launch event offering 1,000 free warrior NFT mints to early community members |
| Monitoring Infrastructure | Deploy contract event monitoring, API health checks, bot uptime tracking, and alerting |

### Q2 2026: Core New Feature Development

**Focus:** Building the most impactful new features and completing partially built systems.

| Feature | Scope |
|---------|-------|
| Tournament System | Bracket creation, elimination modes, automated progression via Cadence scheduling, integrated prediction markets, prize pool management and automated distribution |
| Warrior Breeding & Fusion | Genetic trait inheritance algorithm, breeding cooldowns, generation tracking, fusion burns, offspring preview interfaces |
| Leaderboard Rewards | Seasonal settlement smart contract, CRwN claiming mechanism, multi-category leaderboards, season history archive |
| Prediction Market v2 | Multi-outcome market support (3+ outcomes with LMSR pricing) |
| Progressive Web App | Mobile-responsive layout optimization, service workers for offline access, push notifications, install prompt |
| Analytics Dashboard | Player analytics, market analytics, whale analytics, and platform analytics with charts and export capabilities |

### Q3 2026: Marketplace, Governance & Social

**Focus:** Building marketplace, decentralized governance, AI analysis, and social features.

| Feature | Scope |
|---------|-------|
| AI Agent Marketplace | Full marketplace UI with search/filter, agent detail pages, training interface, listing/purchase flow with escrow, revenue sharing |
| DAO Governance | CRwN staking contract, Governor contract, Timelock controller, proposal creation and voting UI, delegation management |
| AI Market Analysis | LLM integration for automated insights, natural language summaries, trading signal generation, confidence scoring |
| Public Prediction Market API | REST and WebSocket endpoints for third-party access, rate limiting, API key management |
| Cross-Chain Bridge Activation | Configure EVMBridge for Flow Mainnet, enable cross-VM operations |
| Native Social Features | User profiles, following system, discussion threads, social activity feed, share functionality |

### Q4 2026: Scale, Mobile & Ecosystem

**Focus:** Mobile applications, developer tools, esports, and cross-chain expansion.

| Feature | Scope |
|---------|-------|
| Cross-Chain Expansion | Deploy mirror markets on Ethereum L2s (Arbitrum, Base, Optimism) via 0G Network bridge |
| Esports Partnership Program | League structure, sponsored tournaments, streaming integration, spectator mode |
| Mobile Native App | React Native for iOS and Android with full feature parity, biometric auth, native notifications |
| Third-Party SDK | npm packages for arenas, markets, and NFTs; public API documentation; example applications |
| Advanced AI Models | Player-trainable agent parameters, multi-agent ensemble composition, enhanced debate models |
| Creator Economy v2 | Enhanced creator dashboards, batch revenue claiming, creator verification badges, themed events |

---

## 8. Dependencies & Prerequisites

### Feature Dependency Map

| Feature to Build | Depends On | Dependency Status | Priority |
|-----------------|-----------|-------------------|----------|
| Tournament System | Arena Factory, Scheduled Battle, Prediction Market AMM | All COMPLETE | HIGH |
| Warrior Breeding & Fusion | Warrior NFT contract, trait system | All COMPLETE | HIGH |
| Leaderboard Rewards | Arena contract (UserStats), Crown Token | All COMPLETE | HIGH |
| AI Agent Marketplace | AI Agent Intelligent NFT, AI Agent Registry | All COMPLETE | MEDIUM |
| DAO Governance | Crown Token (for staking) | COMPLETE | MEDIUM |
| AI Market Analysis | OpenAI SDK, external market services | All COMPLETE | MEDIUM |
| Prediction Market v2 | Prediction Market AMM, Market Factory | All COMPLETE | MEDIUM |
| Native Social Features | User auth, portfolio system, notification system | All COMPLETE or PARTIAL | LOW |
| Progressive Web App | Frontend application | COMPLETE | MEDIUM |
| Cross-Chain Bridge Activation | EVMBridge Cadence contract, mainnet deployment | COMPLETE / PENDING | LOW |
| Third-Party SDK | All core APIs, documentation | COMPLETE / NOT YET BUILT | LOW |
| Mobile Native App | Progressive Web App (must be built first) | NOT YET BUILT | LOW |
| Esports Partnerships | Tournament System (must be built first) | NOT YET BUILT | LOW |

### Critical Path

The highest-priority features (Tournament System, Breeding/Fusion, Leaderboard Rewards) have **all dependencies already complete**. This means development can begin immediately after mainnet deployment and security audit completion in Q1 2026.

The DAO Governance system and AI Agent Marketplace also have all smart contract dependencies complete, but are scheduled for Q3 to allow the community to grow first — governance requires an active community to be meaningful.

Cross-chain expansion and the developer SDK depend on mainnet stability and usage patterns, making them appropriate for Q4 after the platform has production data to optimize against.

---

## Cross-References

- For business model, financial projections, competitive analysis, and market opportunity, see **[BUSINESS_PLAN.md](./BUSINESS_PLAN.md)**
- For a concise project pitch and funding request, see **[PITCH_DECK.md](./PITCH_DECK.md)**

---

*This document covers the complete technical capabilities and implementation roadmap for WarriorsAI-rena. Every feature described in the "Complete" section has been fully built and is awaiting mainnet deployment. Every feature in the "Partially Built" and "Unbuilt" sections has a clear specification, identified dependencies, and scheduled timeline for implementation.*
