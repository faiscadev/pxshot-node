// src/errors.ts
var PxshotError = class extends Error {
  /** HTTP status code (if applicable) */
  status;
  /** Error code from API */
  code;
  constructor(message, status, code) {
    super(message);
    this.name = "PxshotError";
    this.status = status;
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var AuthenticationError = class extends PxshotError {
  constructor(message = "Invalid or missing API key") {
    super(message, 401, "authentication_error");
    this.name = "AuthenticationError";
  }
};
var RateLimitError = class extends PxshotError {
  /** Rate limit information */
  rateLimit;
  constructor(message, rateLimit) {
    super(message, 429, "rate_limit_exceeded");
    this.name = "RateLimitError";
    this.rateLimit = rateLimit;
  }
  /** Milliseconds until the rate limit resets */
  get retryAfter() {
    return Math.max(0, this.rateLimit.reset * 1e3 - Date.now());
  }
};
var ValidationError = class extends PxshotError {
  /** Field-level validation errors */
  errors;
  constructor(message, errors) {
    super(message, 400, "validation_error");
    this.name = "ValidationError";
    this.errors = errors;
  }
};
var NotFoundError = class extends PxshotError {
  constructor(message = "Resource not found") {
    super(message, 404, "not_found");
    this.name = "NotFoundError";
  }
};
var ScreenshotError = class extends PxshotError {
  constructor(message, code) {
    super(message, 422, code ?? "screenshot_failed");
    this.name = "ScreenshotError";
  }
};
var TimeoutError = class extends PxshotError {
  constructor(message = "Request timed out") {
    super(message, void 0, "timeout");
    this.name = "TimeoutError";
  }
};
var NetworkError = class extends PxshotError {
  cause;
  constructor(message, cause) {
    super(message, void 0, "network_error");
    this.name = "NetworkError";
    this.cause = cause;
  }
};
var ServerError = class extends PxshotError {
  constructor(message = "Internal server error", status = 500) {
    super(message, status, "server_error");
    this.name = "ServerError";
  }
};
function parseError(status, body, rateLimit) {
  const message = extractMessage(body);
  switch (status) {
    case 400:
      return new ValidationError(
        message,
        typeof body === "object" && body !== null && "errors" in body ? body.errors : void 0
      );
    case 401:
      return new AuthenticationError(message);
    case 404:
      return new NotFoundError(message);
    case 422:
      return new ScreenshotError(
        message,
        typeof body === "object" && body !== null && "code" in body ? String(body.code) : void 0
      );
    case 429:
      return new RateLimitError(
        message,
        rateLimit ?? { limit: 0, remaining: 0, reset: Math.floor(Date.now() / 1e3) + 60 }
      );
    default:
      if (status >= 500) {
        return new ServerError(message, status);
      }
      return new PxshotError(message, status);
  }
}
function extractMessage(body) {
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null) {
    if ("message" in body && typeof body.message === "string") {
      return body.message;
    }
    if ("error" in body && typeof body.error === "string") {
      return body.error;
    }
  }
  return "Unknown error";
}

// src/client.ts
var DEFAULT_BASE_URL = "https://api.pxshot.com";
var DEFAULT_TIMEOUT = 6e4;
var DEFAULT_RETRIES = 2;
var DEFAULT_RETRY_DELAY = 1e3;
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
var Pxshot = class {
  apiKey;
  baseUrl;
  timeout;
  retries;
  retryDelay;
  fetchFn;
  /** Last rate limit info from the most recent request */
  lastRateLimit;
  constructor(apiKeyOrConfig) {
    const config = typeof apiKeyOrConfig === "string" ? { apiKey: apiKeyOrConfig } : apiKeyOrConfig;
    if (!config.apiKey) {
      throw new PxshotError("API key is required");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.retryDelay = config.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    if (!this.fetchFn) {
      throw new PxshotError(
        "fetch is not available. Please provide a fetch implementation in the config."
      );
    }
  }
  async screenshot(options) {
    const { store, ...rest } = options;
    if (store) {
      return this.request({
        method: "POST",
        path: "/v1/screenshot",
        body: { ...rest, store: true },
        responseType: "json"
      });
    }
    return this.request({
      method: "POST",
      path: "/v1/screenshot",
      body: { ...rest, store: false },
      responseType: "buffer"
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
  async usage() {
    return this.request({
      method: "GET",
      path: "/v1/usage",
      responseType: "json"
    });
  }
  /**
   * Check API health status
   *
   * @returns Health status
   */
  async health() {
    return this.request({
      method: "GET",
      path: "/health",
      responseType: "json"
    });
  }
  /**
   * Make an authenticated request to the API
   */
  async request(options) {
    const { method, path, body, responseType = "json" } = options;
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: responseType === "json" ? "application/json" : "*/*"
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : void 0
        });
        this.lastRateLimit = this.parseRateLimitHeaders(response.headers);
        if (!response.ok) {
          let errorBody;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = await response.text().catch(() => null);
          }
          const error = parseError(response.status, errorBody, this.lastRateLimit);
          if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.retries) {
            lastError = error;
            await this.sleep(this.calculateBackoff(attempt, response.status === 429));
            continue;
          }
          throw error;
        }
        if (responseType === "buffer") {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
        return await response.json();
      } catch (error) {
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
        if (error instanceof PxshotError) {
          throw error;
        }
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
          }
          throw new NetworkError(`Network error: ${error.message}`, error);
        }
        throw new PxshotError(`Unknown error: ${String(error)}`);
      }
    }
    throw lastError ?? new PxshotError("Request failed after retries");
  }
  /**
   * Fetch with timeout support
   */
  async fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchFn(url, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }
      throw new NetworkError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : void 0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
  /**
   * Parse rate limit headers from response
   */
  parseRateLimitHeaders(headers) {
    const limit = headers.get("X-RateLimit-Limit");
    const remaining = headers.get("X-RateLimit-Remaining");
    const reset = headers.get("X-RateLimit-Reset");
    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10)
      };
    }
    return void 0;
  }
  /**
   * Calculate exponential backoff delay
   */
  calculateBackoff(attempt, isRateLimit) {
    if (isRateLimit && this.lastRateLimit) {
      const retryAfter = this.lastRateLimit.reset * 1e3 - Date.now();
      return Math.max(1e3, Math.min(retryAfter, 6e4));
    }
    const baseDelay = this.retryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 3e4);
  }
  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

export { AuthenticationError, NetworkError, NotFoundError, Pxshot, PxshotError, RateLimitError, ScreenshotError, ServerError, TimeoutError, ValidationError };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map