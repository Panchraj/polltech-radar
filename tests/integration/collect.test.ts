import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'radar-collect-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

after(() => rmSync(dir, { recursive: true, force: true }));

import { getCollectionStatus, triggerCollection } from '../../lib/integration/collection-service';
import { setMeta } from '../../lib/db';

test('getCollectionStatus detects idle and active locks correctly', async () => {
  const projectId = 9999;
  const statusIdle = await getCollectionStatus(projectId);
  assert.equal(statusIdle.status, 'idle');
  assert.equal(statusIdle.lockActive, false);

  // Set simulated active lock in meta
  await setMeta(`pipeline_lock_p${projectId}`, new Date().toISOString());

  const statusLocked = await getCollectionStatus(projectId);
  assert.equal(statusLocked.status, 'running');
  assert.equal(statusLocked.lockActive, true);

  // Trigger while locked should be skipped
  const triggerResult = await triggerCollection(projectId, false);
  assert.equal(triggerResult.status, 'skipped');
  assert.match(triggerResult.reason ?? '', /already in progress/i);
});
