-- CreateTable
CREATE TABLE "MarketBet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warriorId" INTEGER,
    "externalMarketId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "side" BOOLEAN NOT NULL,
    "amount" BIGINT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "shares" DOUBLE PRECISION,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outcome" BOOLEAN,
    "payout" BIGINT,
    "placementTxHash" TEXT,
    "claimTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "MarketBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArbitrageTrade" (
    "id" TEXT NOT NULL,
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
    "expectedProfit" DOUBLE PRECISION NOT NULL,
    "expectedSpread" DOUBLE PRECISION NOT NULL,
    "actualProfit" BIGINT,
    "actualSpread" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "market1OrderId" TEXT,
    "market1Filled" BOOLEAN NOT NULL DEFAULT false,
    "market1Shares" DOUBLE PRECISION,
    "market1ExecutionPrice" DOUBLE PRECISION,
    "market2OrderId" TEXT,
    "market2Filled" BOOLEAN NOT NULL DEFAULT false,
    "market2Shares" DOUBLE PRECISION,
    "market2ExecutionPrice" DOUBLE PRECISION,
    "market1Outcome" BOOLEAN,
    "market2Outcome" BOOLEAN,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "market1FilledAt" TIMESTAMP(3),
    "market2FilledAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ArbitrageTrade_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MarketBet" ADD CONSTRAINT "MarketBet_externalMarketId_fkey" FOREIGN KEY ("externalMarketId") REFERENCES "ExternalMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
