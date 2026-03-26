-- AlterTable
ALTER TABLE "BattleBettingPool" ADD COLUMN     "onChainSettled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MirrorMarket" DROP COLUMN "onChainMarketId";

-- AlterTable
ALTER TABLE "MirrorTrade" DROP COLUMN "onChainMarketId";

-- AlterTable
ALTER TABLE "PredictionRound" ADD COLUMN     "w1ScoreBreakdown" TEXT,
ADD COLUMN     "w2ScoreBreakdown" TEXT;

-- CreateIndex
CREATE INDEX "BattleBet_claimed_idx" ON "BattleBet"("claimed");

-- CreateIndex
CREATE INDEX "BattleBet_bettorAddress_claimed_idx" ON "BattleBet"("bettorAddress", "claimed");

-- CreateIndex
CREATE INDEX "PredictionBattle_status_isStrategyBattle_idx" ON "PredictionBattle"("status", "isStrategyBattle");
