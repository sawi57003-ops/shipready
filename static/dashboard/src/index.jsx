import React, { useState } from 'react';
import ForgeReconciler, { Text, Heading, Button, TextField, Stack, Box, Lozenge } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [projectKey, setProjectKey] = useState('');
  const [versionName, setVersionName] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setError('');
    setReport(null);
    if (!projectKey.trim()) {
      setError('Enter a Jira project key first.');
      return;
    }
    setLoading(true);
    try {
      const res = await invoke('getReadiness', {
        projectKey: projectKey.trim().toUpperCase(),
        versionName: versionName.trim() || undefined,
      });
      if (res.success) setReport(res.report);
      else setError(res.error || 'Could not compute readiness.');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const verdictTone = (v) =>
    v === 'SHIP' ? 'success' : v === 'HOLD' ? 'removed' : 'moved';

  return (
    <Stack space="space.200">
      <Heading as="h1">ShipReady — release readiness</Heading>
      <Text>Check whether a Jira version is ready to ship. ShipReady looks at open issues, blockers, pull requests and builds, then gives a verdict.</Text>
      <TextField
        label="Project key"
        value={projectKey}
        onChange={(e) => setProjectKey(e.target.value)}
        placeholder="e.g. PROJ"
      />
      <TextField
        label="Version name (optional — defaults to the next unreleased version)"
        value={versionName}
        onChange={(e) => setVersionName(e.target.value)}
        placeholder="e.g. 2.4"
      />
      <Button appearance="primary" onClick={check} isDisabled={loading}>
        {loading ? 'Checking…' : 'Check readiness'}
      </Button>
      {error ? <Text><strong>{error}</strong></Text> : null}
      {report ? (
        <Box>
          <Heading as="h2">{report.label}</Heading>
          <Lozenge appearance={verdictTone(report.verdict)}>{report.verdict}</Lozenge>
          <Text>Score: {report.score}/100 — {report.done} of {report.total} issues done, {report.open} open.</Text>
          <Text>Blockers: {report.blockers} · Blocked open: {report.blockedOpen} · High-priority open: {report.highOpen} · Overdue: {report.overdue} · Open PRs: {report.openPRs} · Failing builds: {report.failingBuilds}</Text>
          {report.risks.length > 0 ? (
            <Stack space="space.100">
              <Heading as="h3">Top risks</Heading>
              {report.risks.map((r, i) => (
                <Text key={i}>[{r.severity}] {r.text}</Text>
              ))}
            </Stack>
          ) : (
            <Text>No risks found. Nothing stands between this scope and shipping.</Text>
          )}
        </Box>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
