import { DEFAULT_THRESHOLDS } from "./config.mjs";

const FINGERPRINT_MARKER_PREFIX = "<!-- ss-monitor-fingerprint:";
const FINGERPRINT_MARKER_REGEX = /<!--\s*ss-monitor-fingerprint:([^\s>]+)\s*-->/;

export const MANAGED_LABELS = [
  { name: "incident", color: "B60205", description: "Automated or reported production incident" },
  { name: "production", color: "D93F0B", description: "Impacts live production Strategic Souls service" },
  { name: "automated", color: "0E8A16", description: "Managed automatically by Strategic Souls monitor" },
  { name: "severity:critical", color: "B60205", description: "Immediate site outage or security invariant failure" },
  { name: "severity:high", color: "D93F0B", description: "Core API or feature degradation" },
  { name: "severity:medium", color: "FBCA04", description: "Partial degradation, latency, or stale reference data" },
  { name: "needs-attention", color: "C2E0C6", description: "Requires owner review or triage" },
];

export function extractFingerprint(body) {
  if (typeof body !== "string") return null;
  const m = FINGERPRINT_MARKER_REGEX.exec(body);
  return m ? m[1] : null;
}

export function isAutomationOwnedIssue(issue) {
  if (!issue || typeof issue !== "object") return false;
  const hasLabel = Array.isArray(issue.labels)
    ? issue.labels.some((l) => (typeof l === "string" ? l === "automated" : l?.name === "automated"))
    : false;
  const hasMarker = Boolean(extractFingerprint(issue.body));
  return hasLabel && hasMarker;
}

function buildIssueTitle(check) {
  return `[Incident][${check.severity.toUpperCase()}] ${check.label} — ${check.category}`;
}

function buildIssueBody({
  fingerprint,
  check,
  record,
  monitorResult,
  runUrl,
}) {
  const rel = monitorResult.releaseMetadata;
  const versionLine = rel?.buildCommit
    ? `\`${rel.buildCommit.slice(0, 12)}\` (workerVersionId: \`${rel.workerVersionId ?? "unknown"}\`, release: \`${rel.release ?? "unknown"}\`)`
    : "Unavailable";

  return [
    `${FINGERPRINT_MARKER_PREFIX}${fingerprint} -->`,
    `## Production Incident Summary`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| **Severity** | \`${check.severity}\` |`,
    `| **Check ID** | \`${check.id}\` |`,
    `| **Diagnostic Classification** | \`${check.category}\` |`,
    `| **Impacted Feature** | ${check.impactedFeature} |`,
    `| **Public Probe Path** | \`${check.path}\` |`,
    `| **Target Origin** | ${monitorResult.targetOrigin} |`,
    `| **First Seen (UTC)** | ${record.firstSeenUtc} |`,
    `| **First Seen (IST)** | ${record.firstSeenIst} |`,
    `| **Last Seen (UTC)** | ${record.lastSeenUtc} |`,
    `| **Last Seen (IST)** | ${record.lastSeenIst} |`,
    `| **Confirmed Failing Runs** | ${record.consecutiveFailures} (latest attempt count: ${check.attempts}) |`,
    `| **Observed HTTP / Latency** | status=${check.httpStatus ?? "none"}, durationMs=${check.durationMs ?? "n/a"} |`,
    `| **Production Version** | ${versionLine} |`,
    `| **Workflow Run** | ${runUrl ?? "Manual / local run"} |`,
    ``,
    `### Expected vs Observed`,
    `- **Expected:** ${check.expected}`,
    `- **Observed:** ${check.observed}`,
    ``,
    `### Likely Troubleshooting Steps`,
    `${check.troubleshooting}`,
    ``,
    `> *Automated sanitized diagnostic report. No credentials, raw upstream payloads, cookies, or personal user records are included.*`,
  ].join("\n");
}

function buildRecoveryComment({ monitorResult, check, record, runUrl }) {
  const rel = monitorResult.releaseMetadata;
  const versionLine = rel?.buildCommit
    ? `\`${rel.buildCommit.slice(0, 12)}\` (workerVersionId: \`${rel.workerVersionId ?? "unknown"}\`)`
    : "Unavailable";
  return [
    `### Verified Recovery`,
    ``,
    `Automated probes for \`${check.id}\` passed **${record.consecutiveSuccesses}** consecutive scheduled verification runs.`,
    `- **Recovered at (UTC):** ${monitorResult.checkedAtUtc}`,
    `- **Recovered at (IST):** ${monitorResult.checkedAtIst}`,
    `- **Latest Observation:** ${check.observed}`,
    `- **Production Version:** ${versionLine}`,
    `- **Workflow Run:** ${runUrl ?? "Manual / local run"}`,
    ``,
    `Closing this automation-owned incident issue automatically.`,
  ].join("\n");
}

export function createGitHubClient({ token, repository, fetchImpl = globalThis.fetch }) {
  if (!token || !repository || !repository.includes("/")) {
    throw new Error("Valid GITHUB_TOKEN and owner/repo GITHUB_REPOSITORY are required for GitHub incident sync.");
  }
  const baseUrl = `https://api.github.com/repos/${repository}`;
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "StrategicSouls-Monitor/1.0",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`GitHub API ${options.method ?? "GET"} ${path} failed with HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  };

  return {
    async listOpenAutomatedIssues() {
      const issues = [];
      for (let page = 1; page <= 5; page++) {
        const batch = await request(`/issues?state=open&labels=automated&per_page=100&page=${page}`);
        if (!Array.isArray(batch) || batch.length === 0) break;
        issues.push(...batch.filter((item) => !item.pull_request));
        if (batch.length < 100) break;
      }
      return issues;
    },
    async ensureLabels(labelsToEnsure) {
      const existing = await request("/labels?per_page=100");
      const existingNames = new Set((existing ?? []).map((l) => l.name));
      for (const label of labelsToEnsure) {
        if (existingNames.has(label.name)) continue;
        try {
          await request("/labels", {
            method: "POST",
            body: JSON.stringify(label),
          });
        } catch (err) {
          // Ignore 422 race if label was created concurrently
          if (!String(err.message).includes("HTTP 422")) throw err;
        }
      }
    },
    async createIssue(payload) {
      try {
        return await request("/issues", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (err) {
        // If assignee cannot be assigned (e.g. repository permissions), retry without assignees
        if (payload.assignees?.length && String(err.message).includes("HTTP 422")) {
          const rest = { ...payload };
          delete rest.assignees;
          return await request("/issues", {
            method: "POST",
            body: JSON.stringify(rest),
          });
        }
        throw err;
      }
    },
    async updateIssue(issueNumber, payload) {
      return request(`/issues/${issueNumber}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    async addComment(issueNumber, body) {
      return request(`/issues/${issueNumber}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    },
  };
}

/**
 * Reconciles monitor probe outcomes against persistent run state and GitHub Issues.
 * Deduplicates by stable fingerprint, updates open issues in place without comment spam,
 * and closes only automation-owned issues after consecutive verified recoveries.
 */
export async function reconcileIncidents({
  monitorResult,
  previousState = null,
  github = null,
  dryRun = false,
  runUrl = null,
  ownerAssignee = "GVVKOTA",
  config = DEFAULT_THRESHOLDS,
}) {
  const priorFingerprints = previousState?.fingerprints ?? {};
  const nextFingerprints = {};
  const actions = [];

  const openAutomatedByFingerprint = new Map();
  if (github) {
    const openIssues = await github.listOpenAutomatedIssues();
    for (const issue of openIssues) {
      if (!isAutomationOwnedIssue(issue)) continue;
      const fp = extractFingerprint(issue.body);
      if (fp && !openAutomatedByFingerprint.has(fp)) {
        openAutomatedByFingerprint.set(fp, issue);
      }
    }
  }

  let labelsEnsured = false;
  const ensureLabelsOnce = async () => {
    if (dryRun || !github || labelsEnsured) return;
    await github.ensureLabels(MANAGED_LABELS);
    labelsEnsured = true;
  };

  // Track failed checks
  const failedFingerprints = new Set();
  for (const check of monitorResult.checks) {
    if (check.ok) continue;
    const fp = `prod:${check.id}:${check.category}`;
    failedFingerprints.add(fp);

    const prev = priorFingerprints[fp];
    const consecutiveFailures = (prev?.consecutiveFailures ?? 0) + 1;
    const record = {
      fingerprint: fp,
      checkId: check.id,
      category: check.category,
      severity: check.severity,
      consecutiveFailures,
      consecutiveSuccesses: 0,
      firstSeenUtc: prev?.firstSeenUtc ?? monitorResult.checkedAtUtc,
      firstSeenIst: prev?.firstSeenIst ?? monitorResult.checkedAtIst,
      lastSeenUtc: monitorResult.checkedAtUtc,
      lastSeenIst: monitorResult.checkedAtIst,
      issueNumber: prev?.issueNumber ?? null,
    };

    const existingIssue = openAutomatedByFingerprint.get(fp);
    const requiredRuns =
      check.severity === "critical" ? config.criticalConfirmRuns : config.nonCriticalConfirmRuns;

    if (existingIssue) {
      record.issueNumber = existingIssue.number;
      const nextBody = buildIssueBody({ fingerprint: fp, check, record, monitorResult, runUrl });
      const severityLabel = `severity:${check.severity}`;
      const existingLabels = (existingIssue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
      const nextLabels = [
        ...new Set([
          ...existingLabels.filter((l) => !l.startsWith("severity:")),
          "incident",
          "production",
          "automated",
          "needs-attention",
          severityLabel,
        ]),
      ];

      if (dryRun || !github) {
        actions.push({ type: "WOULD_UPDATE", fingerprint: fp, issueNumber: existingIssue.number, severity: check.severity });
      } else {
        await ensureLabelsOnce();
        await github.updateIssue(existingIssue.number, {
          title: buildIssueTitle(check),
          body: nextBody,
          labels: nextLabels,
        });
        actions.push({ type: "UPDATED", fingerprint: fp, issueNumber: existingIssue.number, severity: check.severity });
      }
    } else if (consecutiveFailures >= requiredRuns) {
      const body = buildIssueBody({ fingerprint: fp, check, record, monitorResult, runUrl });
      const labels = [
        "incident",
        "production",
        "automated",
        `severity:${check.severity}`,
        "needs-attention",
      ];
      if (dryRun || !github) {
        actions.push({ type: "WOULD_OPEN", fingerprint: fp, severity: check.severity });
      } else {
        await ensureLabelsOnce();
        const created = await github.createIssue({
          title: buildIssueTitle(check),
          body,
          labels,
          ...(ownerAssignee ? { assignees: [ownerAssignee] } : {}),
        });
        record.issueNumber = created.number;
        actions.push({ type: "OPENED", fingerprint: fp, issueNumber: created.number, severity: check.severity });
      }
    } else {
      actions.push({
        type: "PENDING_CONFIRMATION",
        fingerprint: fp,
        severity: check.severity,
        consecutiveFailures,
        requiredRuns,
      });
    }

    nextFingerprints[fp] = record;
  }

  // Handle recovery for passing checks
  const checkById = new Map(monitorResult.checks.map((c) => [c.id, c]));
  const allCandidateRecoveries = new Set([
    ...Object.keys(priorFingerprints),
    ...openAutomatedByFingerprint.keys(),
  ]);

  for (const fp of allCandidateRecoveries) {
    if (failedFingerprints.has(fp)) continue;
    const parts = fp.split(":");
    const checkId = parts[1];
    const check = checkById.get(checkId);
    if (!check || !check.ok) continue;

    const prev = priorFingerprints[fp];
    const existingIssue = openAutomatedByFingerprint.get(fp);
    if (!existingIssue && !prev) continue;

    const consecutiveSuccesses = (prev?.consecutiveSuccesses ?? 0) + 1;
    const record = {
      fingerprint: fp,
      checkId,
      category: parts[2] ?? "UNKNOWN",
      severity: prev?.severity ?? "medium",
      consecutiveFailures: 0,
      consecutiveSuccesses,
      firstSeenUtc: prev?.firstSeenUtc ?? monitorResult.checkedAtUtc,
      firstSeenIst: prev?.firstSeenIst ?? monitorResult.checkedAtIst,
      lastSeenUtc: prev?.lastSeenUtc ?? monitorResult.checkedAtUtc,
      lastSeenIst: prev?.lastSeenIst ?? monitorResult.checkedAtIst,
      issueNumber: existingIssue?.number ?? prev?.issueNumber ?? null,
    };

    if (existingIssue && consecutiveSuccesses >= config.recoveryConfirmRuns) {
      if (dryRun || !github) {
        actions.push({
          type: "WOULD_CLOSE",
          fingerprint: fp,
          issueNumber: existingIssue.number,
          consecutiveSuccesses,
        });
        nextFingerprints[fp] = record;
      } else {
        await github.addComment(
          existingIssue.number,
          buildRecoveryComment({ monitorResult, check, record, runUrl }),
        );
        await github.updateIssue(existingIssue.number, {
          state: "closed",
          state_reason: "completed",
        });
        actions.push({
          type: "CLOSED",
          fingerprint: fp,
          issueNumber: existingIssue.number,
          consecutiveSuccesses,
        });
        // Resolved & closed: drop from active tracking
      }
    } else if (existingIssue) {
      actions.push({
        type: "RECOVERY_PENDING",
        fingerprint: fp,
        issueNumber: existingIssue.number,
        consecutiveSuccesses,
        requiredRuns: config.recoveryConfirmRuns,
      });
      nextFingerprints[fp] = record;
    }
    // If no open issue exists and check passed, older pending failure counts are cleared cleanly.
  }

  return {
    actions,
    state: {
      updatedAtUtc: monitorResult.checkedAtUtc,
      targetOrigin: monitorResult.targetOrigin,
      fingerprints: nextFingerprints,
    },
  };
}
