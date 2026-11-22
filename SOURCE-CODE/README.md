> **Source-linked BancABC edition:** The active challenge snapshot uses original BancABC CSV Customer IDs, synthetic customer names, and read-on-demand complete source transaction evidence. No fake demo snapshot is bundled in this release. See `analytics/CHALLENGE-IMPORT.md`.

> **Phase 1 (21 Nov 2026):** This repository now includes a `--challenge` data importer and a validated snapshot based on the supplied BancABC 2026 synthetic reference CSV. See `analytics/CHALLENGE-IMPORT.md`. The older synthetic generator remains in source for regression tests only; it is not bundled as an active snapshot.

# VALUEBRIDGE 360

Customer Intelligence dashboard for exploring engagement segments, deterioration indicators, product candidates, opportunity rankings, migration, alerts and staff follow-up actions.

## Run from the source project

Requirements: Node.js 20.19+ or 22.12+; Python 3.11+ with the dependencies in `analytics/requirements.txt` for data generation and analytics. The dashboard itself only requires a local HTTP server.

```powershell
npm install
npm run dev
```

The dashboard reads a current-snapshot pointer and then loads all ten JSON contracts from that immutable snapshot. Use HTTP; do not open the HTML through `file://`.

## Data status

The included source CSV and all dashboard analytics are synthetic. The interface stays in **DEMO MODE** and labels metrics **illustrative / simulated**. The chronological model evaluation is synthetic-only and must not be represented as measured bank performance. Product entries are candidates pending staff eligibility and suitability review. CDI is an activity-deterioration indicator, not a validated churn probability.

Staff-action edits are stored in browser localStorage; the original JSON seed file is not changed.

## Data and checks

- `npm run generate:synthetic-transactions` generates the synthetic 64-column transaction CSV.
- `npm run validate:synthetic-source -- <csv> --customers 50000 --accounts 98475 --transactions 1048575` validates its source structure and ledger.
- `npm run export:analytics -- <csv> --output analytics-data --customers 50000 --chunksize 50000` creates and validates a new immutable analytics snapshot, then atomically updates its pointer.
- `npm run validate:data` checks the currently selected ten-file snapshot.
- `npm run rollback:analytics -- <snapshot-id>` reactivates a retained snapshot after validating it.
- `npm run test:stage1`, `npm run test:synthetic-source`, `npm run build`, and `npm run test:e2e` run the project checks.

The verified Windows demonstration package and usage materials are documented in `DOCUMENTATION/` and the Stage 3 reports under `analytics/reports/`.
