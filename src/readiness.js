// Pure release-readiness scoring. No Atlassian calls here, so this file is
// easy to unit-test and easy for the Rovo agent to reason about.

function isDone(issue) {
  return issue.fields.status.statusCategory.key === 'done';
}

function priorityName(issue) {
  return (issue.fields.priority && issue.fields.priority.name) || 'None';
}

function statusName(issue) {
  return (issue.fields.status && issue.fields.status.name) || 'unknown';
}

function isHighPriority(issue) {
  return ['Highest', 'High'].includes(priorityName(issue));
}

// Build the readiness report from a list of Jira issues (each may carry a
// `dev` property with pullRequests/builds, attached by jira.js).
export function computeReadiness(issues, label) {
  const total = issues.length;
  const done = issues.filter(isDone);
  const open = issues.filter((i) => !isDone(i));
  const now = new Date();

  const blockers = [];
  const blockedOpen = [];
  for (const issue of open) {
    const links = issue.fields.issuelinks || [];
    for (const link of links) {
      const type = (link.type && link.type.name) || '';
      if (!/block/i.test(type)) continue;
      if (link.outwardIssue && link.outwardIssue.fields) {
        const targetDone = link.outwardIssue.fields.status.statusCategory.key === 'done';
        if (!targetDone) {
          blockers.push({ issue, blocks: link.outwardIssue.key });
        }
      }
      if (link.inwardIssue && link.inwardIssue.fields) {
        const sourceDone = link.inwardIssue.fields.status.statusCategory.key === 'done';
        if (!sourceDone) {
          blockedOpen.push({ issue, blockedBy: link.inwardIssue.key });
        }
      }
    }
  }

  const unassigned = open.filter((i) => !i.fields.assignee);
  const highOpen = open.filter(isHighPriority);
  const overdue = open.filter((i) => {
    const due = i.fields.duedate;
    return due && new Date(due) < now;
  });
  const unestimated = open.filter((i) => !i.fields.timeestimate);

  let openPRs = 0;
  let failingBuilds = 0;
  let mergedPRs = 0;
  for (const issue of open) {
    const dev = issue.dev || { pullRequests: [], builds: [] };
    for (const pr of dev.pullRequests || []) {
      if (pr.status === 'OPEN') openPRs += 1;
      else if (pr.status === 'MERGED') mergedPRs += 1;
    }
    for (const build of dev.builds || []) {
      if (build.state === 'FAILED') failingBuilds += 1;
    }
  }

  // Score: start at 100, subtract for each risk. Blockers and failing builds
  // weigh the most because they are the things that sink a release.
  let score = 100;
  score -= blockers.length * 10;
  score -= blockedOpen.length * 6;
  score -= failingBuilds * 8;
  score -= highOpen.length * 5;
  score -= openPRs * 3;
  score -= overdue.length * 3;
  score -= unassigned.length * 2;
  score -= Math.min(unestimated.length, 10) * 1;
  if (total > 0) {
    score -= Math.round(((total - done.length) / total) * 10);
  }
  score = Math.max(0, Math.min(100, score));

  let verdict;
  if (score >= 85 && blockers.length === 0 && failingBuilds === 0) verdict = 'SHIP';
  else if (score >= 60) verdict = 'SHIP WITH CAUTION';
  else verdict = 'HOLD';

  const risks = [];
  const pushRisk = (severity, text) => risks.push({ severity, text });
  for (const b of blockers) {
    pushRisk('high', `${b.issue.key} blocks ${b.blocks} and is still open (${statusName(b.issue)}, ${priorityName(b.issue)}).`);
  }
  for (const b of blockedOpen) {
    pushRisk('high', `${b.issue.key} is blocked by ${b.blockedBy} which is still open.`);
  }
  if (failingBuilds > 0) pushRisk('high', `${failingBuilds} failing build(s) on open issues.`);
  for (const i of highOpen.slice(0, 5)) {
    pushRisk('medium', `${i.key} (${priorityName(i)}) is still open: ${i.fields.summary}.`);
  }
  if (openPRs > 0) pushRisk('medium', `${openPRs} open pull request(s) on open issues.`);
  for (const i of overdue.slice(0, 5)) {
    pushRisk('medium', `${i.key} is overdue (due ${i.fields.duedate}) and still open.`);
  }
  if (unassigned.length > 0) pushRisk('low', `${unassigned.length} open issue(s) have no assignee.`);
  if (unestimated.length > 0) pushRisk('low', `${unestimated.length} open issue(s) have no time estimate.`);

  return {
    label,
    verdict,
    score,
    total,
    done: done.length,
    open: open.length,
    blockers: blockers.length,
    blockedOpen: blockedOpen.length,
    unassigned: unassigned.length,
    highOpen: highOpen.length,
    overdue: overdue.length,
    unestimated: unestimated.length,
    openPRs,
    mergedPRs,
    failingBuilds,
    risks,
    topIssues: open.slice(0, 10).map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      status: statusName(i),
      priority: priorityName(i),
      assignee: (i.fields.assignee && i.fields.assignee.displayName) || 'Unassigned',
    })),
  };
}

// Markdown version of the report, used for the Confluence page and for the
// agent's chat answer.
export function toMarkdown(report) {
  const lines = [];
  lines.push(`# Release readiness: ${report.label}`);
  lines.push('');
  lines.push(`**Verdict: ${report.verdict}** — score ${report.score}/100`);
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Total issues | ${report.total} |`);
  lines.push(`| Done | ${report.done} |`);
  lines.push(`| Open | ${report.open} |`);
  lines.push(`| Blockers (open) | ${report.blockers} |`);
  lines.push(`| Blocked open issues | ${report.blockedOpen} |`);
  lines.push(`| High-priority open | ${report.highOpen} |`);
  lines.push(`| Overdue open | ${report.overdue} |`);
  lines.push(`| Unassigned open | ${report.unassigned} |`);
  lines.push(`| Open pull requests | ${report.openPRs} |`);
  lines.push(`| Failing builds | ${report.failingBuilds} |`);
  lines.push('');
  if (report.risks.length > 0) {
    lines.push('## Top risks');
    lines.push('');
    for (const r of report.risks) {
      lines.push(`- [${r.severity}] ${r.text}`);
    }
    lines.push('');
  } else {
    lines.push('No risks found. Nothing stands between this scope and shipping.');
    lines.push('');
  }
  if (report.topIssues.length > 0) {
    lines.push('## Open issues');
    lines.push('');
    for (const i of report.topIssues) {
      lines.push(`- ${i.key} — ${i.summary} (${i.status}, ${i.priority}, ${i.assignee})`);
    }
    lines.push('');
  }
  lines.push('_Generated by ShipReady, a Rovo agent for Jira release readiness._');
  return lines.join('\n');
}
