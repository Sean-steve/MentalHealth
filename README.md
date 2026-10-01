# MindOS

Private working repository for the MindOS mental-health platform.

## Imported prototype baseline

The current prototype snapshot supplied on 2026-10-02 was audited as the working Sprint 21 baseline.

### Baseline status

- Architecture/domain source: substantial prototype implementation through Sprint 21.
- Canonical test suites: explicit Sprint 1-21 coverage files are present.
- Database migrations: present through availability/appointments; Sprint 21 care-relationship/clinical-workspace persistence is not yet migrated.
- Runtime API wiring: server currently exposes major domains through Sprint 18, while Sprint 19-21 modules are not yet wired into the main Express API.
- Persistence: several later domains still use in-memory repositories and therefore are prototype-only.
- Sprint 22/23 code exists in the supplied snapshot (care_plans, clinical_record, outcomes) but is not accepted as completed work: it lacks matching canonical sprint tests/migrations/runtime integration and must be audited before reuse.
- UI: primarily a platform/governance prototype dashboard, not the complete consumer/professional MindOS product surface.

## Critical baseline rules

1. Uploaded/canonical MindOS engineering documentation remains authoritative.
2. Existing working code must be audited before modification.
3. Prototype/in-memory implementations must not be represented as production-complete.
4. Safety Kernel, authorization, consent, privacy and governance remain authoritative boundaries.
5. Regulatory registration/certification status must never be fabricated. Development fixtures must be clearly synthetic and must not present the platform as actually certified or registered.
6. Every sprint must run real lint/typecheck/tests/build and report actual results.
7. No sprint is complete solely because domain classes exist.

## Immediate continuation

Before implementing the next sprint:

1. Import the full supplied prototype source into this repository.
2. Establish a clean reproducible dependency install/lockfile path.
3. Run the complete Sprint 1-21 regression suite.
4. Fix baseline compile/type issues independent of missing local dependencies.
5. Reconcile Sprint 19-21 persistence and main-server/API integration.
6. Classify the existing Sprint 22/23 modules as reusable, partial, conflicting or discardable.
7. Continue with the next canonical sprint only after this baseline is green or all blockers are explicitly documented.

## Baseline audit finding

A static audit of the supplied snapshot found approximately 433 domain files and ~71k lines of TypeScript across the `mindos/` domain tree. The project is architecturally broad, but should still be treated as a prototype until persistence, integration, test execution, external-service behavior and release controls are verified.

This repository is the canonical GitHub working location for continuation of MindOS development.
