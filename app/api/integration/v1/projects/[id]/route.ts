import { verifyIntegrationRequest, auditLog } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { projectUpdateSchema } from '@/lib/integration/validation';
import { getProject, updateProject, deleteProject } from '@/lib/integration/project-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  const project = await getProject(projectId);
  if (!project) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
  }

  return jsonSuccess(project, auth.correlationId);
}

export async function PATCH(
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

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Malformed JSON in request body', auth.correlationId, 400);
  }

  const parsed = projectUpdateSchema.safeParse(bodyJson);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError('VALIDATION_ERROR', 'Invalid project update parameters', auth.correlationId, 400, details);
  }

  const updated = await updateProject(projectId, parsed.data);
  if (!updated) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
  }

  auditLog('project_updated', { projectId, changes: Object.keys(parsed.data) }, auth.correlationId);

  return jsonSuccess(updated, auth.correlationId);
}

export async function DELETE(
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

  const deleted = await deleteProject(projectId);
  if (!deleted) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
  }

  auditLog('project_deleted', { projectId }, auth.correlationId);

  return jsonSuccess({ deleted: true, projectId }, auth.correlationId);
}
