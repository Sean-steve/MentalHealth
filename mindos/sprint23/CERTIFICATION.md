# MindOS Sprint 23 Certification

Sprint 23 certification is executed by `.github/workflows/sprint23-certification.yml`.

Current certification scope:
- migration registry validation
- PostgreSQL 16 canonical migrations
- full TypeScript typecheck
- Sprint 1-23 canonical regression
- explicit Sprint 23 acceptance suite
- PostgreSQL runtime smoke
- secret scan
- production build

Clinical-safety invariants:
- no hard-coded clinical thresholds
- no seeded clinical-change rules or alert response deadlines
- explicit comparability
- outcome trend != diagnosis
- outcome alert != Safety RiskState
- approved Safety thresholds route through the authoritative Safety Kernel
- completed review snapshots are immutable
- clinical timeline/projections minimize sensitive values
