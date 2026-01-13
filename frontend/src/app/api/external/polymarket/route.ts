/**
 * Polymarket API Proxy Route
 * GET: Fetch markets directly from Polymarket (bypasses local DB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { polymarketService } from '@/services/externalMarkets';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const action = searchParams.get('action') || 'markets';

    switch (action) {
      case 'markets': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        const markets = await polymarketService.getActiveMarkets(limit, offset);
        const normalizedMarkets = polymarketService.normalizeMarkets(markets);

        return NextResponse.json({
          success: true,
          data: {
            markets: normalizedMarkets,
            count: markets.length,
            raw: markets, // Include raw data for debugging
          },
        });
      }

      case 'market': {
        const conditionId = searchParams.get('conditionId');
        if (!conditionId) {
          return NextResponse.json(
            { success: false, error: 'conditionId required' },
            { status: 400 }
          );
        }

        const market = await polymarketService.getMarket(conditionId);
        if (!market) {
          return NextResponse.json(
            { success: false, error: 'Market not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          data: {
            market: polymarketService.normalizeMarket(market),
            raw: market,
          },
        });
      }

      case 'search': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json(
            { success: false, error: 'Search query required' },
            { status: 400 }
          );
        }

        const markets = await polymarketService.searchMarkets(query);
        return NextResponse.json({
          success: true,
          data: {
            markets: polymarketService.normalizeMarkets(markets),
            count: markets.length,
          },
        });
      }

      case 'orderbook': {
        const tokenId = searchParams.get('tokenId');
        if (!tokenId) {
          return NextResponse.json(
            { success: false, error: 'tokenId required' },
            { status: 400 }
          );
        }

        const orderbook = await polymarketService.getOrderbook(tokenId);
        return NextResponse.json({
          success: true,
          data: orderbook,
        });
      }

      case 'health': {
        const healthy = await polymarketService.healthCheck();
        return NextResponse.json({
          success: true,
          data: { healthy },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[API] Polymarket error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch from Polymarket',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
