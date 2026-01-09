/**
 * API Route: 0G Compute Inference
 * Server-side AI inference via 0G Compute Network
 * This route handles private key operations for 0G broker
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import type { Address } from 'viem';

// Types for inference requests
interface InferenceRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  // Battle prediction specific
  battleData?: {
    battleId: string;
    warriors: {
      id: string;
      traits: {
        strength: number;
        wit: number;
        charisma: number;
        defence: number;
        luck: number;
      };
    }[];
  };
  // Debate specific
  debateContext?: {
    debateId: string;
    phase: 'prediction' | 'evidence' | 'rebuttal';
    otherPredictions?: {
      agentId: string;
      outcome: string;
      reasoning: string;
    }[];
  };
}

interface InferenceResponse {
  success: boolean;
  chatId?: string;
  response?: string;
  provider?: Address;
  timestamp?: number;
  proof?: {
    signature: string;
    modelHash: string;
    inputHash: string;
    outputHash: string;
    providerAddress: Address;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost: string;
  };
  error?: string;
}

// 0G Configuration
const ZERO_G_CONFIG = {
  computeRpc: process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai',
  chainId: parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602'),
};

export async function POST(request: NextRequest) {
  try {
    const body: InferenceRequest = await request.json();
    const { prompt, model, maxTokens = 1000, temperature = 0.7, battleData, debateContext } = body;

    // Validate input
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Get private key from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { success: false, error: '0G private key not configured' },
        { status: 500 }
      );
    }

    // Dynamic imports for server-side only modules
    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');

    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(ZERO_G_CONFIG.computeRpc);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Create 0G broker
    const broker = await createZGComputeNetworkBroker(wallet);

    // Ensure ledger exists
    try {
      await broker.ledger.getLedger();
    } catch {
      // Create ledger if it doesn't exist
      try {
        await broker.ledger.depositFund(3.0); // Minimum deposit
      } catch (depositError: any) {
        if (!depositError.message?.includes('already exists')) {
          console.error('Ledger creation error:', depositError);
        }
      }
    }

    // List available services and get a chatbot provider
    const services = await broker.inference.listService();
    const chatbotServices = services.filter((s: any) => s.serviceType === 'chatbot');

    if (chatbotServices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No chatbot providers available on 0G network' },
        { status: 503 }
      );
    }

    // Prefer index 1 for better models, fallback to 0
    const serviceIndex = Math.min(1, chatbotServices.length - 1);
    const selectedService = chatbotServices[serviceIndex];
    const providerAddress = selectedService.provider as Address;

    // Acknowledge provider signer
    try {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
    } catch (ackError: any) {
      if (!ackError.message?.includes('already acknowledged')) {
        console.warn('Provider acknowledge warning:', ackError.message);
      }
    }

    // Get service metadata
    const { endpoint, model: serviceModel } = await broker.inference.getServiceMetadata(providerAddress);

    // Generate request headers
    const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

    // Prepare headers for OpenAI client
    const requestHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        requestHeaders[key] = value;
      }
    });

    // Send request using OpenAI-compatible API
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      baseURL: endpoint,
      apiKey: '' // Empty as per 0G docs
    });

    const completion = await openai.chat.completions.create(
      {
        messages: [{ role: 'user', content: prompt }],
        model: model || serviceModel,
        max_tokens: maxTokens,
        temperature: temperature
      },
      { headers: requestHeaders }
    );

    const responseText = completion.choices[0].message.content || '';
    const chatId = completion.id;

    // Process response and handle payment
    try {
      await broker.inference.processResponse(providerAddress, responseText, chatId);
    } catch (paymentError: any) {
      console.warn('Payment processing warning:', paymentError.message);
    }

    // Generate proof hashes
    const inputHash = hashString(prompt);
    const outputHash = hashString(responseText);

    const response: InferenceResponse = {
      success: true,
      chatId,
      response: responseText,
      provider: providerAddress,
      timestamp: Date.now(),
      proof: {
        signature: chatId,
        modelHash: serviceModel,
        inputHash,
        outputHash,
        providerAddress
      },
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        cost: '0' // Would calculate from provider prices
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('0G Inference error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for listing available providers
 */
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

    let services: any[] = [];
    try {
      services = await broker.inference.listService();
    } catch (listError) {
      // 0G testnet may not have services registered - return empty list gracefully
      console.warn('0G listService error (may be expected on testnet):', listError);
      return NextResponse.json({
        success: true,
        providers: [],
        message: '0G Compute services not available on this network. Using fallback mode.'
      });
    }

    return NextResponse.json({
      success: true,
      providers: services.map((s: any) => ({
        address: s.provider,
        model: s.model || 'Unknown',
        endpoint: s.url || '',
        serviceType: s.serviceType,
        inputPrice: s.inputPrice?.toString() || '0',
        outputPrice: s.outputPrice?.toString() || '0',
        verifiability: s.verifiability || 'none'
      }))
    });
  } catch (error) {
    console.error('Error listing providers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Simple string hash for proofs
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
}
