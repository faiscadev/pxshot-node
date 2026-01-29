import type {
  PxshotConfig,
  ScreenshotOptions,
  ScreenshotOptionsStore,
  ScreenshotStoredResult,
  UsageResult,
  HealthResult,
  RateLimitInfo,
  RequestOptions,
} from './types.js';
import {
  PxshotError,
  NetworkError,
  TimeoutError,
  parseError,
} from './errors.js';

const DEFAULT_BASE_URL = 'https://api.pxshot.com';
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1000;

// Status codes that are safe to retry
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Pxshot API client
 *
 * @example
 * ```typescript
 * const client = new Pxshot('px_your_api_key');
 *
 * // Get screenshot as buffer
 * const buffer = await client.screenshot({ url: 'https://example.com' });
 *
 * // Get screenshot URL
 * const result = await client.screenshot({ url: 'https://example.com', store: true });
 * console.log(result.url);
 * ```
 */
export class Pxshot {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly fetchFn: typeof fetch;

  /** Last rate limit info from the most recent request */
  public lastRateLimit?: RateLimitInfo;

  constructor(apiKeyOrConfig: string | PxshotConfig) {
    const config: PxshotConfig =
      typeof apiKeyOrConfig === 'string'
        ? { apiKey: apiKeyOrConfig }
        : apiKeyOrConfig;

    if (!config.apiKey) {
      throw new PxshotError('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.retryDelay = config.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.fetchFn = config.fetch ?? globalThis.fetch;

    if (!this.fetchFn) {
      throw new PxshotError(
        'fetch is not available. Please provide a fetch implementation in the config.'
      );
    }
  }

  /**
   * Capture a screenshot
   *
   * @param options - Screenshot options
   * @returns Buffer when store=false (default), or ScreenshotStoredResult when store=true
   *
   * @example
   * ```typescript
   * // Get as buffer
   * const buffer = await client.screenshot({ url: 'https://example.com' });
   * fs.writeFileSync('screenshot.png', buffer);
   *
   * // Get as URL
   * const result = await client.screenshot({
   *   url: 'https://example.com',
   *   store: true,
   *   format: 'webp',
   *   width: 1280,
   *   height: 720,
   * });
   * console.log(result.url);
   * ```
   */
  async screenshot(options: ScreenshotOptionsStore): Promise<ScreenshotStoredResult>;
  async screenshot(options: ScreenshotOptions): Promise<Buffer>;
  async screenshot(
    options: ScreenshotOptions
  ): Promise<Buffer | ScreenshotStoredResult> {
    const { store, ...rest } = options;

    if (store) {
      return this.request<ScreenshotStoredResult>({
        method: 'POST',
        path: '/v1/screenshot',
        body: { ...rest, store: true },
        responseType: 'json',
      });
    }

    return this.request<Buffer>({
      method: 'POST',
      path: '/v1/screenshot',
      body: { ...rest, store: false },
      responseType: 'buffer',
    });
  }

  /**
   * Get usage statistics for the current billing period
   *
   * @returns Current usage information
   *
   * @example
   * ```typescript
   * const usage = await client.usage();
   * console.log(`Used ${usage.screenshots_used} of ${usage.screenshots_limit} screenshots`);
   * ```
   */
  async usage(): Promise<UsageResult> {
    return this.request<UsageResult>({
      method: 'GET',
      path: '/v1/usage',
      responseType: 'json',
    });
  }

  /**
   * Check API health status
   *
   * @returns Health status
   */
  async health(): Promise<HealthResult> {
    return this.request<HealthResult>({
      method: 'GET',
      path: '/health',
      responseType: 'json',
    });
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(options: RequestOptions): Promise<T> {
    const { method, path, body, responseType = 'json' } = options;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: responseType === 'json' ? 'application/json' : '*/*',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        // Parse rate limit headers
        this.lastRateLimit = this.parseRateLimitHeaders(response.headers);

        if (!response.ok) {
          let errorBody: unknown;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = await response.text().catch(() => null);
          }

          const error = parseError(response.status, errorBody, this.lastRateLimit);

          // Only retry on specific status codes
          if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.retries) {
            lastError = error;
            await this.sleep(this.calculateBackoff(attempt, response.status === 429));
            continue;
          }

          throw error;
        }

        // Parse response based on expected type
        if (responseType === 'buffer') {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer) as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        // Don't retry on non-retryable errors
        if (error instanceof PxshotError && !RETRYABLE_STATUS_CODES.has(error.status ?? 0)) {
          throw error;
        }

        if (error instanceof TimeoutError || error instanceof NetworkError) {
          if (attempt < this.retries) {
            lastError = error;
            await this.sleep(this.calculateBackoff(attempt, false));
            continue;
          }
        }

        // If it's already one of our errors, rethrow
        if (error instanceof PxshotError) {
          throw error;
        }

        // Wrap unknown errors
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
          }
          throw new NetworkError(`Network error: ${error.message}`, error);
        }

        throw new PxshotError(`Unknown error: ${String(error)}`);
      }
    }

    // If we exhausted retries, throw the last error
    throw lastError ?? new PxshotError('Request failed after retries');
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await this.fetchFn(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }
      throw new NetworkError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse rate limit headers from response
   */
  private parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      };
    }

    return undefined;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number, isRateLimit: boolean): number {
    if (isRateLimit && this.lastRateLimit) {
      // For rate limits, wait until reset
      const retryAfter = (this.lastRateLimit.reset * 1000) - Date.now();
      return Math.max(1000, Math.min(retryAfter, 60000));
    }

    // Exponential backoff with jitter
    const baseDelay = this.retryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
