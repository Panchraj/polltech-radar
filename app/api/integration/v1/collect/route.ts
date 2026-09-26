import {
  verifyIntegrationRequest,
  auditLog,
  getCachedIdempotentResponse,
  setCachedIdempotentResponse,
} from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { collectTriggerSchema } from '@/lib/integration/validation';
import { getCollectionStatus, triggerCollection } from '@/lib/integration/collection-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

  const url = new URL(request.url);
  const projectIdParam = url.searchParams.get('projectId');
  const projectId = projectIdParam ? parseInt(projectIdParam, 10) : undefined;

  const status = await getCollectionStatus(projectId && !Number.isNaN(projectId) ? projectId : undefined);
  return jsonSuccess(status, auth.correlationId);
}

export async function POST(request: Request): Promise<Response> {
  const auth = verifyIntegrationRequest(request);
  if (!auth.authenticated || auth.errorResponse) {
    return jsonError(
      auth.errorResponse?.error.code ?? 'UNAUTHORIZED',
      auth.errorResponse?.error.message ?? 'Unauthorized',
      auth.correlationId,
      401,
    );
  }

  // Idempotency check
  if (auth.idempotencyKey) {
    const cached = getCachedIdempotentResponse(auth.idempotencyKey);
    if (cached) {
      return jsonSuccess(cached.body, auth.correlationId, cached.status, {
        'X-Idempotent-Replay': 'true',
      });
    }
  }

  let bodyJson: unknown = {};
  try {
    bodyJson = await request.json();
  } catch {
    // Empty body acceptable
  }

  const parsed = collectTriggerSchema.safeParse(bodyJson);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError('VALIDATION_ERROR', 'Invalid collection trigger parameters', auth.correlationId, 400, details);
  }

  auditLog('global_collection_triggered', {
    projectId: parsed.data.projectId,
    full: parsed.data.full,
  }, auth.correlationId);

  const result = await triggerCollection(parsed.data.projectId, parsed.data.full);

  if (auth.idempotencyKey) {
    setCachedIdempotentResponse(auth.idempotencyKey, 200, result);
  }

  return jsonSuccess(result, auth.correlationId);
}
