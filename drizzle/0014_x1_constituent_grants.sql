ALTER TABLE x78_market_universes ADD COLUMN expected_count INTEGER NOT NULL DEFAULT 500;
--> statement-breakpoint
ALTER TABLE x78_market_universes ADD COLUMN rights_expires_at TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS x1_nifty_universe_effective
  ON x78_market_universes(effective_date DESC, sequence DESC) WHERE rights_expires_at IS NOT NULL;
