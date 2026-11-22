import Resolver from '@forge/resolver';
import { searchIssues, getProjectVersions, getVersionIssues, getActiveSprintIssues, getBlockerIssues, attachDevStatus } from './jira';
import { computeReadiness, toMarkdown } from './readiness';
import { createPage, firstSpace, markdownToStorage } from './confluence';

function ok(data) {
  return { success: true, ...data };
}

function fail(message) {
  return { success: false, error: message };
}

// --- Rovo actions -----------------------------------------------------------

export async function getVersionReadiness(payload) {
  try {
    const { projectKey, versionName } = payload || {};
    if (!projectKey || !versionName) return fail('projectKey and versionName are required.');
    const versions = await getProjectVersions(projectKey);
    const match = (versions || []).find((v) => v.name === versionName);
    if (!match) {
      const names = (versions || []).map((v) => v.name).join(', ');
      return fail(`Version "${versionName}" not found in project ${projectKey}. Available versions: ${names || 'none'}.`);
    }
    let issues = await getVersionIssues(projectKey, versionName);
    issues = await attachDevStatus(issues);
    const report = computeReadiness(issues, `${projectKey} ${versionName}`);
    return ok({ report, markdown: toMarkdown(report) });
  } catch (e) {
    return fail(e.message);
  }
}

export async function getSprintHealth(payload) {
  try {
    const { projectKey } = payload || {};
    if (!projectKey) return fail('projectKey is required.');
    let issues = await getActiveSprintIssues(projectKey);
    issues = await attachDevStatus(issues);
    const report = computeReadiness(issues, `${projectKey} active sprint`);
    return ok({ report, markdown: toMarkdown(report) });
  } catch (e) {
    return fail(e.message);
  }
}

export async function getIssueBlockers(payload) {
  try {
    const { projectKey } = payload || {};
    if (!projectKey) return fail('projectKey is required.');
    const { blocking, blocked, openIssues } = await getBlockerIssues(projectKey);
    return ok({
      projectKey,
      openIssueCount: openIssues.length,
      blocking: blocking.map((b) => ({
        key: b.issue.key,
        summary: b.issue.fields.summary,
        status: b.issue.fields.status.name,
        priority: (b.issue.fields.priority && b.issue.fields.priority.name) || 'None',
        blocks: b.blocks,
      })),
      blocked: blocked.map((b) => ({
        key: b.issue.key,
        summary: b.issue.fields.summary,
        status: b.issue.fields.status.name,
        blockedBy: b.blockedBy,
        blockedByStatus: b.blockedByStatus,
      })),
    });
  } catch (e) {
    return fail(e.message);
  }
}

export async function createReleaseReport(payload) {
  try {
    const { projectKey, versionName, spaceKey } = payload || {};
    if (!projectKey || !versionName) return fail('projectKey and versionName are required.');
    let issues = await getVersionIssues(projectKey, versionName);
    issues = await attachDevStatus(issues);
    const report = computeReadiness(issues, `${projectKey} ${versionName}`);
    const markdown = toMarkdown(report);
    const space = spaceKey || (await firstSpace());
    const title = `Release readiness: ${projectKey} ${versionName} — ${report.verdict} (${report.score}/100)`;
    const page = await createPage(space, title, markdownToStorage(markdown));
    return ok({ report, markdown, pageUrl: page.url, spaceKey: space });
  } catch (e) {
    return fail(e.message);
  }
}

// --- UI resolver (Jira project page) ----------------------------------------

const resolverInstance = new Resolver();

resolverInstance.define('getReadiness', async ({ payload }) => {
  const { projectKey, versionName } = payload || {};
  if (!projectKey) return fail('Pick a project first.');
  if (versionName) {
    return getVersionReadiness({ projectKey, versionName });
  }
  const versions = await getProjectVersions(projectKey);
  const unreleased = (versions || []).filter((v) => !v.released);
  if (unreleased.length === 0) return fail(`Project ${projectKey} has no unreleased versions.`);
  return getVersionReadiness({ projectKey, versionName: unreleased[0].name });
});

resolverInstance.define('listVersions', async ({ payload }) => {
  const { projectKey } = payload || {};
  if (!projectKey) return fail('projectKey is required.');
  const versions = await getProjectVersions(projectKey);
  return ok({ versions: (versions || []).map((v) => ({ id: v.id, name: v.name, released: !!v.released })) });
});

export const resolver = resolverInstance.getDefinitions();
