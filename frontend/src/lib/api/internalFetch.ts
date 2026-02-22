/**
 * Fetch wrapper for server-to-server self-calls.
 *
 * On Vercel, Deployment Protection blocks requests that lack browser auth
 * cookies. This wrapper injects the bypass header when the
 * VERCEL_AUTOMATION_BYPASS_SECRET env var is configured, allowing
 * server-side route-to-route calls to pass through.
 *
 * Signature is identical to global fetch() — drop-in replacement.
 */
export async function internalFetch(
  url: string | URL | Request,
  options: RequestInit = {}
): Promise<Response> {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  if (!bypassSecret) {
    return fetch(url, options);
  }

  const headers = new Headers(options.headers);
  headers.set('x-vercel-protection-bypass', bypassSecret);

  return fetch(url, { ...options, headers });
}
