/**
 * Screenshot format options
 */
type ScreenshotFormat = 'png' | 'jpeg' | 'webp';
/**
 * Wait until navigation event
 */
type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
/**
 * Base screenshot options (common fields)
 */
interface ScreenshotOptionsBase {
    /** URL to capture */
    url: string;
    /** Image format (default: png) */
    format?: ScreenshotFormat;
    /** JPEG/WebP quality 0-100 (default: 80) */
    quality?: number;
    /** Viewport width in pixels (default: 1920) */
    width?: number;
    /** Viewport height in pixels (default: 1080) */
    height?: number;
    /** Capture full scrollable page (default: false) */
    full_page?: boolean;
    /** Wait until navigation event */
    wait_until?: WaitUntil;
    /** CSS selector to wait for before capture */
    wait_for_selector?: string;
    /** Milliseconds to wait before capture */
    wait_for_timeout?: number;
    /** Device scale factor for retina (default: 1) */
    device_scale_factor?: number;
}
/**
 * Screenshot options that return a Buffer
 */
interface ScreenshotOptionsBuffer extends ScreenshotOptionsBase {
    /** Store screenshot and return URL (default: false) */
    store?: false;
}
/**
 * Screenshot options that return a stored URL
 */
interface ScreenshotOptionsStore extends ScreenshotOptionsBase {
    /** Store screenshot and return URL */
    store: true;
}
/**
 * Combined screenshot options type
 */
type ScreenshotOptions = ScreenshotOptionsBuffer | ScreenshotOptionsStore;
/**
 * Response when store=true
 */
interface ScreenshotStoredResult {
    /** URL to the stored screenshot */
    url: string;
    /** When the URL expires */
    expires_at: string;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** File size in bytes */
    size_bytes: number;
}
/**
 * Usage statistics response
 */
interface UsageResult {
    /** Billing period (e.g., "2024-01") */
    period: string;
    /** Number of screenshots used this period */
    screenshots_used: number;
    /** Screenshot limit for this period */
    screenshots_limit: number;
    /** Storage used in bytes */
    storage_used_bytes: number;
}
/**
 * Health check response
 */
interface HealthResult {
    /** Service status */
    status: 'ok' | 'degraded' | 'down';
    /** Optional message */
    message?: string;
}
/**
 * Rate limit information parsed from response headers
 */
interface RateLimitInfo {
    /** Maximum requests allowed in the window */
    limit: number;
    /** Remaining requests in the current window */
    remaining: number;
    /** Unix timestamp when the limit resets */
    reset: number;
}
/**
 * Client configuration options
 */
interface PxshotConfig {
    /** API key for authentication */
    apiKey: string;
    /** Base URL for the API (default: https://api.pxshot.com) */
    baseUrl?: string;
    /** Request timeout in milliseconds (default: 60000) */
    timeout?: number;
    /** Number of retry attempts on failure (default: 2) */
    retries?: number;
    /** Base delay between retries in ms (default: 1000) */
    retryDelay?: number;
    /** Custom fetch implementation (for testing or environments without global fetch) */
    fetch?: typeof fetch;
}

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
declare class Pxshot {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeout;
    private readonly retries;
    private readonly retryDelay;
    private readonly fetchFn;
    /** Last rate limit info from the most recent request */
    lastRateLimit?: RateLimitInfo;
    constructor(apiKeyOrConfig: string | PxshotConfig);
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
    screenshot(options: ScreenshotOptionsStore): Promise<ScreenshotStoredResult>;
    screenshot(options: ScreenshotOptions): Promise<Buffer>;
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
    usage(): Promise<UsageResult>;
    /**
     * Check API health status
     *
     * @returns Health status
     */
    health(): Promise<HealthResult>;
    /**
     * Make an authenticated request to the API
     */
    private request;
    /**
     * Fetch with timeout support
     */
    private fetchWithTimeout;
    /**
     * Parse rate limit headers from response
     */
    private parseRateLimitHeaders;
    /**
     * Calculate exponential backoff delay
     */
    private calculateBackoff;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
}

/**
 * Base error class for all Pxshot errors
 */
declare class PxshotError extends Error {
    /** HTTP status code (if applicable) */
    readonly status?: number;
    /** Error code from API */
    readonly code?: string;
    constructor(message: string, status?: number, code?: string);
}
/**
 * Authentication error (401)
 */
declare class AuthenticationError extends PxshotError {
    constructor(message?: string);
}
/**
 * Rate limit exceeded error (429)
 */
declare class RateLimitError extends PxshotError {
    /** Rate limit information */
    readonly rateLimit: RateLimitInfo;
    constructor(message: string, rateLimit: RateLimitInfo);
    /** Milliseconds until the rate limit resets */
    get retryAfter(): number;
}
/**
 * Validation error (400)
 */
declare class ValidationError extends PxshotError {
    /** Field-level validation errors */
    readonly errors?: Record<string, string[]>;
    constructor(message: string, errors?: Record<string, string[]>);
}
/**
 * Resource not found error (404)
 */
declare class NotFoundError extends PxshotError {
    constructor(message?: string);
}
/**
 * Screenshot capture failed error
 */
declare class ScreenshotError extends PxshotError {
    constructor(message: string, code?: string);
}
/**
 * Timeout error
 */
declare class TimeoutError extends PxshotError {
    constructor(message?: string);
}
/**
 * Network/connection error
 */
declare class NetworkError extends PxshotError {
    readonly cause?: Error;
    constructor(message: string, cause?: Error);
}
/**
 * Server error (5xx)
 */
declare class ServerError extends PxshotError {
    constructor(message?: string, status?: number);
}

export { AuthenticationError, type HealthResult, NetworkError, NotFoundError, Pxshot, type PxshotConfig, PxshotError, RateLimitError, type RateLimitInfo, ScreenshotError, type ScreenshotFormat, type ScreenshotOptions, type ScreenshotOptionsBase, type ScreenshotOptionsBuffer, type ScreenshotOptionsStore, type ScreenshotStoredResult, ServerError, TimeoutError, type UsageResult, ValidationError, type WaitUntil };
