import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import {
  verifyIntegrationRequest,
  auditLog,
  getCachedIdempotentResponse,
  setCachedIdempotentResponse,
} from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { getCollectionStatus, triggerCollection } from '@/lib/integration/collection-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = verifyIntegrationRequest(request);
  if (!auth.authenticated || auth.errorResponse) {
    return jsonError(
      auth.errorResponse?.error.code ?? 'UNAUTHORIZED',
      auth.errorResponse?.error.message ?? 'Unauthorized',
      auth.correlationId,
      401,
    );
  }

  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (Number.isNaN(projectId) || projectId <= 0) {
    return jsonError('VALIDATION_ERROR', `Invalid project ID: "${id}"`, auth.correlationId, 400);
  }

  const db = await getDb();
  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!existing) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
  }

  const status = await getCollectionStatus(projectId);
  return jsonSuccess(status, auth.correlationId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = verifyIntegrationRequest(request);
  if (!auth.authenticated || auth.errorResponse) {
    return jsonError(
      auth.errorResponse?.error.code ?? 'UNAUTHORIZED',
      auth.errorResponse?.error.message ?? 'Unauthorized',
      auth.correlationId,
      401,
    );
  }

  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (Number.isNaN(projectId) || projectId <= 0) {
    return jsonError('VALIDATION_ERROR', `Invalid project ID: "${id}"`, auth.correlationId, 400);
  }

  const db = await getDb();
  const [existing] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, projectId));
  if (!existing) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
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

  let full = false;
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && 'full' in body) {
      full = Boolean(body.full);
    }
  } catch {
    // Empty body is acceptable, defaults full to false
  }

  auditLog('collection_triggered', { projectId, projectName: existing.name, full }, auth.correlationId);

  const result = await triggerCollection(projectId, full);

  if (auth.idempotencyKey) {
    setCachedIdempotentResponse(auth.idempotencyKey, 200, result);
  }

  return jsonSuccess(result, auth.correlationId);
}
