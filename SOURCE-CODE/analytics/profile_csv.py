"""Profile CSV structure locally without printing or exporting source records."""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

DATE_HINT = re.compile(r"date|time|period|month", re.I)
CUSTOMER_HINT = re.compile(r"customer|client|party|cif", re.I)
ACCOUNT_HINT = re.compile(r"account|acct", re.I)
AMOUNT_HINT = re.compile(r"amount|value|debit|credit|balance", re.I)
TYPE_HINT = re.compile(r"type|category|channel|narration|description|code", re.I)


def looks_date(value: str) -> bool:
    if not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return bool(re.fullmatch(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", value))


def profile(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        headers = next(reader, None)
        if not headers:
            return {"file_name": path.name, "structural_findings": ["CSV is empty or has no header row"], "columns": []}
        counts = [0] * len(headers)
        types = [Counter() for _ in headers]
        date_candidates: set[str] = set()
        row_count = 0
        malformed_rows = 0
        for row in reader:
            row_count += 1
            if len(row) != len(headers):
                malformed_rows += 1
            for i in range(len(headers)):
                value = row[i].strip() if i < len(row) else ""
                if not value:
                    counts[i] += 1
                elif looks_date(value):
                    types[i]["date"] += 1
                    if DATE_HINT.search(headers[i]) or types[i]["date"] == 1:
                        date_candidates.add(headers[i])
                else:
                    try:
                        float(value.replace(",", ""))
                        types[i]["numeric"] += 1
                    except ValueError:
                        types[i]["text"] += 1
        duplicate_columns = sorted(name for name, count in Counter(headers).items() if count > 1)
        columns = []
        for i, name in enumerate(headers):
            type_counts = types[i]
            detected = max(type_counts, key=type_counts.get) if type_counts else "unknown"
            columns.append({"column_name": name, "detected_type": detected, "missing_count": counts[i], "missing_percentage": round(100 * counts[i] / max(row_count, 1), 2)})
        findings = []
        if malformed_rows:
            findings.append(f"{malformed_rows} data rows have a field count different from the {len(headers)} headers")
        if not malformed_rows:
            findings.append("All data rows have the same field count as the header")
        if duplicate_columns:
            findings.append("Duplicate column names require resolution before mapping")
        return {
            "file_name": path.name,
            "row_count": row_count,
            "column_count": len(headers),
            "columns": columns,
            "duplicate_column_names": duplicate_columns,
            "candidate_date_columns": sorted(date_candidates | {h for h in headers if DATE_HINT.search(h)}),
            "candidate_customer_identifier_columns": [h for h in headers if CUSTOMER_HINT.search(h)],
            "candidate_account_identifier_columns": [h for h in headers if ACCOUNT_HINT.search(h)],
            "candidate_transaction_amount_columns": [h for h in headers if AMOUNT_HINT.search(h)],
            "candidate_transaction_type_columns": [h for h in headers if TYPE_HINT.search(h)],
            "structural_findings": findings,
            "privacy_note": "No source records or customer values are included in this report.",
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="Local CSV path; contents stay on this machine")
    parser.add_argument("--output", type=Path, required=True, help="Path for metadata-only JSON report")
    args = parser.parse_args()
    result = profile(args.csv_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Profile saved to {args.output}; {result.get('column_count', 0)} columns; source values omitted.")


if __name__ == "__main__":
    main()
