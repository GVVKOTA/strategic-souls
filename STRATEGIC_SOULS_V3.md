# Strategic Souls V3 — local engineering handoff
Existing Site appgprj_6ae0ae7364a481919dfb1af2f4fe17f0 is preserved. The initial local delivery was made against production version 7. The owner subsequently authorized the private website update described in [publication scope](docs/v3/PUBLICATION_SCOPE.md).

Start with [the runbook](docs/v3/RUNBOOK.md) and [release evidence](docs/v3/RELEASE_REPORT.md). The local UI can run now; real consumer authentication, persistence and licensed data remain blocked until their documented prerequisites are satisfied.

- [Audit and verified recovery](docs/v3/AUDIT.md)
- [Migration and explicit owner handoff](docs/v3/MIGRATION.md)
- [Product journeys](docs/v3/PRODUCT_SPEC.md)
- [Design system](docs/v3/DESIGN_SYSTEM.md)
- [Architecture and ERD](docs/v3/ARCHITECTURE.md)
- [Data rights matrix](docs/v3/LICENSE_MATRIX.md)
- [Quantitative methods and ten-capability status](docs/v3/QUANT_METHODOLOGY.md)
- [Security](docs/v3/SECURITY.md)
- [Compliance gates](docs/v3/COMPLIANCE_GATES.md)
- [Master specification coverage and gaps](docs/v3/COVERAGE.md)

Frontend: components/v3. Supabase: supabase/migrations. Worker: quant/souls_quant. Tests: tests/v3-* and quant/tests. Existing owner routes and D1 migrations are retained.

The owner authorized publishing this update to the existing private Site. Production access changes, paid provisioning, data purchase, trade execution and legacy ownership transfer remain outside that authorization.
