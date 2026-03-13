/**
 * E2E Test: Strategy Battle Arena
 *
 * Tests the full lifecycle: create → 5 execute-cycle → settlement
 * Run: npx tsx scripts/testStrategyBattle.ts
 */

const BASE = 'http://localhost:3000';

const WARRIOR1_ID = 1;
const WARRIOR2_ID = 2;
const OWNER = '0x5a6472782a098230e04a891a78beee1b7d48e90c';
const STAKES = '5000000000000000000'; // 5 CRwN in wei

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`[FAIL] ${method} ${path} → ${res.status}`);
    console.error(JSON.stringify(data, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status} ${data.error || ''}`);
  }
  return data;
}

function divider(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

async function main() {
  console.log('Strategy Battle Arena — E2E Test');
  console.log(`NFT#${WARRIOR1_ID} vs NFT#${WARRIOR2_ID}`);
  console.log(`Owner: ${OWNER}`);
  console.log(`Stakes: ${STAKES} wei (5 CRwN)`);

  // ── Step 1: Create battle ──
  divider('STEP 1: Create Strategy Battle');
  const createRes = await api('POST', '/api/arena/strategy/create', {
    warrior1Id: WARRIOR1_ID,
    warrior1Owner: OWNER,
    warrior2Id: WARRIOR2_ID,
    warrior2Owner: OWNER,
    stakes: STAKES,
  });
  const battleId = createRes.battle.id;
  console.log(`[OK] Battle created: ${battleId}`);
  console.log(`  Status: ${createRes.battle.status}`);
  console.log(`  BettingPool: ${createRes.bettingPoolId}`);

  // ── Step 2: Verify battle details ──
  divider('STEP 2: Verify Battle Details');
  const detailRes = await api('GET', `/api/arena/strategy/${battleId}`);
  const b = detailRes.battle;
  console.log(`[OK] Battle ${b.id}`);
  console.log(`  Status: ${b.status}`);
  console.log(`  Round: ${b.currentRound}`);
  console.log(`  W1 (NFT#${b.warrior1.nftId}): score=${b.warrior1.score}, profile=${b.warrior1.strategyProfile}`);
  console.log(`  W2 (NFT#${b.warrior2.nftId}): score=${b.warrior2.score}, profile=${b.warrior2.strategyProfile}`);

  // ── Step 3: Execute 5 cycles ──
  for (let cycle = 1; cycle <= 5; cycle++) {
    divider(`STEP 3.${cycle}: Execute Cycle ${cycle}/5`);
    try {
      const cycleRes = await api('POST', `/api/arena/strategy/${battleId}/execute-cycle`);
      console.log(`[OK] Cycle ${cycleRes.roundNumber} complete`);
      console.log(`  W1: ${cycleRes.warrior1.defiMove} → score=${cycleRes.warrior1.score}, yield=${cycleRes.warrior1.yieldEarned}`);
      console.log(`  W2: ${cycleRes.warrior2.defiMove} → score=${cycleRes.warrior2.score}, yield=${cycleRes.warrior2.yieldEarned}`);
      console.log(`  Round winner: ${cycleRes.roundWinner}`);
      console.log(`  Pool APYs: HY=${cycleRes.poolAPYs.highYield} ST=${cycleRes.poolAPYs.stable} LP=${cycleRes.poolAPYs.lp}`);
      if (cycleRes.warrior1.txHash) console.log(`  W1 TX: ${cycleRes.warrior1.txHash}`);
      if (cycleRes.warrior2.txHash) console.log(`  W2 TX: ${cycleRes.warrior2.txHash}`);
      if (cycleRes.settled) console.log(`  ** BATTLE SETTLED **`);
    } catch (err) {
      console.error(`[FAIL] Cycle ${cycle} failed:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  // ── Step 4: Verify final state ──
  divider('STEP 4: Verify Final State');
  const finalRes = await api('GET', `/api/arena/strategy/${battleId}`);
  const fb = finalRes.battle;
  console.log(`[OK] Battle ${fb.id}`);
  console.log(`  Status: ${fb.status}`);
  console.log(`  Rounds completed: ${fb.currentRound}`);
  console.log(`  W1 final score: ${fb.warrior1.score}, total yield: ${fb.warrior1.totalYieldFormatted} CRwN`);
  console.log(`  W2 final score: ${fb.warrior2.score}, total yield: ${fb.warrior2.totalYieldFormatted} CRwN`);
  if (fb.betting) {
    console.log(`  Betting: open=${fb.betting.bettingOpen}, bettors=${fb.betting.totalBettors}`);
  }
  console.log(`  Cycles:`);
  fb.cycles.forEach((c: any) => {
    console.log(`    R${c.roundNumber}: ${c.warrior1.defiMove} vs ${c.warrior2.defiMove} → ${c.roundWinner} (W1:${c.warrior1.score} W2:${c.warrior2.score})`);
  });

  // ── Step 5: Verify appears in list ──
  divider('STEP 5: Verify Battle in List');
  const listRes = await api('GET', '/api/arena/strategy/list');
  const found = listRes.battles.find((b: any) => b.id === battleId);
  if (found) {
    console.log(`[OK] Battle ${battleId} found in list`);
    console.log(`  Status: ${found.status}, Rounds: ${found.currentRound}`);
  } else {
    console.error(`[FAIL] Battle ${battleId} NOT found in list!`);
  }

  divider('TEST COMPLETE');
  const passed = fb.status === 'completed' && fb.currentRound === 5;
  console.log(passed ? '[PASS] All steps completed successfully!' : '[WARN] Battle may not have fully settled — check logs above');
}

main().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
