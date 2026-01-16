/**
 * API Route: 0G Ledger Deposit
 * Deposits funds to the 0G compute ledger for inference payments
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const ZERO_G_CONFIG = {
  computeRpc: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount = 0.5 } = body;

    // Validate amount
    if (amount <= 0 || amount > 10) {
      return NextResponse.json(
        { success: false, error: 'Amount must be between 0 and 10 OG' },
        { status: 400 }
      );
    }

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: '0G private key not configured' },
        { status: 500 }
      );
    }

    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');

    const provider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log('[0G Deposit] Creating broker...');
    const broker = await createZGComputeNetworkBroker(wallet);

    // Check current ledger balance
    let currentBalance = '0';
    try {
      const ledgerInfo = await broker.ledger.getLedger();
      currentBalance = ledgerInfo?.balance?.toString() || '0';
      console.log(`[0G Deposit] Current ledger balance: ${currentBalance}`);
    } catch (e) {
      console.log('[0G Deposit] Ledger does not exist yet, will create');
    }

    // Deposit funds
    console.log(`[0G Deposit] Depositing ${amount} OG...`);
    await broker.ledger.depositFund(amount);

    // Get new balance
    let newBalance = '0';
    try {
      const ledgerInfo = await broker.ledger.getLedger();
      newBalance = ledgerInfo?.balance?.toString() || '0';
    } catch (e) {
      newBalance = String(parseFloat(currentBalance) + amount);
    }

    console.log(`[0G Deposit] New ledger balance: ${newBalance}`);

    return NextResponse.json({
      success: true,
      previousBalance: currentBalance,
      depositedAmount: amount,
      newBalance: newBalance,
      walletAddress: wallet.address,
    });
  } catch (error) {
    console.error('[0G Deposit] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: '0G private key not configured' },
        { status: 500 }
      );
    }

    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');

    const provider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    const wallet = new ethers.Wallet(privateKey, provider);

    const broker = await createZGComputeNetworkBroker(wallet);

    let ledgerBalance = '0';
    let ledgerExists = false;
    try {
      const ledgerInfo = await broker.ledger.getLedger();
      ledgerBalance = ledgerInfo?.balance?.toString() || '0';
      ledgerExists = true;
    } catch (e) {
      ledgerExists = false;
    }

    const walletBalance = await provider.getBalance(wallet.address);

    return NextResponse.json({
      success: true,
      wallet: {
        address: wallet.address,
        balance: ethers.formatEther(walletBalance),
      },
      ledger: {
        exists: ledgerExists,
        balance: ledgerBalance,
      },
    });
  } catch (error) {
    console.error('[0G Deposit] GET Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
