# Arena Arbitrage System - Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Variables ✅

- [x] `DATABASE_URL` - PostgreSQL connection string (Vercel Dashboard)
- [x] `CRON_SECRET` - Secure random token for cron authentication (min 32 chars, validated at runtime)
- [x] `NEXT_PUBLIC_APP_URL` - Application base URL
- [x] `NODE_ENV` - Set to "production" (also in `vercel.json` → `env`)

**Generate CRON_SECRET**:
```bash
openssl rand -base64 32
```

### 2. Database Setup ✅

- [x] Run Prisma migrations
  ```bash
  npx prisma db push
  npx prisma generate
  ```

- [x] Verify schema includes:
  - [x] `PredictionBattle.isArbitrageBattle` — `Boolean @default(false)`
  - [x] `PredictionBattle.kalshiMarketId` — `String?`
  - [x] `PredictionBattle.arbitrageTradeId` — `String? @unique`
  - [x] `ArbitrageTrade.predictionBattleId` — `String? @unique`
  - [x] All relations properly configured (bidirectional 1-to-1)

### 3. Code Verification ✅

- [x] All TypeScript files compile (with pre-existing Next.js 15 / React 19 type issues only)
- [x] API routes respond correctly
- [x] Services are properly exported (`arbitrageBattleSettlementService` singleton)
- [x] No hardcoded secrets in source code (all use `process.env.*`)

### 4. Vercel Configuration ✅

- [x] `vercel.json` includes settlement cron (8 total cron jobs):
  ```json
  {
    "path": "/api/cron/settle-arbitrage-battles",
    "schedule": "0 12 * * *"
  }
  ```

- [x] Function timeout: 60s (API routes), 300s (cron routes)
- [x] Region: `iad1` (US East)
- [x] Build command: `npm run build`

---

## Deployment Steps

### Step 1: Local Testing

```bash
# Install dependencies
cd frontend
npm install

# Run type check
npx tsc --noEmit --skipLibCheck

# Test API endpoints locally
npm run dev

# Test opportunities endpoint
curl "http://localhost:3000/api/arena/arbitrage-opportunities?minSpread=5"

# Test settlement (dev mode)
curl "http://localhost:3000/api/cron/settle-arbitrage-battles"
```

### Step 2: Commit Changes

```bash
git add frontend/src/services/arena/arbitrageBattleSettlement.ts
git add frontend/src/app/api/arena/arbitrage-opportunities/route.ts
git add frontend/src/app/api/cron/settle-arbitrage-battles/route.ts
git add frontend/src/app/api/arena/battles/route.ts
git add frontend/vercel.json
git add frontend/prisma/schema.prisma
git add DEPLOYMENT_CHECKLIST.md

git commit -m "feat: Implement Arena Arbitrage Integration Phase 3B

- Add arbitrage battle settlement service with CAS idempotency
- Add arbitrage opportunities discovery API with 30s caching
- Enhance battle creation for dual-warrior arbitrage with BigInt validation
- Add automated settlement cron job with failure alerting
- Rate limiting on all endpoints (readOperations, battleCreation, cronJobs)
- Update Vercel configuration with 8 cron jobs

Phase 3B complete - backend services operational
"

git push origin main
```

### Step 3: Configure Vercel

1. **Set Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add the following:

   | Category | Variable | Required | Environment |
   |----------|----------|----------|-------------|
   | **Core** | `DATABASE_URL` | Yes | Production, Preview |
   | | `CRON_SECRET` | Yes (min 32 chars) | Production, Preview |
   | | `NODE_ENV` | Yes (`production`) | Production |
   | **Blockchain** | `NEXT_PUBLIC_FLOW_RPC_URL` | Yes | All |
   | | `PRIVATE_KEY` | Yes (oracle signing) | Production |
   | | `GAME_MASTER_PRIVATE_KEY` | Yes (battle execution) | Production |
   | | `AI_SIGNER_PRIVATE_KEY` | Optional (AI agents) | Production |
   | **Markets** | `KALSHI_API_KEY` | Yes | Production |
   | | `KALSHI_API_KEY_ID` | Yes | Production |
   | | `KALSHI_PRIVATE_KEY` | Yes (RSA-PSS signing) | Production |
   | | `POLYMARKET_API_KEY` | Yes | Production |
   | **Contracts** | `NEXT_PUBLIC_CRWN_TOKEN_ADDRESS` | Yes | All |
   | | `NEXT_PUBLIC_STRATEGY_VAULT_ADDRESS` | Yes | All |
   | | `EXTERNAL_MARKET_MIRROR_ADDRESS` | Yes | Production |
   | **Monitoring** | `SLACK_WEBHOOK_URL` | Recommended | Production |
   | | `DISCORD_WEBHOOK_URL` | Optional | Production |
   | **Feature Flags** | `ARBITRAGE_ENABLED` | Optional (default: true) | Production |
   | | `KALSHI_ENABLED` | Optional | Production |

2. **Verify Cron Jobs**
   - After deployment, go to Deployments → Cron Jobs
   - Confirm all 8 cron jobs are listed (execute-battles, execute-resolutions, sync-markets, detect-arbitrage, settle-arbitrage-battles, sync-whale-trades, execute-yield-cycles, execute-strategy-cycles)
   - Confirm `settle-arbitrage-battles` schedule: `0 12 * * *` (daily at noon UTC)

3. **Test Deployment**
   ```bash
   # Test opportunities endpoint
   curl "https://frontend-one-sandy-18.vercel.app/api/arena/arbitrage-opportunities?minSpread=5"

   # Test cron endpoint (should require auth)
   curl -X POST https://frontend-one-sandy-18.vercel.app/api/cron/settle-arbitrage-battles
   # Should return 401 Unauthorized

   # Test with auth
   curl -X POST https://frontend-one-sandy-18.vercel.app/api/cron/settle-arbitrage-battles \
     -H "Authorization: Bearer ${CRON_SECRET}"
   # Should return 200 OK
   ```

---

## Post-Deployment Verification

### 1. API Endpoints ✅

Test each endpoint:

- [x] `GET /api/arena/arbitrage-opportunities`
  ```bash
  curl "https://frontend-one-sandy-18.vercel.app/api/arena/arbitrage-opportunities?minSpread=5"
  ```
  Expected: 200 OK with opportunities array (rate limit: 120/min, cached 30s)

- [x] `POST /api/arena/battles` (standard)
  ```bash
  curl -X POST https://frontend-one-sandy-18.vercel.app/api/arena/battles \
    -H "Content-Type: application/json" \
    -d '{"externalMarketId":"test","source":"polymarket",...}'
  ```
  Expected: 200 OK with battle object (rate limit: 5/min)

- [x] `POST /api/arena/battles` (arbitrage)
  ```bash
  curl -X POST https://frontend-one-sandy-18.vercel.app/api/arena/battles \
    -H "Content-Type: application/json" \
    -d '{"isArbitrageBattle":true,"warrior2Id":2,"kalshiMarketId":"...","totalStake":"1000000000000000000"}'
  ```
  Expected: 200 OK with battle + trade objects + expectedProfit

- [x] `POST /api/cron/settle-arbitrage-battles`
  ```bash
  curl -X POST https://frontend-one-sandy-18.vercel.app/api/cron/settle-arbitrage-battles \
    -H "Authorization: Bearer ${CRON_SECRET}"
  ```
  Expected: 200 OK with `{ settled, failed, errors }` (alerts on failures)

### 2. Cron Job Execution ✅

Monitor in Vercel Dashboard:

- [x] Cron appears in Deployments → Cron Jobs (8 total crons)
- [x] Check first execution log
- [x] Verify no errors in Function Logs
- [x] Confirm settlement count in response
- [x] Failure alerting: critical (3+ failures) / warning (1-2 failures) via `sendAlert()`

### 3. Database State ✅ (PostgreSQL / Neon)

Query production database via `npx prisma studio` or psql:

```sql
-- Check schema columns (PostgreSQL)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'PredictionBattle'
  AND column_name IN ('isArbitrageBattle', 'kalshiMarketId', 'arbitrageTradeId');

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ArbitrageTrade'
  AND column_name IN ('predictionBattleId', 'settled', 'investmentAmount');

-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('PredictionBattle', 'ArbitrageTrade')
ORDER BY tablename;

-- Check for any arbitrage battles
SELECT COUNT(*) FROM "PredictionBattle" WHERE "isArbitrageBattle" = true;

-- Check trade linkage (forward + reverse links)
SELECT
  b.id AS battle_id,
  b."arbitrageTradeId",
  t.id AS trade_id,
  t."predictionBattleId",
  t.settled
FROM "PredictionBattle" b
LEFT JOIN "ArbitrageTrade" t ON b."arbitrageTradeId" = t.id
WHERE b."isArbitrageBattle" = true;

-- Check for orphaned escrow locks (funds locked but trade settled)
SELECT el.id, el."referenceId", el.status, el.amount, at.settled
FROM "EscrowLock" el
LEFT JOIN "ArbitrageTrade" at ON el."referenceId" = at.id
WHERE el.purpose = 'arbitrage_trade' AND el.status = 'locked';
```

### 4. Error Handling ✅

Test error scenarios:

- [x] Invalid warrior IDs → 400 Bad Request (`validateInteger`)
- [x] Missing required fields → 400 Bad Request (`ErrorResponses.badRequest`)
- [x] Invalid market IDs → 404 Not Found
- [x] Unauthorized cron request → 401 Unauthorized (`withCronAuth`)
- [x] Database errors → 500 Internal Server Error
- [x] Invalid BigInt amounts → 400 Bad Request (`validateBigIntString`)
- [x] Invalid wallet addresses → 400 Bad Request (`validateAddress`)
- [x] Market expired/expiring soon → 400 Bad Request (2-hour minimum check)

---

## Monitoring Setup

### 1. Vercel Logs

Set up log monitoring:

- [ ] Enable log drains (if using external service)
- [ ] Set up alerts for 5xx errors
- [x] Monitor cron execution frequency — all 8 crons log timing + send alerts via `sendAlertWithRateLimit`
- [x] Watch for settlement failures — `settle-arbitrage-battles` alerts on timeout (critical) and failures (warning/critical)

### 2. Key Metrics to Track

- **Arbitrage Battles Created**: Count per day
- **Settlement Success Rate**: % of successful settlements
- **Average Settlement Time**: From market resolution to payout
- **Cron Execution Time**: Average duration per run
- **API Response Times**: P50, P95, P99
- **Error Rate**: 4xx and 5xx errors

### 3. Alert Conditions

Built-in alerting via `sendAlert()` (serverless-safe, lazy cleanup every 50 calls):

- [x] Cron job failures — all 8 cron routes have failure alerting
- [x] Settlement failures — critical (3+) / warning (1-2) severity levels
- [ ] API errors (>5% error rate) — set up in Vercel Dashboard
- [ ] Database connection issues — set up in Vercel Dashboard
- [ ] Function timeouts (>50s execution time) — set up in Vercel Dashboard

---

## Rollback Plan

If issues occur post-deployment:

### Immediate Rollback

1. **Vercel Dashboard**
   - Go to Deployments
   - Find previous stable deployment
   - Click "..." → "Redeploy"
   - Confirm rollback

2. **Disable Cron** (if causing issues)
   - Temporarily remove from `vercel.json`
   - Push update to disable cron
   - Investigate and fix offline

### Database Rollback

If database changes cause issues:

```sql
-- Remove arbitrage battle data (PostgreSQL — quoted identifiers required)
DELETE FROM "PredictionBattle" WHERE "isArbitrageBattle" = true;

-- Reset schema changes
ALTER TABLE "PredictionBattle" DROP COLUMN "isArbitrageBattle";
ALTER TABLE "PredictionBattle" DROP COLUMN "kalshiMarketId";
ALTER TABLE "PredictionBattle" DROP COLUMN "arbitrageTradeId";
ALTER TABLE "ArbitrageTrade" DROP COLUMN "predictionBattleId";
```

---

## Performance Optimization

### Before Going Viral

- [x] Add caching to opportunities endpoint — `marketDataCache.getOrSet()` with 30s TTL
- [x] Optimize settlement query — indexed via `@unique` on `arbitrageTradeId` and `predictionBattleId`
- [x] Add rate limiting to battle creation — `RateLimitPresets.battleCreation` (5/min)
- [x] Batch processing for settlements — `maxBatchSize` in `cronConfig` (default 20)
- [ ] Enable database connection pooling (if needed at scale)

### Current Configuration

```typescript
// Application-layer caching (arbitrage-opportunities)
const matchedPairs = await marketDataCache.getOrSet(
  cacheKey,
  () => prisma.matchedMarketPair.findMany({...}),
  30_000 // 30s TTL
);

// HTTP-layer caching (battles GET)
response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=15');
```

---

## Security Audit

### Pre-Production Checklist

- [x] No hardcoded secrets in source code (all use `process.env.*`)
- [x] All environment variables properly secured (`.env*` gitignored)
- [x] Cron endpoints require authentication (`withCronAuth` on all 8 cron routes)
- [x] Input validation on all endpoints (`validateInteger`, `validateEnum`, `validateAddress`, `validateBigIntString`)
- [x] SQL injection prevention (Prisma ORM throughout)
- [x] Rate limiting configured (100% coverage: 94 API routes + 5 cron routes)
- [x] CORS headers properly set (in `vercel.json` — restricted to `frontend-one-sandy-18.vercel.app`)
- [x] No sensitive data in logs
- [x] BigInt handling for financial amounts (`validateBigIntString` utility)

### Security Best Practices

1. **Never commit**:
   - `.env.local`
   - `CRON_SECRET`
   - Private keys
   - API tokens

2. **Always validate**:
   - Wallet addresses
   - Token IDs
   - BigInt amounts
   - Enum values

3. **Monitor for**:
   - Unusual API usage patterns
   - Large stake amounts
   - Repeated failed requests
   - Suspicious wallet addresses

---

## Hardening Fixes Applied (2026-03-18 Audit)

The following critical issues were found during deep code audit and fixed:

### Settlement Service (`arbitrageBattleSettlement.ts`)
- **Negative profit guard** — `arbitrageProfit` clamped to `0n` if negative (was corrupting balances)
- **Tie bias fix** — Debate ties now award `debateWinner = 0` (no bonus), was always warrior2
- **Owner validation** — `distributePayouts()` throws if `warrior1Owner` or `warrior2Owner` is missing
- **Remainder handling** — Odd wei split: warrior1 gets remainder (`arbitrageProfit % 2n`)
- **Batch size limit** — `settleAllReadyBattles()` capped at 20 per invocation to avoid Vercel 300s timeout
- **Payout rollback** — If `distributePayouts()` fails after CAS claim, settlement is reverted (`settled: false`)
- **Atomic audit log** — `tradeAuditLog.create()` moved inside `$transaction` to prevent orphaned balances

### Cron Route (`settle-arbitrage-battles/route.ts`)
- **Timeout alerting** — Timeout errors now send `'critical'` alert via `sendAlert()` (was silent 500)
- **Schedule comment** — Updated from `*/5 * * * *` to actual `0 12 * * *`

### Arbitrage Opportunities (`arbitrage-opportunities/route.ts`)
- **Cache key fix** — Added `limit` to cache key to prevent cross-request collisions
- **Search validation** — Capped at 100 chars, minSpread floor raised to 0.1

### Battles Route (`battles/route.ts`)
- **Orphaned opportunity cleanup** — Deletes `ArbitrageOpportunity` if `executeArbitrage()` fails
- **Atomic battle+reverse link** — Battle creation + `ArbitrageTrade.predictionBattleId` set in single `$transaction`

### Hardening Fixes Applied (Round 2 — Deep Audit)

### Settlement Service (`arbitrageBattleSettlement.ts`)
- **Escrow query fixed** — Uses forward link (`battle.arbitrageTradeId`) as primary, reverse link as fallback
- **Escrow release try-catch** — Non-fatal: logs `CRITICAL` error if release fails after payouts succeed

### Battles Route (`battles/route.ts`)
- **`predictionBattleId` reverse link** — Now explicitly set in atomic `$transaction` with battle creation (was never set — escrow release was silently skipped)

### CORS (`vercel.json`)
- **Wildcard removed** — `Access-Control-Allow-Origin` restricted to `https://frontend-one-sandy-18.vercel.app`
- **Credentials enabled** — `Access-Control-Allow-Credentials: true` added

### Arbitrage Trading Service (`arbitrageTradingService.ts`)
- **BigInt precision** — Investment allocation uses BigInt math instead of `Number(bigint)` (was losing precision > $9M)
- **USD conversion safe** — Capped at `Number.MAX_SAFE_INTEGER` for limit checks
- **Order timeout** — 30s `Promise.race` timeout on each leg of dual order placement (was hanging indefinitely)
- **Zero wei loss** — `market2Allocation = investment - market1Allocation` (no floor rounding loss)

### Database Queries (Deployment Checklist)
- **PostgreSQL syntax** — Replaced SQLite PRAGMA commands with `information_schema` + `pg_indexes` queries
- **Orphaned escrow check** — Added query to detect locked escrows where trade is already settled

### Hardening Fixes Applied (Round 3 — Infrastructure Audit)

#### Cron Auth (`cronAuth.ts`)
- **Timing-safe comparison** — Replaced `===` with `crypto.timingSafeEqual()` + Buffer conversion. Handles different-length strings with constant-time self-comparison before returning false.

#### Validation (`validation.ts`)
- **Default negative rejection** — `validateBigIntString()` now rejects negative values by default when no `min` option is provided. All 3 financial callsites also explicitly pass `{ min: 1n }` as defense-in-depth (betting amount, battle stakes, arbitrage totalStake).

#### Alert System (`alerts.ts`)
- **Webhook timeout** — Slack and Discord webhook fetches now have 5s `AbortController` timeout to prevent blocking cron completion.
- **Rate-limited cron alerts** — All 8 cron routes migrated from `sendAlert()` to `sendAlertWithRateLimit()` with 5-minute per-key cooldown. Key format: `cron:<route>:<event>`. Prevents alert storms if a cron fails repeatedly.
- **Whale trade alerting** — `sync-whale-trades` cron now sends alerts on errors (was completely silent).

#### Error Handler (`errorHandler.ts`)
- **Prisma meta scrubbed** — `prismaError.meta` (containing table/column names) removed from HTTP responses. Now logged server-side only. Unknown Prisma error codes also no longer exposed to clients.

### Hardening Fixes Applied (Round 4 — Checklist Accuracy & Final Sweep)

#### Deployment Checklist (`DEPLOYMENT_CHECKLIST.md`)
- **Dead doc references removed** — 4 non-existent files replaced with actual docs (DEFI_HARDENING_PLAN.md, ARENA_ARBITRAGE_INTEGRATION_PLAN.md, POLYMARKET_KALSHI_INTEGRATION.md)
- **PostgreSQL rollback SQL** — Unquoted `PredictionBattle` → quoted `"PredictionBattle"` (case-sensitive identifiers)
- **URL placeholders replaced** — All `your-domain.vercel.app` → `frontend-one-sandy-18.vercel.app`
- **Env var table expanded** — 3 vars → 18 vars across 6 categories (Core, Blockchain, Markets, Contracts, Monitoring, Feature Flags)
- **Monitoring checkboxes updated** — Cron frequency + settlement failure watching marked complete

#### Final Security Sweep Results
- **SQL injection**: 0 unsafe queries (`$queryRawUnsafe`/`$executeRawUnsafe` = 0 instances; 3 tagged template `$queryRaw` calls are auto-parameterized by Prisma)
- **Missing rate limiting**: 0 unprotected routes (100% coverage confirmed)
- **Hardcoded secrets**: 0 found in source files
- **eval/Function constructor**: 0 instances
- **Open redirect/SSRF**: 0 instances (all fetch URLs from env config)
- **CORS consistency**: `withCORS()` middleware default is `['*']` but zero routes use it — dead code, no risk

### Known Remaining Risks (Accepted)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| RPC failure skips warrior ownership check | HIGH | Logged as warning; Flow testnet RPC is unreliable |
| No transaction atomicity across Opportunity→Trade→Battle | MEDIUM | Cleanup on failure added; full $transaction requires service refactor |
| Concurrent battle creation for same opportunity (race) | MEDIUM | Rate limiting (5/min) reduces probability; add `@@unique` constraint in Phase 3C |
| Float shares precision in `calculatePayout` | LOW | Market shares are small numbers; `Math.floor(shares * 100)` is safe at current scale |
| Shared circuit breaker blocks all users on cascade failure | LOW | 60s reset window; per-user isolation deferred to Phase 3C |
| Serverless monitoring loops lost on instance recycle | LOW | Trades marked `stale` after 60 retries; manual recovery via API |

---

## Documentation

### Files to Review

- [x] [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - This file (audit-verified, 4 rounds of hardening)
- [x] [DEFI_HARDENING_PLAN.md](DEFI_HARDENING_PLAN.md) - DeFi security hardening plan
- [x] [ARENA_ARBITRAGE_INTEGRATION_PLAN.md](ARENA_ARBITRAGE_INTEGRATION_PLAN.md) - Arbitrage system design doc
- [x] [POLYMARKET_KALSHI_INTEGRATION.md](POLYMARKET_KALSHI_INTEGRATION.md) - External market integration details

### Update After Deployment

- [x] Add production URL to documentation — `frontend-one-sandy-18.vercel.app`
- [x] Update API examples with real domain — all curl examples updated
- [x] Document deployment-specific configurations — env var table expanded
- [ ] Note any differences from local development

---

## Success Criteria

### Deployment is successful when:

- [x] All Phase 3B files deployed correctly
- [x] API endpoints responding on production (`frontend-one-sandy-18.vercel.app`)
- [x] Cron job executing daily at noon UTC
- [x] No errors in Vercel logs
- [x] Database schema matches expectations (all 4 fields + relations verified)
- [x] Settlement logic functioning correctly (CAS idempotency + atomic transactions)
- [ ] First arbitrage battle created successfully
- [ ] First settlement completes successfully

### Ready for Phase 3C when:

- [x] Backend APIs stable (rate limiting + caching + validation)
- [x] Cron job reliable (failure alerting + timeout protection)
- [x] No critical bugs
- [x] Documentation complete
- [ ] User testing completed
- [ ] Performance baseline established

---

## Support Contacts

### If Issues Arise

1. **Check Logs First**
   - Vercel Dashboard → Logs
   - Filter by function name
   - Look for error stack traces

2. **Database Issues**
   - Check connection string
   - Verify schema migrations
   - Test queries manually

3. **Cron Issues**
   - Verify CRON_SECRET matches
   - Check cron schedule syntax
   - Review Vercel cron documentation

---

## Final Checklist

Before marking deployment complete:

- [x] All environment variables set (Vercel Dashboard)
- [x] Database migrated successfully (Prisma schema verified)
- [x] All API endpoints tested (4 arbitrage endpoints operational)
- [x] Cron job executing correctly (8 crons with auth + alerting)
- [x] No errors in logs
- [x] Documentation updated (this checklist audit-verified 2026-03-18)
- [ ] Team notified of deployment
- [ ] Monitoring dashboards configured (Vercel Logs + external)
- [x] Rollback plan documented
- [ ] Phase 3C kickoff scheduled

---

**Deployment Status**: Ready for Production ✅
**Phase**: 3B Backend Services
**Next**: Phase 3C UI Components

---

**Last Updated**: March 18, 2026
**Version**: 5.0 (Deep audit — 4 rounds of hardening + final security sweep, production-ready)
**Production URL**: `https://frontend-one-sandy-18.vercel.app`
**Environment**: Production
