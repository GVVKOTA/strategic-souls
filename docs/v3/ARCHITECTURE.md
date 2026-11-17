# V3 architecture
The existing React/Vinext/Sites Worker remains the web application. D1 continues to hold unchanged legacy records. Supabase is the accepted new identity/authoritative relational backend; no hosted project was provisioned.

~~~mermaid
flowchart LR
  Browser[React mobile workspace] -->|same origin JSON / HttpOnly cookies| Web[Sites Worker]
  Web -->|HTTPS Auth / REST / RPC| SB[Supabase Auth and PostgreSQL RLS]
  Web -->|HTTPS authenticated objects| Store[Supabase private Storage]
  Web -->|legacy owner routes only| D1[Existing D1 records]
  Python[Separate Python process] -->|restricted authenticated HTTPS RPC| Queue[PostgreSQL job queue]
  Queue --> SB
  Python --> Lake[Immutable raw Parquet]
  Lake --> Adjust[Versioned point-in-time adjustment]
  Adjust --> Cache[Partitioned cache / atomic CURRENT]
  Cache --> Duck[DuckDB bounded predicates]
  Duck --> Eval[Reproducible reports]
~~~

No Python batch job or raw PostgreSQL TCP connection runs in the Sites Worker. Python's optional queue transport also uses HTTPS with a separately authorized worker identity and a reviewed local dataset catalog.

~~~mermaid
erDiagram
  Body ||--o{ TeamMembership : joins
  Team ||--|{ TeamMembership : controls
  Body ||--o{ Soul : authors
  Team ||--o{ Soul : shares
  Soul ||--|{ SoulVersion : preserves
  SoulVersion ||--o{ SoulEvidence : references
  SoulVersion o|--o{ SoulVersion : parent
  Soul ||--o{ SoulEvent : reviews
  Soul ||--o{ SoulComment : discusses
  Soul ||--o{ ResearchTask : assigns
  Body ||--o{ ScanDefinition : owns
  ScanDefinition ||--|{ ScanVersion : commits
  ScanVersion ||--o{ ScanRun : evaluates
  DatasetVersion ||--o{ ScanRun : reproduces
  SourceEntitlement ||--o{ DatasetVersion : permits
  ScanRun ||--o{ BacktestFold : reports
  Body ||--o{ Holding : records
~~~

Additional schemas include handle history, invitations, preferences, security identities/aliases, corporate actions, quote snapshots, indicator versions, moderation/appeals/reports/blocks, attribution and audit events. Immutable entities reject UPDATE; ordinary authenticated users have no direct table writes. Validated RPCs own mutation transactions, request fingerprints and CAS heads.

## Permission boundary
RLS consults live membership tables rather than trusting role claims in stale JWTs. Team-owned research requires current membership even for its original author. Role helper NULL results fail closed. Private data never appears in public profile fields. JSON exports use RLS or explicit current Team checks; licensed raw data is excluded.

Idempotent responses recheck current authorization before returning an earlier snapshot. Data entitlements default to operator-only and require explicit audience and derived-use grants. Stored evaluation results require both live scan access and current dataset permission, including after expiration or revocation.

The worker queue is deny-by-default. Only an operator-enrolled worker can claim/complete jobs. Requests require explicit plan approval, current entitlements and a readable/editable immutable scan. Rights and tenant access are rechecked at claim and completion. Terminal results cannot be rewritten. Requeue is limited to stale RUNNING jobs; no automatic exchange execution exists.

## Provenance and scale
Dataset and normalized-input hashes, source code fingerprints, corporate-action versions, scan definitions, windows, cost assumptions and evaluator version identify calculations. Raw data is immutable; changed input buckets rebuild while unchanged cache partitions are reused. Atomic pointer publication prevents partial-generation reads; an unreconciled writer lock fails closed.

The measured fixture is finite, not a universal latency promise. Current cache common indicators include SMA20/50, EMA20, RSI14, ATR14, volatility20, momentum21 and average value20; selected other rolling predicates compile to validated DuckDB windows. Cached RSI periods other than 14 deliberately abstain pending a rebuilt definition.
