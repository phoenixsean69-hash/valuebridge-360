"""Customer activity deterioration indicators, explicitly not churn probabilities."""
from __future__ import annotations

import numpy as np
from data_preparation import PreparedData


def analyze_retention(data: PreparedData) -> dict:
    labels = data.monthly_labels
    recent = [i for i, label in enumerate(labels) if "2026-08" <= label <= "2026-10"]
    baseline = [i for i, label in enumerate(labels) if "2026-02" <= label <= "2026-07"]
    rows = []
    valid_scores: list[float] = []
    monthly = []
    for i, customer_id in enumerate(data.customer_ids):
        old_n = int(data.monthly_counts[i, baseline].sum())
        new_n = int(data.monthly_counts[i, recent].sum())
        old_m = float(data.monthly_monetary[i, baseline].sum())
        new_m = float(data.monthly_monetary[i, recent].sum())
        intervals = data.baseline_interval_days[i]
        if old_n < 2 or old_m <= 0 or not intervals:
            rows.append({"customer_id": customer_id, "cdi_score": None, "risk_category": "UNSCORED", "historical_activity": old_n, "recent_activity": new_n, "activity_change_percent": None, "frequency_drop": None, "monetary_drop": None, "recency_drop": None, "reason": "Not enough baseline activity to calculate a comparable deterioration score.", "prediction_status": "not a churn probability"})
            continue
        expected_n = old_n / 6 * 3
        expected_m = old_m / 6 * 3
        frequency_drop = float(np.clip((expected_n - new_n) / expected_n, 0, 1)) if expected_n else 0.0
        monetary_drop = float(np.clip((expected_m - new_m) / expected_m, 0, 1)) if expected_m else 0.0
        median_interval = max(1.0, float(np.median(intervals)))
        last = int(data.last_activity_ordinal[i])
        days_since = max(0, data.observation_date.toordinal() - last) if last >= 0 else 9999
        recency_drop = float(np.clip(days_since / (2 * median_interval), 0, 1))
        score = round(100 * (0.4 * frequency_drop + 0.4 * monetary_drop + 0.2 * recency_drop))
        category = "LOW" if score < 25 else "MODERATE" if score < 50 else "HIGH" if score < 75 else "CRITICAL"
        change = round(100 * (new_n - expected_n) / expected_n) if expected_n else 0
        rows.append({"customer_id": customer_id, "cdi_score": score, "risk_category": category, "historical_activity": old_n, "recent_activity": new_n, "activity_change_percent": change, "frequency_drop": round(frequency_drop, 4), "monetary_drop": round(monetary_drop, 4), "recency_drop": round(recency_drop, 4), "reason": f"{frequency_drop:.0%} frequency decline; {monetary_drop:.0%} monetary activity decline; {days_since} days since qualifying transaction.", "prediction_status": "activity indicator; not a churn probability"})
        valid_scores.append(score)
    for j, label in enumerate(labels):
        # Earlier months are intentionally blank: the supplied CDI is an end-of-window
        # comparison for Aug–Oct 2026 and must not be backfilled as a false time series.
        if j != len(labels)-1:
            monthly.append({"month":label,"average_cdi":None,"high_risk_customers":0}); continue
        monthly.append({"month":label,"average_cdi":round(float(np.mean(valid_scores)),2) if valid_scores else None,"high_risk_customers":sum(row["cdi_score"] is not None and row["cdi_score"]>=50 for row in rows)})
    return {"customers": rows, "monthly_trends": monthly, "observation_date": data.observation_date.isoformat(), "methodology": "Compare Aug–Oct 2026 activity with Feb–Jul 2026 monthly baseline. CDI = 40% frequency deterioration + 40% USD activity deterioration + 20% recency scaled to the customer’s median baseline interval. Requires at least two baseline transactions; this is not a churn probability."}
