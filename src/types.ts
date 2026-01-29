/**
 * Screenshot format options
 */
export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

/**
 * Wait until navigation event
 */
export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';

/**
 * Base screenshot options (common fields)
 */
export interface ScreenshotOptionsBase {
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
export interface ScreenshotOptionsBuffer extends ScreenshotOptionsBase {
  /** Store screenshot and return URL (default: false) */
  store?: false;
}

/**
 * Screenshot options that return a stored URL
 */
export interface ScreenshotOptionsStore extends ScreenshotOptionsBase {
  /** Store screenshot and return URL */
  store: true;
}

/**
 * Combined screenshot options type
 */
export type ScreenshotOptions = ScreenshotOptionsBuffer | ScreenshotOptionsStore;

/**
 * Response when store=true
 */
export interface ScreenshotStoredResult {
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
export interface UsageResult {
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
export interface HealthResult {
  /** Service status */
  status: 'ok' | 'degraded' | 'down';
  /** Optional message */
  message?: string;
}

/**
 * Rate limit information parsed from response headers
 */
export interface RateLimitInfo {
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
export interface PxshotConfig {
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
 * Internal request options
 */
export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  responseType?: 'json' | 'buffer';
}
