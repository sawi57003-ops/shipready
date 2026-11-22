# ShipReady — a Rovo agent that tells Jira teams whether a version is ready to ship

**Codegeist 2026 entry — Apps for Software Teams · Bonus: Best Agents (Rovo)**

AI can think. But shipping with confidence takes context: who is doing what, what is
blocked, which pull requests are still open, which builds are failing. ShipReady is a
Rovo agent that reads that context straight from Jira and gives a straight answer.

Ask it in Rovo chat:

> "Is version 2.4 ready to ship?"

It checks every issue in the version, its blockers, assignees, due dates, open pull
requests and failing builds, then answers with a verdict — **SHIP**, **SHIP WITH
CAUTION**, or **HOLD** — a 0–100 score, the ranked risks, and the next steps. It can
also write the full report to a Confluence page.

## What it does

| Ask | What ShipReady does |
|---|---|
| Is version 2.4 ready to ship? | Scores the fixVersion: done vs open, blockers, high-priority open, overdue, unassigned, open PRs, failing builds |
| What is blocking this sprint? | Lists unresolved blockers and open issues blocked by unresolved work |
| Show me the riskiest open issues | Ranks open issues by risk (blockers and failing builds first) |
| Write a release readiness report | Creates a Confluence page with verdict, score, risk list and next steps |

A Jira project page ("ShipReady" tab) shows the same readiness dashboard without
chatting.

## How it works

- **Rovo agent** (`rovo:agent` module) with a focused prompt and four actions.
- **Actions** (`action` modules, all backed by Forge functions):
  - `get-version-readiness` (GET) — JQL search on the fixVersion + dev-status (PRs/builds), then scores.
  - `get-sprint-health` (GET) — same scoring over the active sprint (`sprint in openSprints()`).
  - `get-issue-blockers` (GET) — blocker link graph over open issues.
  - `create-release-report` (CREATE) — writes the report to Confluence.
- **Scoring** (`src/readiness.js`, pure and unit-tested): starts at 100, subtracts for
  blockers (−10), failing builds (−8), blocked-open issues (−6), high-priority open
  (−5), open PRs (−3), overdue (−3), unassigned (−2), unestimated (−1), and
  incompleteness. Verdict: ≥85 with no blockers and no failing builds → SHIP;
  ≥60 → SHIP WITH CAUTION; otherwise HOLD.
- **Dev status is best-effort**: if a site has no dev tool linked, PR/build data is
  reported as unknown instead of failing the check.

## Tech

- Atlassian Forge, Node.js 22 runtime, UI Kit 2 (`@forge/react`) for the project page.
- Jira Cloud REST API via `@forge/api` (`api.asApp().requestJira`), Confluence via
  `requestConfluence`. No external services, no paid APIs, no Forge LLMs.
- Scopes: `read:jira-work`, `read:jira-user`, `read:confluence-space.summary`,
  `write:confluence-content`.

## Run the tests

```bash
npm install
npm test
```

## Deploy (needs an Atlassian account)

```bash
# 1. Install the Forge CLI and log in with an Atlassian API token
npm install -g @forge/cli
forge login

# 2. Register the app (replaces the placeholder app.id in manifest.yml)
forge create --template jira-hello-world
# ...or: forge register, then copy the id into manifest.yml

# 3. Deploy and install on a free Atlassian developer site
forge deploy
forge install

# 4. Share with judges: create an installation link
#    https://developer.atlassian.com/platform/forge/share-your-app/
```

Note: the VM this was built on blocks the Forge CLI's analytics config write
(`chown` EPERM in the sandbox). Workaround that works here:
`SNAP=1 forge <command>` plus `forge settings set usage-analytics false` once.

## Demo

Demo video (< 5 min, YouTube, public): _to be added before submission_.

## License

MIT. See [LICENSE](LICENSE).
