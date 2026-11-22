VALUEBRIDGE 360 — BANCABC CSV SOURCE-LINKED EDITION
==================================================

This version connects directly to analytical outputs generated from the supplied
BancABC_2026.csv, including the ORIGINAL customer identifiers, names, customer
statuses, KYC indicators, product holdings, city, province, account types and
transaction-level drilldowns. It does not create or select a separate fake demo.
The BancABC hackathon file itself contains SYNTHETIC reference records; the app
is not connected to a production banking system.

HOW TO OPEN (Windows)
---------------------
1. Extract this complete ZIP to a NEW folder; do not extract over an older version.
2. Double-click START-VALUEBRIDGE.bat in VALUEBRIDGE-360-PORTABLE.
3. Your browser opens http://127.0.0.1:4174/
4. If the browser does not open, enter that address manually.

HOW TO VERIFY THE REAL SOURCE RECORDS
-------------------------------------
1. Open Customer Value Segments and find Customer ID 715360.
2. Verify the displayed name is Rufaro Mushonga and that its RFM segment is At Risk.
3. Click the customer to see source status, portfolio and all 21 CSV transactions.
4. Browse transactions and search the original BancABC CSV for Transaction ID
   ZW11951047206 (dated 2025-09-15, ATM_WITHDRAWAL, USD equivalent 1628.81).
5. Check the 'CHALLENGE DATA' / 'BANCABC 2026 CSV · ORIGINAL IDS' label at top.

The new offline server uses port 4174, so it won't accidentally open the previous
release that may still be running at http://127.0.0.1:4173. This package contains
only the BancABC-derived snapshot, and will not fall back to the older demo.

DATA SCOPE
----------
- 1,048,575 source transaction records (all statuses), available locally by customer.
- 50,000 source-linked customers.
- 98,475 accounts.
- 873,812 qualifying records used by selected engagement measures.
- The values in RFM/retention/product summaries are derived metrics; raw source
  transactions are shown separately so they can be audited.

The raw 634 MB CSV is not necessary for running the offline release; precomputed
analytical snapshots and customer-specific source records are packaged instead.
Sensitive source fields (national ID, phone, email, date of birth) are omitted.
All published scores remain hackathon prototypes, not real-world bank forecasts.

TO REBUILD
----------
See SOURCE-CODE/analytics/CHALLENGE-IMPORT.md. Python and required dependencies
are needed only to regenerate the analytics from the CSV, not to run the ZIP.
