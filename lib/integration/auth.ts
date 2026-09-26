import crypto from 'node:crypto';
import { cfg } from '@/lib/connector-config';
import type { ApiErrorResponse } from './types';

export const INTEGRATION_TOKEN_ENV = 'POLLTECH_RADAR_INTEGRATION_TOKEN';
export const INTEGRATION_TOKEN_FALLBACK_ENV = 'POLLTECH_RADAR_INTEGRATION_TOKEN_FALLBACK';

/**
 * Returns all configured active integration tokens (supporting rotation).
 * Tokens can be set in POLLTECH_RADAR_INTEGRATION_TOKEN (comma-separated if rotating)
 * or in POLLTECH_RADAR_INTEGRATION_TOKEN_FALLBACK.
 */
export function getValidIntegrationTokens(): string[] {
  const primary =
    cfg(INTEGRATION_TOKEN_ENV) ||
    process.env[INTEGRATION_TOKEN_ENV] ||
    process.env.INTEGRATION_KEY ||
    '';
  const fallback =
    cfg(INTEGRATION_TOKEN_FALLBACK_ENV) ||
    process.env[INTEGRATION_TOKEN_FALLBACK_ENV] ||
    process.env.INTEGRATION_KEY_PREVIOUS ||
    '';

  const tokens = [...primary.split(','), ...fallback.split(',')]
    .map((t) => t.trim())
    .filter(Boolean);

  return Array.from(new Set(tokens));
}

/**
 * Constant-time comparison between client-provided token and expected token.
 * Prevents side-channel timing attacks.
 */
export function safeTokenCompare(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Validates whether the given token matches any currently active integration token.
 */
export function isValidToken(givenToken: string | null | undefined): boolean {
  if (!givenToken) return false;
  const validTokens = getValidIntegrationTokens();
  if (validTokens.length === 0) return false;

  for (const expected of validTokens) {
    if (safeTokenCompare(givenToken, expected)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts the bearer token or api-key from request headers.
 */
export function extractToken(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const apiKey = headers.get('x-api-key') || headers.get('x-integration-key');
  if (apiKey && apiKey.trim()) {
    return apiKey.trim();
  }
  return null;
}

/**
 * Extracts X-Correlation-Id from headers or generates a new UUID v4.
 */
export function getOrGenerateCorrelationId(headers: Headers): string {
  const incoming = headers.get('x-correlation-id');
  if (incoming && incoming.trim()) {
    return incoming.trim();
  }
  return crypto.randomUUID();
}

/**
 * Extracts Idempotency-Key if present.
 */
export function extractIdempotencyKey(headers: Headers): string | null {
  const key = headers.get('idempotency-key');
  return key && key.trim() ? key.trim() : null;
}

// In-memory idempotency cache for mutating operations (TTL = 10 minutes)
interface IdempotencyRecord {
  timestamp: number;
  status: number;
  body: unknown;
}

const idempotencyCache = new Map<string, IdempotencyRecord>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export function getCachedIdempotentResponse(key: string): IdempotencyRecord | null {
  const record = idempotencyCache.get(key);
  if (!record) return null;
  if (Date.now() - record.timestamp > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return null;
  }
  return record;
}

export function setCachedIdempotentResponse(key: string, status: number, body: unknown): void {
  // Evict expired entries if cache grows
  if (idempotencyCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache.entries()) {
      if (now - v.timestamp > IDEMPOTENCY_TTL_MS) {
        idempotencyCache.delete(k);
      }
    }
  }
  idempotencyCache.set(key, { timestamp: Date.now(), status, body });
}

// Rate limiting (simple sliding window: max 180 requests per minute per IP / Token)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 180;

export function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(identifier) ?? [];
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (valid.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  valid.push(now);
  rateLimitMap.set(identifier, valid);
  return true;
}

/**
 * Verifies request authentication, rate limiting, and returns correlation details.
 */
export function verifyIntegrationRequest(request: Request): {
  authenticated: boolean;
  correlationId: string;
  idempotencyKey: string | null;
  errorResponse?: ApiErrorResponse;
} {
  const correlationId = getOrGenerateCorrelationId(request.headers);
  const idempotencyKey = extractIdempotencyKey(request.headers);
  const token = extractToken(request.headers);

  const configuredTokens = getValidIntegrationTokens();
  if (configuredTokens.length === 0) {
    return {
      authenticated: false,
      correlationId,
      idempotencyKey,
      errorResponse: {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Integration API is disabled. Set POLLTECH_RADAR_INTEGRATION_TOKEN to enable.',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (!token || !isValidToken(token)) {
    return {
      authenticated: false,
      correlationId,
      idempotencyKey,
      errorResponse: {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing Bearer integration token.',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Rate limiting check
  const rateLimitKey = token.slice(-8);
  if (!checkRateLimit(rateLimitKey)) {
    return {
      authenticated: false,
      correlationId,
      idempotencyKey,
      errorResponse: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded. Maximum 180 requests per minute.',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  return {
    authenticated: true,
    correlationId,
    idempotencyKey,
  };
}

/**
 * Structured audit logging for administrative and collection triggers.
 */
export function auditLog(action: string, metadata: Record<string, unknown>, correlationId: string): void {
  const logEntry = {
    ts: new Date().toISOString(),
    event: 'polltech_integration_audit',
    action,
    correlationId,
    ...metadata,
  };
  console.log(`[audit:integration] ${JSON.stringify(logEntry)}`);
}
