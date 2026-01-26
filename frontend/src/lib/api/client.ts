/**
 * Type-Safe API Client
 * A strongly-typed HTTP client for making API requests
 */

import { APIError, ErrorResponses } from './errorHandler';

/**
 * HTTP methods supported by the client
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request configuration options
 */
export interface RequestConfig<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  retries?: number;
  retryDelay?: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  ok: boolean;
}

/**
 * API client configuration
 */
export interface ApiClientConfig {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  onResponse?: <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
  onError?: (error: APIError) => void | Promise<void>;
}

/**
 * Create a type-safe API client
 *
 * @example
 * const api = createApiClient({
 *   baseUrl: '/api',
 *   defaultHeaders: {
 *     'Content-Type': 'application/json',
 *   },
 * });
 *
 * // GET request
 * const { data } = await api.get<User[]>('/users');
 *
 * // POST request
 * const { data } = await api.post<User>('/users', { name: 'John' });
 *
 * // With query params
 * const { data } = await api.get<User[]>('/users', { params: { limit: 10 } });
 */
export function createApiClient(config: ApiClientConfig) {
  const {
    baseUrl,
    defaultHeaders = { 'Content-Type': 'application/json' },
    timeout: defaultTimeout = 30000,
    onRequest,
    onResponse,
    onError,
  } = config;

  /**
   * Build URL with query parameters
   */
  function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, baseUrl.startsWith('http') ? baseUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${baseUrl}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Make an HTTP request
   */
  async function request<TResponse, TBody = unknown>(
    path: string,
    requestConfig: RequestConfig<TBody> = {}
  ): Promise<ApiResponse<TResponse>> {
    let finalConfig = requestConfig;

    // Apply request interceptor
    if (onRequest) {
      finalConfig = await onRequest(finalConfig);
    }

    const {
      method = 'GET',
      body,
      headers = {},
      params,
      timeout = defaultTimeout,
      signal,
      credentials = 'same-origin',
      cache,
      retries = 0,
      retryDelay = 1000,
    } = finalConfig;

    const url = buildUrl(path, params);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine signals if external signal provided
    const combinedSignal = signal
      ? new AbortController().signal
      : controller.signal;

    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...defaultHeaders,
        ...headers,
      },
      credentials,
      signal: combinedSignal,
      cache,
    };

    if (body !== undefined && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    let lastError: APIError | null = null;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        let data: TResponse;

        // Try to parse JSON, fall back to text
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = (await response.text()) as unknown as TResponse;
        }

        if (!response.ok) {
          const error = new APIError(
            (data as { message?: string })?.message || response.statusText,
            response.status,
            (data as { code?: string })?.code || 'API_ERROR'
          );
          throw error;
        }

        let apiResponse: ApiResponse<TResponse> = {
          data,
          status: response.status,
          headers: response.headers,
          ok: response.ok,
        };

        // Apply response interceptor
        if (onResponse) {
          apiResponse = await onResponse(apiResponse);
        }

        return apiResponse;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof APIError) {
          lastError = error;
        } else if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = ErrorResponses.timeout();
          } else {
            lastError = new APIError(error.message, 500, 'NETWORK_ERROR');
          }
        } else {
          lastError = new APIError('Unknown error', 500, 'UNKNOWN_ERROR');
        }

        // Don't retry on client errors (4xx)
        if (lastError.statusCode >= 400 && lastError.statusCode < 500) {
          break;
        }

        attempt++;
        if (attempt <= retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    // Call error handler
    if (onError && lastError) {
      await onError(lastError);
    }

    throw lastError;
  }

  return {
    /**
     * Make a GET request
     */
    get<TResponse>(
      path: string,
      config?: Omit<RequestConfig, 'method' | 'body'>
    ): Promise<ApiResponse<TResponse>> {
      return request<TResponse>(path, { ...config, method: 'GET' });
    },

    /**
     * Make a POST request
     */
    post<TResponse, TBody = unknown>(
      path: string,
      body?: TBody,
      config?: Omit<RequestConfig<TBody>, 'method' | 'body'>
    ): Promise<ApiResponse<TResponse>> {
      return request<TResponse, TBody>(path, { ...config, method: 'POST', body });
    },

    /**
     * Make a PUT request
     */
    put<TResponse, TBody = unknown>(
      path: string,
      body?: TBody,
      config?: Omit<RequestConfig<TBody>, 'method' | 'body'>
    ): Promise<ApiResponse<TResponse>> {
      return request<TResponse, TBody>(path, { ...config, method: 'PUT', body });
    },

    /**
     * Make a PATCH request
     */
    patch<TResponse, TBody = unknown>(
      path: string,
      body?: TBody,
      config?: Omit<RequestConfig<TBody>, 'method' | 'body'>
    ): Promise<ApiResponse<TResponse>> {
      return request<TResponse, TBody>(path, { ...config, method: 'PATCH', body });
    },

    /**
     * Make a DELETE request
     */
    delete<TResponse>(
      path: string,
      config?: Omit<RequestConfig, 'method' | 'body'>
    ): Promise<ApiResponse<TResponse>> {
      return request<TResponse>(path, { ...config, method: 'DELETE' });
    },

    /**
     * Make a raw request with full config
     */
    request,
  };
}

/**
 * Default API client for the application
 *
 * @example
 * import { api } from '@/lib/api/client';
 *
 * const { data } = await api.get<User[]>('/users');
 */
export const api = createApiClient({
  baseUrl: '/api',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Create a typed API endpoint helper
 *
 * @example
 * const userEndpoint = createEndpoint<{ id: string }, User>('/users/:id');
 *
 * const { data } = await userEndpoint.get({ id: '123' });
 */
export function createEndpoint<TParams extends Record<string, string> = Record<string, never>, TResponse = unknown>(
  pathTemplate: string,
  client = api
) {
  function buildPath(params?: TParams): string {
    if (!params) return pathTemplate;

    let path = pathTemplate;
    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, encodeURIComponent(value));
    });
    return path;
  }

  return {
    get(params?: TParams, config?: Omit<RequestConfig, 'method' | 'body'>) {
      return client.get<TResponse>(buildPath(params), config);
    },

    post<TBody = unknown>(params: TParams | undefined, body: TBody, config?: Omit<RequestConfig<TBody>, 'method' | 'body'>) {
      return client.post<TResponse, TBody>(buildPath(params), body, config);
    },

    put<TBody = unknown>(params: TParams | undefined, body: TBody, config?: Omit<RequestConfig<TBody>, 'method' | 'body'>) {
      return client.put<TResponse, TBody>(buildPath(params), body, config);
    },

    patch<TBody = unknown>(params: TParams | undefined, body: TBody, config?: Omit<RequestConfig<TBody>, 'method' | 'body'>) {
      return client.patch<TResponse, TBody>(buildPath(params), body, config);
    },

    delete(params?: TParams, config?: Omit<RequestConfig, 'method' | 'body'>) {
      return client.delete<TResponse>(buildPath(params), config);
    },
  };
}

/**
 * Utility to check if an error is an API error
 */
export function isApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}

/**
 * Utility to get a user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

export default api;
