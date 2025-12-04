// DEPRECATED: This API route has been moved to the dedicated arena backend service
// This file now serves as a redirect/proxy to the new backend
import { NextApiRequest, NextApiResponse } from 'next';

// Arena Backend URL - configured via environment variable
const ARENA_BACKEND_URL = process.env.NEXT_PUBLIC_ARENA_BACKEND_URL || 'http://localhost:3002';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { battleId } = req.query;

  try {
    // Redirect to the new backend service
    const backendUrl = `${ARENA_BACKEND_URL}/api/arena/commands${battleId ? `?battleId=${battleId}` : ''}`;
    
    // Forward the request to the new backend
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });
    
    const data = await response.json();
    
    // Return the response from the backend
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Error redirecting to backend:', error);
    res.status(500).json({
      error: `Backend service unavailable. Please ensure the arena backend is running at ${ARENA_BACKEND_URL}`,
      originalError: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
