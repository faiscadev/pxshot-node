import { describe, it, expect, vi } from 'vitest';
import { Pxshot } from './client.js';
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
} from './errors.js';

// Mock fetch for testing
function createMockFetch(responses: Array<{
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    
    const headers = new Headers(response.headers ?? {});
    
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
      arrayBuffer: async () => {
        if (response.body instanceof ArrayBuffer) return response.body;
        if (Buffer.isBuffer(response.body)) return response.body.buffer;
        return new TextEncoder().encode(JSON.stringify(response.body)).buffer;
      },
    } as Response;
  }) as unknown as typeof fetch;
}

describe('Pxshot', () => {
  describe('constructor', () => {
    it('accepts a string API key', () => {
      const mockFetch = createMockFetch([{ status: 200 }]);
      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });
      expect(client).toBeDefined();
    });

    it('accepts a config object', () => {
      const mockFetch = createMockFetch([{ status: 200 }]);
      const client = new Pxshot({
        apiKey: 'px_test_key',
        baseUrl: 'https://custom.api.com',
        timeout: 30000,
        retries: 3,
        fetch: mockFetch,
      });
      expect(client).toBeDefined();
    });

    it('throws if no API key provided', () => {
      expect(() => new Pxshot({ apiKey: '' })).toThrow('API key is required');
    });
  });

  describe('screenshot', () => {
    it('returns buffer when store=false', async () => {
      const imageData = Buffer.from('fake-image-data');
      const mockFetch = createMockFetch([{
        status: 200,
        body: imageData,
        headers: {
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '99',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
        },
      }]);

      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });
      const result = await client.screenshot({ url: 'https://example.com' });

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pxshot.com/v1/screenshot',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer px_test_key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('returns stored result when store=true', async () => {
      const storedResult = {
        url: 'https://cdn.pxshot.com/abc123.png',
        expires_at: '2024-01-01T00:00:00Z',
        width: 1920,
        height: 1080,
        size_bytes: 12345,
      };
      const mockFetch = createMockFetch([{ status: 200, body: storedResult }]);

      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });
      const result = await client.screenshot({
        url: 'https://example.com',
        store: true,
      });

      expect(result).toEqual(storedResult);
    });

    it('sends all options in request body', async () => {
      const mockFetch = createMockFetch([{ status: 200, body: { url: 'test' } }]);
      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });

      await client.screenshot({
        url: 'https://example.com',
        format: 'webp',
        quality: 90,
        width: 1280,
        height: 720,
        full_page: true,
        wait_until: 'networkidle0',
        wait_for_selector: '#main',
        wait_for_timeout: 1000,
        device_scale_factor: 2,
        store: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            url: 'https://example.com',
            format: 'webp',
            quality: 90,
            width: 1280,
            height: 720,
            full_page: true,
            wait_until: 'networkidle0',
            wait_for_selector: '#main',
            wait_for_timeout: 1000,
            device_scale_factor: 2,
            store: true,
          }),
        })
      );
    });
  });

  describe('usage', () => {
    it('returns usage data', async () => {
      const usageData = {
        period: '2024-01',
        screenshots_used: 150,
        screenshots_limit: 1000,
        storage_used_bytes: 1024000,
      };
      const mockFetch = createMockFetch([{ status: 200, body: usageData }]);

      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });
      const result = await client.usage();

      expect(result).toEqual(usageData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pxshot.com/v1/usage',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('health', () => {
    it('returns health status', async () => {
      const mockFetch = createMockFetch([{ status: 200, body: { status: 'ok' } }]);
      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });
      const result = await client.health();
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('error handling', () => {
    it('throws AuthenticationError on 401', async () => {
      const mockFetch = createMockFetch([{
        status: 401,
        body: { message: 'Invalid API key' },
      }]);

      const client = new Pxshot({ apiKey: 'bad_key', fetch: mockFetch, retries: 0 });

      await expect(client.usage()).rejects.toThrow(AuthenticationError);
    });

    it('throws ValidationError on 400', async () => {
      const mockFetch = createMockFetch([{
        status: 400,
        body: {
          message: 'Validation failed',
          errors: { url: ['URL is required'] },
        },
      }]);

      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch, retries: 0 });

      try {
        await client.screenshot({ url: '' });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toEqual({ url: ['URL is required'] });
      }
    });

    it('throws RateLimitError on 429 with rate limit info', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 60;
      const mockFetch = createMockFetch([{
        status: 429,
        body: { message: 'Rate limit exceeded' },
        headers: {
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetTime),
        },
      }]);

      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch, retries: 0 });

      try {
        await client.usage();
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).rateLimit.limit).toBe(100);
        expect((error as RateLimitError).rateLimit.remaining).toBe(0);
      }
    });
  });

  describe('rate limit headers', () => {
    it('parses rate limit headers from response', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      const mockFetch = createMockFetch([{
        status: 200,
        body: { status: 'ok' },
        headers: {
          'X-RateLimit-Limit': '1000',
          'X-RateLimit-Remaining': '999',
          'X-RateLimit-Reset': String(resetTime),
        },
      }]);

      const client = new Pxshot({ apiKey: 'px_test_key', fetch: mockFetch });
      await client.health();

      expect(client.lastRateLimit).toEqual({
        limit: 1000,
        remaining: 999,
        reset: resetTime,
      });
    });
  });

  describe('retries', () => {
    it('retries on 500 errors', async () => {
      const mockFetch = createMockFetch([
        { status: 500, body: { message: 'Server error' } },
        { status: 500, body: { message: 'Server error' } },
        { status: 200, body: { status: 'ok' } },
      ]);

      const client = new Pxshot({
        apiKey: 'px_test_key',
        fetch: mockFetch,
        retries: 2,
        retryDelay: 10, // Short delay for tests
      });

      const result = await client.health();
      expect(result).toEqual({ status: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does not retry on 400 errors', async () => {
      const mockFetch = createMockFetch([
        { status: 400, body: { message: 'Bad request' } },
      ]);

      const client = new Pxshot({
        apiKey: 'px_test_key',
        fetch: mockFetch,
        retries: 2,
      });

      await expect(client.health()).rejects.toThrow(ValidationError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401 errors', async () => {
      const mockFetch = createMockFetch([
        { status: 401, body: { message: 'Unauthorized' } },
      ]);

      const client = new Pxshot({
        apiKey: 'px_test_key',
        fetch: mockFetch,
        retries: 2,
      });

      await expect(client.health()).rejects.toThrow(AuthenticationError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('custom base URL', () => {
    it('uses custom base URL', async () => {
      const mockFetch = createMockFetch([{ status: 200, body: { status: 'ok' } }]);
      const client = new Pxshot({
        apiKey: 'px_test_key',
        baseUrl: 'https://custom.api.com/',
        fetch: mockFetch,
      });

      await client.health();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/health',
        expect.any(Object)
      );
    });
  });
});
