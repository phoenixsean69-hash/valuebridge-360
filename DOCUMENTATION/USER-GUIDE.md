> **Source-linked release (21 Nov 2026):** This packaged app now shows original source CSV Customer IDs and synthetic legal names, plus indexed transaction evidence. It includes only the supplied BancABC synthetic challenge snapshot. Previous demo-mode statements and `4173` references below are legacy historical documentation; the active launcher uses port `4174`. For current use, read `../README-START-HERE.txt` and `../SOURCE-CODE/analytics/CHALLENGE-IMPORT.md`.

# VALUEBRIDGE 360 user guide

## Start the demonstration

1. Extract the entire `VALUEBRIDGE-360-PORTABLE` folder from its ZIP.
2. Double-click `START-VALUEBRIDGE.bat`.
3. Wait for the local server window to report that the dashboard is running. Your default browser opens automatically.
4. Keep the server window open while presenting. Press Ctrl+C in that window to stop.

The dashboard runs locally at `http://127.0.0.1:4174`. The current demo needs no internet, global Node.js, Python, or external service. If port 4173 is in use, close the other local service before launching.

## Navigate and explore

Use the left navigation to open each of the six panels. On narrow screens, use the menu button to open or close navigation. Search and filter controls refine the displayed rows; sortable table headings change ordering; pagination controls move through result pages. Select a customer row or its detail control to open the customer detail view. Charts respond to the panel's available filters.

## Staff action queue

Add an action from the queue panel, then edit its notes, priority or review status. Changes persist in browser localStorage for this computer/browser origin, including after refresh. The JSON action file is the untouched seed and is not rewritten by the dashboard. Resetting browser site data removes locally saved changes.

## Interpreting the demonstration

Every record is synthetic. CDI means Customer Deterioration Index and is a staff-review prioritisation signal, not a churn probability. Product suggestions are candidates pending staff eligibility and suitability review. Opportunity scores are relative prioritisation aids, not promised revenue or profitability. Model values are not shown as validated findings; absent metrics appear as “Not yet evaluated”.

## Troubleshooting

- If the app does not open, use the address shown in the server window in a modern browser.
- If the launcher says the port is occupied, close the other service using port 4173 and retry.
- If the browser shows a data loading error, close the app and re-extract the full ZIP; the package includes a validated snapshot and source data.
- Do not delete or rename files inside the extracted package while the app is running.
