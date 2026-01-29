-- CreateTable
CREATE TABLE "MarketBet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "warriorId" INTEGER,
    "externalMarketId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "side" BOOLEAN NOT NULL,
    "amount" BIGINT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "shares" REAL,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outcome" BOOLEAN,
    "payout" BIGINT,
    "placementTxHash" TEXT,
    "claimTxHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placedAt" DATETIME,
    "settledAt" DATETIME,
    CONSTRAINT "MarketBet_externalMarketId_fkey" FOREIGN KEY ("externalMarketId") REFERENCES "ExternalMarket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArbitrageTrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "market1Source" TEXT NOT NULL,
    "market1Id" TEXT NOT NULL,
    "market1Question" TEXT NOT NULL,
    "market1Side" BOOLEAN NOT NULL,
    "market2Source" TEXT NOT NULL,
    "market2Id" TEXT NOT NULL,
    "market2Question" TEXT NOT NULL,
    "market2Side" BOOLEAN NOT NULL,
    "investmentAmount" BIGINT NOT NULL,
    "market1Amount" BIGINT NOT NULL,
    "market2Amount" BIGINT NOT NULL,
    "expectedProfit" REAL NOT NULL,
    "expectedSpread" REAL NOT NULL,
    "actualProfit" BIGINT,
    "actualSpread" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "market1OrderId" TEXT,
    "market1Filled" BOOLEAN NOT NULL DEFAULT false,
    "market1Shares" REAL,
    "market1ExecutionPrice" REAL,
    "market2OrderId" TEXT,
    "market2Filled" BOOLEAN NOT NULL DEFAULT false,
    "market2Shares" REAL,
    "market2ExecutionPrice" REAL,
    "market1Outcome" BOOLEAN,
    "market2Outcome" BOOLEAN,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" DATETIME,
    "market1FilledAt" DATETIME,
    "market2FilledAt" DATETIME,
    "settledAt" DATETIME
);

-- CreateIndex
CREATE INDEX "MarketBet_userId_idx" ON "MarketBet"("userId");

-- CreateIndex
CREATE INDEX "MarketBet_externalMarketId_idx" ON "MarketBet"("externalMarketId");

-- CreateIndex
CREATE INDEX "MarketBet_status_idx" ON "MarketBet"("status");

-- CreateIndex
CREATE INDEX "MarketBet_createdAt_idx" ON "MarketBet"("createdAt");

-- CreateIndex
CREATE INDEX "ArbitrageTrade_userId_idx" ON "ArbitrageTrade"("userId");

-- CreateIndex
CREATE INDEX "ArbitrageTrade_status_idx" ON "ArbitrageTrade"("status");

-- CreateIndex
CREATE INDEX "ArbitrageTrade_settled_idx" ON "ArbitrageTrade"("settled");

-- CreateIndex
CREATE INDEX "ArbitrageTrade_createdAt_idx" ON "ArbitrageTrade"("createdAt");
