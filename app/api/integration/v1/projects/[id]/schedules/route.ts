import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { verifyIntegrationRequest, auditLog } from '@/lib/integration/auth';
import { jsonSuccess, jsonError } from '@/lib/integration/response';
import { listSchedules, saveSchedule } from '@/lib/integration/schedule-service';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const scheduleSchema = z.object({
  sourceCode: z.string().trim().min(1),
  mode: z.enum(['interval', 'cron', 'manual']),
  expression: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  enabled: z.boolean().optional(),
  maxRunDuration: z.number().int().min(10).max(3600).optional(),
});

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

  const schedules = await listSchedules(projectId);
  return jsonSuccess(schedules, auth.correlationId);
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
  const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!existing) {
    return jsonError('NOT_FOUND', `Project with ID ${projectId} not found`, auth.correlationId, 404);
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Malformed JSON in request body', auth.correlationId, 400);
  }

  const parsed = scheduleSchema.safeParse(bodyJson);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return jsonError('VALIDATION_ERROR', 'Invalid schedule parameters', auth.correlationId, 400, details);
  }

  const saved = await saveSchedule({
    projectId,
    ...parsed.data,
  });

  auditLog('schedule_saved', { projectId, sourceCode: parsed.data.sourceCode, mode: parsed.data.mode }, auth.correlationId);

  return jsonSuccess(saved, auth.correlationId, 201);
}
