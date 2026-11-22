import api, { route } from '@forge/api';

const ISSUE_FIELDS = [
  'summary',
  'status',
  'priority',
  'assignee',
  'issuetype',
  'fixVersions',
  'issuelinks',
  'duedate',
  'timeestimate',
  'created',
  'updated',
];

async function jiraJson(path, options) {
  const res = await api.asApp().requestJira(route`${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Search issues with JQL. Returns the raw issue array.
export async function searchIssues(jql, maxResults = 100) {
  const body = await jiraJson('/rest/api/3/search/jql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql, fields: ISSUE_FIELDS, maxResults }),
  });
  return body.issues || [];
}

export async function getProjectVersions(projectKey) {
  return jiraJson(route`/rest/api/3/project/${projectKey}/versions`);
}

// All issues carrying a given fixVersion name.
export async function getVersionIssues(projectKey, versionName) {
  const jql = `project = ${projectKey} AND fixVersion = "${versionName.replace(/"/g, '\\"')}" ORDER BY priority DESC, updated DESC`;
  return searchIssues(jql);
}

// Issues in the currently active sprint(s) of a project.
export async function getActiveSprintIssues(projectKey) {
  const jql = `project = ${projectKey} AND sprint in openSprints() ORDER BY priority DESC, updated DESC`;
  return searchIssues(jql);
}

// Open issues that are linked as blockers, or are blocked by open work.
// Returns { blocking: [...], blocked: [...] } with issue summaries.
export async function getBlockerIssues(projectKey) {
  const jql = `project = ${projectKey} AND statusCategory != Done ORDER BY priority DESC, updated DESC`;
  const issues = await searchIssues(jql);
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const blocking = [];
  const blocked = [];
  for (const issue of issues) {
    const links = issue.fields.issuelinks || [];
    for (const link of links) {
      const type = (link.type && (link.type.name || '')) || '';
      const isBlockerLink = /block/i.test(type);
      if (!isBlockerLink) continue;
      if (link.outwardIssue) {
        // this issue blocks outwardIssue
        blocking.push({ issue, blocks: link.outwardIssue.key });
      }
      if (link.inwardIssue) {
        // inwardIssue blocks this issue
        blocked.push({ issue, blockedBy: link.inwardIssue.key, blockedByStatus: (link.inwardIssue.fields && link.inwardIssue.fields.status && link.inwardIssue.fields.status.name) || 'unknown' });
      }
    }
  }
  return { blocking, blocked, openIssues: issues };
}

// Best-effort dev info (pull requests / builds) for one issue.
// The dev-status endpoint aggregates linked Bitbucket/GitHub data. If the site
// has no dev tool linked, or the app lacks access, this returns empty lists
// instead of failing the whole readiness check.
export async function getDevStatus(issueId) {
  const result = { pullRequests: [], builds: [] };
  for (const dataType of ['pullrequest', 'build']) {
    try {
      const res = await api.asApp().requestJira(
        route`/rest/dev-status/1.0/issue/detail?issueId=${issueId}&applicationType=bitbucket&dataType=${dataType}`
      );
      if (!res.ok) continue;
      const body = await res.json();
      const detail = (body && body.detail) || [];
      for (const d of detail) {
        if (dataType === 'pullrequest') result.pullRequests.push(...(d.pullRequests || []));
        else result.builds.push(...(d.builds || []));
      }
    } catch (e) {
      // dev info is optional; ignore and keep going
    }
  }
  return result;
}

// Attach dev status to the open issues (bounded so the action stays fast).
export async function attachDevStatus(issues, limit = 25) {
  const open = issues.filter((i) => i.fields.status.statusCategory.key !== 'done');
  const slice = open.slice(0, limit);
  const enriched = await Promise.all(
    slice.map(async (issue) => {
      const dev = await getDevStatus(issue.id);
      return { ...issue, dev };
    })
  );
  const byId = new Map(enriched.map((i) => [i.id, i]));
  return issues.map((i) => byId.get(i.id) || { ...i, dev: { pullRequests: [], builds: [] } });
}
