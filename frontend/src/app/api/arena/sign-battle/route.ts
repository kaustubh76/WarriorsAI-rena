/**
 * POST /api/arena/sign-battle
 *
 * Server-side battle signing and execution.
 * Signs move data with AI_SIGNER_PRIVATE_KEY and submits the battle transaction.
 * Keeps the private key server-side only — never exposed to the client.
 */

import { NextResponse } from 'next/server';
import { encodePacked, keccak256, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { createFlowWalletClient, createFlowPublicClient } from '@/lib/flowClient';
import { ArenaAbi } from '@/constants';

interface SignBattleRequest {
  arenaAddress: string;
  warriorsOneMove: number;  // uint8 enum
  warriorsTwoMove: number;  // uint8 enum
  preSignedSignature?: string;  // If signature was already generated, just submit tx
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'arena-sign-battle', ...RateLimitPresets.storageWrite }),
  async (req) => {
    const body: SignBattleRequest = await req.json();
    const { arenaAddress, warriorsOneMove, warriorsTwoMove, preSignedSignature } = body;

    if (!arenaAddress || !/^0x[0-9a-fA-F]{40}$/.test(arenaAddress)) {
      throw ErrorResponses.badRequest('Valid arena contract address is required');
    }
    if (typeof warriorsOneMove !== 'number' || typeof warriorsTwoMove !== 'number') {
      throw ErrorResponses.badRequest('warriorsOneMove and warriorsTwoMove must be numbers');
    }
    if (warriorsOneMove < 0 || warriorsOneMove > 4 || warriorsTwoMove < 0 || warriorsTwoMove > 4) {
      throw ErrorResponses.badRequest('Move values must be 0-4');
    }

    const aiSignerKey = process.env.AI_SIGNER_PRIVATE_KEY;
    if (!aiSignerKey) {
      throw ErrorResponses.serviceUnavailable('AI signer not configured');
    }

    const formattedKey = aiSignerKey.startsWith('0x') ? aiSignerKey : `0x${aiSignerKey}`;
    const aiSignerAccount = privateKeyToAccount(formattedKey as `0x${string}`);

    // Generate signature if not pre-signed
    let signature: string;
    if (preSignedSignature) {
      signature = preSignedSignature;
    } else {
      const dataToSign = encodePacked(
        ['uint8', 'uint8'],
        [warriorsOneMove, warriorsTwoMove]
      );
      const dataHash = keccak256(dataToSign);
      signature = await aiSignerAccount.signMessage({
        message: { raw: dataHash }
      });
    }

    // Submit transaction on-chain
    const wc = createFlowWalletClient(aiSignerAccount);
    const pc = createFlowPublicClient();

    const hash = await wc.writeContract({
      address: arenaAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'battle',
      args: [warriorsOneMove, warriorsTwoMove, signature],
    });

    // Wait for confirmation
    const receipt = await pc.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 60_000,
    });

    // Parse WarriorsMoveExecuted events to determine HIT/MISS
    let warriorsOneHitStatus: 'HIT' | 'MISS' | 'PENDING' = 'PENDING';
    let warriorsTwoHitStatus: 'HIT' | 'MISS' | 'PENDING' = 'PENDING';

    try {
      const moveExecutedEvents = receipt.logs.filter(log => {
        try {
          const decoded = decodeEventLog({ abi: ArenaAbi, data: log.data, topics: log.topics });
          return decoded.eventName === 'WarriorsMoveExecuted';
        } catch { return false; }
      });

      moveExecutedEvents.forEach((log, index) => {
        try {
          const decoded = decodeEventLog({ abi: ArenaAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === 'WarriorsMoveExecuted') {
            const eventArgs = decoded.args as Record<string, unknown>;
            const damageOnOpponentWarriors = eventArgs.damageOnOpponentWarriors as bigint | undefined;
            const recoveryOnSelfWarriors = eventArgs.recoveryOnSelfWarriors as bigint | undefined;
            const dodged = eventArgs.dodged as boolean | undefined;

            const isHit = (damageOnOpponentWarriors ?? 0n) > 0n ||
                          (recoveryOnSelfWarriors ?? 0n) > 0n ||
                          dodged === true;

            if (index === 0) {
              warriorsOneHitStatus = isHit ? 'HIT' : 'MISS';
            } else {
              warriorsTwoHitStatus = isHit ? 'HIT' : 'MISS';
            }
          }
        } catch {
          // Skip unparseable events
        }
      });
    } catch (eventErr) {
      console.warn('[SignBattle] Failed to parse battle events:', eventErr instanceof Error ? eventErr.message : eventErr);
    }

    return NextResponse.json({
      success: true,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
      signature,
      warriorsOneHitStatus,
      warriorsTwoHitStatus,
    });
  },
], { errorContext: 'API:Arena:SignBattle:POST' });
