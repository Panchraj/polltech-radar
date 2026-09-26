import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects, benchmarkEntities } from '@/lib/db/schema';
import { planFromLegacy } from '@/lib/query-plan';
import type { ProjectProvisionInput, ProjectResponse } from './types';

/**
 * Maps a database project row to a standardized integration response.
 */
function toProjectResponse(row: typeof projects.$inferSelect): ProjectResponse {
  return {
    id: row.id,
    monitoringId: row.monitoringId ?? null,
    name: row.name,
    active: row.active === 1,
    mode: row.mode,
    keywords: row.keywords,
    allTerms: row.allTerms ?? [],
    excludeTerms: row.excludeTerms ?? [],
    languages: row.languages,
    countries: row.countries ?? [],
    semanticContext: row.semanticContext ?? null,
    createdAt: row.createdAt.toISOString(),
    queryPlan: row.queryPlan ?? undefined,
  };
}

/**
 * Creates and provisions a new project for PollTech.
 * IMPORTANT: In strict accordance with the technical design rules, approved manual terms
 * are compiled deterministically into a QueryPlan without invoking Generative AI.
 */
export async function createProject(input: ProjectProvisionInput): Promise<ProjectResponse> {
  const db = await getDb();

  // 1. Insert core project record
  const [newProject] = await db
    .insert(projects)
    .values({
      name: input.name,
      monitoringId: input.monitoringId ?? null,
      active: input.active === false ? 0 : 1,
      keywords: input.keywords,
      allTerms: input.allTerms ?? [],
      excludeTerms: input.excludeTerms ?? [],
      languages: input.languages ?? ['en'],
      countries: input.countries ?? [],
      semanticContext: input.semanticContext ?? null,
      brandVoice: input.brandVoice ?? null,
      telegramChannels: input.telegramChannels ?? [],
      rssFeeds: input.rssFeeds ?? [],
      mode: input.mode ?? 'listening',
      talkwalkerProject: input.talkwalkerProject ?? null,
      talkwalkerTopics: input.talkwalkerTopics ?? [],
    })
    .returning();

  // 2. Insert benchmark entities if provided
  const entitiesForPlan: Array<{ name: string; keywords: string[]; isOwnBrand?: boolean }> = [];
  if (input.benchmarkEntities && input.benchmarkEntities.length > 0) {
    for (const ent of input.benchmarkEntities) {
      const [inserted] = await db
        .insert(benchmarkEntities)
        .values({
          projectId: newProject.id,
          name: ent.name,
          keywords: ent.keywords,
          isOwnBrand: ent.isOwnBrand ? 1 : 0,
        })
        .returning();
      entitiesForPlan.push({
        name: inserted.name,
        keywords: inserted.keywords,
        isOwnBrand: Boolean(inserted.isOwnBrand),
      });
    }
  }

  // 3. Compile deterministic query plan from approved manual terms (no AI call)
  const queryPlan = planFromLegacy(newProject, entitiesForPlan);
  const [updatedProject] = await db
    .update(projects)
    .set({ queryPlan })
    .where(eq(projects.id, newProject.id))
    .returning();

  return toProjectResponse(updatedProject);
}

/**
 * Retrieves a project by ID.
 */
export async function getProject(projectId: number): Promise<ProjectResponse | null> {
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  return row ? toProjectResponse(row) : null;
}

/**
 * Retrieves a project by PollTech monitoring ID.
 */
export async function getProjectByMonitoringId(monitoringId: string): Promise<ProjectResponse | null> {
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.monitoringId, monitoringId));
  return row ? toProjectResponse(row) : null;
}

/**
 * Lists projects with optional filtering by active state or monitoringId.
 */
export async function listProjects(filter?: {
  monitoringId?: string;
  active?: boolean;
}): Promise<ProjectResponse[]> {
  const db = await getDb();
  const conds = [];

  if (filter?.monitoringId) {
    conds.push(eq(projects.monitoringId, filter.monitoringId));
  }
  if (filter?.active !== undefined) {
    conds.push(eq(projects.active, filter.active ? 1 : 0));
  }

  const query = conds.length > 0
    ? db.select().from(projects).where(and(...conds)).orderBy(projects.id)
    : db.select().from(projects).orderBy(projects.id);

  const rows = await query;
  return rows.map(toProjectResponse);
}

/**
 * Updates an existing project. Recompiles query plan if keywords/terms are modified.
 */
export async function updateProject(
  projectId: number,
  input: Partial<ProjectProvisionInput>,
): Promise<ProjectResponse | null> {
  const db = await getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!existing) return null;

  const updateSet: Partial<typeof projects.$inferInsert> = {};

  if (input.name !== undefined) updateSet.name = input.name;
  if (input.monitoringId !== undefined) updateSet.monitoringId = input.monitoringId;
  if (input.active !== undefined) updateSet.active = input.active ? 1 : 0;
  if (input.keywords !== undefined) updateSet.keywords = input.keywords;
  if (input.allTerms !== undefined) updateSet.allTerms = input.allTerms;
  if (input.excludeTerms !== undefined) updateSet.excludeTerms = input.excludeTerms;
  if (input.languages !== undefined) updateSet.languages = input.languages;
  if (input.countries !== undefined) updateSet.countries = input.countries;
  if (input.semanticContext !== undefined) updateSet.semanticContext = input.semanticContext;
  if (input.brandVoice !== undefined) updateSet.brandVoice = input.brandVoice;
  if (input.telegramChannels !== undefined) updateSet.telegramChannels = input.telegramChannels;
  if (input.rssFeeds !== undefined) updateSet.rssFeeds = input.rssFeeds;
  if (input.mode !== undefined) updateSet.mode = input.mode;
  if (input.talkwalkerProject !== undefined) updateSet.talkwalkerProject = input.talkwalkerProject;
  if (input.talkwalkerTopics !== undefined) updateSet.talkwalkerTopics = input.talkwalkerTopics;

  // If terms changed, recompile deterministic query plan
  const termsChanged =
    input.keywords !== undefined ||
    input.allTerms !== undefined ||
    input.excludeTerms !== undefined ||
    input.name !== undefined;

  if (termsChanged) {
    const existingEntities = await db
      .select()
      .from(benchmarkEntities)
      .where(eq(benchmarkEntities.projectId, projectId));

    const simulatedProject = {
      ...existing,
      ...updateSet,
      keywords: updateSet.keywords ?? existing.keywords,
      allTerms: updateSet.allTerms ?? existing.allTerms,
      excludeTerms: updateSet.excludeTerms ?? existing.excludeTerms,
    };

    updateSet.queryPlan = planFromLegacy(
      simulatedProject,
      existingEntities.map((e) => ({
        name: e.name,
        keywords: e.keywords,
        isOwnBrand: Boolean(e.isOwnBrand),
      })),
    );
  }

  const [updated] = await db
    .update(projects)
    .set(updateSet)
    .where(eq(projects.id, projectId))
    .returning();

  return updated ? toProjectResponse(updated) : null;
}

/**
 * Deletes a project and cascaded records.
 */
export async function deleteProject(projectId: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id });
  return result.length > 0;
}
