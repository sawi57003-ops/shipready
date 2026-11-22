import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReadiness, toMarkdown } from '../src/readiness.js';

const mk = (key, status, priority, opts = {}) => ({
  key,
  id: key,
  fields: {
    summary: `Issue ${key}`,
    status: { name: status, statusCategory: { key: status === 'Done' ? 'done' : 'new' } },
    priority: { name: priority },
    assignee: opts.assignee === undefined ? { displayName: 'Ana' } : opts.assignee,
    issuelinks: opts.links || [],
    duedate: opts.due || null,
    timeestimate: opts.est === undefined ? 3600 : opts.est,
  },
  dev: opts.dev || { pullRequests: [], builds: [] },
});

test('all done -> SHIP, score 100, no risks', () => {
  const r = computeReadiness([mk('A-1', 'Done', 'High'), mk('A-2', 'Done', 'Medium')], 'A 1.0');
  assert.equal(r.verdict, 'SHIP');
  assert.equal(r.score, 100);
  assert.equal(r.risks.length, 0);
});

test('open blocker + failing build -> HOLD', () => {
  const issues = [
    mk('P-1', 'Done', 'High'),
    mk('P-2', 'In Progress', 'Highest', {
      links: [{ type: { name: 'Blocks' }, outwardIssue: { key: 'P-3', fields: { status: { statusCategory: { key: 'new' } } } } }],
    }),
    mk('P-3', 'To Do', 'High', {
      assignee: null,
      due: '2026-11-01',
      dev: { pullRequests: [{ status: 'OPEN' }], builds: [{ state: 'FAILED' }] },
    }),
  ];
  const r = computeReadiness(issues, 'P 2.4');
  assert.equal(r.verdict, 'HOLD');
  assert.ok(r.score < 60);
  assert.equal(r.blockers, 1);
  assert.equal(r.failingBuilds, 1);
  assert.equal(r.openPRs, 1);
  assert.ok(r.risks.length >= 5);
});

test('markdown contains verdict, score and risk list', () => {
  const r = computeReadiness([mk('P-1', 'To Do', 'High')], 'P 1.0');
  const md = toMarkdown(r);
  assert.ok(md.includes('**Verdict:'));
  assert.ok(md.includes('score'));
  assert.ok(md.includes('## Top risks'));
});
