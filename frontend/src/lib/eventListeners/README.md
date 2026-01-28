
# Event Tracking System

Complete event tracking implementation for ExternalMarketMirror contract on Flow testnet.

## Features

- ✅ **Real-time Event Monitoring** - Listens to all 11 contract events
- ✅ **Database Synchronization** - Automatically syncs events to database
- ✅ **Event Backfilling** - Catch up on missed events after downtime
- ✅ **Error Handling** - Robust error handling with retry logic
- ✅ **Type-Safe** - Full TypeScript support with viem
- ✅ **Production-Ready** - Includes logging, auditing, and monitoring

## Events Tracked

| Event Name | Description | Handler |
|------------|-------------|---------|
| `MirrorMarketCreated` | New mirror market created | Creates/updates MirrorMarket record |
| `MirrorTradeExecuted` | Trade executed on mirror | Creates MirrorTrade record, updates volume |
| `MirrorPriceSynced` | Price synced from external market | Updates price, creates sync history |
| `MirrorResolved` | Market resolved with outcome | Marks market/trades as resolved |
| `AgentTradeExecuted` | AI agent executed trade | Creates agent trade record |
| `VRFCopyTradeExecuted` | VRF copy trade completed | Updates pending copy trade status |
| `PredictionStored` | 0G verified prediction stored | Stores prediction metadata |
| `OracleUpdated` | Oracle address changed | Logs to audit table, sends alert |
| `AgentContractUpdated` | Agent contract changed | Logs to audit table |
| `MirrorMarketRequested` | Market creation requested (VRF) | Informational logging |
| `VRFCopyTradeRequested` | Copy trade requested (VRF) | Informational logging |

## Quick Start

### 1. Basic Usage

```typescript
import { startAllEventListeners, stopAllEventListeners } from '@/lib/eventListeners';

// Start all listeners
const unwatchFunctions = await startAllEventListeners();

// Your app runs...

// Stop all listeners when done
stopAllEventListeners(unwatchFunctions);
```

### 2. With Backfilling

```typescript
import { startAllEventListeners } from '@/lib/eventListeners';

// Start listeners and backfill missed events
const unwatchFunctions = await startAllEventListeners({
  backfill: true,  // Backfill from last synced block
});
```

### 3. From Specific Block

```typescript
import { startAllEventListeners } from '@/lib/eventListeners';

// Start from a specific block
const unwatchFunctions = await startAllEventListeners({
  fromBlock: 91000000n,  // Start from block 91M
  backfill: false,       // Don't backfill
});
```

### 4. Manual Backfilling

```typescript
import { backfillExternalMarketEvents } from '@/lib/eventListeners';

// Backfill events from block range
await backfillExternalMarketEvents(
  90000000n,  // From block
  91000000n   // To block
);
```

## Integration with Next.js

### Option 1: API Route (Recommended for Development)

Create `/app/api/events/start/route.ts`:

```typescript
import { startAllEventListeners } from '@/lib/eventListeners';
import { NextResponse } from 'next/server';

let unwatchFunctions: any = null;

export async function POST() {
  if (unwatchFunctions) {
    return NextResponse.json({ error: 'Listeners already running' }, { status: 400 });
  }

  unwatchFunctions = await startAllEventListeners({ backfill: true });

  return NextResponse.json({ success: true, message: 'Event listeners started' });
}
```

Create `/app/api/events/stop/route.ts`:

```typescript
import { stopAllEventListeners } from '@/lib/eventListeners';
import { NextResponse } from 'next/server';

export async function POST() {
  if (unwatchFunctions) {
    stopAllEventListeners(unwatchFunctions);
    unwatchFunctions = null;
  }

  return NextResponse.json({ success: true, message: 'Event listeners stopped' });
}
```

Then start/stop via API calls:

```bash
# Start listeners
curl -X POST http://localhost:3000/api/events/start

# Stop listeners
curl -X POST http://localhost:3000/api/events/stop
```

### Option 2: Background Service (Recommended for Production)

Create a separate service that runs independently:

`services/eventListener.ts`:

```typescript
import { startAllEventListeners } from '@/lib/eventListeners';

async function main() {
  console.log('Starting event listener service...');

  const unwatchFunctions = await startAllEventListeners({
    backfill: true,
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down event listener service...');
    stopAllEventListeners(unwatchFunctions);
    process.exit(0);
  });

  console.log('Event listener service running. Press Ctrl+C to stop.');
}

main().catch(console.error);
```

Run as separate process:

```bash
ts-node services/eventListener.ts
```

Or add to `package.json`:

```json
{
  "scripts": {
    "events:start": "ts-node services/eventListener.ts",
    "dev": "concurrently \"npm run dev:next\" \"npm run events:start\""
  }
}
```

### Option 3: Server Component (Next.js App Router)

In your root layout or a dedicated server component:

```typescript
// app/event-listener.tsx
'use server';

import { startAllEventListeners } from '@/lib/eventListeners';

let isListening = false;

export async function initEventListeners() {
  if (isListening) return;

  await startAllEventListeners({ backfill: true });
  isListening = true;
}
```

Then call in root layout:

```typescript
// app/layout.tsx
import { initEventListeners } from './event-listener';

export default async function RootLayout({ children }) {
  // Start event listeners on server startup
  await initEventListeners();

  return <html>{children}</html>;
}
```

## Database Schema Requirements

The event listener expects these Prisma models:

```prisma
model MirrorMarket {
  mirrorKey      String   @id
  flowMarketId   Int
  externalId     String
  source         String   // 'polymarket' or 'kalshi'
  initialPrice   Int
  lastSyncPrice  Int
  lastSyncTime   DateTime?
  isActive       Boolean  @default(true)
  resolved       Boolean  @default(false)
  yesWon         Boolean?
  resolvedAt     DateTime?
  totalVolume    String   @default("0")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model MirrorTrade {
  id              String   @id @default(cuid())
  mirrorKey       String
  agentId         Int?
  trader          String
  isYes           Boolean
  amount          String
  sharesReceived  String
  predictionHash  String?
  txHash          String   @unique
  blockNumber     Int
  isVRFTrade      Boolean  @default(false)
  completed       Boolean  @default(true)
  completedAt     DateTime?
  resolved        Boolean  @default(false)
  yesWon          Boolean?
  resolvedAt      DateTime?
  timestamp       DateTime @default(now())
}

model VerifiedPrediction {
  mirrorKey   String   @id
  outcome     String
  confidence  Int
  isVerified  Boolean
  storedAt    DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PriceSyncHistory {
  id          String   @id @default(cuid())
  mirrorKey   String
  oldPrice    Int
  newPrice    Int
  syncedAt    DateTime
}

model SystemAudit {
  id          String   @id @default(cuid())
  eventType   String
  oldValue    String
  newValue    String
  txHash      String
  blockNumber Int
  timestamp   DateTime @default(now())
}
```

Add to your `schema.prisma` and run:

```bash
npx prisma migrate dev --name add_event_tracking
```

## Monitoring & Debugging

### Check Listener Status

```typescript
import { getLastSyncedBlock } from '@/lib/eventListeners';

const lastBlock = await getLastSyncedBlock();
console.log('Last synced block:', lastBlock.toString());
```

### View Logs

All event handlers log to console:

```
[Event] MirrorMarketCreated: { mirrorKey: '0x...', flowMarketId: '123', ... }
[Event] MirrorMarket synced to DB: 0x...
[Event] MirrorTradeExecuted: { mirrorKey: '0x...', trader: '0x...', ... }
```

Security events (oracle/admin changes) are logged with warnings:

```
[Event] ⚠️ ORACLE UPDATED: { oldOracle: '0x...', newOracle: '0x...' }
```

### Error Handling

All event handlers have try-catch blocks that log errors:

```
[Event] Error handling MirrorTradeExecuted: <error details>
```

Errors don't crash the listener - it continues processing other events.

## Performance Considerations

### Event Polling Rate

Viem uses polling by default. Adjust polling interval if needed:

```typescript
const client = createFlowPublicClient({
  pollingInterval: 4000, // Poll every 4 seconds (default)
});
```

### Batch Processing

For large backfills, consider processing in batches:

```typescript
const BATCH_SIZE = 10000n;

for (let i = startBlock; i < endBlock; i += BATCH_SIZE) {
  await backfillExternalMarketEvents(i, i + BATCH_SIZE);
  console.log(`Processed blocks ${i} to ${i + BATCH_SIZE}`);
}
```

### Database Connection Pooling

Ensure Prisma connection pooling is configured:

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
  connectionLimit = 10
}
```

## Troubleshooting

### Issue: Events not being detected

**Solution**: Check RPC connection and contract address:

```typescript
import { createFlowPublicClient } from '@/lib/flowClient';

const client = createFlowPublicClient();
const code = await client.getBytecode({
  address: '0x7485019de6Eca5665057bAe08229F9E660ADEfDa',
});
console.log('Contract deployed:', code && code.length > 2);
```

### Issue: Database errors

**Solution**: Verify Prisma schema matches the event models:

```bash
npx prisma generate
npx prisma db push
```

### Issue: Missing events after restart

**Solution**: Use backfilling to catch up:

```typescript
const lastBlock = await getLastSyncedBlock();
const currentBlock = await client.getBlockNumber();

if (currentBlock - lastBlock > 100n) {
  console.log('Catching up on missed events...');
  await backfillExternalMarketEvents(lastBlock, currentBlock);
}
```

## Testing

### Unit Tests

```typescript
import { handleMirrorMarketCreated } from './externalMarketEvents';

test('handles MirrorMarketCreated event', async () => {
  const mockLog = {
    args: {
      mirrorKey: '0x123...',
      flowMarketId: 1n,
      externalId: 'test-market',
      source: 0,
      adjustedPrice: 5000n,
    },
  };

  await handleMirrorMarketCreated(mockLog as any);

  // Assert database was updated
  const market = await prisma.mirrorMarket.findUnique({
    where: { mirrorKey: '0x123...' },
  });

  expect(market).toBeDefined();
  expect(market!.externalId).toBe('test-market');
});
```

### Integration Tests

```bash
# Start listener in test mode
NODE_ENV=test npm run events:start

# Run test trades
npm run test:trades

# Verify events were captured
npm run test:events:verify
```

## Roadmap

- [ ] Add webhook notifications for critical events
- [ ] Implement event replay functionality
- [ ] Add Prometheus metrics export
- [ ] Create event dashboard UI
- [ ] Add support for multiple chains
- [ ] Implement event-driven cache invalidation

## License

MIT
