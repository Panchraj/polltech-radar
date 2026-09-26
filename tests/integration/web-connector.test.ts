import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genericWeb, setApprovedWebTargets } from '../../lib/connectors/web';

test('genericWeb connector respects target approval configuration and policy boundaries', async () => {
  // Initially no targets configured -> disabled
  setApprovedWebTargets([]);
  assert.equal(genericWeb.enabled(), false);

  const emptyMentions = await genericWeb.fetchMentions({
    anyTerms: ['election'],
    allTerms: [],
    excludeTerms: [],
    languages: ['en'],
    countries: [],
  });
  assert.equal(emptyMentions.length, 0);

  // Set approved target
  setApprovedWebTargets([
    {
      url: 'https://example.org/press-release',
      approvalId: 'appr-001',
      approvedBy: 'compliance-officer',
      approvedAt: '2026-09-26T10:00:00Z',
    },
  ]);

  assert.equal(genericWeb.enabled(), true);
  assert.equal(genericWeb.id, 'generic_web');
  assert.equal(genericWeb.tier, 'free');

  // Reset
  setApprovedWebTargets([]);
  assert.equal(genericWeb.enabled(), false);
});
