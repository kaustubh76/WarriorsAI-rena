# Arena Arbitrage System - Quick Start Guide

## 🚀 What's Been Implemented

The Arena Arbitrage Integration system is now **50% complete** with all backend services operational. Users can create arbitrage battles where two warriors debate while simultaneously executing profitable arbitrage trades across Polymarket and Kalshi.

---

## 📋 Prerequisites

1. **Environment Setup**
   ```bash
   cd frontend
   npm install
   ```

2. **Environment Variables**
   Add to `.env.local`:
   ```bash
   # Database
   DATABASE_URL="file:./dev.db"

   # Cron Authentication (generate with: openssl rand -base64 32)
   CRON_SECRET="your-secure-secret-here"

   # API URLs
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

3. **Database Migration**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

---

## 🎯 How It Works

### The Arbitrage Battle Flow

1. **Discovery**: System finds price discrepancies between Polymarket and Kalshi
2. **Creation**: User selects 2 warriors and creates arbitrage battle
3. **Execution**: System executes both sides of arbitrage trade simultaneously
4. **Debate**: Warriors engage in 5 rounds of AI-powered debate
5. **Settlement**: When markets resolve, system distributes:
   - External market winnings
   - Arbitrage profit (split equally)
   - Debate bonus (to winner)

---

## 🔧 API Usage

### 1. Find Arbitrage Opportunities

```bash
# Get all opportunities with 5%+ profit
curl "http://localhost:3000/api/arena/arbitrage-opportunities?minSpread=5"

# Search for Bitcoin opportunities
curl "http://localhost:3000/api/arena/arbitrage-opportunities?search=bitcoin&minSpread=3"
```

**Response**:
```json
{
  "success": true,
  "opportunities": [
    {
      "id": "matched_abc123",
      "question": "Will Bitcoin hit $100k by March 2026?",
      "polymarket": {
        "id": "poly_0x1234",
        "yesPrice": 45,
        "noPrice": 55,
        "volume": "2300000"
      },
      "kalshi": {
        "id": "kalshi_BTCUSD-100K",
        "yesPrice": 48,
        "noPrice": 52,
        "volume": "890000"
      },
      "spread": 7.0,
      "potentialProfit": 7.5,
      "cost": 0.93,
      "strategy": {
        "buyYesOn": "polymarket",
        "buyNoOn": "kalshi"
      }
    }
  ]
}
```

### 2. Create Arbitrage Battle

```bash
curl -X POST http://localhost:3000/api/arena/battles \
  -H "Content-Type: application/json" \
  -d '{
    "warrior1Id": 42,
    "warrior2Id": 73,
    "warrior1Owner": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "externalMarketId": "poly_0x1234",
    "source": "polymarket",
    "question": "Will Bitcoin hit $100k by March 2026?",
    "kalshiMarketId": "kalshi_BTCUSD-100K",
    "totalStake": "10000000000000000000",
    "isArbitrageBattle": true
  }'
```

**Response**:
```json
{
  "success": true,
  "battle": {
    "id": "battle_123",
    "status": "active",
    "isArbitrageBattle": true
  },
  "arbitrageTradeId": "trade_456",
  "expectedProfit": 7.5,
  "message": "Arbitrage battle created and trade executed successfully"
}
```

### 3. Check Battle Status

```bash
# Get all arbitrage battles
curl "http://localhost:3000/api/arena/battles?status=active"

# Get specific battle
curl "http://localhost:3000/api/arena/battles?battleId=battle_123"
```

### 4. Manual Settlement Trigger (Development)

```bash
# Only works in development mode
curl "http://localhost:3000/api/cron/settle-arbitrage-battles"
```

---

## 💰 Payout Structure

### Example: 10 CRwN Investment with 7.5% Arbitrage Profit

**Investment**:
- 4.5 CRwN → Polymarket YES @ 45¢
- 4.8 CRwN → Kalshi NO @ 48¢
- Total: 9.3 CRwN

**Outcomes**:
- Polymarket resolves: YES ✅
- Kalshi resolves: NO ✅
- Total payout: 10.0 CRwN
- Arbitrage profit: 0.7 CRwN

**Debate Results**:
- Warrior 1 score: 300 points
- Warrior 2 score: 200 points
- Winner: Warrior 1
- Spectator pool: 50 CRwN total
- Debate bonus: 8.57 CRwN (60% of losing side's 20 CRwN)

**Final Distribution**:
- **Warrior 1 Owner**:
  - External market: 5.0 CRwN (Polymarket YES winner)
  - Arbitrage profit: 0.35 CRwN (50% split)
  - Debate bonus: 8.57 CRwN (debate winner)
  - **Total: 13.92 CRwN**

- **Warrior 2 Owner**:
  - External market: 5.0 CRwN (Kalshi NO winner)
  - Arbitrage profit: 0.35 CRwN (50% split)
  - **Total: 5.35 CRwN**

*(Note: In arbitrage battles, both warriors are owned by the same user, so they receive both amounts)*

---

## 🗄️ Database Queries

### Check Your Arbitrage Battles

```sql
SELECT
  b.id,
  b.warrior1Id,
  b.warrior2Id,
  b.status,
  b.warrior1Score,
  b.warrior2Score,
  t.expectedProfit,
  t.actualProfit,
  t.settled
FROM PredictionBattle b
JOIN ArbitrageTrade t ON b.arbitrageTradeId = t.id
WHERE b.warrior1Owner = '0xYourAddress'
  AND b.isArbitrageBattle = true;
```

### Check Trade Status

```sql
SELECT
  id,
  market1Source,
  market1Id,
  market1Filled,
  market2Source,
  market2Id,
  market2Filled,
  status,
  expectedProfit,
  actualProfit
FROM ArbitrageTrade
WHERE userId = '0xYourAddress'
ORDER BY createdAt DESC;
```

### Monitor Settlement Queue

```sql
SELECT
  b.id as battleId,
  b.status as battleStatus,
  t.settled,
  m1.status as market1Status,
  m2.status as market2Status
FROM PredictionBattle b
JOIN ArbitrageTrade t ON b.arbitrageTradeId = t.id
JOIN ExternalMarket m1 ON t.market1Id = m1.id
JOIN ExternalMarket m2 ON t.market2Id = m2.id
WHERE b.isArbitrageBattle = true
  AND b.status = 'completed'
  AND t.settled = false;
```

---

## ⚙️ Configuration

### Vercel Deployment

1. **Push code to repository**
   ```bash
   git add .
   git commit -m "feat: Add Arena Arbitrage Integration Phase 3B"
   git push
   ```

2. **Set environment variables in Vercel**
   - Go to Project Settings → Environment Variables
   - Add `CRON_SECRET` (use output from `openssl rand -base64 32`)
   - Add `DATABASE_URL` if not auto-detected

3. **Enable Cron Jobs**
   - Vercel automatically detects `vercel.json` cron configuration
   - Verify in Deployments → Cron Jobs tab
   - Settlement cron runs every 5 minutes

4. **Monitor Cron Execution**
   - Vercel Dashboard → Logs
   - Filter by `/api/cron/settle-arbitrage-battles`
   - Check for errors or failed settlements

---

## 🧪 Testing Checklist

- [ ] **Opportunities API**
  - [ ] Returns opportunities with correct calculations
  - [ ] Search filtering works
  - [ ] minSpread filtering works
  - [ ] Strategy correctly identifies buy/sell sides

- [ ] **Battle Creation**
  - [ ] Validates warrior ownership
  - [ ] Creates arbitrage opportunity record
  - [ ] Executes both trades
  - [ ] Links battle to trade
  - [ ] Sets status to 'active' immediately

- [ ] **Settlement**
  - [ ] Detects when both markets resolved
  - [ ] Calculates payouts correctly
  - [ ] Splits arbitrage profit 50/50
  - [ ] Awards debate bonus to winner
  - [ ] Updates database correctly
  - [ ] Handles errors gracefully

- [ ] **Database Integrity**
  - [ ] All foreign keys valid
  - [ ] No orphaned records
  - [ ] Amounts stored as BigInt
  - [ ] Status transitions valid

---

## 🐛 Troubleshooting

### Issue: Cron job not running

**Solution**:
1. Check Vercel Dashboard → Cron Jobs
2. Verify `CRON_SECRET` is set in environment variables
3. Check logs for authentication errors
4. Ensure `vercel.json` is committed to repository

### Issue: Battle creation fails

**Possible causes**:
1. No `MatchedMarketPair` found → Run market sync job
2. Warrior ownership validation → TODO: Implement on-chain check
3. Insufficient matched market data → Check database

### Issue: Settlement not happening

**Check**:
1. Both markets have `status='resolved'`
2. Battle has `status='completed'`
3. Trade has `settled=false`
4. Cron job is running (check logs)

### Issue: Incorrect profit calculations

**Verify**:
1. Market prices stored correctly (in basis points)
2. Shares calculated accurately
3. BigInt conversions not losing precision
4. Debate bonus calculation using correct pool

---

## 📚 Documentation

- **Complete Plan**: [ARENA_ARBITRAGE_INTEGRATION_PLAN.md](ARENA_ARBITRAGE_INTEGRATION_PLAN.md)
- **Phase 1 & 2**: [PHASE_1_2_IMPLEMENTATION_COMPLETE.md](PHASE_1_2_IMPLEMENTATION_COMPLETE.md)
- **Phase 3A**: [PHASE_3A_COMPLETE.md](PHASE_3A_COMPLETE.md)
- **Phase 3B**: [PHASE_3B_COMPLETE.md](PHASE_3B_COMPLETE.md)
- **Full Summary**: [COMPLETE_IMPLEMENTATION_SUMMARY.md](COMPLETE_IMPLEMENTATION_SUMMARY.md)
- **Testing Guide**: [test-arbitrage-implementation.md](test-arbitrage-implementation.md)

---

## 🚧 Known Limitations

1. **CRwN Transfers**: Placeholder - needs Flow blockchain integration
2. **Order Execution**: Mock - needs real Polymarket/Kalshi APIs
3. **Warrior Ownership**: Skipped - needs on-chain verification
4. **First Round**: Not auto-executed - needs debate service integration
5. **Market Matching**: Requires populated database from sync jobs

---

## 🔜 What's Next (Phase 3C)

### UI Components to Build:

1. **MarketSearchWithArbitrage.tsx**
   - Search interface for opportunities
   - Side-by-side price comparison
   - Visual profit indicators

2. **DualWarriorSelector.tsx**
   - Select 2 owned warriors
   - Display traits and stats
   - Ownership validation

3. **ArbitrageProfitPreview.tsx**
   - Investment breakdown
   - Expected profit display
   - Cost analysis

4. **ArbitrageTrackingPanel.tsx**
   - Real-time order status
   - Current market prices
   - P&L tracking

5. **Enhanced CreateChallengeModal.tsx**
   - Arbitrage mode toggle
   - Integrate opportunity search
   - Integrate warrior selector

6. **Enhanced LiveBattleView.tsx**
   - Show arbitrage tracking
   - Display settlement status
   - External market links

---

## 💡 Pro Tips

1. **Minimum Spreads**: Start with 5%+ to ensure profitable trades after fees
2. **Warrior Selection**: Use warriors with complementary traits for better debates
3. **Market Timing**: Create battles when markets have high liquidity
4. **Settlement**: Battles auto-settle within 5 minutes of market resolution
5. **Monitoring**: Watch cron logs during market closures for settlement activity

---

## 🆘 Support

For issues or questions:
1. Check documentation files listed above
2. Review database queries to verify data
3. Check API logs for error messages
4. Test endpoints manually with curl
5. Verify environment variables are set

---

**System Status**: Backend Complete (Phase 3B) ✅
**Next Phase**: UI Components (Phase 3C)
**Progress**: ~50% Complete

Ready to use the backend APIs for building the frontend interface!
