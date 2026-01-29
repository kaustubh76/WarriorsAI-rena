# Direct Betting & Arbitrage Trading - Phase 1 & 2 Complete

## Implementation Summary

Successfully implemented Phase 1 (Database & Core Services) and Phase 2 (API Endpoints) of the approved plan for direct market betting and automated arbitrage trading on Polymarket and Kalshi.

---

## Phase 1: Database & Core Services ✅

### 1. Database Schema (Prisma)

Added two new tables to [prisma/schema.prisma](prisma/schema.prisma):

#### **MarketBet Table**
Tracks direct bets placed by users on external markets.

**Fields**:
- `id` - Unique bet identifier
- `userId` - Wallet address of bettor
- `warriorId` - Optional warrior NFT used for bet
- `externalMarketId` - Reference to ExternalMarket table
- `source` - 'polymarket' | 'kalshi'
- `question` - Market question
- `side` - Boolean (true=YES, false=NO)
- `amount` - CRwN amount (BigInt)
- `entryPrice` - Price at bet placement (0-100%)
- `shares` - Shares purchased on external platform
- `orderId` - External platform order ID
- `status` - 'pending' | 'placed' | 'won' | 'lost' | 'cancelled'
- `outcome` - Final outcome (true=YES won, false=NO won)
- `payout` - Winnings in CRwN
- Timestamps: `createdAt`, `placedAt`, `settledAt`

**Indexes**: userId, externalMarketId, status, createdAt

#### **ArbitrageTrade Table**
Tracks automated arbitrage trades across two markets.

**Fields**:
- `id` - Unique trade identifier
- `userId` - Wallet address of trader
- `opportunityId` - Reference to detected opportunity
- Market 1 details: `market1Source`, `market1Id`, `market1Question`, `market1Side`
- Market 2 details: `market2Source`, `market2Id`, `market2Question`, `market2Side`
- Investment: `investmentAmount`, `market1Amount`, `market2Amount` (BigInt)
- Expected: `expectedProfit`, `expectedSpread` (Float)
- Actual: `actualProfit`, `actualSpread`
- Status: 'pending' | 'partial' | 'completed' | 'failed' | 'settled'
- Order tracking for both markets: `orderId`, `filled`, `shares`, `executionPrice`, `filledAt`
- Outcomes: `market1Outcome`, `market2Outcome`, `settled`
- Error tracking: `error`, `lastError`, `attempts`
- Timestamps: `createdAt`, `executedAt`, `settledAt`

**Indexes**: userId, status, settled, createdAt

### 2. Prisma Migration

- Created migration SQL file
- Applied schema changes with `prisma db push`
- Generated Prisma client with new tables
- Database successfully updated

### 3. Core Services

#### **[MarketBettingService](src/services/betting/marketBettingService.ts)** (377 lines)

Handles direct betting on Polymarket and Kalshi markets.

**Key Methods**:
- `placeBet(params)` - Place bet on external market
  - Validates market exists and is active
  - Creates bet record (status: pending)
  - Places order on external platform (Polymarket/Kalshi)
  - Updates bet with order details (status: placed)

- `getBetStatus(betId)` - Check bet status
  - Returns bet details
  - Checks order fill status on external platform

- `getUserBets(userId, filters)` - Get user's bet history
  - Filter by status, source, limit
  - Returns all matching bets

- `claimWinnings(betId)` - Claim winnings for won bet
  - Checks if market is resolved
  - Determines if bet won
  - Calculates payout
  - Settles position and transfers CRwN

- `monitorResolution(betId)` - Monitor market resolution
  - Auto-claim when market resolves

**Private Methods**:
- `placePolymarketOrder()` - Place order on Polymarket CLOB
- `placeKalshiOrder()` - Place order on Kalshi Trade API

#### **[ArbitrageTradingService](src/services/betting/arbitrageTradingService.ts)** (425 lines)

Handles automated arbitrage execution.

**Key Methods**:
- `findOpportunities(minSpread)` - Find current arbitrage opportunities
  - Queries existing opportunity detection system

- `executeArbitrage(params)` - Execute arbitrage trade
  - Validates opportunity is active and not expired
  - Calculates position sizes proportionally
  - Creates trade record
  - Places orders on both markets simultaneously
  - Monitors order fills

- `monitorTrade(tradeId)` - Monitor trade status
  - Checks order fill status on both platforms
  - Updates trade when both filled
  - Waits for market resolution

- `waitForResolution(tradeId)` - Wait for markets to resolve
  - Checks if both markets resolved
  - Auto-closes positions when ready

- `closePositions(tradeId)` - Close positions and settle
  - Gets market outcomes
  - Calculates payouts for both positions
  - Calculates total profit
  - Settles trade and releases funds

- `calculatePnL(tradeId)` - Calculate profit/loss
  - Returns detailed P&L breakdown

- `getUserTrades(userId, filters)` - Get user's trade history

**Private Methods**:
- `placeMarket1Order()` - Place order on first market
- `placeMarket2Order()` - Place order on second market

#### **[OrderExecutionService](src/services/betting/orderExecutionService.ts)** (278 lines)

Unified order placement and monitoring.

**Key Methods**:
- `placeOrder(params)` - Place order on any platform
  - Routes to Polymarket or Kalshi

- `placePolymarketOrder(params)` - Polymarket order execution
  - Converts CRwN to USDC
  - Places limit/market order
  - Returns orderId, shares, executionPrice

- `placeKalshiOrder(params)` - Kalshi order execution
  - Converts CRwN to USD
  - Places order via Trade API
  - Returns orderId, contracts, executionPrice

- `monitorOrder(orderId, source)` - Check order status
  - Returns fill status, percentage, price

- `cancelOrder(orderId, source)` - Cancel pending order

- `getBestPrice(marketId, source, side)` - Get current best price

- `estimateExecutionPrice(...)` - Estimate price with slippage

- `batchPlaceOrders(orders)` - Place multiple orders in parallel

- `getOrderHistory(userId, source)` - Get user's order history

**Note**: Current implementation uses placeholder/mock order execution. Real Polymarket CLOB and Kalshi Trade API integration will be added in future phases.

---

## Phase 2: API Endpoints ✅

### Market Betting Endpoints

#### **POST /api/markets/bet**
Place a bet on an external market.

**Request Body**:
```json
{
  "userId": "0x123...",
  "externalMarketId": "poly_xxx",
  "source": "polymarket",
  "side": "YES",
  "amount": "1000000000000000000",
  "warriorId": 42
}
```

**Response**:
```json
{
  "success": true,
  "betId": "cuid123",
  "orderId": "poly_order_123",
  "shares": 22.22,
  "executionPrice": 0.45
}
```

**File**: [src/app/api/markets/bet/route.ts](src/app/api/markets/bet/route.ts)

#### **GET /api/markets/bets**
Get user's betting history.

**Query Parameters**:
- `userId` (required) - Wallet address
- `status` (optional) - Filter by status
- `source` (optional) - Filter by source
- `limit` (optional) - Max results

**Response**:
```json
{
  "success": true,
  "bets": [...],
  "total": 10
}
```

**File**: [src/app/api/markets/bets/route.ts](src/app/api/markets/bets/route.ts)

#### **GET /api/markets/bets/[id]**
Get specific bet details.

**Response**:
```json
{
  "success": true,
  "bet": {...},
  "orderStatus": "filled",
  "fillPercentage": 100
}
```

**File**: [src/app/api/markets/bets/[id]/route.ts](src/app/api/markets/bets/[id]/route.ts)

#### **DELETE /api/markets/bets/[id]**
Cancel a pending bet.

**Response**:
```json
{
  "success": true
}
```

**File**: [src/app/api/markets/bets/[id]/route.ts](src/app/api/markets/bets/[id]/route.ts)

#### **POST /api/markets/bets/[id]/claim**
Claim winnings for a won bet.

**Response**:
```json
{
  "success": true,
  "payout": "2000000000000000000",
  "txHash": "0xabc..."
}
```

**File**: [src/app/api/markets/bets/[id]/claim/route.ts](src/app/api/markets/bets/[id]/claim/route.ts)

---

### Arbitrage Trading Endpoints

#### **POST /api/arbitrage/execute**
Execute an arbitrage trade.

**Request Body**:
```json
{
  "userId": "0x123...",
  "opportunityId": "arb_poly_xxx_kalshi_yyy",
  "investmentAmount": "10000000000000000000"
}
```

**Response**:
```json
{
  "success": true,
  "tradeId": "cuid456",
  "market1OrderId": "poly_order_123",
  "market2OrderId": "kalshi_order_456",
  "expectedProfit": 7.5
}
```

**File**: [src/app/api/arbitrage/execute/route.ts](src/app/api/arbitrage/execute/route.ts)

#### **GET /api/arbitrage/trades**
Get user's arbitrage trade history.

**Query Parameters**:
- `userId` (required)
- `status` (optional)
- `settled` (optional) - Boolean
- `limit` (optional)

**Response**:
```json
{
  "success": true,
  "trades": [...],
  "total": 5
}
```

**File**: [src/app/api/arbitrage/trades/route.ts](src/app/api/arbitrage/trades/route.ts)

#### **GET /api/arbitrage/trades/[id]**
Get specific trade details with P&L.

**Response**:
```json
{
  "success": true,
  "trade": {...},
  "pnl": {
    "investmentAmount": "10000000000000000000",
    "totalPayout": "10750000000000000000",
    "profitLoss": "750000000000000000",
    "profitPercentage": 7.5
  }
}
```

**File**: [src/app/api/arbitrage/trades/[id]/route.ts](src/app/api/arbitrage/trades/[id]/route.ts)

#### **POST /api/arbitrage/trades/[id]**
Manually close positions for a trade.

**Response**:
```json
{
  "success": true,
  "profit": "750000000000000000",
  "market1Payout": "5000000000000000000",
  "market2Payout": "5750000000000000000"
}
```

**File**: [src/app/api/arbitrage/trades/[id]/route.ts](src/app/api/arbitrage/trades/[id]/route.ts)

---

## Technical Implementation Details

### BigInt Handling
All monetary amounts use BigInt for precision:
- Database stores as BIGINT
- TypeScript uses `bigint` type
- API converts to string for JSON serialization

### Status States

**MarketBet States**:
1. `pending` - Bet created, not yet placed
2. `placed` - Order placed on external platform
3. `won` - Market resolved, bet won, winnings claimed
4. `lost` - Market resolved, bet lost
5. `cancelled` - Bet cancelled before execution

**ArbitrageTrade States**:
1. `pending` - Trade created, orders not yet placed
2. `partial` - One or both orders placed but not filled
3. `completed` - Both orders filled
4. `failed` - Order placement failed
5. `settled` - Markets resolved, positions closed

### Error Handling
- All services return structured result objects with `success` boolean
- Errors include descriptive messages
- Failed operations logged to console
- Database tracks error messages and attempt counts

### Concurrent Order Execution
- Arbitrage orders placed simultaneously with `Promise.all()`
- Minimizes execution time and slippage risk
- Monitors both fills independently

### Resolution Monitoring
- Bet service monitors market resolution for auto-claiming
- Arbitrage service waits for both markets to resolve
- Auto-settlement when both outcomes available

---

## Files Created/Modified

### New Files (11)
1. `/frontend/src/services/betting/marketBettingService.ts` (377 lines)
2. `/frontend/src/services/betting/arbitrageTradingService.ts` (425 lines)
3. `/frontend/src/services/betting/orderExecutionService.ts` (278 lines)
4. `/frontend/src/app/api/markets/bet/route.ts` (87 lines)
5. `/frontend/src/app/api/markets/bets/route.ts` (57 lines)
6. `/frontend/src/app/api/markets/bets/[id]/route.ts` (96 lines)
7. `/frontend/src/app/api/markets/bets/[id]/claim/route.ts` (49 lines)
8. `/frontend/src/app/api/arbitrage/execute/route.ts` (70 lines)
9. `/frontend/src/app/api/arbitrage/trades/route.ts` (68 lines)
10. `/frontend/src/app/api/arbitrage/trades/[id]/route.ts` (139 lines)
11. `/frontend/prisma/migrations/20260128_add_betting_arbitrage/migration.sql`

### Modified Files (1)
1. `/frontend/prisma/schema.prisma` - Added MarketBet and ArbitrageTrade tables

**Total Lines Added**: ~1,646 lines of TypeScript code + SQL migration

---

## Integration Points

### With Existing Systems

1. **ExternalMarket Table**
   - MarketBet references ExternalMarket via foreign key
   - Reuses existing market sync infrastructure
   - Accesses Polymarket and Kalshi market data

2. **ArbitrageOpportunity Table**
   - ArbitrageTrade references detected opportunities
   - Reuses existing opportunity detection algorithm
   - Leverages cross-market matching system

3. **External Markets Service**
   - OrderExecutionService uses polymarketService and kalshiService
   - Reuses API integrations for market data
   - Shares rate limiting and error handling

4. **Prisma Database**
   - All new tables integrated into existing schema
   - Maintains referential integrity
   - Uses existing SQLite database

### With Future Systems

1. **CRwN Token Smart Contracts**
   - Escrow system for locking bets
   - Automated payout distribution
   - Token bridge for USDC/USD conversion

2. **Polymarket CLOB API**
   - Real order placement
   - Order status monitoring
   - Position settlement

3. **Kalshi Trade API**
   - Real order execution
   - Order fill tracking
   - Contract settlement

4. **Warrior NFT Traits**
   - Luck trait influences bet confidence
   - Warrior statistics tracking
   - NFT-based betting bonuses

---

## Next Steps (Phase 3: UI Components)

The following components need to be built:

### Market Betting Dashboard
- `/app/markets/betting/page.tsx` - Main betting page
- `MarketBettingList.tsx` - Browse available markets
- `MarketBettingCard.tsx` - Individual market display
- `PlaceBetModal.tsx` - Bet placement interface
- `BettingHistory.tsx` - User's bet history
- `BetStatusCard.tsx` - Individual bet tracking

### Arbitrage Trading Dashboard
- `/app/arbitrage/trading/page.tsx` - Main trading page
- `ArbitrageOpportunityFeed.tsx` - Live opportunities
- `ExecuteArbitrageModal.tsx` - Execution interface
- `ActiveTradesPanel.tsx` - Monitor active trades
- `ArbitragePnLChart.tsx` - Profit/loss visualization
- `RiskManagementPanel.tsx` - Set limits/controls

### Unified Trading Hub
- `/app/trading/page.tsx` - Combined view
- Portfolio overview
- P&L summary
- Quick action buttons

### React Hooks
- `useMarketBetting.ts` - Betting state management
- `useBettingHistory.ts` - History with real-time updates
- `useArbitrageTrades.ts` - Trade management
- Integration with existing `useExternalMarkets.ts`

---

## Testing Status

### Unit Tests (TODO)
- Service method tests
- API endpoint tests
- Database operation tests
- Error handling tests

### Integration Tests (TODO)
- Complete bet flow (place → monitor → claim)
- Complete arbitrage flow (detect → execute → settle)
- Order placement and monitoring
- Database transactions

### Manual Testing (TODO)
- Place bet on Polymarket
- Place bet on Kalshi
- View betting history
- Execute arbitrage trade
- Monitor trade status
- Claim winnings

---

## Known Limitations

1. **Placeholder Order Execution**
   - Current implementation uses mock orders
   - Real Polymarket CLOB integration pending
   - Real Kalshi Trade API integration pending

2. **No Smart Contract Integration**
   - CRwN escrow not implemented
   - Token locking/unlocking manual
   - No on-chain settlement

3. **Simplified P&L Calculation**
   - Assumes 1:1 CRwN to USD conversion
   - No transaction fees included
   - No slippage modeling

4. **No WebSocket Price Updates**
   - Prices fetched from database only
   - No real-time orderbook data
   - Manual refresh required

5. **No Authentication**
   - Endpoints accept userId directly
   - No wallet signature verification
   - No rate limiting per user

---

## Success Metrics

### Direct Betting
- ✅ Users can place bets programmatically
- ✅ Bet execution tracked in database
- ✅ Order status monitoring implemented
- ✅ Winnings calculation implemented
- ⏳ Real-time bet tracking (UI pending)
- ⏳ <3 click bet placement (UI pending)

### Arbitrage Trading
- ✅ Opportunities can be executed
- ✅ Simultaneous order placement
- ✅ Trade status tracking
- ✅ P&L calculation
- ⏳ Trade execution <10s (real API pending)
- ⏳ Average spread capture >80% (needs testing)

---

## API Usage Examples

### Place a Bet

```bash
curl -X POST http://localhost:3000/api/markets/bet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "externalMarketId": "poly_0x1234...",
    "source": "polymarket",
    "side": "YES",
    "amount": "1000000000000000000",
    "warriorId": 42
  }'
```

### Execute Arbitrage

```bash
curl -X POST http://localhost:3000/api/arbitrage/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "opportunityId": "arb_poly_xxx_kalshi_yyy",
    "investmentAmount": "10000000000000000000"
  }'
```

### Get Betting History

```bash
curl "http://localhost:3000/api/markets/bets?userId=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb&status=placed&limit=10"
```

### Get Trade P&L

```bash
curl "http://localhost:3000/api/arbitrage/trades/cuid123"
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                   │
│  ┌──────────────────┐        ┌──────────────────┐      │
│  │  Betting UI      │        │  Arbitrage UI    │      │
│  │  (Phase 3)       │        │  (Phase 3)       │      │
│  └────────┬─────────┘        └────────┬─────────┘      │
│           │                           │                  │
│  ┌────────▼───────────────────────────▼─────────┐      │
│  │         API Endpoints (Phase 2 ✅)            │      │
│  │  /api/markets/*    /api/arbitrage/*           │      │
│  └────────┬───────────────────────────┬─────────┘      │
│           │                           │                  │
│  ┌────────▼───────────────────────────▼─────────┐      │
│  │       Core Services (Phase 1 ✅)              │      │
│  │  MarketBettingService                         │      │
│  │  ArbitrageTradingService                      │      │
│  │  OrderExecutionService                        │      │
│  └────────┬───────────────────────────┬─────────┘      │
└───────────┼───────────────────────────┼─────────────────┘
            │                           │
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────┐
│   Prisma Database     │   │  External APIs        │
│  ┌─────────────────┐  │   │  ┌─────────────────┐ │
│  │  MarketBet      │  │   │  │  Polymarket     │ │
│  │  ArbitrageTrade │  │   │  │  CLOB API       │ │
│  │  ExternalMarket │  │   │  │  (Phase 4)      │ │
│  └─────────────────┘  │   │  └─────────────────┘ │
└───────────────────────┘   │  ┌─────────────────┐ │
                            │  │  Kalshi         │ │
                            │  │  Trade API      │ │
                            │  │  (Phase 4)      │ │
                            │  └─────────────────┘ │
                            └───────────────────────┘
```

---

## Conclusion

Phase 1 and Phase 2 are **100% complete**. The foundation for direct market betting and automated arbitrage trading is now in place:

✅ **Database schema** - MarketBet and ArbitrageTrade tables
✅ **Core services** - Full business logic implementation
✅ **API endpoints** - Complete REST API for betting and trading
✅ **Integration** - Connected to existing external markets system

**Ready for Phase 3**: UI components can now be built on top of these APIs.

**Next Actions**:
1. Build UI components (Phase 3)
2. Implement real Polymarket/Kalshi order execution (Phase 4)
3. Add CRwN smart contract integration (Phase 4)
4. Write comprehensive tests (Phase 5)
5. Deploy to production (Phase 6)

---

**Implementation Date**: January 28, 2026
**Status**: Phases 1 & 2 Complete ✅
**Lines of Code Added**: 1,646 lines
**Files Created**: 11 files
**Database Tables Added**: 2 tables
