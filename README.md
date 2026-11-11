# MindOS

MindOS is a multi-sided mental-health support and care platform for users, verified professionals and operations teams.

## Current engineering status

The canonical implementation has progressed through Sprint 28 and **Phase B29 — Full Backend Persistence & Local Certification**.

B29 closes the remaining local-backend durability gaps by activating PostgreSQL-backed persistence across the core User → Professional → Operations workflow, including identity, consent, assessments, content state, AI state, care navigation/referrals, professional/provider state, availability, appointments, care relationships, clinical workspace, clinical operations, analytics, hardening, release assurance and launch controls.

The B29 certification candidate passed:

- 27/27 PostgreSQL migrations
- full TypeScript
- 538/538 full regression tests
- 8/8 B29 persistence acceptance tests
- Sprint 27 release-assurance/security/clinical/privacy-regulatory regressions
- 14/14 automated accessibility baseline
- real PostgreSQL backup/restore drill
- Sprint 27 and Sprint 28 PostgreSQL smokes
- native PostgreSQL User → Professional → Operations golden path
- restart persistence verification
- database-level appointment-overlap protection
- encrypted/no-plaintext clinical and AI persistence checks
- secret and dependency scans
- production build, performance budgets and SBOM

See `docs/reconciliation/b29.html` for the certification evidence.

## Local backend

Use PostgreSQL 16+ and Redis 7+. Copy `.env.example` to `.env`, configure local credentials, then enable the **single system-wide persistence switch**:

```env
MINDOS_DATABASE_DRIVER=postgres
```

`MINDOS_DATABASE_DRIVER=postgres` applies to the whole MindOS backend. There are no Sprint-specific storage switches in normal runtime configuration.

Apply the schema and start the platform:

```bash
bun install
bun run db:validate-migrations
bun run db:migrate
bun run dev
```

For the dedicated native-PostgreSQL B29 certification:

```bash
bun run b29:local-certification
```

A `Dockerfile` and `docker-compose.yml` are also present for containerized local development.

## Product journeys

**User:** onboarding → wellbeing → assessments → AI support → content → progress → care navigation → appointments → care plan.

**Professional:** verified profile → referrals → appointments → patient workspace → encounters → care plans → messaging → outcomes.

**Operations:** safety escalations → clinical review → incidents → continuity management → analytics → release/launch governance.

## Critical safety and governance boundaries

1. Generative AI is not the final authority for operational risk state, diagnosis or prescribing.
2. Clinical, privacy, AI-safety, security and regulatory approvals cannot be fabricated by CI or development fixtures.
3. Crisis resources presented as authoritative must be verified and unexpired.
4. Professional verification used in local certification is synthetic TEST-ONLY evidence and does not represent a real practitioner approval.
5. Production/beta activation remains governed by exact-build release assurance and applicable human/external evidence.
6. In production/full-persistence mode, professional data access requires recipient-bound canonical consent.
7. Development/test fixtures must never be represented as real Kenya regulatory registration, clinical approval or crisis-resource verification.

## Repository

This repository is the canonical GitHub implementation record for MindOS.
