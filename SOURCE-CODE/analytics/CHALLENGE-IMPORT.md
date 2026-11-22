# BancABC challenge CSV import (source-linked edition)

`BancABC_2026.csv` is the **supplied synthetic BancABC hackathon dataset**. This release analyses its original customer IDs (for example 715360) and retains selected supplied profile fields (name, customer status, products held, KYC status, risk rating, location, account counts). These profile fields are for display only and are not incorporated into historical RFM or retention model features. Contact details, government IDs and dates of birth are excluded.

All 1,048,575 original transaction rows (including pending/failed and non-qualifying transactions) are copied into 128 indexed, local-only, read-on-demand JSON transaction files. Selecting a customer in the app retrieves just that customer's source rows from the portable server. Qualifying transactions for RFM remain a stricter subset of completed, positive-USD, non-service-fee transactions.

Regenerate the active challenge snapshot from SOURCE-CODE:

```
python -m pip install -r analytics/requirements.txt
python analytics/export_dashboard.py /path/to/BancABC_2026.csv --challenge --output analytics-data --customers 50000
```

`analytics/source_evidence.py` enriches each newly generated snapshot with the original customer fields and indexed source transactions before validation. A separate directory in `DATA/analytics-data/snapshots` is served by the offline Windows launcher, so copy the validated new snapshot and `current-snapshot.json` pointer to the corresponding `DATA` paths before redistributing. The source CSV itself is not required to run the precomputed offline app.

The released launcher runs at http://127.0.0.1:4174/ (different from older 4173 releases to avoid port collisions). Only validated snapshots from the supplied challenge CSV with original IDs can activate; previous demo snapshots have been removed from the distributed package.

Important: This CSV contains **synthetic challenge reference data**. Names/IDs match the supplied file, but they are not verified as real bank customer records. Historical model scores do not establish real-world retention effects.
