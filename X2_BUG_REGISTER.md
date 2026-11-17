# Reproduced bugs and corrective evidence

| Finding / cause | Correction / evidence |
|---|---|
| Header clutter and approved GVV image absent | Actual provided JPEG copied unchanged; compact image-only header, centered omni-search; desktop/mobile before/after screenshots |
| Repeated writes / no immediate feedback | Synchronous locks, request-key deduplication, conflicting-payload rejection, pending indicators, bounded fetch timeout; ten-rapid-write actual API tests |
| DATE source bars failed strict scan ISO timestamp validation | Date precision anchor at midnight plus separate conservative retrieval known-at; actual data-service to strict scan-engine test yields PASS and no UNKNOWN |
| Dirty-state event dispatched on document while shell listened on window | Use the same window event target for navigation guard; native beforeunload remains; verify guarded navigation with own unsaved QA inputs |
| Owner-export navigation canceled at about 10s; source chained independent D1 reads | Parallel bounded owner-scoped read groups; retain limits and whole-export failure semantics. Cancellation alone does not prove the cause; actual post-release export verification is recorded in the receipt |
| Default empty instrument scope yielded no rows; weekly ECB ignored selected grouping | Empty scope selects the eligible universe; exact nonempty scopes remain narrow; actual service tests for both branches and calendar aggregation |
| Landscape sidebar clipped Community below viewport | Remove repeated sidebar filler, bounded scroll and compact short-height links; verify actual landscape geometry |
| Display-only sources could enter client technical calculations | Separate analysis and derived-display grants; indicators, comparisons, aggregation and calculations gate before reading data; explicit negative tests |
| Analysis provider choice could be overridden by a display provider | Private purpose-pinned ingestion and segregated caches; two competing provider fixture proves analysis-only ingestion and public non-exposure |
| Stored licensed scan data could outlive display grants | One read-time serializer intersects creation/current/expiry rights for preflight, run, history, detail, export and evidence; immutable stored digest unchanged; withheld output tests |
| Blank/bool financial values could become zero; impossible/future filing dates | Strict numeric/calendar validation, genuine zero preserved, null and quality notes retained; malformed/date/boolean regressions |
| Social role revocation/removal and concurrent pair creation races | Authority rechecked inside SQL mutations, unique conversation pairs, retry-safe requests; 14 isolated social security tests |
| Account erasure removes shared conversation copies | Separate required shared-conversation acknowledgment, participant-only export, explicit privacy disclosure and tested no-ack refusal; no production erasure performed |
| Duplicate asset title / invisible layout feedback | Modal labelled Asset research; actual asset title inside, save feedback wired to visible shell notice |
| Existing groups hidden behind empty-state filler | Default-select first existing membership; remove decorative marketing filler, preserve essential privacy notice |
| Current dependency advisory appeared after X1 | Next/ESLint updated to 16.4.5; exact audit and retained unpatched development advisories documented in X2_DEPENDENCY_REVIEW.md |

Reported extreme clipping was not reproduced at normal font in the initial 390px production view; that report is not misrepresented as a verified root cause. Source inspection, screen-size tests and explicit overflow measurements are separate evidence. No exhaustive defect-free or independent financial audit certification is claimed.
