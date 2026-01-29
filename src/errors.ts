import type { RateLimitInfo } from './types.js';

/**
 * Base error class for all Pxshot errors
 */
export class PxshotError extends Error {
  /** HTTP status code (if applicable) */
  readonly status?: number;
  /** Error code from API */
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'PxshotError';
    this.status = status;
    this.code = code;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends PxshotError {
  constructor(message = 'Invalid or missing API key') {
    super(message, 401, 'authentication_error');
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limit exceeded error (429)
 */
export class RateLimitError extends PxshotError {
  /** Rate limit information */
  readonly rateLimit: RateLimitInfo;

  constructor(message: string, rateLimit: RateLimitInfo) {
    super(message, 429, 'rate_limit_exceeded');
    this.name = 'RateLimitError';
    this.rateLimit = rateLimit;
  }

  /** Milliseconds until the rate limit resets */
  get retryAfter(): number {
    return Math.max(0, (this.rateLimit.reset * 1000) - Date.now());
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends PxshotError {
  /** Field-level validation errors */
  readonly errors?: Record<string, string[]>;

  constructor(message: string, errors?: Record<string, string[]>) {
    super(message, 400, 'validation_error');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends PxshotError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'not_found');
    this.name = 'NotFoundError';
  }
}

/**
 * Screenshot capture failed error
 */
export class ScreenshotError extends PxshotError {
  constructor(message: string, code?: string) {
    super(message, 422, code ?? 'screenshot_failed');
    this.name = 'ScreenshotError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends PxshotError {
  constructor(message = 'Request timed out') {
    super(message, undefined, 'timeout');
    this.name = 'TimeoutError';
  }
}

/**
 * Network/connection error
 */
export class NetworkError extends PxshotError {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, undefined, 'network_error');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Server error (5xx)
 */
export class ServerError extends PxshotError {
  constructor(message = 'Internal server error', status = 500) {
    super(message, status, 'server_error');
    this.name = 'ServerError';
  }
}

/**
 * Parse an API error response into the appropriate error class
 */
export function parseError(
  status: number,
  body: unknown,
  rateLimit?: RateLimitInfo
): PxshotError {
  const message = extractMessage(body);

  switch (status) {
    case 400:
      return new ValidationError(
        message,
        typeof body === 'object' && body !== null && 'errors' in body
          ? (body as { errors: Record<string, string[]> }).errors
          : undefined
      );
    case 401:
      return new AuthenticationError(message);
    case 404:
      return new NotFoundError(message);
    case 422:
      return new ScreenshotError(
        message,
        typeof body === 'object' && body !== null && 'code' in body
          ? String((body as { code: unknown }).code)
          : undefined
      );
    case 429:
      return new RateLimitError(
        message,
        rateLimit ?? { limit: 0, remaining: 0, reset: Math.floor(Date.now() / 1000) + 60 }
      );
    default:
      if (status >= 500) {
        return new ServerError(message, status);
      }
      return new PxshotError(message, status);
  }
}

function extractMessage(body: unknown): string {
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null) {
    if ('message' in body && typeof (body as { message: unknown }).message === 'string') {
      return (body as { message: string }).message;
    }
    if ('error' in body && typeof (body as { error: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
  }
  return 'Unknown error';
}
