import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_PRODUCTION_URL, resolveMonitorConfig } from "./config.mjs";
import { createGitHubClient, reconcileIncidents } from "./github-incidents.mjs";
import { runProductionMonitor } from "./monitor.mjs";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    url: process.env.SS_PRODUCTION_URL ?? DEFAULT_PRODUCTION_URL,
    stateIn: null,
    stateOut: null,
    failOnIncident: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--fail-on-incident") args.failOnIncident = true;
    else if (arg === "--url" && argv[i + 1]) args.url = argv[++i];
    else if (arg === "--state-in" && argv[i + 1]) args.stateIn = argv[++i];
    else if (arg === "--state-out" && argv[i + 1]) args.stateOut = argv[++i];
  }
  return args;
}

function readJsonSafe(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function formatStepSummary({ monitorResult, reconcileResult, dryRun, incidentSyncError }) {
  const lines = [
    `## Strategic Souls Production Monitor (${dryRun ? "DRY RUN" : "LIVE"})`,
    `- **Target:** ${monitorResult.targetOrigin}`,
    `- **Checked (UTC / IST):** ${monitorResult.checkedAtUtc} / ${monitorResult.checkedAtIst}`,
    `- **Checks:** ${monitorResult.summary.passed}/${monitorResult.summary.total} passed, ${monitorResult.summary.failed} failed, ${monitorResult.summary.warnings} warnings`,
    `- **Build Commit:** \`${monitorResult.releaseMetadata?.buildCommit ?? "unavailable"}\` (workerVersionId: \`${monitorResult.releaseMetadata?.workerVersionId ?? "unavailable"}\`)`,
    ``,
    `| Check | Status | Category | HTTP | Latency | Observed |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];
  for (const c of monitorResult.checks) {
    lines.push(
      `| \`${c.id}\` | ${c.ok ? "PASS" : `FAIL (${c.severity})`} | \`${c.category}\` | ${c.httpStatus ?? "-"} | ${c.durationMs ?? "-"}ms | ${c.observed} |`,
    );
  }
  if (reconcileResult?.actions?.length) {
    lines.push("", "### Incident Actions");
    for (const a of reconcileResult.actions) {
      lines.push(`- \`${a.type}\` \`${a.fingerprint}\`${a.issueNumber ? ` (issue #${a.issueNumber})` : ""}`);
    }
  }
  if (incidentSyncError) {
    lines.push("", `> **ERROR:** GitHub incident sync failed: ${incidentSyncError}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveMonitorConfig(process.env);
  const previousState = readJsonSafe(args.stateIn);

  const monitorResult = await runProductionMonitor({
    targetUrl: args.url,
    config,
  });

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const runUrl =
    repository && process.env.GITHUB_RUN_ID
      ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  let github = null;
  if (token && repository && repository.includes("/")) {
    github = createGitHubClient({ token, repository });
  }

  let reconcileResult = null;
  let incidentSyncError = null;
  try {
    reconcileResult = await reconcileIncidents({
      monitorResult,
      previousState,
      github,
      dryRun: args.dryRun || !github,
      runUrl,
      config,
    });
  } catch (err) {
    incidentSyncError = err instanceof Error ? err.message : String(err);
  }

  if (args.stateOut && reconcileResult?.state) {
    const absOut = resolve(args.stateOut);
    mkdirSync(dirname(absOut), { recursive: true });
    writeFileSync(absOut, JSON.stringify(reconcileResult.state, null, 2));
  }

  const summaryMarkdown = formatStepSummary({
    monitorResult,
    reconcileResult,
    dryRun: args.dryRun || !github,
    incidentSyncError,
  });

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun || !github,
        monitorResult,
        actions: reconcileResult?.actions ?? [],
        incidentSyncError,
      },
      null,
      2,
    ),
  );

  if (incidentSyncError) {
    process.exitCode = 1;
    return;
  }

  if (!args.dryRun && args.failOnIncident && !monitorResult.ok) {
    const hasConfirmedSevere = monitorResult.checks.some(
      (c) => !c.ok && (c.severity === "critical" || c.severity === "high"),
    );
    if (hasConfirmedSevere) {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Production monitor failed: ${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Strategic Souls Production Monitor Failed\n\n- **Reason:** ${message}\n`,
      "utf8",
    );
  }
  process.exitCode = 1;
});
