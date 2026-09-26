import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { collectionSchedules, type ScheduleMode } from '@/lib/db/schema';

export interface ScheduleInput {
  projectId: number;
  sourceCode: string;
  mode: ScheduleMode;
  expression?: string;
  timezone?: string;
  enabled?: boolean;
  maxRunDuration?: number;
}

export interface ScheduleResponse {
  id: number;
  projectId: number;
  sourceCode: string;
  mode: ScheduleMode;
  expression: string | null;
  timezone: string | null;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  maxRunDuration: number | null;
  createdAt: string;
}

function toScheduleResponse(row: typeof collectionSchedules.$inferSelect): ScheduleResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCode: row.sourceCode,
    mode: row.mode,
    expression: row.expression ?? null,
    timezone: row.timezone ?? 'UTC',
    enabled: row.enabled === 1,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    maxRunDuration: row.maxRunDuration ?? 300,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSchedules(projectId: number): Promise<ScheduleResponse[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(collectionSchedules)
    .where(eq(collectionSchedules.projectId, projectId))
    .orderBy(collectionSchedules.sourceCode);

  return rows.map(toScheduleResponse);
}

export async function saveSchedule(input: ScheduleInput): Promise<ScheduleResponse> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(collectionSchedules)
    .where(
      and(
        eq(collectionSchedules.projectId, input.projectId),
        eq(collectionSchedules.sourceCode, input.sourceCode),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(collectionSchedules)
      .set({
        mode: input.mode,
        expression: input.expression ?? existing.expression,
        timezone: input.timezone ?? existing.timezone,
        enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
        maxRunDuration: input.maxRunDuration ?? existing.maxRunDuration,
      })
      .where(eq(collectionSchedules.id, existing.id))
      .returning();
    return toScheduleResponse(updated);
  }

  const [created] = await db
    .insert(collectionSchedules)
    .values({
      projectId: input.projectId,
      sourceCode: input.sourceCode,
      mode: input.mode,
      expression: input.expression ?? null,
      timezone: input.timezone ?? 'UTC',
      enabled: input.enabled === false ? 0 : 1,
      maxRunDuration: input.maxRunDuration ?? 300,
    })
    .returning();

  return toScheduleResponse(created);
}

export async function deleteSchedule(scheduleId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(collectionSchedules)
    .where(eq(collectionSchedules.id, scheduleId))
    .returning({ id: collectionSchedules.id });

  return rows.length > 0;
}
