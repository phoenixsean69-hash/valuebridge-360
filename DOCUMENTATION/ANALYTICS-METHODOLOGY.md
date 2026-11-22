> **Source-linked release (21 Nov 2026):** This packaged app now shows original source CSV Customer IDs and synthetic legal names, plus indexed transaction evidence. It includes only the supplied BancABC synthetic challenge snapshot. Previous demo-mode statements and `4173` references below are legacy historical documentation; the active launcher uses port `4174`. For current use, read `../README-START-HERE.txt` and `../SOURCE-CODE/analytics/CHALLENGE-IMPORT.md`.

# Analytics methodology and interpretation

All inputs and outputs described here are synthetic. Calculations demonstrate a reproducible workflow and do not assert real customer behavior or validated business outcomes.

## Population and time windows

The full demonstration contains 50,000 synthetic customers, 98,475 accounts and 1,048,575 dated transaction rows over 48 monthly periods. Transaction processing is chunked. Customer/account identifiers are generated consistently and the output validator checks referential integrity and cross-file snapshot IDs.

## Customer value and RFM

Recency, frequency and monetary summaries are derived from transaction dates, counts and converted amounts at the configured analytical cutoff. Segment membership is assigned from synthetic profile attributes and calculated measures. Segment totals are reconciled against the customer population. Currency conversion uses the dataset's explicitly fictional reference rates; it must not be interpreted as historical market-rate data.

## Customer Deterioration Index (CDI)

The CDI combines observed changes in transaction activity and relationship signals according to the implemented feature weights. It is a prioritisation indicator for staff review, not a validated churn probability, causal finding or credit-risk measure. A high CDI means the synthetic signals meet the configured review threshold; it does not establish that a customer will leave.

## Product candidates

Association counts and support/confidence/lift-style measures are calculated from synthetic product holdings and transaction/profile data. The resulting suggestions are candidates pending staff eligibility, suitability, affordability, consent and policy review. They are not personalised financial advice and must not be treated as a guaranteed conversion or revenue.

## Opportunity ranking

Opportunity scores combine documented synthetic relationship and activity factors. Rankings are relative prioritisation aids within this generated population. Scores do not guarantee revenue, profitability, contactability or suitability. The dashboard shows the score and its contextual data rather than claiming a forecast is validated.

## Migration, alerts and predictive model metrics

Segment migration compares period assignments and reconciles transition counts. Alerts are rule-triggered synthetic indicators. Model metrics are shown only when present in validated output; null metrics render as “Not yet evaluated”. Any reported evaluation in this demo is synthetic and cannot establish production model performance or generalisation to real data.

## Validation

Python and JavaScript validators check the ten JSON output contracts, schema/source metadata, count and reference consistency, snapshot identity and key measure invariants. Python unit tests cover deterministic generation, temporal cutoff/leakage controls, score and association logic, migration and snapshot publication recovery. Independent test logs and limits are recorded in the Stage 3 reports.
