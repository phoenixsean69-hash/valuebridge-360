"""Calculate a complete synthetic snapshot and activate it with an atomic pointer."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from data_preparation import prepare_transactions
from challenge_preparation import prepare_challenge_transactions
from migration_analysis import analyze_migration
from opportunity_scoring import rank_opportunities
from predictive_models import evaluate_models
from product_affinity import analyze_affinity
from retention_analysis import analyze_retention
from rfm_analysis import analyze_rfm
from source_evidence import enrich_snapshot
from snapshot_store import (
    atomic_write_pointer,
    initialize_from_legacy,
    pointer_path_for,
    publication_lock,
    recover_pointer,
    validate_snapshot,
)

DEMO_META = {"schema_version": "1.0.0", "data_source": "synthetic", "metric_status": "illustrative / simulated"}
CHALLENGE_META = {"schema_version": "1.0.0", "data_source": "BancABC 2026 Hackathon CSV (synthetic records)", "metric_status": "challenge dataset / synthetic records"}


def write(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def _build_documents(data, snapshot_id: str, *, challenge: bool = False) -> tuple[dict[str, dict], dict]:
    meta = CHALLENGE_META if challenge else DEMO_META
    rfm = analyze_rfm(data)
    retention = analyze_retention(data)
    affinity = analyze_affinity(data)
    rankings = rank_opportunities(data, rfm, affinity)
    migration = analyze_migration(data)
    model_result = evaluate_models(data)

    summary = {**meta, "summary": {
        "customer_count": data.customer_count,
        "account_count": data.account_count,
        "active_customers": rfm["summary"]["active_customers"],
        "at_risk_customers": sum(row["risk_category"] in ("HIGH", "CRITICAL") for row in retention["customers"]),
        "high_value_customers": rfm["summary"]["high_value_customers"],
        "potential_opportunities": len(rankings),
        "period_start": data.first_transaction_date.isoformat(),
        "period_end": data.observation_date.isoformat(),
    }}
    segments = {**meta, "segments": rfm["segments"], "customers": rfm["customers"], "methodology": rfm["methodology"]}
    risk = {**meta, "observation_date": retention["observation_date"], "cdi_methodology_version": "2.0.0", "customers": retention["customers"], "monthly_trends": retention["monthly_trends"], "methodology": retention["methodology"]}
    products = {**meta, "recommendations": affinity["recommendations"], "methodology": affinity["methodology"]}
    opportunities = {**meta, "rankings": rankings, "methodology": "Relative portfolio association and customer activity; not commercial value."}
    migration_doc = {**meta, "periods": migration["periods"], "transitions": migration["transitions"], "methodology": migration["methodology"]}
    alert_rows = []
    for row in retention["customers"]:
        if row["risk_category"] in ("HIGH", "CRITICAL"):
            alert_rows.append({
                "alert_id": f"ALT-{len(alert_rows) + 1:05d}",
                "customer_id": row["customer_id"],
                "alert_type": "CDI_DETERIORATION",
                "severity": row["risk_category"],
                "description": f"CDI {row['cdi_score']} ({row['risk_category']}); {row['reason']}",
                "created_at": f"{retention['observation_date']}T00:00:00Z",
                "status": "OPEN",
            })
    alerts = {**meta, "alerts": alert_rows}
    model_doc = {
        **meta,
        "evaluation_status": "VALIDATED" if challenge and model_result.get("models") else "SIMULATED",
        "prediction_target": "No qualifying transaction in the following three complete calendar months",
        "evaluation_method": model_result.get("evaluation_method", "Chronological leakage-safe synthetic evaluation unavailable") + (" Challenge CSV contains synthetic reference records; this is not real-world performance evidence." if challenge else ""),
        "evaluation_sample_size": model_result.get("evaluation_sample_size"),
        "models": model_result.get("models", []),
    }
    if not model_doc["models"]:
        model_doc["models"] = [{
            "model_name": name, "model_type": kind, "roc_auc": None, "pr_auc": None, "precision": None,
            "recall": None, "precision_at_top_k": None, "lift_at_top_k": None,
        } for name, kind in [("Naive Recency Baseline", "BASELINE"), ("Logistic Regression", "BASELINE"), ("Gradient Boosting", "ADVANCED")]]

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    manifest = {
        "schema_version": "1.0.0", "application": "VALUEBRIDGE 360",
        "data_mode": "competition" if challenge else "synthetic", "data_source": meta["data_source"],
        "generator_version": "challenge-import-1.0" if challenge else "2.1.0", "random_seed": 3602026 if not challenge else None, "generated_at": generated_at,
        "customer_count": data.customer_count, "account_count": data.account_count, "transaction_count": data.transaction_count,
        "illustrative": True, "metric_status": meta["metric_status"], "snapshot_id": snapshot_id,
        "source_observation_period": {"start": data.first_transaction_date.isoformat(), "end": data.observation_date.isoformat()},
        "processing_version": "analytics-2.1.0", "validation_status": "PENDING",
    }
    documents = {
        "dashboard_summary.json": summary,
        "customer_segments.json": segments,
        "retention_risk.json": risk,
        "product_opportunities.json": products,
        "opportunity_rankings.json": opportunities,
        "segment_migration.json": migration_doc,
        "alerts.json": alerts,
        "model_performance.json": model_doc,
    }
    for document in documents.values():
        document["snapshot_id"] = snapshot_id
    return documents, manifest


def export(source: Path, output: Path, customer_count: int = 50_000, chunksize: int = 100_000, *, challenge: bool = False) -> dict:
    started = time.perf_counter()
    project_root = Path(__file__).resolve().parents[1]
    source = source.resolve()
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    snapshot_root = output / "snapshots"
    snapshot_root.mkdir(parents=True, exist_ok=True)
    pointer = pointer_path_for(output, project_root)
    lock_path = output / ".publisher.lock"

    with publication_lock(lock_path):
        # Interrupted runs can leave only unreferenced staging folders. They are
        # removed while holding the exclusive publisher lock; activated snapshots
        # are immutable and are never removed here.
        for stale in snapshot_root.glob(".staging-*"):
            if stale.is_dir():
                shutil.rmtree(stale, ignore_errors=True)
        try:
            current_id = recover_pointer(snapshot_root, pointer)
        except FileNotFoundError:
            current_id = initialize_from_legacy(output, snapshot_root, pointer, project_root)

        current_dir = snapshot_root / current_id
        queue_seed = output / "staff_action_queue.json"
        if not queue_seed.is_file():
            queue_seed = current_dir / "staff_action_queue.json"
        if not queue_seed.is_file():
            raise FileNotFoundError("The original staff action queue seed file is missing")

        data = (prepare_challenge_transactions if challenge else prepare_transactions)(source, customer_count, chunksize)
        mode = "challenge" if challenge else "synthetic"
        snapshot_id = f"{mode}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{uuid.uuid4().hex[:12]}"
        staging = snapshot_root / f".staging-{snapshot_id}"
        final = snapshot_root / snapshot_id
        staging.mkdir()
        try:
            documents, manifest = _build_documents(data, snapshot_id, challenge=challenge)
            write(staging / "manifest.json", manifest)
            for name, document in documents.items():
                write(staging / name, document)
            if challenge:
                # Do not copy fictional seed actions into a different customer mapping.
                # Prioritise reviews, not automated decisions. Local browser edits remain local.
                actions = []
                for row in sorted(documents["retention_risk.json"]["customers"], key=lambda x: -(x["cdi_score"] or 0)):
                    if row["risk_category"] not in ("CRITICAL", "HIGH") or len(actions) >= 250:
                        continue
                    actions.append({
                        "action_id": f"ACT-{len(actions)+1:05d}", "customer_id": row["customer_id"],
                        "action_type": "RETENTION_FOLLOW_UP", "priority": "HIGH", "notes": "Review deterioration indicator and eligibility before outreach.",
                        "review_status": "PENDING", "created_at": f"{data.observation_date.isoformat()}T00:00:00Z",
                    })
                write(staging / "staff_action_queue.json", {"schema_version": "1.0.0", "data_source": CHALLENGE_META["data_source"], "actions": actions})
            else:
                shutil.copy2(queue_seed, staging / "staff_action_queue.json")

            if challenge:
                enrich_snapshot(source, staging)
                manifest = json.loads((staging / "manifest.json").read_text(encoding="utf-8"))
            validate_snapshot(staging, project_root)
            manifest["validation_status"] = "PASS"
            write(staging / "manifest.json", manifest)
            validate_snapshot(staging, project_root)

            staging.rename(final)
            # The pointer update is the publication commit. If interrupted before
            # replacement, readers stay on the previous immutable snapshot.
            atomic_write_pointer(pointer, snapshot_id)
        except Exception:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
            raise

        output_bytes = sum(path.stat().st_size for path in final.iterdir() if path.is_file())
        result = {
            "status": "PASS", "snapshot_id": snapshot_id, "customer_count": data.customer_count,
            "accounts": data.account_count, "transactions": data.transaction_count,
            "qualifying_transactions": data.qualifying_transaction_count,
            "affinity_recommendations": len(documents["product_opportunities.json"]["recommendations"]),
            "opportunity_rankings": len(documents["opportunity_rankings.json"]["rankings"]),
            "migration_periods": len(documents["segment_migration.json"]["periods"]),
            "model_holdout_size": documents["model_performance.json"]["evaluation_sample_size"],
            "source_bytes": data.source_bytes, "snapshot_bytes": output_bytes,
            "snapshot_directory": str(final), "pointer": str(pointer),
            "previous_snapshot_id": current_id, "elapsed_seconds": round(time.perf_counter() - started, 2),
        }
        print(json.dumps(result, indent=2))
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("analytics-data"))
    parser.add_argument("--customers", type=int, default=50_000)
    parser.add_argument("--chunksize", type=int, default=100_000)
    parser.add_argument("--challenge", action="store_true", help="Use supplied BancABC challenge CSV; preserve synthetic demo as fallback")
    args = parser.parse_args()
    export(args.source, args.output, args.customers, args.chunksize, challenge=args.challenge)


if __name__ == "__main__":
    main()
