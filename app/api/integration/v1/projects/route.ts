import { verifyIntegrationRequest, auditLog, getCachedIdempotentResponse, setCachedIdempotentResponse } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { projectProvisionSchema } from '@/lib/integration/validation';
import { createProject, listProjects } from '@/lib/integration/project-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  const monitoringId = url.searchParams.get('monitoringId') ?? undefined;
  const activeParam = url.searchParams.get('active');
  const active = activeParam !== null ? activeParam === 'true' || activeParam === '1' : undefined;

  try {
    const projectsList = await listProjects({ monitoringId, active });
    return jsonSuccess(projectsList, auth.correlationId);
  } catch (err) {
    const message = (err as Error).message ?? 'Failed to list projects';
    return jsonError('INTERNAL_ERROR', message, auth.correlationId, 500);
  }
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

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Malformed JSON in request body', auth.correlationId, 400);
  }

  const parsed = projectProvisionSchema.safeParse(bodyJson);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError(
      'VALIDATION_ERROR',
      'Invalid project provisioning parameters',
      auth.correlationId,
      400,
      details,
    );
  }

  try {
    const newProject = await createProject(parsed.data);

    auditLog('project_created', {
      projectId: newProject.id,
      monitoringId: newProject.monitoringId,
      name: newProject.name,
    }, auth.correlationId);

    if (auth.idempotencyKey) {
      setCachedIdempotentResponse(auth.idempotencyKey, 201, newProject);
    }

    return jsonSuccess(newProject, auth.correlationId, 201);
  } catch (err) {
    const message = (err as Error).message ?? 'Failed to create project';
    return jsonError('INTERNAL_ERROR', message, auth.correlationId, 500);
  }
}
