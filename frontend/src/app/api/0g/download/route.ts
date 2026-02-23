/**
 * API Route: 0G Storage Download
 * GET /api/0g/download?rootHash=0x...
 *
 * Downloads files from 0G Storage by root hash with smart content-type detection.
 * Used by client-side hooks to fetch warrior NFT metadata and images.
 */

import { NextResponse } from 'next/server';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';
import { downloadFrom0G, detectContentType } from '@/lib/0g/downloadHelper';

export const GET = composeMiddleware([
  withRateLimit({ prefix: '0g-download', ...RateLimitPresets.moderateReads }),
  async (req) => {
    const { searchParams } = new URL(req.url);
    const rootHash = searchParams.get('rootHash');

    if (!rootHash) {
      throw ErrorResponses.badRequest('rootHash query parameter is required');
    }

    const data = await downloadFrom0G(rootHash);

    if (!data) {
      throw ErrorResponses.notFound('File not found in 0G Storage');
    }

    const contentType = detectContentType(data);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': data.length.toString(),
        // 0G content is immutable (content-addressed), cache aggressively
        'Cache-Control': 'public, max-age=86400, immutable',
        'ETag': `"${rootHash}"`,
      },
    });
  },
], { errorContext: 'API:0G:Download:GET' });
