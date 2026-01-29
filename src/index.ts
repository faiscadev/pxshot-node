// Main client
export { Pxshot } from './client.js';

// Types
export type {
  ScreenshotFormat,
  WaitUntil,
  ScreenshotOptionsBase,
  ScreenshotOptionsBuffer,
  ScreenshotOptionsStore,
  ScreenshotOptions,
  ScreenshotStoredResult,
  UsageResult,
  HealthResult,
  RateLimitInfo,
  PxshotConfig,
} from './types.js';

// Errors
export {
  PxshotError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  ScreenshotError,
  TimeoutError,
  NetworkError,
  ServerError,
} from './errors.js';
