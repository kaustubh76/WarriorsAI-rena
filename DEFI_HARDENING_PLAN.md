# Warriors AI Arena — On-Chain DeFi Migration Plan

> Moving ALL core DeFi operations on-chain: betting, battle creation, settlement, ELO, escrow, trait enforcement, staking, and fee distribution.

---

## Why This Migration

The current codebase has 14+ Solidity contracts deployed on Flow testnet, but most business logic **bypasses them entirely** and runs in TypeScript/Prisma. A thorough code review reveals that:

- **Betting** is DB records, no CRwN escrowed (`betting/route.ts`)
- **Battle creation** is DB-only (`strategyArenaService.ts:160-202`)
- **Settlement** uses a server wallet to transfer from its own balance (`strategyArenaService.ts:566-588`)
- **ELO ratings** are computed in TypeScript and stored in SQLite (`strategyArenaService.ts:446-549`)
- **Escrow** is a DB ledger with no token transfers (`escrowService.ts` — line 5 says: "For production, consider migrating to smart contract escrow")
- **Trait constraints** are enforced in TypeScript (`defiConstraints.ts:54-134`)
- **Scoring** is TypeScript math (`arenaScoring.ts`)
- **Creator fees** are tracked in DB only (`creator/record-fee/route.ts`)
- **Staking** does not exist (fees accumulate in `PredictionMarketAMM.totalFeeCollected` with no distribution)

For a DeFi platform, the smart contracts must be the source of truth.

---

## What's Already On-Chain (Keep As-Is)

| Component | Contract | Status |
|-----------|----------|--------|
| NFT traits + moves | `WarriorsNFT.sol` | Deployed, working |
| Vault deposit/rebalance/withdraw | `StrategyVault.sol` | Deployed, working |
| Yield accrual | `BasePool.sol` (3 pools) | Deployed, working (static APY) |
| AMM trading | `PredictionMarketAMM.sol` | Deployed, working |
| Micro-market buy/sell/resolve | `MicroMarketFactory.sol` | Deployed, working |
| Market mirroring | `ExternalMarketMirror.sol` | Deployed, integrated |
| Creator revenue | `CreatorRevenueShare.sol` | Deployed, **NOT called from API** |
| CRwN mint/burn | `CrownToken.sol` | Deployed, working |

---

## What Must Move On-Chain

| Operation | Current | Target | Severity |
|-----------|---------|--------|----------|
| Battle creation + stake escrow | DB record, no escrow | Contract creates battle, escrows CRwN | **CRITICAL** |
| Betting pool + payouts | DB math, no token movement | Contract escrows bets, calculates payouts | **CRITICAL** |
| Battle settlement + prize distribution | Server wallet transfer (line 578) | Contract distributes escrowed funds | **CRITICAL** |
| ELO rating updates | DB upsert (lines 496-549) | On-chain rating registry | **HIGH** |
| Trait constraint enforcement | TypeScript (defiConstraints.ts) | Solidity in StrategyVault.rebalance() | **HIGH** |
| Escrow fund locking | DB ledger (escrowService.ts) | Replaced by battle manager contract | **CRITICAL** |
| Pool APYs | Static owner-set values | Dynamic utilization-based | **HIGH** |
| Fee distribution to stakers | Does not exist | stCRwN staking contract | **HIGH** |
| Micro-market creation for battles | Not wired | Auto-create per cycle | **MEDIUM** |
| Score transparency | Single number, opaque | Component breakdown | **MEDIUM** |

---

## Phase 1: StrategyBattleManager.sol — Core On-Chain Contract

### The Concept

Instead of separate contracts for escrow, betting, and settlement, one unified `StrategyBattleManager.sol` handles the complete battle lifecycle on-chain:

```
createBattle() → stakes escrowed on-chain
    ↓
placeBet() → bets escrowed on-chain
    ↓
closeBetting() → no more bets
    ↓
recordCycleScore() × 5 → scores stored on-chain
    ↓
settleBattle() → winner gets stakes + betting pot, ELO updated on-chain
    ↓
claimBet() → bettors pull their winnings from contract
```

### Contract Design

**File:** `src/StrategyBattleManager.sol`

**Constructor:**
```solidity
constructor(
    address _crownToken,
    address _warriorsNFT,
    address _strategyVault
)
```

**Battle Lifecycle Functions:**

```solidity
function createBattle(
    uint256 warrior1Id, uint256 warrior2Id, uint256 stakes
) external returns (uint256 battleId);
```
- Validates: both warriors have active vaults (via strategyVault)
- Validates: msg.sender owns warrior1 (via warriorsNFT.ownerOf)
- Transfers: stakes from warrior1Owner AND warrior2Owner to contract (escrow)
- Creates: Battle struct with bettingOpen=true
- Emits: `BattleCreated(battleId, warrior1Id, warrior2Id, stakes)`

```solidity
function recordCycleScore(
    uint256 battleId, uint256 w1RoundScore, uint256 w2RoundScore
) external onlyResolver;
```
- Updates cumulative scores
- Increments currentRound
- Emits: `CycleScored(battleId, round, w1Score, w2Score)`

```solidity
function settleBattle(uint256 battleId) external onlyResolver;
```
- Requires: currentRound >= 5
- Determines winner from scores
- Transfers: stakes × 2 to winner (or refund each on draw)
- Updates: on-chain ELO for both warriors
- Settles: opens bet claims
- Emits: `BattleSettled(battleId, winnerId, w1NewRating, w2NewRating)`

**Betting Functions:**

```solidity
function placeBet(uint256 battleId, bool betOnWarrior1, uint256 amount) external;
```
- Transfers CRwN from bettor to contract
- Updates pool totals
- Emits: `BetPlaced(battleId, bettor, betOnWarrior1, amount)`

```solidity
function claimBet(uint256 battleId) external;
```
- Pull-based: bettor calls to receive payout
- Winner: `betAmount + (losingPool × betAmount / winningPool) - 5% fee`
- Draw: `betAmount - 5% fee`
- Loser: 0
- Emits: `BetClaimed(battleId, bettor, payout)`

**View Functions (matching existing hook ABI in `useBattleBetting.ts:55-106`):**

```solidity
function getBattingOdds(uint256 battleId) view returns (uint256 w1Odds, uint256 w2Odds, uint256 totalPool);
function getUserBet(uint256 battleId, address bettor) view returns (BetInfo);
function getBattle(uint256 battleId) view returns (Battle);
function getWarriorRating(uint256 nftId) view returns (WarriorRating);
```

**Internal ELO (on-chain, replaces arenaScoring.ts):**

```solidity
function _updateElo(uint256 winnerId, uint256 loserId, bool isDraw) internal;
```
- Standard Elo: `E = 1 / (1 + 10^((opponent - my) / 400))`
- Dynamic K-factor: 48 (new player, <20 battles), 32 (intermediate), 24 (veteran, 50+)
- Updates `ratings[nftId]` mapping on-chain
- Tracks: totalBattles, wins, losses, draws, currentStreak, peakRating

### On-Chain Trait Constraint Enforcement

**Modify:** `src/StrategyVault.sol`

Move `defiConstraints.ts` logic into Solidity inside `rebalance()`:

```solidity
function _enforceTraitConstraints(
    uint256[3] calldata proposed,
    IWarriorsNFT.Traits memory traits,
    uint256[3] memory prev
) internal pure {
    // ALPHA → max concentration: 2000 + 6000 × strength / 10000
    uint256 maxConc = 2000 + (traits.strength * 6000) / 10000;
    require(proposed[0] <= maxConc && proposed[2] <= maxConc, "Concentration limit");

    // HEDGE → min stable: 500 + 6500 × defence / 10000
    uint256 minStable = 500 + (traits.defence * 6500) / 10000;
    require(proposed[1] >= minStable, "Stable minimum");

    // MOMENTUM → max delta: 500 + 4500 × charisma / 10000
    uint256 maxDelta = 500 + (traits.charisma * 4500) / 10000;
    uint256 shift = _absDiff(proposed[0], prev[0]) + _absDiff(proposed[1], prev[1]) + _absDiff(proposed[2], prev[2]);
    require(shift / 2 <= maxDelta, "Rebalance delta limit");
}
```

### Supporting Files

| File | Purpose |
|------|---------|
| `src/Interfaces/IStrategyBattleManager.sol` | Interface |
| `script/DeployBattleManager.s.sol` | Deployment (pattern: DeployVault.s.sol) |
| `frontend/src/constants/abis/battleManagerAbi.ts` | Full ABI export |
| `test/StrategyBattleManager.t.sol` | Foundry tests |

### Frontend Changes

**`frontend/src/constants/index.ts`:**
```typescript
STRATEGY_BATTLE_MANAGER: process.env.NEXT_PUBLIC_BATTLE_MANAGER_ADDRESS || '0x...',
```

**`frontend/src/hooks/arena/useBattleBetting.ts`:**
- Line 110: Point to `STRATEGY_BATTLE_MANAGER` address
- Replace inline ABI with import
- Hook already handles on-chain path (lines 213-219)

**`frontend/src/services/arena/strategyArenaService.ts`:**
- `createStrategyBattle()`: After DB create, call `createBattle()` on-chain. Store `onChainBattleId`
- `executeCycle()`: After scoring, call `recordCycleScore()` on-chain
- `settleBattle()`: Remove server wallet transfer (lines 566-588). Call `settleBattle()` on contract instead
- DB remains as cache/index for queries and cron scheduling

**`frontend/src/app/api/arena/betting/route.ts`:**
- POST: User calls contract from wallet. API just caches the bet in DB
- PATCH: User calls contract from wallet. API syncs DB
- GET: Read from DB cache, optionally cross-check on-chain

**`frontend/prisma/schema.prisma`:**
- `PredictionBattle`: add `onChainBattleId Int?`, `createTxHash String?`
- `BattleBet`: add `escrowTxHash String?`, `claimTxHash String?`
- `BattleBettingPool`: add `onChainSettled Boolean @default(false)`

### Test Cases

```
1. createBattle → stakes escrowed → BattleCreated event
2. createBattle with inactive vault → reverts
3. placeBet → CRwN transferred → BetPlaced event
4. placeBet after close → reverts
5. recordCycleScore × 5 → scores accumulate
6. settleBattle → winner gets 2× stakes → ELO updated → BattleSettled event
7. claimBet winner → correct payout with 5% fee
8. claimBet loser → 0 payout
9. claimBet draw → refund minus fee
10. double-claim → reverts
11. ELO: new player gets K=48, veteran gets K=24
12. Trait constraints: rebalance exceeding concentration → reverts
```

---

## Phase 2: Dynamic Pool APYs

### Problem

`BasePool.sol` has static `apyBasisPoints` (18%/4%/12%). Every strategy battle converges on "maximize HighYield." No strategic depth.

### Solution

**Modify:** `src/pools/BasePool.sol`

```solidity
uint256 public maxCapacity;              // 0 = unlimited (backward compat)
uint256 public targetUtilization = 5000; // 50%

function getEffectiveAPY() public view returns (uint256) {
    if (maxCapacity == 0) return apyBasisPoints;
    uint256 util = (totalDeposits * 10000) / maxCapacity;
    if (util == 0) util = 1;
    uint256 mult = (targetUtilization * 10000) / util;
    if (mult > 20000) mult = 20000; // cap 2×
    if (mult < 5000) mult = 5000;   // floor 0.5×
    return (apyBasisPoints * mult) / 10000;
}
```

**Modify `_accrueYield()`:** Use `getEffectiveAPY()` instead of `apyBasisPoints`.

**Backward compatible:** `maxCapacity == 0` means static APY. Dynamic activates only when owner sets capacity.

### Files
- `src/pools/BasePool.sol` — dynamic formula
- `src/Interfaces/IPool.sol` — add views
- `frontend/src/services/vaultService.ts` — read effective APYs
- `frontend/src/app/arena/strategy/[id]/page.tsx` — display
- `test/BasePool.t.sol` — tests

---

## Phase 3: CRwN Staking (stCRwN)

### Contracts

**`src/stCRwN.sol`** — ERC20 receipt token, mint/burn only by staking contract

**`src/CRwNStaking.sol`:**
```
stake(amount) → deposit CRwN, receive stCRwN at exchange rate
requestUnstake(shares) → 7-day cooldown queue
completeUnstake() → after cooldown, burn stCRwN, receive CRwN
distributeFees(amount) → authorized fee sources increase exchange rate
stakeWarrior(nftId) → escrow NFT for yield boost (BRONZE=1.25× → PLATINUM=3×)
unstakeWarrior() → return NFT
```

### Fee Forwarding

**Modify `PredictionMarketAMM.sol`** — at 4 fee collection points:
```solidity
if (address(stakingContract) != address(0)) {
    uint256 stakerShare = (fee * stakingFeePercent) / FEE_DENOMINATOR;
    crownToken.approve(address(stakingContract), stakerShare);
    stakingContract.distributeFees(stakerShare);
    totalFeeCollected -= stakerShare;
}
```
Follows existing guard pattern from `creatorRevenueShare` (lines 140-142).

Same pattern in: `MicroMarketFactory.sol`, `StrategyBattleManager.sol`.

### Frontend
- `frontend/src/hooks/useStaking.ts` — stake/unstake/warrior boost
- `frontend/src/app/staking/page.tsx` — dashboard (TVL, APY, position, warrior boost)
- `frontend/src/app/api/staking/route.ts` — read on-chain stats

---

## Phase 4: Micro Market Integration

### Modify `MicroMarketFactory.sol`
- Add `YIELD_COMPARISON`, `ALLOCATION_SHIFT` market types
- Add `createStrategyMicroMarkets(battleId, cycle, endTime, liquidity)`

### Wire into `strategyArenaService.ts`
- Before cycle: create micro-markets on-chain
- After cycle: resolve with yield data
- Gated behind env var (backward compatible)

### Frontend
- Strategy battle detail: show micro-markets per cycle
- New API: `arena/strategy/[id]/micro-markets`

---

## Phase 5: Scoring Transparency

### `arenaScoring.ts`
Return component breakdown: `{ yield, aiQuality, traitBonus, moveCounter, vrfModifier }`

### `strategyArenaService.ts`
Store breakdown per cycle in DB.

### `strategy/[id]/page.tsx`
Render breakdown bars per cycle.

### Schema
Add `w1ScoreBreakdown Json?`, `w2ScoreBreakdown Json?` to `PredictionRound`.

---

## Complete File Inventory

### New Files (16)

| # | File | Phase | Description |
|---|------|-------|-------------|
| 1 | `src/StrategyBattleManager.sol` | 1 | Core on-chain battle + betting + ELO |
| 2 | `src/Interfaces/IStrategyBattleManager.sol` | 1 | Interface |
| 3 | `script/DeployBattleManager.s.sol` | 1 | Deployment script |
| 4 | `frontend/src/constants/abis/battleManagerAbi.ts` | 1 | ABI export |
| 5 | `test/StrategyBattleManager.t.sol` | 1 | Foundry tests |
| 6 | `test/BasePool.t.sol` | 2 | Dynamic APY tests |
| 7 | `src/stCRwN.sol` | 3 | Receipt token |
| 8 | `src/CRwNStaking.sol` | 3 | Staking contract |
| 9 | `src/Interfaces/ICRwNStaking.sol` | 3 | Interface |
| 10 | `script/DeployStaking.s.sol` | 3 | Deployment script |
| 11 | `frontend/src/constants/abis/stakingAbi.ts` | 3 | ABI export |
| 12 | `frontend/src/hooks/useStaking.ts` | 3 | Staking hook |
| 13 | `frontend/src/app/staking/page.tsx` | 3 | Staking dashboard |
| 14 | `frontend/src/app/api/staking/route.ts` | 3 | Staking API |
| 15 | `test/CRwNStaking.t.sol` | 3 | Staking tests |
| 16 | `frontend/src/app/api/arena/strategy/[id]/micro-markets/route.ts` | 4 | Micro-markets API |

### Modified Files (13)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `src/StrategyVault.sol` | 1 | On-chain trait constraint enforcement |
| 2 | `frontend/src/constants/index.ts` | 1,3 | Add contract addresses |
| 3 | `frontend/src/hooks/arena/useBattleBetting.ts` | 1 | Point to BattleManager |
| 4 | `frontend/src/services/arena/strategyArenaService.ts` | 1,2,4,5 | On-chain create/score/settle |
| 5 | `frontend/src/app/api/arena/betting/route.ts` | 1 | DB cache role |
| 6 | `frontend/prisma/schema.prisma` | 1,5 | On-chain IDs, tx hashes |
| 7 | `src/pools/BasePool.sol` | 2 | Dynamic APY |
| 8 | `src/Interfaces/IPool.sol` | 2 | New views |
| 9 | `frontend/src/services/vaultService.ts` | 2 | Effective APY |
| 10 | `frontend/src/app/arena/strategy/[id]/page.tsx` | 2,4,5 | APY, micro-markets, scoring |
| 11 | `src/PredictionMarketAMM.sol` | 3 | Fee forwarding |
| 12 | `src/MicroMarketFactory.sol` | 3,4 | Fee forwarding + strategy types |
| 13 | `frontend/src/lib/arenaScoring.ts` | 5 | Score breakdown |

---

## Verification Checklist

### Contracts
- [x] `forge build` — all contracts compile
- [x] `forge test --match-contract StrategyBattleManager` — passes (24 tests)
- [x] `forge test --match-contract BasePool` — passes (14 tests)
- [x] `forge test --match-contract CRwNStaking` — passes (21 tests)

### Deployment
- [x] Deploy StrategyBattleManager to Flow testnet
- [x] Deploy stCRwN + CRwNStaking to Flow testnet
- [x] Wire fee forwarding: AMM → Staking
- [x] Set capacity on pools for dynamic APY

### E2E Flow
- [x] Create battle from frontend → stakes escrowed on-chain → tx on explorer
- [x] Place bet → CRwN transferred to contract → BetPlaced event
- [x] Execute 5 cycles → scores recorded on-chain → CycleScored events
- [x] Battle settles → winner receives stakes + bet winnings → ELO on-chain
- [x] Claim bet → CRwN transferred from contract to bettor
- [x] Stake CRwN → receive stCRwN → trade generates fees → exchange rate increases
- [x] Rebalance exceeding trait constraints → tx reverts on-chain
- [x] Dynamic APYs fluctuate based on pool utilization
- [x] `cd frontend && npx tsc --noEmit` — only pre-existing errors

---

*Plan v3 — "Everything On-Chain" — all core DeFi operations moved to smart contracts with DB as cache/index layer.*
