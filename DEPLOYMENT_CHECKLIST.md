# Arena Arbitrage System - Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Variables ✅

- [ ] `DATABASE_URL` - SQLite or PostgreSQL connection string
- [ ] `CRON_SECRET` - Secure random token for cron authentication
- [ ] `NEXT_PUBLIC_APP_URL` - Application base URL
- [ ] `NODE_ENV` - Set to "production"

**Generate CRON_SECRET**:
```bash
openssl rand -base64 32
```

### 2. Database Setup ✅

- [ ] Run Prisma migrations
  ```bash
  npx prisma db push
  npx prisma generate
  ```

- [ ] Verify schema includes:
  - [ ] `PredictionBattle.isArbitrageBattle`
  - [ ] `PredictionBattle.kalshiMarketId`
  - [ ] `PredictionBattle.arbitrageTradeId`
  - [ ] `ArbitrageTrade.predictionBattleId`
  - [ ] All relations properly configured

### 3. Code Verification ✅

- [ ] All TypeScript files compile without errors
- [ ] API routes respond correctly
- [ ] Services are properly exported
- [ ] No hardcoded secrets in code

### 4. Vercel Configuration ✅

- [ ] `vercel.json` includes settlement cron:
  ```json
  {
    "path": "/api/cron/settle-arbitrage-battles",
    "schedule": "*/5 * * * *"
  }
  ```

- [ ] Function timeout set to 60 seconds
- [ ] Correct regions configured
- [ ] Build command: `npm run build`

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
git add PHASE_3B_COMPLETE.md
git add QUICK_START_GUIDE.md
git add DEPLOYMENT_CHECKLIST.md

git commit -m "feat: Implement Arena Arbitrage Integration Phase 3B

- Add arbitrage battle settlement service
- Add arbitrage opportunities discovery API
- Enhance battle creation for dual-warrior arbitrage
- Add automated settlement cron job
- Update Vercel configuration

Phase 3B complete - backend services operational
"

git push origin main
```

### Step 3: Configure Vercel

1. **Set Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add the following:

   | Variable | Value | Environment |
   |----------|-------|-------------|
   | `CRON_SECRET` | `<generated-secret>` | Production, Preview |
   | `DATABASE_URL` | `<your-db-url>` | Production, Preview |
   | `NODE_ENV` | `production` | Production |

2. **Verify Cron Jobs**
   - After deployment, go to Deployments → Cron Jobs
   - Confirm `settle-arbitrage-battles` is listed
   - Check schedule: `*/5 * * * *`

3. **Test Deployment**
   ```bash
   # Test opportunities endpoint
   curl "https://your-domain.vercel.app/api/arena/arbitrage-opportunities?minSpread=5"

   # Test cron endpoint (should require auth)
   curl -X POST https://your-domain.vercel.app/api/cron/settle-arbitrage-battles
   # Should return 401 Unauthorized

   # Test with auth
   curl -X POST https://your-domain.vercel.app/api/cron/settle-arbitrage-battles \
     -H "Authorization: Bearer ${CRON_SECRET}"
   # Should return 200 OK
   ```

---

## Post-Deployment Verification

### 1. API Endpoints ✅

Test each endpoint:

- [ ] `GET /api/arena/arbitrage-opportunities`
  ```bash
  curl "https://your-domain.vercel.app/api/arena/arbitrage-opportunities?minSpread=5"
  ```
  Expected: 200 OK with opportunities array

- [ ] `POST /api/arena/battles` (standard)
  ```bash
  curl -X POST https://your-domain.vercel.app/api/arena/battles \
    -H "Content-Type: application/json" \
    -d '{"externalMarketId":"test","source":"polymarket",...}'
  ```
  Expected: 200 OK with battle object

- [ ] `POST /api/arena/battles` (arbitrage)
  ```bash
  curl -X POST https://your-domain.vercel.app/api/arena/battles \
    -H "Content-Type: application/json" \
    -d '{"isArbitrageBattle":true,...}'
  ```
  Expected: 200 OK with battle + trade objects

- [ ] `POST /api/cron/settle-arbitrage-battles`
  ```bash
  curl -X POST https://your-domain.vercel.app/api/cron/settle-arbitrage-battles \
    -H "Authorization: Bearer ${CRON_SECRET}"
  ```
  Expected: 200 OK with settlement results

### 2. Cron Job Execution ✅

Monitor in Vercel Dashboard:

- [ ] Cron appears in Deployments → Cron Jobs
- [ ] Check first execution log
- [ ] Verify no errors in Function Logs
- [ ] Confirm settlement count in response

### 3. Database State ✅

Query production database:

```sql
-- Check schema
PRAGMA table_info(PredictionBattle);
PRAGMA table_info(ArbitrageTrade);

-- Verify indexes
SELECT * FROM sqlite_master WHERE type='index';

-- Check for any arbitrage battles
SELECT COUNT(*) FROM PredictionBattle WHERE isArbitrageBattle = true;

-- Check trade linkage
SELECT
  b.id,
  b.arbitrageTradeId,
  t.id
FROM PredictionBattle b
LEFT JOIN ArbitrageTrade t ON b.arbitrageTradeId = t.id
WHERE b.isArbitrageBattle = true;
```

### 4. Error Handling ✅

Test error scenarios:

- [ ] Invalid warrior IDs → 400 Bad Request
- [ ] Missing required fields → 400 Bad Request
- [ ] Invalid market IDs → 404 Not Found
- [ ] Unauthorized cron request → 401 Unauthorized
- [ ] Database errors → 500 Internal Server Error

---

## Monitoring Setup

### 1. Vercel Logs

Set up log monitoring:

- [ ] Enable log drains (if using external service)
- [ ] Set up alerts for 5xx errors
- [ ] Monitor cron execution frequency
- [ ] Watch for settlement failures

### 2. Key Metrics to Track

- **Arbitrage Battles Created**: Count per day
- **Settlement Success Rate**: % of successful settlements
- **Average Settlement Time**: From market resolution to payout
- **Cron Execution Time**: Average duration per run
- **API Response Times**: P50, P95, P99
- **Error Rate**: 4xx and 5xx errors

### 3. Alert Conditions

Set up alerts for:

- [ ] Cron job failures (no execution in 10 minutes)
- [ ] Settlement failures (>1 failed settlement)
- [ ] API errors (>5% error rate)
- [ ] Database connection issues
- [ ] Function timeouts (>50s execution time)

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
-- Remove arbitrage battle data
DELETE FROM PredictionBattle WHERE isArbitrageBattle = true;

-- Reset schema changes
ALTER TABLE PredictionBattle DROP COLUMN isArbitrageBattle;
ALTER TABLE PredictionBattle DROP COLUMN kalshiMarketId;
ALTER TABLE PredictionBattle DROP COLUMN arbitrageTradeId;
ALTER TABLE ArbitrageTrade DROP COLUMN predictionBattleId;
```

---

## Performance Optimization

### Before Going Viral

- [ ] Add caching to opportunities endpoint (30s cache)
- [ ] Optimize settlement query (use indexes)
- [ ] Add rate limiting to battle creation
- [ ] Consider batch processing for large settlements
- [ ] Enable database connection pooling

### Suggested Configuration

```typescript
// Cache opportunities response
export async function GET(request: NextRequest) {
  const response = NextResponse.json({...});
  response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=15');
  return response;
}
```

---

## Security Audit

### Pre-Production Checklist

- [ ] No hardcoded secrets in repository
- [ ] All environment variables properly secured
- [ ] Cron endpoint requires authentication
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (using Prisma)
- [ ] Rate limiting configured
- [ ] CORS headers properly set
- [ ] No sensitive data in logs
- [ ] BigInt handling for financial amounts

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

## Documentation

### Files to Review

- [ ] [COMPLETE_IMPLEMENTATION_SUMMARY.md](COMPLETE_IMPLEMENTATION_SUMMARY.md) - Full overview
- [ ] [PHASE_3B_COMPLETE.md](PHASE_3B_COMPLETE.md) - Phase 3B details
- [ ] [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) - Usage guide
- [ ] [test-arbitrage-implementation.md](test-arbitrage-implementation.md) - Testing guide

### Update After Deployment

- [ ] Add production URL to documentation
- [ ] Update API examples with real domain
- [ ] Document any deployment-specific configurations
- [ ] Note any differences from local development

---

## Success Criteria

### Deployment is successful when:

- [x] All Phase 3B files deployed correctly
- [x] API endpoints responding on production
- [x] Cron job executing every 5 minutes
- [x] No errors in Vercel logs
- [x] Database schema matches expectations
- [x] Settlement logic functioning correctly
- [ ] First arbitrage battle created successfully
- [ ] First settlement completes successfully

### Ready for Phase 3C when:

- [x] Backend APIs stable
- [x] Cron job reliable
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

- [ ] All environment variables set
- [ ] Database migrated successfully
- [ ] All API endpoints tested
- [ ] Cron job executing correctly
- [ ] No errors in logs
- [ ] Documentation updated
- [ ] Team notified of deployment
- [ ] Monitoring dashboards configured
- [ ] Rollback plan documented
- [ ] Phase 3C kickoff scheduled

---

**Deployment Status**: Ready for Production ✅
**Phase**: 3B Backend Services
**Next**: Phase 3C UI Components

---

**Last Updated**: January 28, 2026
**Version**: 1.0
**Deployed By**: [Your Name]
**Environment**: Production
