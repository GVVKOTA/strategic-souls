# X2 research defects and regression evidence

Source audit and actual fixture verification on 17 November 2026:

| Finding | Before | Repair / actual regression |
|---|---|---|
| New scan metadata contract absent | Name defaulted to Untitled; no mandatory description | Server validates authored Unicode name/description before source fetch/save; rejects blank/short/overlong values, stores immutable X2 definition, preserves old records |
| All-missing source could create an UNKNOWN-only run | X1 saved the run although no instrument could execute | Preflight blocks zero eligible inputs, preserves UNKNOWN vs FAIL, requires explicit policy for partial mixed coverage; route tests prove no fabricated zero-match scan |
| Simple builder only flat ALL/ANY | Nested safe expressions could not return to visual editing | Recursive ALL/ANY/NOT representation, safe conversion and canonical roundtrip/equivalence tests; unsupported custom expressions remain Advanced |
| Same-view Strategy context could retain stale initialFormula | Prop was only read during initial state construction | New formula/panel/instrument context synchronization; root initialInstrument scopes exact source IDs instead of broad FX fallback |
| UI scan handler lacked a synchronous first-tap lock | Rapid event handlers could run before React busy committed | Mutation ref lock plus descriptive busy state; stable server request keys remain authoritative on retries |
| Review retry could duplicate immutable events | Every retry used a fresh UUID | Stable optional review ID and INSERT OR IGNORE with exact-content verification; ten rapid requests retain one event, changed-content reuse gets 409 |
| No editable versioned scan draft | Only executed immutable scans existed | Owner-private CAS versioned drafts with retry safety, reload persistence and original version retention; two-user/collision/cap tests |
| No defensible evidence gate | X1 explicitly had no probability/calibration engine | Pure outcome/replay/held-out estimator, causal/consent/overlap/baseline gates and truthful insufficient-evidence production state; successful TEST calibration is never shown as market evidence |

These are scoped findings, not a claim that the whole application is bug-free. The integrator owns actual browser reproduction, source integration and production verification. Physical Android, 200% zoom, provider credentials/PIT data, asynchronous job cancellation and independent production model validation remain unverified. Current bounded scans are synchronous server requests; client timeout does not prove server cancellation. Stable retry IDs prevent a retry from duplicating a completed scan.
