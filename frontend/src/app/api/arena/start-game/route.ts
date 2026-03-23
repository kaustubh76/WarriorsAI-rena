/**
 * POST /api/arena/start-game
 *
 * Server-side game start execution.
 * Calls startGame() on the arena contract using GAME_MASTER_PRIVATE_KEY.
 * Keeps the private key server-side only — never exposed to the client.
 */

import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { createFlowWalletClient, createFlowPublicClient } from '@/lib/flowClient';
import { ArenaAbi } from '@/constants';

interface StartGameRequest {
  arenaAddress: string;
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'arena-start-game', ...RateLimitPresets.storageWrite }),
  async (req) => {
    const body: StartGameRequest = await req.json();
    const { arenaAddress } = body;

    if (!arenaAddress || !/^0x[0-9a-fA-F]{40}$/.test(arenaAddress)) {
      throw ErrorResponses.badRequest('Valid arena contract address is required');
    }

    // Use server-side only env var (no NEXT_PUBLIC_ prefix)
    const gameMasterKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!gameMasterKey) {
      throw ErrorResponses.serviceUnavailable('Game master key not configured');
    }

    const formattedKey = gameMasterKey.startsWith('0x') ? gameMasterKey : `0x${gameMasterKey}`;
    const gameMasterAccount = privateKeyToAccount(formattedKey as `0x${string}`);

    const wc = createFlowWalletClient(gameMasterAccount);
    const pc = createFlowPublicClient();

    const hash = await wc.writeContract({
      address: arenaAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'startGame',
      args: [],
    });

    const receipt = await pc.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: 60_000,
    });

    return NextResponse.json({
      success: receipt.status === 'success',
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
  },
], { errorContext: 'API:Arena:StartGame:POST' });
