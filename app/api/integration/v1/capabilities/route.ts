import { verifyIntegrationRequest } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import {
  CONNECTORS,
  SOURCE_META,
  SOURCE_KIND,
  SOURCE_CATEGORY,
} from '@/lib/connectors';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const auth = verifyIntegrationRequest(request);
  if (!auth.authenticated || auth.errorResponse) {
    return jsonError(
      auth.errorResponse?.error.code ?? 'UNAUTHORIZED',
      auth.errorResponse?.error.message ?? 'Unauthorized',
      auth.correlationId,
      401,
    );
  }

  const connectors = CONNECTORS.map((c) => ({
    id: c.id,
    label: c.label,
    tier: c.tier,
    enabled: c.enabled(),
    disabledReason: c.disabledReason,
    kind: SOURCE_KIND[c.id] ?? 'post',
    category: SOURCE_CATEGORY[c.id] ?? 'general',
    meta: SOURCE_META[c.id] ?? { label: c.label, color: '#94a3b8' },
  }));

  const capabilities = {
    apiVersion: 'v1',
    features: {
      cursorPagination: true,
      deterministicQueryPlan: true,
      idempotency: true,
      aiLineage: true,
      collectionControl: true,
      tokenRotation: true,
    },
    limits: {
      maxPageSize: 200,
      defaultPageSize: 50,
      rateLimitPerMinute: 180,
    },
    connectors,
  };

  return jsonSuccess(capabilities, auth.correlationId);
}
