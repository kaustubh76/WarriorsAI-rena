/**
 * Kalshi API Proxy Route
 * GET: Fetch markets directly from Kalshi (bypasses local DB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { kalshiService } from '@/services/externalMarkets';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const action = searchParams.get('action') || 'markets';

    switch (action) {
      case 'markets': {
        const status = searchParams.get('status') || 'open';
        const limit = parseInt(searchParams.get('limit') || '50');

        const response = await kalshiService.getMarkets(status, limit);
        const normalizedMarkets = kalshiService.normalizeMarkets(response.markets);

        return NextResponse.json({
          success: true,
          data: {
            markets: normalizedMarkets,
            count: response.markets.length,
            cursor: response.cursor,
            raw: response.markets,
          },
        });
      }

      case 'market': {
        const ticker = searchParams.get('ticker');
        if (!ticker) {
          return NextResponse.json(
            { success: false, error: 'ticker required' },
            { status: 400 }
          );
        }

        const market = await kalshiService.getMarket(ticker);
        if (!market) {
          return NextResponse.json(
            { success: false, error: 'Market not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          data: {
            market: kalshiService.normalizeMarket(market),
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

        const markets = await kalshiService.searchMarkets(query);
        return NextResponse.json({
          success: true,
          data: {
            markets: kalshiService.normalizeMarkets(markets),
            count: markets.length,
          },
        });
      }

      case 'orderbook': {
        const ticker = searchParams.get('ticker');
        if (!ticker) {
          return NextResponse.json(
            { success: false, error: 'ticker required' },
            { status: 400 }
          );
        }

        const orderbook = await kalshiService.getOrderbook(ticker);
        return NextResponse.json({
          success: true,
          data: orderbook,
        });
      }

      case 'trades': {
        const ticker = searchParams.get('ticker');
        if (!ticker) {
          return NextResponse.json(
            { success: false, error: 'ticker required' },
            { status: 400 }
          );
        }

        const limit = parseInt(searchParams.get('limit') || '50');
        const response = await kalshiService.getTrades(ticker, limit);
        return NextResponse.json({
          success: true,
          data: response,
        });
      }

      case 'events': {
        const status = searchParams.get('status') || 'open';
        const limit = parseInt(searchParams.get('limit') || '50');

        const events = await kalshiService.getEvents(status, limit);
        return NextResponse.json({
          success: true,
          data: {
            events,
            count: events.length,
          },
        });
      }

      case 'health': {
        const healthy = await kalshiService.healthCheck();
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
    console.error('[API] Kalshi error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch from Kalshi',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
