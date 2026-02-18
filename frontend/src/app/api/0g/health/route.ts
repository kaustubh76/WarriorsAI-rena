/**
 * 0G Health Check Endpoint
 *
 * Diagnoses the 0G Compute integration status:
 * - RPC connectivity
 * - Wallet balance
 * - Ledger status
 * - Provider availability
 */

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { ZEROG_RPC, ZEROG_CHAIN_ID, ZEROG_COMPUTE } from '@/lib/apiConfig';
import { RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

interface HealthStatus {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  rpc: {
    connected: boolean;
    chainId: number | null;
    blockNumber: number | null;
    error?: string;
  };
  wallet: {
    configured: boolean;
    address: string | null;
    balance: string | null;
    error?: string;
  };
  ledger: {
    exists: boolean;
    balance: string | null;
    error?: string;
  };
  providers: {
    available: boolean;
    count: number;
    chatbotCount: number;
    list: Array<{
      address: string;
      model: string;
      serviceType: string;
    }>;
    error?: string;
  };
  recommendations: string[];
}

export const GET = composeMiddleware([
  withRateLimit({ prefix: '0g-health', ...RateLimitPresets.readOperations }),
  async (req, ctx) => {
    const status: HealthStatus = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      rpc: { connected: false, chainId: null, blockNumber: null },
      wallet: { configured: false, address: null, balance: null },
      ledger: { exists: false, balance: null },
      providers: { available: false, count: 0, chatbotCount: 0, list: [] },
      recommendations: [],
    };

    const issues: string[] = [];

    // Step 1: Check RPC connectivity
    let provider: ethers.JsonRpcProvider | null = null;
    try {
      provider = new ethers.JsonRpcProvider(ZEROG_RPC);
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();

      status.rpc = {
        connected: true,
        chainId: Number(network.chainId),
        blockNumber,
      };

      if (Number(network.chainId) !== ZEROG_CHAIN_ID) {
        issues.push(`Chain ID mismatch: expected ${ZEROG_CHAIN_ID}, got ${network.chainId}`);
      }
    } catch (error) {
      status.rpc.connected = false;
      status.rpc.error = error instanceof Error ? error.message : 'Unknown RPC error';
      issues.push('Cannot connect to 0G RPC. Check network connectivity.');
      status.recommendations.push(`Verify RPC endpoint: ${ZEROG_RPC}`);
    }

    // Step 2: Check wallet configuration and balance
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      status.wallet.configured = false;
      status.wallet.error = 'PRIVATE_KEY not set in environment';
      issues.push('PRIVATE_KEY environment variable is not configured.');
      status.recommendations.push('Set PRIVATE_KEY in .env.local with a funded 0G testnet wallet');
    } else if (provider && status.rpc.connected) {
      try {
        const wallet = new ethers.Wallet(privateKey, provider);
        const balance = await provider.getBalance(wallet.address);

        status.wallet = {
          configured: true,
          address: wallet.address,
          balance: ethers.formatEther(balance),
        };

        const balanceNum = parseFloat(ethers.formatEther(balance));
        if (balanceNum < 0.1) {
          issues.push(`Wallet balance too low: ${balanceNum} OG. Need at least 3 OG for ledger.`);
          status.recommendations.push('Fund wallet with 0G testnet tokens from faucet');
        }
      } catch (error) {
        status.wallet.configured = true;
        status.wallet.error = error instanceof Error ? error.message : 'Unknown wallet error';
        issues.push('Error accessing wallet. Check PRIVATE_KEY format.');
      }
    }

    // Step 3: Check ledger and providers (requires broker)
    if (status.wallet.configured && status.rpc.connected && privateKey) {
      try {
        const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
        const wallet = new ethers.Wallet(privateKey, provider!);
        const broker = await createZGComputeNetworkBroker(wallet);

        // Check ledger
        try {
          const ledgerInfo = await broker.ledger.getLedger();
          status.ledger = {
            exists: true,
            balance: ledgerInfo?.balance?.toString() || '0',
          };

          const ledgerBalance = parseFloat(status.ledger.balance || '0');
          if (ledgerBalance < 1) {
            issues.push(`Ledger balance low: ${ledgerBalance}. May need to deposit more.`);
            status.recommendations.push('Consider depositing more funds to ledger via broker.ledger.depositFund()');
          }
        } catch (ledgerError: any) {
          if (ledgerError.message?.includes('not found') || ledgerError.message?.includes('does not exist')) {
            status.ledger.exists = false;
            status.ledger.error = 'Ledger not created yet';
            issues.push('Ledger account does not exist. Will be created on first inference.');
            status.recommendations.push('Ensure wallet has at least 3 OG tokens for ledger creation');
          } else {
            status.ledger.error = ledgerError.message;
            issues.push(`Ledger error: ${ledgerError.message}`);
          }
        }

        // Check providers
        try {
          const services = await broker.inference.listService();
          const chatbotServices = services.filter((s: any) => s.serviceType === 'chatbot');

          status.providers = {
            available: chatbotServices.length > 0,
            count: services.length,
            chatbotCount: chatbotServices.length,
            list: chatbotServices.slice(0, 5).map((s: any) => ({
              address: s.provider,
              model: s.model || 'unknown',
              serviceType: s.serviceType,
            })),
          };

          if (chatbotServices.length === 0) {
            issues.push('No chatbot providers available on 0G network.');
            status.recommendations.push('Wait for providers to come online or check 0G network status');
            status.recommendations.push(`Known provider: ${ZEROG_COMPUTE.providerAddress}`);
          }
        } catch (providerError: any) {
          status.providers.error = providerError.message;
          issues.push(`Cannot list providers: ${providerError.message}`);
          status.recommendations.push('Check 0G network status at https://scan.0g.ai');
        }
      } catch (brokerError: any) {
        const errorMsg = brokerError.message || 'Unknown broker error';
        issues.push(`Broker initialization failed: ${errorMsg}`);

        if (errorMsg.includes('insufficient funds')) {
          status.recommendations.push('Fund wallet with 0G testnet tokens');
        } else {
          status.recommendations.push('Check 0G SDK version and network status');
        }
      }
    }

    // Determine overall health
    if (issues.length === 0) {
      status.overall = 'healthy';
    } else if (status.rpc.connected && status.wallet.configured && status.providers.available) {
      status.overall = 'degraded';
    } else {
      status.overall = 'unhealthy';
    }

    // Add issues to recommendations if not already there
    if (issues.length > 0 && status.recommendations.length === 0) {
      status.recommendations = issues;
    }

    return NextResponse.json({
      ...status,
      issues,
      config: {
        rpcUrl: ZEROG_RPC,
        chainId: ZEROG_CHAIN_ID,
        knownProvider: ZEROG_COMPUTE.providerAddress,
        brokerUrl: ZEROG_COMPUTE.brokerUrl,
      },
    });
  },
], { errorContext: 'API:0G:Health:GET' });
