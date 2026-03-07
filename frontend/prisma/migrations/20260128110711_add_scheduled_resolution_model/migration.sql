-- CreateTable
CREATE TABLE "ScheduledResolution" (
    "id" TEXT NOT NULL,
    "flowResolutionId" BIGINT,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "externalMarketId" TEXT NOT NULL,
    "mirrorKey" TEXT,
    "oracleSource" TEXT NOT NULL,
    "outcome" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduleTransactionHash" TEXT,
    "executeTransactionHash" TEXT,
    "creator" TEXT NOT NULL,

    CONSTRAINT "ScheduledResolution_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScheduledResolution" ADD CONSTRAINT "ScheduledResolution_externalMarketId_fkey" FOREIGN KEY ("externalMarketId") REFERENCES "ExternalMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledResolution" ADD CONSTRAINT "ScheduledResolution_mirrorKey_fkey" FOREIGN KEY ("mirrorKey") REFERENCES "MirrorMarket"("mirrorKey") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledResolution_flowResolutionId_key" ON "ScheduledResolution"("flowResolutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledResolution_mirrorKey_key" ON "ScheduledResolution"("mirrorKey");

-- CreateIndex
CREATE INDEX "ScheduledResolution_status_idx" ON "ScheduledResolution"("status");

-- CreateIndex
CREATE INDEX "ScheduledResolution_scheduledTime_idx" ON "ScheduledResolution"("scheduledTime");

-- CreateIndex
CREATE INDEX "ScheduledResolution_externalMarketId_idx" ON "ScheduledResolution"("externalMarketId");

-- CreateIndex
CREATE INDEX "ScheduledResolution_mirrorKey_idx" ON "ScheduledResolution"("mirrorKey");
