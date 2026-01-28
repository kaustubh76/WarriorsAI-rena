-- CreateTable: MirrorMarket
-- Stores mirror markets created from external sources (Polymarket, Kalshi)
CREATE TABLE "MirrorMarket" (
    "mirrorKey" TEXT NOT NULL,
    "flowMarketId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "initialPrice" INTEGER NOT NULL,
    "lastSyncPrice" INTEGER NOT NULL,
    "lastSyncTime" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "yesWon" BOOLEAN,
    "resolvedAt" TIMESTAMP(3),
    "totalVolume" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MirrorMarket_pkey" PRIMARY KEY ("mirrorKey")
);

-- CreateTable: MirrorTrade
-- Stores all trades executed on mirror markets
CREATE TABLE "MirrorTrade" (
    "id" TEXT NOT NULL,
    "mirrorKey" TEXT NOT NULL,
    "agentId" INTEGER,
    "trader" TEXT NOT NULL,
    "isYes" BOOLEAN NOT NULL,
    "amount" TEXT NOT NULL,
    "sharesReceived" TEXT NOT NULL,
    "predictionHash" TEXT,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "isVRFTrade" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "yesWon" BOOLEAN,
    "resolvedAt" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MirrorTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VerifiedPrediction
-- Stores 0G verified predictions for mirror markets
CREATE TABLE "VerifiedPrediction" (
    "mirrorKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "isVerified" BOOLEAN NOT NULL,
    "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifiedPrediction_pkey" PRIMARY KEY ("mirrorKey")
);

-- CreateTable: PriceSyncHistory
-- Tracks price sync events from external markets
CREATE TABLE "PriceSyncHistory" (
    "id" TEXT NOT NULL,
    "mirrorKey" TEXT NOT NULL,
    "oldPrice" INTEGER NOT NULL,
    "newPrice" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceSyncHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SystemAudit
-- Audit log for critical system events (oracle changes, admin actions)
CREATE TABLE "SystemAudit" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MirrorTrade_txHash_key" ON "MirrorTrade"("txHash");

-- CreateIndex: Query trades by market
CREATE INDEX "MirrorTrade_mirrorKey_idx" ON "MirrorTrade"("mirrorKey");

-- CreateIndex: Query trades by trader
CREATE INDEX "MirrorTrade_trader_idx" ON "MirrorTrade"("trader");

-- CreateIndex: Query trades by agent
CREATE INDEX "MirrorTrade_agentId_idx" ON "MirrorTrade"("agentId");

-- CreateIndex: Query trades by block number (for sync)
CREATE INDEX "MirrorTrade_blockNumber_idx" ON "MirrorTrade"("blockNumber");

-- CreateIndex: Query trades by timestamp
CREATE INDEX "MirrorTrade_timestamp_idx" ON "MirrorTrade"("timestamp");

-- CreateIndex: Query active markets
CREATE INDEX "MirrorMarket_isActive_idx" ON "MirrorMarket"("isActive");

-- CreateIndex: Query by external source
CREATE INDEX "MirrorMarket_source_externalId_idx" ON "MirrorMarket"("source", "externalId");

-- CreateIndex: Query price sync history by market
CREATE INDEX "PriceSyncHistory_mirrorKey_idx" ON "PriceSyncHistory"("mirrorKey");

-- CreateIndex: Query price sync history by time
CREATE INDEX "PriceSyncHistory_syncedAt_idx" ON "PriceSyncHistory"("syncedAt");

-- CreateIndex: Query audit log by event type
CREATE INDEX "SystemAudit_eventType_idx" ON "SystemAudit"("eventType");

-- CreateIndex: Query audit log by timestamp
CREATE INDEX "SystemAudit_timestamp_idx" ON "SystemAudit"("timestamp");

-- CreateIndex: Query audit log by transaction
CREATE INDEX "SystemAudit_txHash_idx" ON "SystemAudit"("txHash");
