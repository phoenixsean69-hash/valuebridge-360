> **Source-linked release (21 Nov 2026):** This packaged app now shows original source CSV Customer IDs and synthetic legal names, plus indexed transaction evidence. It includes only the supplied BancABC synthetic challenge snapshot. Previous demo-mode statements and `4173` references below are legacy historical documentation; the active launcher uses port `4174`. For current use, read `../README-START-HERE.txt` and `../SOURCE-CODE/analytics/CHALLENGE-IMPORT.md`.

# VALUEBRIDGE 360 project architecture

## Purpose and data boundary

VALUEBRIDGE 360 is a local, offline-capable decision-support demonstration. Its transaction records and derived customer profiles are synthetic. The application does not connect to bank systems or represent actual customers, risk, revenue, or model effectiveness.

## Main components

- `src/`: React and TypeScript single-page dashboard, six navigable panels, data validation, visualisations and local staff-action queue.
- `generator/`: deterministic synthetic reference-data and customer-profile generation used by Stage 1.
- `analytics/`: transaction generator, chunked calculations, output validation, snapshot publication and rollback utilities.
- `analytics-data/snapshots/<snapshot-id>/`: immutable ten-file JSON data snapshots. `analytics/current-snapshot.json` is the active pointer; a previous pointer supports recovery.
- `local-data/synthetic/transactions.csv`: reproducible 64-column transaction-level synthetic source, excluded from ordinary source control.
- `RUNTIME/serve.mjs`: package-only Node static server bound to loopback; no Python or npm modules are required at demonstration time.
- `START-VALUEBRIDGE.bat`: Windows entry point for the portable release.

## Data flow

The seeded generator writes a chronological synthetic CSV. The analytics exporter reads it in chunks, calculates customer and period measures, validates a staged output directory, publishes it under a unique immutable snapshot ID and atomically switches a small pointer file. The browser reads the pointer once and then loads the matching snapshot-specific JSON documents. A mismatched snapshot is rejected instead of combining data from different exports.

The staff queue begins with the JSON seed in the snapshot. Browser edits are stored in the browser's localStorage for the local demo origin and do not modify the seed or source CSV.

## Build and reproducibility

Development requirements are Node.js, npm and Python 3.11 or newer. Install locked JavaScript dependencies with `npm ci`; use the project Python runtime bootstrap for analytics commands. Main commands are documented in the root README and Stage 3 reports. The portable release embeds the Node executable, production build, source and synthetic dataset.

## Security and operations

The portable server binds to `127.0.0.1`, serves only the packaged production files and validated active JSON snapshot, and makes no outbound requests. There is no authentication or multi-user service; it is intended for a single-computer demonstration. Do not put confidential or real customer data into this demonstration package. Closing the launcher window with Ctrl+C stops the server.

## Known boundaries

The package is tested on the available Windows host with global developer tools removed from the process PATH. A separate clean Windows 10/11 machine was not available, so hardware/OS-specific certification remains outstanding. Browser localStorage is scoped to the browser profile and origin, not exported with the package.
