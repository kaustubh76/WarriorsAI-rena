/**
 * API Route: POST /api/vault/deposit
 *
 * Records a vault deposit in the database after on-chain tx succeeds.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses } from '@/lib/api';
import { RateLimitPresets } from '@/lib/api/rateLimit';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { prisma } from '@/lib/prisma';

interface DepositRequest {
  nftId: number;
  ownerAddress: string;
  txHash: string;
  amount: string;
  allocation: { highYield: number; stable: number; lp: number };
  proof?: object;
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'vault-deposit', ...RateLimitPresets.marketCreation }),
  async (req) => {
    const body: DepositRequest = await req.json();
    const { nftId, ownerAddress, txHash, amount, allocation, proof } = body;

    if (!nftId || !ownerAddress || !txHash || !amount || !allocation) {
      throw ErrorResponses.badRequest('nftId, ownerAddress, txHash, amount, and allocation are required');
    }

    if (allocation.highYield + allocation.stable + allocation.lp !== 10000) {
      throw ErrorResponses.badRequest('Allocation must sum to 10000');
    }

    // Upsert vault record
    const vault = await prisma.vault.upsert({
      where: { nftId },
      create: {
        nftId,
        ownerAddress: ownerAddress.toLowerCase(),
        depositAmount: amount,
        allocationHighYield: allocation.highYield,
        allocationStable: allocation.stable,
        allocationLP: allocation.lp,
        aiProof: proof ? JSON.stringify(proof) : null,
        status: 'active',
      },
      update: {
        depositAmount: amount,
        allocationHighYield: allocation.highYield,
        allocationStable: allocation.stable,
        allocationLP: allocation.lp,
        aiProof: proof ? JSON.stringify(proof) : null,
        status: 'active',
      },
    });

    // Create deposit record
    const deposit = await prisma.vaultDeposit.create({
      data: {
        vaultId: vault.id,
        amount,
        txHash,
        type: 'deposit',
      },
    });

    return NextResponse.json({
      success: true,
      vaultId: vault.id,
      depositId: deposit.id,
    });
  },
], { errorContext: 'API:Vault:Deposit:POST' });
