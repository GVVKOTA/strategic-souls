-- Strategic Souls X 3.0 additive schema migration:
-- 1. Reproducible Research lineage & rerun-as-new linkage (x9_scan_lineage)
-- 2. SOUL MEMORY daily adaptive GRAVEYARD intelligence (x9_soul_memory_observations, x9_soul_memory_daily_state)
-- 3. Operational cron & maintenance heartbeat registry (x9_system_heartbeats)
-- Strictly additive; preserves all existing tables, rows, and immutability triggers (0000-0020).

CREATE TABLE IF NOT EXISTS x9_scan_lineage (
  scan_id TEXT PRIMARY KEY NOT NULL REFERENCES x1_scans(id) ON DELETE CASCADE,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  rerun_of_scan_id TEXT REFERENCES x1_scans(id) ON DELETE SET NULL,
  rerun_mode TEXT NOT NULL DEFAULT 'ORIGINAL' CHECK(rerun_mode IN ('ORIGINAL','RERUN_LATEST','REPRODUCE_ORIGINAL')),
  formula_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  universe_version TEXT NOT NULL,
  universe_hash TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  history_start_iso TEXT NOT NULL,
  history_cutoff_iso TEXT NOT NULL,
  data_freshness TEXT NOT NULL,
  rights_mode TEXT NOT NULL,
  soul_memory_day TEXT,
  soul_memory_version INTEGER NOT NULL DEFAULT 0,
  reproducibility_status TEXT NOT NULL CHECK(reproducibility_status IN ('FULL_SNAPSHOT','DERIVED_CHECKSUM_ONLY','LIMITED_BY_DATA_RIGHTS')),
  reproducibility_note TEXT NOT NULL,
  canonical_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS x9_scan_lineage_subject_idx
  ON x9_scan_lineage(subject, created_at DESC);

CREATE INDEX IF NOT EXISTS x9_scan_lineage_parent_idx
  ON x9_scan_lineage(rerun_of_scan_id);

CREATE TABLE IF NOT EXISTS x9_soul_memory_observations (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  ist_day TEXT NOT NULL,
  scan_id TEXT NOT NULL REFERENCES x1_scans(id) ON DELETE CASCADE,
  request_digest TEXT NOT NULL,
  rule_signature TEXT NOT NULL,
  research_type TEXT NOT NULL CHECK(research_type IN ('CLASSIC','BUILD','DISCOVER','DRAW')),
  direction TEXT NOT NULL DEFAULT 'LONG' CHECK(direction IN ('LONG','SHORT','NEUTRAL')),
  timeframe TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  sector_group TEXT,
  signal_cutoff TEXT NOT NULL,
  data_version TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  outcome_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(outcome_status IN ('PENDING','CONFIRMED','UNCONFIRMED','INCOMPATIBLE')),
  outcome_return_pct REAL,
  outcome_evaluated_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(subject, ist_day, scan_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS x9_sm_obs_day_subject_idx
  ON x9_soul_memory_observations(subject, ist_day, rule_signature, timeframe);

CREATE INDEX IF NOT EXISTS x9_sm_obs_dedup_idx
  ON x9_soul_memory_observations(subject, ist_day, request_digest, instrument_id);

CREATE INDEX IF NOT EXISTS x9_sm_obs_pending_idx
  ON x9_soul_memory_observations(subject, ist_day, outcome_status, signal_cutoff);

CREATE TABLE IF NOT EXISTS x9_soul_memory_daily_state (
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  ist_day TEXT NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 0,
  scans_analyzed INTEGER NOT NULL DEFAULT 0,
  distinct_signals INTEGER NOT NULL DEFAULT 0,
  evaluated_outcomes INTEGER NOT NULL DEFAULT 0,
  aggregates_json TEXT NOT NULL,
  as_of_cutoff TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(subject, ist_day)
);

CREATE INDEX IF NOT EXISTS x9_sm_state_day_idx
  ON x9_soul_memory_daily_state(ist_day);

CREATE TABLE IF NOT EXISTS x9_system_heartbeats (
  job_key TEXT PRIMARY KEY NOT NULL,
  last_started_at TEXT NOT NULL,
  last_succeeded_at TEXT,
  last_day_key TEXT,
  last_status TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
