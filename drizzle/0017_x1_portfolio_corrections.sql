CREATE TABLE x1_ledger_corrections (
  subject TEXT NOT NULL REFERENCES accounts(subject) ON DELETE CASCADE,
  ledger_id TEXT NOT NULL REFERENCES x1_ledger(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  request_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(ledger_id,revision),
  UNIQUE(subject,request_key)
);
--> statement-breakpoint
CREATE TRIGGER x1_ledger_correction_immutable BEFORE UPDATE ON x1_ledger_corrections
BEGIN
  SELECT RAISE(ABORT,'Ledger corrections are immutable');
END;
--> statement-breakpoint
CREATE VIEW x1_effective_ledger AS
SELECT l.id,l.subject,l.portfolio_id,l.created_at,COALESCE(c.payload,l.payload) payload
FROM x1_ledger l LEFT JOIN x1_ledger_corrections c
  ON c.ledger_id=l.id AND c.revision=(SELECT max(n.revision) FROM x1_ledger_corrections n WHERE n.ledger_id=l.id)
WHERE c.revision IS NULL OR c.payload IS NOT NULL;
