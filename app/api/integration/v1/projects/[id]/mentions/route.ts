import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { verifyIntegrationRequest } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { cursorMentionsQuerySchema } from '@/lib/integration/validation';
import { queryMentionsCursor } from '@/lib/integration/mention-service';

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
    return jsonError(
      'VALIDATION_ERROR',
      `Invalid project ID: "${id}"`,
      auth.correlationId,
      400,
    );
  }

  // Parse query parameters
  const url = new URL(request.url);
  const rawParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    rawParams[key] = value;
  }

  const parseResult = cursorMentionsQuerySchema.safeParse(rawParams);
  if (!parseResult.success) {
    const details = parseResult.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError(
      'VALIDATION_ERROR',
      'Invalid query parameters for cursor pagination',
      auth.correlationId,
      400,
      details,
    );
  }

  // Verify project exists
  const db = await getDb();
  const [existingProject] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!existingProject) {
    return jsonError(
      'NOT_FOUND',
      `Project with ID ${projectId} not found`,
      auth.correlationId,
      404,
    );
  }

  try {
    const result = await queryMentionsCursor(projectId, parseResult.data);
    return jsonSuccess(result, auth.correlationId);
  } catch (err) {
    const message = (err as Error).message ?? 'Failed to retrieve mentions';
    return jsonError('INTERNAL_ERROR', message, auth.correlationId, 500);
  }
}
