import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeTokenCompare,
  isValidToken,
  extractToken,
  getOrGenerateCorrelationId,
  verifyIntegrationRequest,
  INTEGRATION_TOKEN_ENV,
  INTEGRATION_TOKEN_FALLBACK_ENV,
} from '../../lib/integration/auth';

test('safeTokenCompare performs constant time comparison', () => {
  assert.equal(safeTokenCompare('token123', 'token123'), true);
  assert.equal(safeTokenCompare('token123', 'token124'), false);
  assert.equal(safeTokenCompare('token123', 'token12'), false);
  assert.equal(safeTokenCompare('', 'token123'), false);
  assert.equal(safeTokenCompare('token123', ''), false);
});

test('extractToken parses Bearer and x-api-key headers', () => {
  const h1 = new Headers({ authorization: 'Bearer secret_token_abc' });
  assert.equal(extractToken(h1), 'secret_token_abc');

  const h2 = new Headers({ authorization: 'bearer token_lower' });
  assert.equal(extractToken(h2), 'token_lower');

  const h3 = new Headers({ 'x-api-key': 'custom_api_key' });
  assert.equal(extractToken(h3), 'custom_api_key');

  const h4 = new Headers({});
  assert.equal(extractToken(h4), null);
});

test('getOrGenerateCorrelationId preserves incoming ID or generates UUID', () => {
  const incomingId = 'custom-correlation-uuid-999';
  const h1 = new Headers({ 'x-correlation-id': incomingId });
  assert.equal(getOrGenerateCorrelationId(h1), incomingId);

  const h2 = new Headers({});
  const generated = getOrGenerateCorrelationId(h2);
  assert.ok(generated && generated.length > 10);
  assert.match(generated, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('verifyIntegrationRequest rejects requests when integration token is not configured', () => {
  const origToken = process.env[INTEGRATION_TOKEN_ENV];
  const origFallback = process.env[INTEGRATION_TOKEN_FALLBACK_ENV];
  try {
    delete process.env[INTEGRATION_TOKEN_ENV];
    delete process.env[INTEGRATION_TOKEN_FALLBACK_ENV];

    const req = new Request('http://localhost/api/integration/v1/health', {
      headers: { authorization: 'Bearer some_token' },
    });
    const result = verifyIntegrationRequest(req);
    assert.equal(result.authenticated, false);
    assert.equal(result.errorResponse?.error.code, 'UNAUTHORIZED');
    assert.match(result.errorResponse?.error.message ?? '', /disabled/i);
  } finally {
    if (origToken) process.env[INTEGRATION_TOKEN_ENV] = origToken;
    if (origFallback) process.env[INTEGRATION_TOKEN_FALLBACK_ENV] = origFallback;
  }
});

test('verifyIntegrationRequest accepts valid primary token and token rotation fallback', () => {
  const origToken = process.env[INTEGRATION_TOKEN_ENV];
  const origFallback = process.env[INTEGRATION_TOKEN_FALLBACK_ENV];
  try {
    process.env[INTEGRATION_TOKEN_ENV] = 'primary_token_1,primary_token_2';
    process.env[INTEGRATION_TOKEN_FALLBACK_ENV] = 'fallback_token_old';

    // Primary token 1
    const req1 = new Request('http://localhost/api/integration/v1/health', {
      headers: { authorization: 'Bearer primary_token_1' },
    });
    assert.equal(verifyIntegrationRequest(req1).authenticated, true);

    // Primary token 2 (from comma-separated rotation list)
    const req2 = new Request('http://localhost/api/integration/v1/health', {
      headers: { authorization: 'Bearer primary_token_2' },
    });
    assert.equal(verifyIntegrationRequest(req2).authenticated, true);

    // Fallback token (rotation window)
    const req3 = new Request('http://localhost/api/integration/v1/health', {
      headers: { authorization: 'Bearer fallback_token_old' },
    });
    assert.equal(verifyIntegrationRequest(req3).authenticated, true);

    // Invalid token
    const req4 = new Request('http://localhost/api/integration/v1/health', {
      headers: { authorization: 'Bearer wrong_token' },
    });
    const res4 = verifyIntegrationRequest(req4);
    assert.equal(res4.authenticated, false);
    assert.equal(res4.errorResponse?.error.code, 'UNAUTHORIZED');
  } finally {
    if (origToken) process.env[INTEGRATION_TOKEN_ENV] = origToken;
    else delete process.env[INTEGRATION_TOKEN_ENV];
    if (origFallback) process.env[INTEGRATION_TOKEN_FALLBACK_ENV] = origFallback;
    else delete process.env[INTEGRATION_TOKEN_FALLBACK_ENV];
  }
});
