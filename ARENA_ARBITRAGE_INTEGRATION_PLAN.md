# Arena-Integrated Betting & Arbitrage System - Complete Plan

## User Request
**"Integrate betting and arbitrage into Prediction Arena battles. Instead of just picking warrior IDs, users select topics/markets. Warriors auto-execute real bets on Polymarket/Kalshi as they battle."**

## User-Specified Requirements
1. **Warrior Setup**: User picks 2 warriors (they own both), each auto-bets opposite sides
2. **Bet Timing**: Bets placed immediately when battle is created
3. **Profit Distribution**:
   - External market winner takes all Polymarket/Kalshi winnings
   - If arbitrage profitable → Both warriors split arbitrage profit
   - Debate winner gets bonus from spectator pool

---

## Current State (After Phase 1 & 2 Completion)

### ✅ Already Implemented
1. **Database Schema** - MarketBet and ArbitrageTrade tables exist
2. **Core Services** - MarketBettingService, ArbitrageTradingService, OrderExecutionService
3. **API Endpoints** - Complete REST APIs for betting and arbitrage
4. **Prediction Arena** - Full battle system with 5-round debates
5. **Spectator Betting** - BattleBet table with pool-based payouts
6. **Cross-Platform Matching** - MatchedMarketPair finds same events on Polymarket/Kalshi
7. **Arbitrage Detection** - Algorithm calculates spreads and profit potential

### ❌ What's Missing
1. **Arena-Bet Linking** - PredictionBattle not connected to MarketBet/ArbitrageTrade
2. **Dual-Warrior Creation** - Can't create battle with 2 warriors from same owner
3. **Auto-Bet Execution** - Battles don't trigger real bet placement
4. **Hybrid Settlement** - No logic for arbitrage profit split + debate bonus
5. **UI Integration** - Battle creation flow doesn't show arbitrage opportunities

---

## Enhanced Battle Flow

### 1. Market Discovery & Selection
**User Experience:**
1. User opens "Create Battle" modal
2. Searches for topic (e.g., "Bitcoin $100k by March")
3. System queries MatchedMarketPair table
4. Shows available markets:
   ```
   📊 Polymarket: 45% YES / 55% NO | Volume: $2.3M
   📊 Kalshi: 48% YES / 52% NO | Volume: $890K

   💰 Arbitrage Opportunity: 7% profit potential
   Cost: $0.93 → Guaranteed Return: $1.00
   ```

**Implementation:**
- Enhance `CreateChallengeModal.tsx` to query `/api/arena/matched-markets`
- Display side-by-side price comparison
- Calculate and show arbitrage spread in real-time

### 2. Dual-Warrior Setup
**User Experience:**
1. User selects TWO warriors they own (not just one)
2. System auto-assigns:
   - Warrior 1 → YES side (Polymarket)
   - Warrior 2 → NO side (Kalshi)
3. User sets total stake amount (e.g., 10 CRwN)
4. System shows allocation:
   ```
   Warrior #42 (YES): 4.5 CRwN → Polymarket
   Warrior #73 (NO): 4.8 CRwN → Kalshi
   Expected Profit: 0.7 CRwN (7%)
   ```

**Implementation:**
- Modify `POST /api/arena/battles` to accept `warrior2Id` at creation
- Remove "accept challenge" flow for arbitrage battles
- Validate both warriors owned by same user
- Calculate proportional stake split based on prices

### 3. Immediate Bet Execution
**When User Clicks "Create Battle":**

1. **Create ArbitrageTrade Record**
   ```typescript
   const arbitrageTrade = await arbitrageTradingService.executeArbitrage({
     userId: user.address,
     opportunityId: matchedMarket.id,
     investmentAmount: totalStake,
   });
   ```

2. **Place Both Orders Simultaneously**
   - Warrior 1 → Polymarket YES order
   - Warrior 2 → Kalshi NO order
   - Lock CRwN in escrow

3. **Create PredictionBattle Record**
   ```typescript
   const battle = await prisma.predictionBattle.create({
     data: {
       warrior1Id, warrior2Id,
       warrior1Owner, warrior2Owner, // Same address
       externalMarketId: polymarketId,
       kalshiMarketId: kalshiId, // NEW FIELD
       arbitrageTradeId: arbitrageTrade.id, // NEW FIELD
       stakes: totalStake.toString(),
       status: 'active', // Skip 'pending' state
       currentRound: 1, // Start immediately
     }
   });
   ```

4. **Start Battle Automatically**
   - No waiting for opponent
   - Round 1 executes immediately
   - Spectators can bet throughout

**Implementation Files:**
- Modify `/src/app/api/arena/battles/route.ts` (POST handler)
- Add `kalshiMarketId` and `arbitrageTradeId` fields to PredictionBattle schema
- Call `arbitrageTradingService.executeArbitrage()` before battle creation
- Remove "pending" state for arbitrage battles

### 4. Debate Battle (Mostly Unchanged)
- 5 rounds of AI-generated arguments
- Trait-based scoring
- Move system (STRIKE, TAUNT, DODGE, etc.)
- Spectator betting via BattleBet table
- Existing logic preserved

**No Changes Needed** to:
- `/src/services/arena/debateService.ts`
- `/src/lib/arenaScoring.ts`
- `/src/app/api/arena/battles/[id]/execute/route.ts`

### 5. Dual Settlement System

**When External Markets Resolve:**

```typescript
// Monitor both Polymarket and Kalshi resolution
async function monitorArbitrageBattleResolution(battleId: string) {
  const battle = await prisma.predictionBattle.findUnique({
    where: { id: battleId },
    include: { arbitrageTrade: true }
  });

  // Check Polymarket resolution
  const polyMarket = await prisma.externalMarket.findUnique({
    where: { id: battle.externalMarketId }
  });

  // Check Kalshi resolution
  const kalshiMarket = await prisma.externalMarket.findUnique({
    where: { id: battle.kalshiMarketId }
  });

  if (polyMarket.status === 'resolved' && kalshiMarket.status === 'resolved') {
    await settleBattle(battle);
  }
}
```

**Settlement Logic:**

```typescript
async function settleBattle(battle: PredictionBattle & { arbitrageTrade: ArbitrageTrade }) {
  // 1. Calculate external market payouts
  const polyPayout = calculatePayout(battle.warrior1Id, polyMarket.outcome);
  const kalshiPayout = calculatePayout(battle.warrior2Id, kalshiMarket.outcome);

  const totalPayout = polyPayout + kalshiPayout;
  const totalCost = battle.arbitrageTrade.investmentAmount;
  const arbitrageProfit = totalPayout - totalCost;

  // 2. Determine debate winner
  const debateWinner = battle.warrior1Score > battle.warrior2Score
    ? 'warrior1'
    : 'warrior2';

  // 3. Distribute external market winnings (winner takes all)
  if (polyMarket.outcome === 'yes') {
    await transferCRwN(battle.warrior1Owner, polyPayout); // Warrior 1 wins Polymarket
  }
  if (kalshiMarket.outcome === 'no') {
    await transferCRwN(battle.warrior2Owner, kalshiPayout); // Warrior 2 wins Kalshi
  }

  // 4. Split arbitrage profit (if any)
  if (arbitrageProfit > 0) {
    const profitPerWarrior = arbitrageProfit / 2n;
    await transferCRwN(battle.warrior1Owner, profitPerWarrior);
    await transferCRwN(battle.warrior2Owner, profitPerWarrior);
  }

  // 5. Debate winner gets spectator pool bonus
  const spectatorPool = await prisma.battleBettingPool.findUnique({
    where: { battleId: battle.id }
  });

  const winningPool = debateWinner === 'warrior1'
    ? spectatorPool.totalWarrior1Bets
    : spectatorPool.totalWarrior2Bets;

  const losingPool = debateWinner === 'warrior1'
    ? spectatorPool.totalWarrior2Bets
    : spectatorPool.totalWarrior1Bets;

  const debateBonus = calculateDebateBonus(winningPool, losingPool);
  const bonusRecipient = debateWinner === 'warrior1'
    ? battle.warrior1Owner
    : battle.warrior2Owner;

  await transferCRwN(bonusRecipient, debateBonus);

  // 6. Update battle status
  await prisma.predictionBattle.update({
    where: { id: battle.id },
    data: {
      status: 'completed',
      completedAt: new Date()
    }
  });

  // 7. Update ArbitrageTrade status
  await prisma.arbitrageTrade.update({
    where: { id: battle.arbitrageTradeId },
    data: {
      status: 'settled',
      actualProfit: arbitrageProfit,
      settledAt: new Date()
    }
  });
}
```

**Implementation Files:**
- Create `/src/services/arena/arbitrageBattleSettlement.ts` (new service)
- Add cron job to monitor resolution: `/src/app/api/cron/settle-arbitrage-battles/route.ts`
- Modify `PATCH /api/arena/battles` to handle dual settlement

---

## Database Schema Changes

### PredictionBattle Table (Additions)
```prisma
model PredictionBattle {
  // ... existing fields ...

  // NEW FIELDS for arbitrage integration
  kalshiMarketId    String?           // Second market for arbitrage
  arbitrageTradeId  String?   @unique // Link to ArbitrageTrade
  isArbitrageBattle Boolean   @default(false) // Flag for special handling

  // Relations
  arbitrageTrade    ArbitrageTrade? @relation(fields: [arbitrageTradeId], references: [id])
}
```

### ArbitrageTrade Table (Additions)
```prisma
model ArbitrageTrade {
  // ... existing fields ...

  // NEW FIELD for battle linkage
  predictionBattleId String? @unique
  predictionBattle   PredictionBattle?
}
```

### Migration Steps
1. Add fields to schema
2. Run `npx prisma migrate dev --name add_arbitrage_battle_link`
3. Generate Prisma client

---

## API Endpoint Modifications

### 1. `POST /api/arena/battles` (Create Battle)

**New Request Body:**
```typescript
{
  userId: string,
  warrior1Id: number,      // NEW: Must provide both warriors
  warrior2Id: number,      // NEW: Must provide both warriors
  polymarketId: string,    // Market 1
  kalshiId: string,        // Market 2
  totalStake: string,      // Total CRwN amount (in wei)
  isArbitrageBattle: true  // NEW: Flag to trigger arbitrage logic
}
```

**Enhanced Logic:**
```typescript
export async function POST(request: NextRequest) {
  const { userId, warrior1Id, warrior2Id, polymarketId, kalshiId, totalStake, isArbitrageBattle } = await request.json();

  // Validate both warriors owned by user
  const [warrior1, warrior2] = await Promise.all([
    validateWarriorOwnership(warrior1Id, userId),
    validateWarriorOwnership(warrior2Id, userId)
  ]);

  if (isArbitrageBattle) {
    // Get matched market prices
    const matchedMarket = await prisma.matchedMarketPair.findFirst({
      where: {
        polymarketId,
        kalshiId,
        isActive: true
      }
    });

    if (!matchedMarket) {
      return NextResponse.json({ error: 'Markets not matched' }, { status: 400 });
    }

    // Calculate position sizes
    const polyPrice = matchedMarket.polymarketYesPrice / 10000;
    const kalshiPrice = matchedMarket.kalshiNoPrice / 10000;
    const totalCost = polyPrice + kalshiPrice;

    const polyAllocation = (polyPrice / totalCost) * BigInt(totalStake);
    const kalshiAllocation = (kalshiPrice / totalCost) * BigInt(totalStake);

    // Execute arbitrage trade
    const arbitrageTrade = await arbitrageTradingService.executeArbitrage({
      userId,
      opportunityId: matchedMarket.id,
      investmentAmount: BigInt(totalStake)
    });

    if (!arbitrageTrade.success) {
      return NextResponse.json({ error: arbitrageTrade.error }, { status: 500 });
    }

    // Create battle (status: 'active', no pending state)
    const battle = await prisma.predictionBattle.create({
      data: {
        warrior1Id,
        warrior2Id,
        warrior1Owner: userId,
        warrior2Owner: userId,
        externalMarketId: polymarketId,
        kalshiMarketId: kalshiId,
        arbitrageTradeId: arbitrageTrade.tradeId,
        isArbitrageBattle: true,
        stakes: totalStake,
        status: 'active',
        currentRound: 1,
        question: matchedMarket.polymarketQuestion
      }
    });

    // Execute first round immediately
    await executeDebateRound(battle.id, 1);

    return NextResponse.json({
      success: true,
      battleId: battle.id,
      arbitrageTradeId: arbitrageTrade.tradeId,
      expectedProfit: arbitrageTrade.expectedProfit
    });
  }

  // ... existing non-arbitrage battle logic ...
}
```

### 2. New Endpoint: `GET /api/arena/arbitrage-opportunities`

**Purpose:** Find markets suitable for arbitrage battles

**Query Params:**
- `search` - Topic/keyword search
- `minSpread` - Minimum profit percentage (default: 5)
- `limit` - Max results (default: 20)

**Response:**
```json
{
  "success": true,
  "opportunities": [
    {
      "id": "matched_123",
      "question": "Will Bitcoin hit $100k by March 2026?",
      "polymarket": {
        "id": "poly_abc",
        "yesPrice": 45,
        "noPrice": 55,
        "volume": "2300000"
      },
      "kalshi": {
        "id": "kalshi_xyz",
        "yesPrice": 48,
        "noPrice": 52,
        "volume": "890000"
      },
      "spread": 7.0,
      "potentialProfit": 7.5,
      "cost": 0.93
    }
  ]
}
```

**Implementation:**
```typescript
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');
  const minSpread = parseFloat(searchParams.get('minSpread') || '5');
  const limit = parseInt(searchParams.get('limit') || '20');

  // Query matched markets with arbitrage potential
  const opportunities = await prisma.matchedMarketPair.findMany({
    where: {
      isActive: true,
      hasArbitrage: true,
      ...(search && {
        OR: [
          { polymarketQuestion: { contains: search } },
          { kalshiQuestion: { contains: search } }
        ]
      })
    },
    orderBy: { priceDifference: 'desc' },
    take: limit
  });

  // Filter by spread and format response
  const filtered = opportunities
    .filter(opp => {
      const cost = (opp.polymarketYesPrice + opp.kalshiNoPrice) / 10000;
      const profit = (1 - cost) * 100;
      return profit >= minSpread;
    })
    .map(opp => formatOpportunity(opp));

  return NextResponse.json({
    success: true,
    opportunities: filtered
  });
}
```

### 3. New Endpoint: `POST /api/cron/settle-arbitrage-battles`

**Purpose:** Background job to monitor and settle arbitrage battles

**Logic:**
```typescript
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find active arbitrage battles
  const activeBattles = await prisma.predictionBattle.findMany({
    where: {
      isArbitrageBattle: true,
      status: 'completed' // Debate finished but not settled
    },
    include: {
      arbitrageTrade: true
    }
  });

  const settledCount = 0;
  const errors = [];

  for (const battle of activeBattles) {
    try {
      // Check if both markets resolved
      const [polyMarket, kalshiMarket] = await Promise.all([
        prisma.externalMarket.findUnique({ where: { id: battle.externalMarketId } }),
        prisma.externalMarket.findUnique({ where: { id: battle.kalshiMarketId } })
      ]);

      if (polyMarket?.status === 'resolved' && kalshiMarket?.status === 'resolved') {
        await settleBattle(battle);
        settledCount++;
      }
    } catch (error) {
      errors.push({ battleId: battle.id, error: error.message });
    }
  }

  return NextResponse.json({
    success: true,
    settledCount,
    errors
  });
}
```

**Vercel Cron Config (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/cron/settle-arbitrage-battles",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## UI Component Changes

### 1. Enhanced `CreateChallengeModal.tsx`

**New Features:**
- Market search with arbitrage detection
- Dual-warrior selection
- Price comparison display
- Profit calculator
- Real-time spread updates

**Key Sections:**

```tsx
// Market Search Section
<MarketSearchWithArbitrage
  onSelectMarket={(polyId, kalshiId, spread) => {
    setSelectedPolymarket(polyId);
    setSelectedKalshi(kalshiId);
    setArbitrageSpread(spread);
  }}
/>

// Dual-Warrior Selection
<DualWarriorSelector
  userWarriors={ownedWarriors}
  onSelectWarriors={(w1, w2) => {
    setWarrior1(w1);
    setWarrior2(w2);
  }}
/>

// Profit Preview
<ArbitrageProfitPreview
  polyPrice={polyPrice}
  kalshiPrice={kalshiPrice}
  totalStake={stakeAmount}
  spread={arbitrageSpread}
/>

// Create Button
<button onClick={createArbitrageBattle}>
  Create Battle & Execute Arbitrage
</button>
```

### 2. New Component: `MarketSearchWithArbitrage.tsx`

**Purpose:** Search markets and display arbitrage opportunities

**Features:**
- Debounced search input
- Side-by-side price comparison
- Visual spread indicator
- Profit percentage badge

**API Call:**
```typescript
const searchMarkets = async (query: string) => {
  const response = await fetch(`/api/arena/arbitrage-opportunities?search=${query}&minSpread=3`);
  const data = await response.json();
  setOpportunities(data.opportunities);
};
```

### 3. Enhanced `LiveBattleView.tsx`

**New Display Sections:**

```tsx
{battle.isArbitrageBattle && (
  <ArbitrageTrackingPanel
    arbitrageTradeId={battle.arbitrageTradeId}
    polymarketId={battle.externalMarketId}
    kalshiId={battle.kalshiMarketId}
  />
)}

// Shows:
// - Real-time order status (filled/pending)
// - Current market prices
// - Estimated P&L
// - Settlement countdown
```

---

## Implementation Phases

### Phase 3A: Database & Schema Updates (1 day)
**Tasks:**
1. Add `kalshiMarketId`, `arbitrageTradeId`, `isArbitrageBattle` to PredictionBattle
2. Add `predictionBattleId` to ArbitrageTrade
3. Create migration and apply
4. Generate Prisma client

**Files:**
- `prisma/schema.prisma`
- `prisma/migrations/YYYYMMDDHHMMSS_add_arbitrage_battle_link/migration.sql`

### Phase 3B: Backend Services (2 days)
**Tasks:**
1. Create `arbitrageBattleSettlement.ts` service
2. Modify `POST /api/arena/battles` for dual-warrior creation
3. Create `GET /api/arena/arbitrage-opportunities` endpoint
4. Create `POST /api/cron/settle-arbitrage-battles` endpoint
5. Add settlement monitoring logic

**Files:**
- `/src/services/arena/arbitrageBattleSettlement.ts` (NEW)
- `/src/app/api/arena/battles/route.ts` (MODIFY)
- `/src/app/api/arena/arbitrage-opportunities/route.ts` (NEW)
- `/src/app/api/cron/settle-arbitrage-battles/route.ts` (NEW)

### Phase 3C: UI Components (3 days)
**Tasks:**
1. Enhance `CreateChallengeModal.tsx` for dual-warrior selection
2. Create `MarketSearchWithArbitrage.tsx` component
3. Create `DualWarriorSelector.tsx` component
4. Create `ArbitrageProfitPreview.tsx` component
5. Create `ArbitrageTrackingPanel.tsx` component
6. Update `LiveBattleView.tsx` for arbitrage display

**Files:**
- `/src/components/arena/CreateChallengeModal.tsx` (MODIFY)
- `/src/components/arena/MarketSearchWithArbitrage.tsx` (NEW)
- `/src/components/arena/DualWarriorSelector.tsx` (NEW)
- `/src/components/arena/ArbitrageProfitPreview.tsx` (NEW)
- `/src/components/arena/ArbitrageTrackingPanel.tsx` (NEW)
- `/src/app/prediction-arena/battle/[id]/page.tsx` (MODIFY)

### Phase 3D: Testing & Integration (2 days)
**Tasks:**
1. Test dual-warrior battle creation
2. Test immediate bet execution
3. Test settlement with various outcomes
4. Test profit distribution logic
5. Test spectator betting integration

---

## Verification & Testing

### End-to-End Test Flow

1. **Create Arbitrage Battle**
   ```bash
   # Search for opportunities
   curl "http://localhost:3000/api/arena/arbitrage-opportunities?search=bitcoin&minSpread=5"

   # Create battle
   curl -X POST http://localhost:3000/api/arena/battles \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "0x123...",
       "warrior1Id": 42,
       "warrior2Id": 73,
       "polymarketId": "poly_abc",
       "kalshiId": "kalshi_xyz",
       "totalStake": "10000000000000000000",
       "isArbitrageBattle": true
     }'
   ```

2. **Verify Bet Execution**
   ```bash
   # Check ArbitrageTrade status
   curl "http://localhost:3000/api/arbitrage/trades/[tradeId]"

   # Should show both orders placed
   ```

3. **Simulate Debate Rounds**
   ```bash
   # Execute 5 rounds
   for i in {1..5}; do
     curl -X POST "http://localhost:3000/api/arena/battles/[battleId]/execute" \
       -H "Content-Type: application/json" \
       -d '{"mode": "round"}'
   done
   ```

4. **Mock Market Resolution**
   ```bash
   # Update external markets to resolved
   # (In production, this happens via sync)
   UPDATE ExternalMarket
   SET status='resolved', outcome='yes'
   WHERE id='poly_abc';

   UPDATE ExternalMarket
   SET status='resolved', outcome='no'
   WHERE id='kalshi_xyz';
   ```

5. **Trigger Settlement**
   ```bash
   # Run cron job
   curl -X POST http://localhost:3000/api/cron/settle-arbitrage-battles \
     -H "Authorization: Bearer ${CRON_SECRET}"
   ```

6. **Verify Payouts**
   ```bash
   # Check battle status
   curl "http://localhost:3000/api/arena/battles/[battleId]"

   # Check ArbitrageTrade profit
   curl "http://localhost:3000/api/arbitrage/trades/[tradeId]"

   # Verify CRwN balances updated correctly
   ```

### Expected Outcomes

**Example Scenario:**
- Polymarket YES: 45% ($4.50 invested)
- Kalshi NO: 48% ($4.80 invested)
- Total Cost: $9.30
- Warrior 1 wins debate (300 vs 200 score)
- Polymarket resolves YES, Kalshi resolves NO

**Payouts:**
1. **External Markets:**
   - Warrior 1 (Polymarket YES winner): $10.00
   - Warrior 2 (Kalshi NO winner): $10.00
   - Total: $20.00

2. **Arbitrage Profit:**
   - Total Payout: $20.00
   - Total Cost: $9.30
   - Profit: $10.70
   - Each Warrior: $5.35

3. **Debate Bonus:**
   - Spectator pool: $50 total ($30 on W1, $20 on W2)
   - Warrior 1 (debate winner): Gets share of losing pool
   - Bonus: ~$8.57 (calculated from pool distribution)

4. **Final Totals:**
   - Warrior 1 Owner: $10.00 + $5.35 + $8.57 = $23.92
   - Warrior 2 Owner: $10.00 + $5.35 = $15.35
   - Total Profit: $29.97 (from $9.30 investment + spectator fees)

---

## Risk Mitigation

### 1. Order Execution Failures
**Risk:** One order fails while other succeeds
**Mitigation:**
- Wrap both orders in transaction
- If either fails, cancel both and refund
- Log failure for manual review

### 2. Price Slippage
**Risk:** Prices change between display and execution
**Mitigation:**
- Set max slippage tolerance (2%)
- Use limit orders with price caps
- Show warning if spread dropped below profitable

### 3. Settlement Race Conditions
**Risk:** Multiple settlements triggered simultaneously
**Mitigation:**
- Use database row locking
- Check status before settlement
- Idempotent settlement logic

### 4. Partial Market Resolution
**Risk:** One market resolves, other delays
**Mitigation:**
- Monitor both markets independently
- Only settle when both confirmed
- Timeout after 30 days → manual intervention

---

## Success Metrics

### Arena-Integrated Betting
- ✅ Users can create arbitrage battles with 2 warriors
- ✅ Bets execute immediately on both platforms
- ✅ Real-time order status tracking
- ✅ Automatic settlement when markets resolve
- ✅ Correct profit distribution (arbitrage + debate)

### User Experience
- ✅ Battle creation in <5 clicks
- ✅ Visual arbitrage opportunity display
- ✅ Clear profit projection
- ✅ Transparent settlement breakdown
- ✅ Spectator betting preserved

### Technical Performance
- ✅ Order execution <10 seconds
- ✅ Settlement processing <30 seconds
- ✅ 99%+ uptime for monitoring
- ✅ No duplicate settlements
- ✅ Accurate P&L calculations

---

## Summary

This plan transforms Prediction Arena battles into **active arbitrage vehicles**:

1. **Unified Experience**: One action creates battle + executes arbitrage
2. **Dual Warrior System**: Both warriors work together for profit
3. **Immediate Execution**: No waiting for opponent acceptance
4. **Hybrid Rewards**: External winnings + arbitrage profit + debate bonus
5. **Spectator Entertainment**: Debate battles remain engaging
6. **Automated Settlement**: Background monitoring and payout distribution

**Key Innovation**: Warriors aren't just debating—they're **actively trading** on behalf of their owners while providing entertainment value through debate mechanics.

**Implementation Status:**
- ✅ Phase 1 & 2: Database, services, APIs complete
- ⏳ Phase 3A-D: Arena integration (8 days estimated)

Ready to proceed with implementation.
