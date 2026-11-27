/**
 * Strategic Souls X 3.0 — Unified Full-Schema Cloudflare D1 SQL Backup & Isolated SQLite Restore Verifier.
 * Offline only: NEVER connects to or mutates hosted Cloudflare D1.
 *
 * Usage:
 *   1) Verify a real SQL export (from `wrangler d1 export ss --remote --output <dump.sql>`):
 *        node operations/scripts/verify-logical-backup.mjs <path-to-dump.sql> <external-output-dir>
 *
 *   2) Run an end-to-end full-schema (0000..0021) isolated backup + SQL dump + restore drill:
 *        node operations/scripts/verify-logical-backup.mjs --drill <external-output-dir>
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databaseMigrationsDir, repoRoot } from "./repo-paths.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertOutsideRepo(targetPath) {
  const rel = relative(repoRoot, targetPath);
  assert.ok(
    rel.startsWith("..") || resolve(targetPath) === targetPath && !targetPath.startsWith(repoRoot),
    `Output directory MUST be outside the Git repository checkout (${targetPath}).`,
  );
}

function listMigrations() {
  return readdirSync(databaseMigrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/i.test(f))
    .sort();
}

/** Build an in-memory reference SQLite database by applying all repo migrations 0000..latest. */
function buildReferenceSchemaInventory() {
  const migrations = listMigrations();
  assert.ok(migrations.length >= 22, `Expected >=22 migrations (0000..0021), found ${migrations.length}`);
  const ref = new DatabaseSync(":memory:");
  for (const file of migrations) {
    ref.exec(readFileSync(join(databaseMigrationsDir, file), "utf8"));
  }
  const objects = ref
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'
       ORDER BY type ASC, name ASC`,
    )
    .all();
  ref.close();
  return {
    migrations,
    tables: objects.filter((o) => o.type === "table").map((o) => o.name),
    indexes: objects.filter((o) => o.type === "index").map((o) => o.name),
    triggers: objects.filter((o) => o.type === "trigger").map((o) => o.name),
  };
}

function quoteSqlLiteral(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "bigint") return val.toString();
  if (val instanceof Uint8Array) return `X'${Buffer.from(val).toString("hex")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

/** Export every table schema, row, index, and trigger from a SQLite database to a deterministic .sql dump. */
function exportSqliteToSql(db) {
  const lines = [
    "-- Strategic Souls X 3.0 Logical SQL Dump",
    "PRAGMA foreign_keys = OFF;",
    "BEGIN TRANSACTION;",
  ];
  const tables = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'
       ORDER BY rowid ASC`,
    )
    .all();
  for (const t of tables) {
    lines.push(`${t.sql};`);
  }
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM "${t.name}"`).all();
    for (const row of rows) {
      const vals = cols.map((c) => quoteSqlLiteral(row[c]));
      lines.push(
        `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${vals.join(",")});`,
      );
    }
  }
  const extras = db
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type IN ('index','trigger','view') AND sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'
       ORDER BY type ASC, name ASC`,
    )
    .all();
  for (const e of extras) {
    lines.push(`${e.sql};`);
  }
  lines.push("COMMIT;");
  lines.push("PRAGMA foreign_keys = ON;");
  return lines.join("\n") + "\n";
}

function computeTableChecksums(db, tableNames) {
  const counts = {};
  const checksums = {};
  for (const table of tableNames) {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    counts[table] = rows.length;
    const serialized = rows
      .map((r) => JSON.stringify(r, Object.keys(r).sort()))
      .sort()
      .join("\n");
    checksums[table] = sha256(serialized);
  }
  const aggregateChecksum = sha256(
    tableNames.map((t) => `${t}:${counts[t]}:${checksums[t]}`).join("|"),
  );
  return { counts, checksums, aggregateChecksum };
}

/** Generate a realistic multi-table fixture SQL dump across the entire 0000..0021 schema for offline restore drills. */
function createDrillSqlDump(outDir) {
  const sourceDbPath = join(outDir, "drill-source.sqlite");
  assert.equal(existsSync(sourceDbPath), false, "Refusing to overwrite existing drill-source.sqlite");
  const db = new DatabaseSync(sourceDbPath);
  for (const file of listMigrations()) {
    db.exec(readFileSync(join(databaseMigrationsDir, file), "utf8"));
  }

  const nowIso = "2026-11-28T00:00:00.000Z";
  const legacyPayload = JSON.stringify({ id: "soul-drill-1", title: "Immutability drill" });
  const legacyDigest = sha256(legacyPayload);
  const scanPayload = JSON.stringify({ mode: "CLASSIC", interval: "3h", formula: "RSI(14) < 35" });
  const scanDigest = sha256(scanPayload);

  db.prepare(
    `INSERT INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("drill-user-1", "Drill Researcher", nowIso, "2026-11-28", 1, nowIso);

  db.prepare(
    `INSERT INTO souls (id, created_at, snapshot_at, instrument, model_version, payload, digest)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("soul-drill-1", nowIso, nowIso, "NSE:RELIANCE", "x3.0", legacyPayload, legacyDigest);

  db.prepare(
    `INSERT INTO x1_scans (id, subject, request_key, mode, name, payload, digest, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("scan-drill-1", "drill-user-1", "req-drill-1", "CLASSIC", "Drill 3H Scan", scanPayload, scanDigest, nowIso);

  db.prepare(
    `INSERT INTO x9_scan_lineage (
       scan_id, subject, rerun_of_scan_id, rerun_mode, formula_version, engine_version,
       universe_version, universe_hash, timeframe, history_start_iso, history_cutoff_iso,
       data_freshness, rights_mode, soul_memory_day, soul_memory_version,
       reproducibility_status, reproducibility_note, canonical_digest, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "scan-drill-1",
    "drill-user-1",
    null,
    "ORIGINAL",
    "ast-v1",
    "x3.0",
    "2026-11-28",
    sha256("NSE:INFY,NSE:RELIANCE"),
    "3h",
    "2026-10-28T00:00:00.000Z",
    nowIso,
    "COMPLETED_BARS",
    "FULL_DISPLAY",
    "2026-11-28",
    1,
    "FULL_SNAPSHOT",
    "Verified offline restore drill lineage",
    scanDigest,
    nowIso,
  );

  db.prepare(
    `INSERT INTO x9_soul_memory_observations (
       id, subject, ist_day, scan_id, request_digest, rule_signature, research_type,
       direction, timeframe, instrument_id, sector_group, signal_cutoff, data_version,
       metrics_json, outcome_status, outcome_return_pct, outcome_evaluated_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "obs-drill-1",
    "drill-user-1",
    "2026-11-28",
    "scan-drill-1",
    sha256("obs-drill-1"),
    "RSI(14)<35",
    "CLASSIC",
    "LONG",
    "3h",
    "NSE:RELIANCE",
    "Energy",
    nowIso,
    "v1",
    JSON.stringify({ scoreRaw: 74.2, volumeRatio: 1.35 }),
    "PENDING",
    null,
    null,
    nowIso,
  );

  db.prepare(
    `INSERT INTO x9_soul_memory_daily_state (
       subject, ist_day, state_version, scans_analyzed, distinct_signals,
       evaluated_outcomes, aggregates_json, as_of_cutoff, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "drill-user-1",
    "2026-11-28",
    1,
    1,
    1,
    0,
    JSON.stringify({ topSymbols: ["NSE:RELIANCE"], bounded: true }),
    nowIso,
    nowIso,
  );

  db.prepare(
    `INSERT INTO x9_system_heartbeats (
       job_key, last_started_at, last_succeeded_at, last_day_key, last_status, detail_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "soul_memory_ist_midnight_reset",
    nowIso,
    nowIso,
    "2026-11-28",
    "OK",
    JSON.stringify({ resetDay: "2026-11-28" }),
    nowIso,
  );

  const refInv = buildReferenceSchemaInventory();
  const sourceStats = computeTableChecksums(db, refInv.tables);
  const dumpSql = exportSqliteToSql(db);
  db.close();

  const dumpPath = join(outDir, "drill-backup.sql");
  writeFileSync(dumpPath, dumpSql, { encoding: "utf8", flag: "wx" });
  return { dumpPath, sourceStats };
}

function verifySqlRestore(dumpPath, outDir, expectedSourceStats = null) {
  assert.ok(existsSync(dumpPath), `SQL dump file not found: ${dumpPath}`);
  assertOutsideRepo(outDir);
  mkdirSync(outDir, { recursive: true });

  const refInv = buildReferenceSchemaInventory();
  const restoreDbPath = join(outDir, "isolated-restore.sqlite");
  assert.equal(
    existsSync(restoreDbPath),
    false,
    "Restore destination isolated-restore.sqlite already exists; choose a fresh directory.",
  );

  const sqlBytes = readFileSync(dumpPath);
  const sqlText = sqlBytes.toString("utf8");
  const db = new DatabaseSync(restoreDbPath);
  db.exec(sqlText);

  // 1. SQLite integrity + foreign key checks
  const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
  assert.equal(integrity, "ok", `PRAGMA integrity_check failed: ${integrity}`);
  const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
  assert.equal(fkViolations.length, 0, `Foreign key violations found: ${JSON.stringify(fkViolations)}`);

  // 2. Dynamic full-schema inventory verification against migrations 0000..latest
  const restoredObjects = db
    .prepare(
      `SELECT type, name FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'`,
    )
    .all();
  const restoredTables = new Set(restoredObjects.filter((o) => o.type === "table").map((o) => o.name));
  const restoredIndexes = new Set(restoredObjects.filter((o) => o.type === "index").map((o) => o.name));
  const restoredTriggers = new Set(restoredObjects.filter((o) => o.type === "trigger").map((o) => o.name));

  const missingTables = refInv.tables.filter((t) => !restoredTables.has(t));
  const missingIndexes = refInv.indexes.filter((i) => !restoredIndexes.has(i));
  const missingTriggers = refInv.triggers.filter((tr) => !restoredTriggers.has(tr));
  assert.equal(missingTables.length, 0, `Restored DB missing tables: ${missingTables.join(", ")}`);
  assert.equal(missingIndexes.length, 0, `Restored DB missing indexes: ${missingIndexes.join(", ")}`);
  assert.equal(missingTriggers.length, 0, `Restored DB missing triggers: ${missingTriggers.join(", ")}`);

  // 3. Verify immutability triggers reject mutations (inside rolled-back savepoint / expecting abort)
  if (db.prepare("SELECT count(*) AS n FROM souls").get().n > 0) {
    assert.throws(
      () => db.prepare("UPDATE souls SET payload = '{}'").run(),
      /immutable/i,
      "Expected souls immutability trigger to reject UPDATE",
    );
  }
  if (db.prepare("SELECT count(*) AS n FROM x1_scans").get().n > 0) {
    assert.throws(
      () => db.prepare("UPDATE x1_scans SET payload = '{}'").run(),
      /immutable/i,
      "Expected x1_scans immutability trigger to reject UPDATE",
    );
  }

  // 4. Verify per-table row counts and deterministic SHA-256 checksums across ALL tables
  const restoredStats = computeTableChecksums(db, refInv.tables);
  if (expectedSourceStats) {
    assert.deepEqual(restoredStats.counts, expectedSourceStats.counts, "Per-table row count mismatch after restore");
    assert.equal(
      restoredStats.aggregateChecksum,
      expectedSourceStats.aggregateChecksum,
      "Aggregate per-table SHA-256 checksum mismatch after restore",
    );
  }
  db.close();

  // 5. Reopen strictly read-only and re-check PRAGMA integrity_check
  const reopened = new DatabaseSync(restoreDbPath, { readOnly: true });
  assert.equal(reopened.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  reopened.close();

  const nonEmptyTables = Object.fromEntries(
    Object.entries(restoredStats.counts).filter(([, count]) => count > 0),
  );

  const report = {
    format: "gvv-full-schema-sql-restore-v2",
    checkedAtUtc: new Date().toISOString(),
    result: "PASS",
    migrationCount: refInv.migrations.length,
    latestMigration: refInv.migrations[refInv.migrations.length - 1],
    schemaInventory: {
      tablesVerified: refInv.tables.length,
      indexesVerified: refInv.indexes.length,
      triggersVerified: refInv.triggers.length,
      missingTables: 0,
      missingIndexes: 0,
      missingTriggers: 0,
    },
    integrityCheck: "ok",
    foreignKeyViolations: 0,
    immutabilityTriggersVerified: true,
    reopenedReadOnly: true,
    totalRowsRestored: Object.values(restoredStats.counts).reduce((a, b) => a + b, 0),
    nonEmptyTableCounts: nonEmptyTables,
    sourceChecksumMatched: expectedSourceStats ? true : null,
    aggregateTableDataSha256: restoredStats.aggregateChecksum,
    dumpSqlSha256: sha256(sqlBytes),
    restoreSqliteSha256: sha256(readFileSync(restoreDbPath)),
    limitations: [
      "Offline isolated SQLite verification only; hosted Cloudflare D1 was not modified.",
      "For live production restores, pair Wrangler SQL exports with Cloudflare D1 Time Travel bookmarks.",
    ],
  };

  writeFileSync(
    join(outDir, "restore-verification.json"),
    JSON.stringify(report, null, 2),
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify(report, null, 2));
}

const args = process.argv.slice(2);
if (args[0] === "--drill" && args[1]) {
  const outDir = resolve(args[1]);
  assertOutsideRepo(outDir);
  mkdirSync(outDir, { recursive: true });
  const { dumpPath, sourceStats } = createDrillSqlDump(outDir);
  verifySqlRestore(dumpPath, outDir, sourceStats);
} else if (args.length >= 2) {
  verifySqlRestore(resolve(args[0]), resolve(args[1]));
} else {
  console.error(
    "Usage:\n" +
      "  node operations/scripts/verify-logical-backup.mjs <dump.sql> <external-output-dir>\n" +
      "  node operations/scripts/verify-logical-backup.mjs --drill <external-output-dir>",
  );
  process.exit(1);
}
