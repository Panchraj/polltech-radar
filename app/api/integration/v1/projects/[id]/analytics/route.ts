import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { verifyIntegrationRequest } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { getProjectAnalytics } from '@/lib/integration/analytics-service';

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

  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days');
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  // Check project existence
  const db = await getDb();
  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!existing) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
  }

  try {
    const analytics = await getProjectAnalytics(projectId, Number.isNaN(days) ? 30 : days);
    return jsonSuccess(analytics, auth.correlationId);
  } catch (err) {
    const message = (err as Error).message ?? 'Failed to compute analytics';
    return jsonError('INTERNAL_ERROR', message, auth.correlationId, 500);
  }
}
