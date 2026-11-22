> **Source-linked release (21 Nov 2026):** This packaged app now shows original source CSV Customer IDs and synthetic legal names, plus indexed transaction evidence. It includes only the supplied BancABC synthetic challenge snapshot. Previous demo-mode statements and `4173` references below are legacy historical documentation; the active launcher uses port `4174`. For current use, read `../README-START-HERE.txt` and `../SOURCE-CODE/analytics/CHALLENGE-IMPORT.md`.

# Demonstration and presentation guide

## Launch and opening statement

Extract the portable folder and double-click `START-VALUEBRIDGE.bat`. The browser opens the local application; keep the server window open. Open by stating: “This is VALUEBRIDGE 360, an offline decision-support demonstration using a fully synthetic dataset. No results shown here are findings about real bank customers.”

## Six panels

1. **Customer Value Segments** — show customer distribution and value/relationship patterns, then filter and inspect a customer detail.
2. **Retention and Risk Monitor** — explain the Customer Deterioration Index (CDI) as a rule-based prioritisation signal for staff review, not as a validated churn probability.
3. **Next-Best-Product List** — describe output as product candidates. Every suggestion remains subject to staff eligibility, suitability, affordability, consent and policy checks.
4. **Opportunity Ranking** — show how relative scores help order a review queue. Scores do not guarantee revenue, profit, conversion or contactability.
5. **Migration and Alerts** — explain period-to-period segment transitions and rule-triggered synthetic alerts; point out the synthetic label.
6. **Decision and Performance Centre** — show governance context and available model evaluation fields. “Not yet evaluated” means no metric is available; it must not be replaced by an invented figure.

## Interaction sequence

Navigate through all six panels. Demonstrate a search, a filter, table sorting and pagination. Open a customer detail. In the staff action queue, create an action, change its notes/priority/status, refresh and show persistence. Explain that these user edits live in browser localStorage, not in the synthetic source file.

## What changes with an approved real dataset

Only after formal authorisation and governance review would a real source be profiled, mapped and validated. Data access controls, minimisation, retention, privacy, legal basis, suitability rules, model validation and production security would need separate design and approval. Synthetic benchmarks and example metrics would be replaced with evidence calculated from the approved source, and model claims would require independent evaluation. This package itself remains a synthetic offline demonstration.
