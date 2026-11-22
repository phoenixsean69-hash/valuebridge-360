"""Validate the ten VALUEBRIDGE 360 JSON outputs and their cross-file references."""
from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def _default_data_dir() -> Path:
    if os.environ.get("VALUEBRIDGE_DATA_DIR"):
        return Path(os.environ["VALUEBRIDGE_DATA_DIR"])
    for filename in ("current-snapshot.json", "current-snapshot.previous.json"):
        pointer = ROOT / "analytics" / filename
        try:
            value = json.loads(pointer.read_text(encoding="utf-8"))
            candidate = ROOT / "analytics-data" / "snapshots" / value["snapshot_id"]
            if (candidate.is_dir() and json.loads((candidate / "manifest.json").read_text(encoding="utf-8")).get("validation_status") == "PASS"):
                return candidate
        except (OSError, ValueError, KeyError):
            pass
    return ROOT / "analytics-data"

DATA = _default_data_dir()
REPORTS = ROOT / "analytics" / "reports"
FILES = ["manifest.json", "dashboard_summary.json", "customer_segments.json", "retention_risk.json", "product_opportunities.json", "opportunity_rankings.json", "segment_migration.json", "alerts.json", "model_performance.json", "staff_action_queue.json"]
SEGMENTS = {"CHAMPIONS", "LOYAL_CUSTOMERS", "POTENTIAL_LOYALISTS", "NEW_CUSTOMERS", "AT_RISK", "HIBERNATING"}
EXPECTED_MODES = {
    "synthetic": ("synthetic", "illustrative / simulated", "SIMULATED"),
    "competition": ("BancABC 2026 Hackathon CSV (synthetic records)", "challenge dataset / synthetic records", "VALIDATED"),
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load(name: str) -> dict:
    path = DATA / name
    require(path.exists(), f"Missing required file: {name}")
    value = json.loads(path.read_text(encoding="utf-8"))
    require(isinstance(value, dict), f"{name} must contain a JSON object")
    return value


def validate() -> dict:
    docs = {name: load(name) for name in FILES}
    manifest = docs["manifest.json"]
    require(manifest.get("schema_version") == "1.0.0", "Unsupported manifest schema version")
    mode = manifest.get("data_mode")
    require(mode in EXPECTED_MODES, "Unsupported snapshot mode")
    source_name, status_name, evaluation_name = EXPECTED_MODES[mode]
    expected_meta = {"schema_version": "1.0.0", "data_source": source_name, "metric_status": status_name}
    require(manifest.get("data_source") == source_name and manifest.get("metric_status") == status_name, "Manifest provenance mismatch")
    require(manifest.get("application") == "VALUEBRIDGE 360" and manifest.get("illustrative") is True, "Manifest identity/mode invalid")
    if manifest.get("snapshot_id"):
        for name, doc in docs.items():
            if name != "staff_action_queue.json":
                require(doc.get("snapshot_id") == manifest["snapshot_id"], f"{name}: snapshot ID mismatch")
    for name, doc in docs.items():
        if name != "manifest.json":
            for key, expected in expected_meta.items():
                if name == "staff_action_queue.json" and key == "metric_status":
                    continue
                require(doc.get(key) == expected, f"{name}: incorrect {key}")
    if manifest.get("snapshot_id"):
        for name, doc in docs.items():
            if name != "staff_action_queue.json":
                require(doc.get("snapshot_id") == manifest["snapshot_id"], f"{name}: snapshot ID mismatch")
    customer_doc = docs["customer_segments.json"]
    customers = customer_doc.get("customers")
    segments = customer_doc.get("segments")
    require(isinstance(customers, list) and isinstance(segments, list), "Customer and segment arrays are required")
    customer_ids = {c["customer_id"] for c in customers}
    require(len(customer_ids) == len(customers), "Customer IDs must be unique")
    require({s["segment_id"] for s in segments} == SEGMENTS, "Exactly the six agreed segments are required")
    require(sum(s["customer_count"] for s in segments) == len(customers), "Segment counts do not reconcile")
    require(abs(sum(s["percentage"] for s in segments) - 100) <= 0.15, "Segment percentages do not reconcile")
    for c in customers:
        require(c["segment_id"] in SEGMENTS, "Unknown customer segment")
        require(isinstance(c["frequency"], int) and c["frequency"] >= 0 and 0 <= c["recency_days"] <= 3650 and c["monetary_score"] >= 0, "Invalid customer activity metrics")
        require(c["last_activity_date"] == "" or bool(date.fromisoformat(c["last_activity_date"])), "Invalid customer last activity date")
    summary = docs["dashboard_summary.json"]["summary"]
    require(summary["customer_count"] == len(customers), "Summary customer count mismatch")
    risk = docs["retention_risk.json"]
    require(date.fromisoformat(risk["observation_date"]), "Invalid CDI observation date")
    require({r["customer_id"] for r in risk["customers"]} == customer_ids, "Risk customer references mismatch")
    for row in risk["customers"]:
        if row["cdi_score"] is None:
            require(row["risk_category"] == "UNSCORED" and all(row[k] is None for k in ("frequency_drop", "monetary_drop", "recency_drop")), "Unscored CDI row must have null components")
        else:
            require(0 <= row["cdi_score"] <= 100 and all(isinstance(row[k], (int, float)) and 0 <= row[k] <= 1 for k in ("frequency_drop", "monetary_drop", "recency_drop")), "CDI or component outside valid range")
    recs = docs["product_opportunities.json"]["recommendations"]
    require(all(r["customer_id"] in customer_ids for r in recs), "Unknown customer in recommendations")
    require(all(all(0 <= r[k] <= 1 for k in ("affinity_score", "support", "confidence")) and r["lift"] >= 0 and "CANDIDATE" in r["eligibility_status"] for r in recs), "Invalid product metric or disclaimer")
    rankings = docs["opportunity_rankings.json"]["rankings"]
    require([r["rank"] for r in rankings] == list(range(1, len(rankings) + 1)), "Opportunity ranks must be contiguous")
    require(all(r["customer_id"] in customer_ids and 0 <= r["opportunity_score"] <= 1 for r in rankings), "Invalid opportunity ranking")
    require(all(rankings[i]["opportunity_score"] >= rankings[i + 1]["opportunity_score"] for i in range(len(rankings) - 1)), "Opportunity rows are not ranked by descending score")
    migration = docs["segment_migration.json"]
    require(all(t["from_segment"] in {s["segment_name"] for s in segments} and t["to_segment"] in {s["segment_name"] for s in segments} and t["customer_count"] >= 0 for t in migration["transitions"]), "Invalid migration rows")
    require(set(migration["periods"]) == {t["period"] for t in migration["transitions"]}, "Migration periods do not match transition periods")
    require(all(sum(t["customer_count"] for t in migration["transitions"] if t["period"] == period) == len(customers) for period in migration["periods"]), "Migration transition counts do not reconcile")
    alerts = docs["alerts.json"]["alerts"]
    require(all(a["customer_id"] in customer_ids and date.fromisoformat(a["created_at"][:10]) for a in alerts), "Invalid alert reference/date")
    models = docs["model_performance.json"]
    require(models["evaluation_status"] == evaluation_name and len(models["models"]) == 3, "Expected three correctly labelled model entries")
    for model in models["models"]:
        for key in ("roc_auc", "pr_auc", "precision", "recall", "precision_at_top_k", "lift_at_top_k"):
            v = model[key]
            max_value = float("inf") if key == "lift_at_top_k" else 1
            require(v is None or isinstance(v, (int, float)) and 0 <= v <= max_value, f"Invalid model metric {key}")
    queue = docs["staff_action_queue.json"]["actions"]
    require(all(a["customer_id"] in customer_ids and a["review_status"] in {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"} for a in queue), "Invalid staff action row")
    return {"status": "PASS", "files_validated": len(FILES), "customer_count": len(customers), "segment_count": len(segments), "recommendations": len(recs), "rankings": len(rankings), "migration_rows": len(migration["transitions"]), "alerts": len(alerts), "staff_actions": len(queue), "model_metric_policy": "synthetic-only chronological evaluation; null values remain unavailable", "data_mode": mode}


if __name__ == "__main__":
    try:
        report = validate()
        if not os.environ.get("VALUEBRIDGE_DATA_DIR"):
            REPORTS.mkdir(parents=True, exist_ok=True)
            (REPORTS / "validation-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
    except Exception as exc:
        print(f"VALIDATION FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
