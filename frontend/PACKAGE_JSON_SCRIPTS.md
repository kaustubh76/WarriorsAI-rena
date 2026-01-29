# Package.json Scripts to Add

Add these scripts to your `package.json` for easier testing and development:

```json
{
  "scripts": {
    // ... existing scripts ...

    // Arbitrage Testing & Seeding
    "seed:arbitrage": "ts-node scripts/seed-arbitrage-demo.ts",
    "test:arbitrage": "jest __tests__/services/arena --coverage",
    "test:profit": "jest __tests__/utils/profitCalculations --coverage",
    "test:e2e": "jest __tests__/e2e/arbitrage-flow",
    "test:all": "jest --coverage",

    // Development helpers
    "arbitrage:opportunities": "curl 'http://localhost:3000/api/arena/arbitrage-opportunities?minSpread=5' | json_pp",
    "arbitrage:settle": "curl 'http://localhost:3000/api/cron/settle-arbitrage-battles'",

    // Database
    "db:reset": "npx prisma db push --force-reset",
    "db:seed:all": "npm run db:reset && npm run seed:arbitrage",

    // Testing shortcuts
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage --coverageReporters=html && open coverage/index.html"
  }
}
```

## Usage Examples

```bash
# Seed demo data
npm run seed:arbitrage

# Run arbitrage tests
npm run test:arbitrage

# Run all tests with coverage
npm run test:all

# Reset DB and seed fresh data
npm run db:seed:all

# Watch mode for development
npm run test:watch

# View coverage report
npm run test:coverage
```

## Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run seed:arbitrage` | Create demo arbitrage opportunities |
| `npm run test:arbitrage` | Test settlement service |
| `npm run test:profit` | Test profit calculations |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:all` | Run all tests with coverage |
| `npm run db:seed:all` | Reset DB + seed data |

## Development Workflow

```bash
# 1. Setup
npm install
npm run db:reset

# 2. Seed data
npm run seed:arbitrage

# 3. Start dev server
npm run dev

# 4. In another terminal, test
npm run test:watch

# 5. Check opportunities API
npm run arbitrage:opportunities
```

## Production Checklist

Before deploying:

```bash
# Run full test suite
npm run test:all

# Ensure all tests pass
# Coverage should be > 85%

# Seed production database
CRON_SECRET=xxx npm run seed:arbitrage

# Deploy
vercel --prod
```
