> **Source-linked BancABC edition:** The active challenge snapshot uses original BancABC CSV Customer IDs, synthetic customer names, and read-on-demand complete source transaction evidence. No fake demo snapshot is bundled in this release. See `analytics/CHALLENGE-IMPORT.md`.

# Challenge integration is now available

For the supplied BancABC 2026 Hackathon CSV, use [CHALLENGE-IMPORT.md](CHALLENGE-IMPORT.md) and `python analytics/export_dashboard.py <CSV> --challenge`. The challenge data itself contains synthetic reference records. The original generator remains in source for regression tests only.

---

## Legacy demo generator documentation

# VALUEBRIDGE 360 local analytics pipeline

All generated source rows are synthetic. No real customer or competition data is read by the generation or dashboard-export commands.

## Synthetic transaction source

Install pinned project-local dependencies if needed:

```powershell
.\.venv\Scripts\python.exe -m pip install -r analytics/requirements.txt
```

Generate and validate the representative 1,000-customer source first:

```powershell
npm run generate:synthetic-transactions -- --customers 1000 --transactions 20000 --output local-data/synthetic/smoke.csv
npm run validate:synthetic-source -- local-data/synthetic/smoke.csv --customers 1000 --accounts 1970 --transactions 20000
```

Generate the reference-scale source after the small run validates:

```powershell
npm run generate:synthetic-transactions -- --output local-data/synthetic/transactions.csv
npm run validate:synthetic-source -- local-data/synthetic/transactions.csv --customers 50000 --accounts 98475 --transactions 1048575 --report analytics/reports/synthetic-source-validation.json
```

The CSV is ignored by Git under `local-data/`. The generator is deterministic for a seed, streams records to disk, writes exactly 64 documented columns, and preserves stable fictional `CUST-*` references for the staff queue.

## Transaction analytics and dashboard snapshot

Process the full source in chunks and publish one validated ten-file snapshot:

```powershell
npm run export:analytics -- local-data/synthetic/transactions.csv --output analytics-data --customers 50000 --chunksize 50000
npm run validate:data
```

The exporter computes RFM, retention CDI, portfolio co-holding associations, relative opportunity ranking, month-end migration and chronological model evaluation. It stages and validates all ten JSON files before publishing, assigns one `snapshot_id` to the nine calculated files, retains the action queue seed unchanged, and keeps the preceding directory as a rollback copy.

Metric meaning is intentionally limited: transaction monetary values represent activity, not profit or lifetime value; portfolio co-holding does not establish purchase intent, eligibility or suitability; opportunity scores are relative prioritisation aids; CDI is not a churn probability; model evaluation results are synthetic-only. CDI is unscored when its baseline is insufficient. Null model metrics display as “Not yet evaluated.”

## Checks

```powershell
npm run lint
npm run test:stage1
npm run test:synthetic-source
npm run validate:data
npm run build
npm run test:e2e
```

The Playwright production-browser suite covers all panels, interactions, staff-action persistence, null metrics, missing/empty states, responsive viewports and browser errors. Current results and screenshots are in `analytics/reports/stage2-evidence.md` and `analytics/reports/stage2-screenshots/`. The complete run summary is `analytics/reports/overnight-development-report.md`.
