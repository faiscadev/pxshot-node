# Pxshot

Official Node.js/TypeScript SDK for [Pxshot](https://pxshot.com) - the screenshot API.

## Features

- 🎯 **TypeScript-first** - Full type definitions included
- 🪶 **Zero dependencies** - Uses native `fetch`
- ⚡ **Promise-based** - Async/await ready
- 🔄 **Auto-retry** - Configurable retry with exponential backoff
- 🚦 **Rate limit aware** - Parses and exposes rate limit headers
- 🌐 **Universal** - Works in Node.js 18+ and modern browsers

## Installation

```bash
npm install pxshot
```

## Quick Start

```typescript
import { Pxshot } from 'pxshot';

const client = new Pxshot('px_your_api_key');

// Capture a screenshot
const buffer = await client.screenshot({ url: 'https://example.com' });

// Save to file (Node.js)
import { writeFileSync } from 'fs';
writeFileSync('screenshot.png', buffer);
```

## Usage

### Initialize the Client

```typescript
import { Pxshot } from 'pxshot';

// Simple initialization with API key
const client = new Pxshot('px_your_api_key');

// Or with full configuration
const client = new Pxshot({
  apiKey: 'px_your_api_key',
  baseUrl: 'https://api.pxshot.com', // Optional
  timeout: 60000, // Request timeout in ms (default: 60000)
  retries: 2, // Number of retries on failure (default: 2)
  retryDelay: 1000, // Base delay between retries in ms (default: 1000)
});
```

### Capture Screenshots

#### Get Screenshot as Buffer

```typescript
const buffer = await client.screenshot({
  url: 'https://example.com',
});

// With options
const buffer = await client.screenshot({
  url: 'https://example.com',
  format: 'webp', // 'png' | 'jpeg' | 'webp'
  quality: 90, // 0-100 for jpeg/webp
  width: 1280, // Viewport width
  height: 720, // Viewport height
  full_page: true, // Capture full scrollable page
  wait_until: 'networkidle0', // Wait for network idle
  wait_for_selector: '#content', // Wait for element
  wait_for_timeout: 2000, // Wait in ms
  device_scale_factor: 2, // Retina scale
  block_ads: true, // Block ads and trackers
});
```

#### Get Screenshot as Hosted URL

```typescript
const result = await client.screenshot({
  url: 'https://example.com',
  store: true,
});

console.log(result.url); // https://cdn.pxshot.com/abc123.png
console.log(result.expires_at); // 2024-01-01T00:00:00Z
console.log(result.width); // 1920
console.log(result.height); // 1080
console.log(result.size_bytes); // 123456
```

### Check Usage

```typescript
const usage = await client.usage();

console.log(`Used: ${usage.screenshots_used} / ${usage.screenshots_limit}`);
console.log(`Storage: ${usage.storage_used_bytes} bytes`);
console.log(`Period: ${usage.period}`);
```

### Health Check

```typescript
const health = await client.health();
console.log(health.status); // 'ok' | 'degraded' | 'down'
```

## Error Handling

The SDK provides typed errors for different scenarios:

```typescript
import {
  Pxshot,
  PxshotError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ScreenshotError,
  TimeoutError,
  NetworkError,
  ServerError,
} from 'pxshot';

const client = new Pxshot('px_your_api_key');

try {
  await client.screenshot({ url: 'https://example.com' });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}ms`);
    console.log(error.rateLimit); // { limit, remaining, reset }
  } else if (error instanceof ValidationError) {
    console.error('Validation failed:', error.errors);
  } else if (error instanceof ScreenshotError) {
    console.error('Screenshot failed:', error.message);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.cause);
  } else if (error instanceof ServerError) {
    console.error('Server error:', error.status);
  } else if (error instanceof PxshotError) {
    console.error('API error:', error.message, error.code);
  }
}
```

## Rate Limits

Rate limit information is available after each request:

```typescript
await client.screenshot({ url: 'https://example.com' });

if (client.lastRateLimit) {
  console.log(`Limit: ${client.lastRateLimit.limit}`);
  console.log(`Remaining: ${client.lastRateLimit.remaining}`);
  console.log(`Resets at: ${new Date(client.lastRateLimit.reset * 1000)}`);
}
```

## TypeScript

All types are exported for your convenience:

```typescript
import type {
  ScreenshotOptions,
  ScreenshotStoredResult,
  UsageResult,
  HealthResult,
  RateLimitInfo,
  PxshotConfig,
  ScreenshotFormat,
  WaitUntil,
} from 'pxshot';
```

## Browser Usage

The SDK works in browsers that support `fetch`:

```typescript
import { Pxshot } from 'pxshot';

const client = new Pxshot('px_your_api_key');

// Get as hosted URL (recommended for browsers)
const result = await client.screenshot({
  url: 'https://example.com',
  store: true,
});

// Display the image
const img = document.createElement('img');
img.src = result.url;
document.body.appendChild(img);
```

## Requirements

- Node.js 18+ (for native `fetch`)
- Or any environment with `fetch` available (browsers, Deno, Bun, etc.)

## License

MIT
