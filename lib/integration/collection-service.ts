import { getMeta } from '@/lib/db';
import { runPipeline } from '@/lib/pipeline';
import { getLastIngestAt } from '@/lib/data';
import type { SourceStatus } from '@/lib/ingest';
import type { CollectionStatusResponse } from './types';

const LOCK_TTL_MS = 5 * 60 * 1000;
const lockKey = (projectId?: number) => (projectId ? `pipeline_lock_p${projectId}` : 'pipeline_lock');

/**
 * Returns the current collection and lock status for a project or the global pipeline.
 */
export async function getCollectionStatus(projectId?: number): Promise<CollectionStatusResponse> {
  const key = lockKey(projectId);
  const lock = await getMeta<string>(key);
  const lockActive = Boolean(lock && Date.now() - new Date(lock).getTime() < LOCK_TTL_MS);

  const lastIngestDate = await getLastIngestAt();
  const sourceStatus = (await getMeta<SourceStatus>('source_status')) ?? {};

  return {
    projectId,
    status: lockActive ? 'running' : 'idle',
    lockActive,
    lastIngestAt: lastIngestDate ? lastIngestDate.toISOString() : null,
    sourceStatus: sourceStatus as Record<string, unknown>,
  };
}

/**
 * Triggers a controlled collection run for a specific project.
 */
export async function triggerCollection(
  projectId?: number,
  full = false,
): Promise<CollectionStatusResponse> {
  const statusBefore = await getCollectionStatus(projectId);
  if (statusBefore.lockActive) {
    return {
      projectId,
      status: 'skipped',
      reason: 'A collection pipeline is already in progress for this project',
      lockActive: true,
      lastIngestAt: statusBefore.lastIngestAt,
      sourceStatus: statusBefore.sourceStatus,
    };
  }

  // Trigger pipeline execution asynchronously or synchronously
  try {
    const result = await runPipeline({ projectId, full, digest: false });

    if (result && typeof result === 'object' && 'skipped' in result && result.skipped) {
      return {
        projectId,
        status: 'skipped',
        reason: (result as { reason?: string }).reason ?? 'Pipeline skipped execution',
        lockActive: true,
        lastIngestAt: statusBefore.lastIngestAt,
        sourceStatus: statusBefore.sourceStatus,
      };
    }

    const statusAfter = await getCollectionStatus(projectId);
    return {
      projectId,
      status: 'completed',
      lockActive: false,
      lastIngestAt: new Date().toISOString(),
      sourceStatus: statusAfter.sourceStatus,
    };
  } catch (err) {
    const errorMsg = (err as Error).message ?? 'Pipeline execution failure';
    return {
      projectId,
      status: 'failed',
      reason: errorMsg,
      lockActive: false,
      lastIngestAt: statusBefore.lastIngestAt,
      sourceStatus: statusBefore.sourceStatus,
    };
  }
}
