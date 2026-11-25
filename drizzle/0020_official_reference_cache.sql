CREATE TABLE IF NOT EXISTS official_reference_cache (
  source TEXT PRIMARY KEY CHECK(source IN ('ECB', 'UST')),
  source_url TEXT NOT NULL,
  document TEXT NOT NULL CHECK(length(document) BETWEEN 1 AND 500000),
  retrieved_at TEXT NOT NULL
);
