# Strategic Souls V3 — local engineering handoff
Existing Site appgprj_6ae0ae7364a481919dfb1af2f4fe17f0 is preserved. The initial local delivery was made against production version 7. The owner subsequently authorized the private website update described in [publication scope](PUBLICATION_SCOPE.md).

Start with [the runbook](RUNBOOK.md) and [release evidence](RELEASE_REPORT.md). The local UI can run now; real consumer authentication, persistence and licensed data remain blocked until their documented prerequisites are satisfied.

- [Audit and verified recovery](AUDIT.md)
- [Migration and explicit owner handoff](MIGRATION.md)
- [Product journeys](PRODUCT_SPEC.md)
- [Design system](DESIGN_SYSTEM.md)
- [Architecture and ERD](ARCHITECTURE.md)
- [Data rights matrix](LICENSE_MATRIX.md)
- [Quantitative methods and ten-capability status](QUANT_METHODOLOGY.md)
- [Security](SECURITY.md)
- [Compliance gates](COMPLIANCE_GATES.md)
- [Master specification coverage and gaps](COVERAGE.md)

Frontend: components/v3. Supabase: supabase/migrations. Worker: quant/souls_quant. Tests: tests/v3-* and quant/tests. Existing owner routes and D1 migrations are retained.

The owner authorized publishing this update to the existing private Site. Production access changes, paid provisioning, data purchase, trade execution and legacy ownership transfer remain outside that authorization.
