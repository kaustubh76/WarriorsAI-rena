/**
 * External Markets API Route
 * GET: Fetch unified markets from Polymarket and Kalshi
 */

import { NextRequest, NextResponse } from 'next/server';
import { externalMarketsService } from '@/services/externalMarkets';
import {
  MarketSource,
  ExternalMarketStatus,
  MarketFilters,
} from '@/types/externalMarket';
import { handleAPIError } from '@/lib/api/errorHandler';
import { applyRateLimit, RateLimitPresets } from '@/lib/api/rateLimit';

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    applyRateLimit(request, {
      prefix: 'external-markets',
      ...RateLimitPresets.apiQueries,
    });

    const { searchParams } = new URL(request.url);

    // Parse filters from query params
    const filters: MarketFilters = {};

    // Source filter
    const source = searchParams.get('source');
    if (source) {
      if (source.includes(',')) {
        filters.source = source.split(',') as MarketSource[];
      } else {
        filters.source = source as MarketSource;
      }
    }

    // Status filter
    const status = searchParams.get('status');
    if (status) {
      filters.status = status as ExternalMarketStatus;
    }

    // Category filter
    const category = searchParams.get('category');
    if (category) {
      filters.category = category;
    }

    // Search filter
    const search = searchParams.get('search');
    if (search) {
      filters.search = search;
    }

    // Volume filter
    const minVolume = searchParams.get('minVolume');
    if (minVolume) {
      filters.minVolume = minVolume;
    }

    // End time filter
    const maxEndTime = searchParams.get('maxEndTime');
    if (maxEndTime) {
      filters.maxEndTime = parseInt(maxEndTime);
    }

    // Sorting
    const sortBy = searchParams.get('sortBy');
    if (sortBy) {
      filters.sortBy = sortBy as 'volume' | 'endTime' | 'yesPrice' | 'createdAt';
    }

    const sortOrder = searchParams.get('sortOrder');
    if (sortOrder) {
      filters.sortOrder = sortOrder as 'asc' | 'desc';
    }

    // Pagination
    const page = searchParams.get('page');
    if (page) {
      filters.page = parseInt(page);
    }

    const pageSize = searchParams.get('pageSize');
    if (pageSize) {
      filters.pageSize = Math.min(parseInt(pageSize), 100); // Max 100 per page
    }

    // Fetch markets
    const markets = await externalMarketsService.getAllMarkets(filters);

    // Get stats for response
    const stats = await externalMarketsService.getMarketStats();

    return NextResponse.json({
      success: true,
      data: {
        markets,
        total: stats.totalMarkets,
        page: filters.page || 1,
        pageSize: filters.pageSize || 50,
        lastSync: stats.lastSync,
      },
    });
  } catch (error) {
    return handleAPIError(error, 'API:ExternalMarkets:GET');
  }
}
