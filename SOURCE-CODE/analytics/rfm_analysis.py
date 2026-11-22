"""RFM scoring and six-segment assignment from qualifying transaction history."""
from __future__ import annotations

from datetime import date

import numpy as np

from data_preparation import PreparedData

SEGMENT_NAMES = {
    "CHAMPIONS": "Champions",
    "LOYAL_CUSTOMERS": "Loyal Customers",
    "POTENTIAL_LOYALISTS": "Potential Loyalists",
    "NEW_CUSTOMERS": "New Customers",
    "AT_RISK": "At Risk",
    "HIBERNATING": "Hibernating",
}
SEGMENT_ORDER = tuple(SEGMENT_NAMES)


def quintile_scores(values: np.ndarray, valid: np.ndarray, higher_is_better: bool = True) -> np.ndarray:
    scores = np.zeros(len(values), dtype=np.int8)
    indexes = np.flatnonzero(valid)
    if not len(indexes):
        return scores
    # Stable ordinal ranks make ties deterministic while retaining five evenly sized bands.
    order = np.argsort(values[indexes], kind="stable")
    rank = np.empty(len(indexes), dtype=np.int32)
    rank[order] = np.arange(len(indexes), dtype=np.int32)
    bands = np.minimum(5, rank * 5 // max(1, len(indexes)) + 1).astype(np.int8)
    scores[indexes] = 6 - bands if not higher_is_better else bands
    return scores


def assign_segment(recency_score: int, frequency_score: int, monetary_score: int, *, has_activity: bool, first_activity_days: int) -> str:
    if not has_activity:
        return "HIBERNATING"
    if recency_score >= 4 and frequency_score >= 4 and monetary_score >= 4:
        return "CHAMPIONS"
    if first_activity_days <= 90 and frequency_score <= 2:
        return "NEW_CUSTOMERS"
    if recency_score >= 4 and frequency_score >= 2:
        return "POTENTIAL_LOYALISTS"
    if recency_score >= 3 and (frequency_score >= 4 or monetary_score >= 4):
        return "LOYAL_CUSTOMERS"
    if recency_score <= 2 and (frequency_score >= 3 or monetary_score >= 3):
        return "AT_RISK"
    return "HIBERNATING"


def analyze_rfm(data: PreparedData) -> dict:
    customer_count = data.customer_count
    observation_ordinal = date.toordinal(data.observation_date)
    last_ordinals = data.last_activity_ordinal.astype(np.int64)
    first_ordinals = data.first_activity_ordinal.astype(np.int64)
    frequency = data.monthly_counts.sum(axis=1, dtype=np.uint64)
    monetary = data.monthly_monetary.sum(axis=1, dtype=np.float64)
    has_activity = frequency > 0
    observed_period_days = observation_ordinal - date.toordinal(data.first_transaction_date) + 1
    recency = np.where(has_activity, observation_ordinal - last_ordinals, observed_period_days).astype(np.int32)
    first_activity_days = np.where(has_activity, observation_ordinal - first_ordinals, np.iinfo(np.int32).max).astype(np.int32)
    r_score = quintile_scores(recency, has_activity, higher_is_better=False)
    f_score = quintile_scores(frequency, has_activity, higher_is_better=True)
    m_score = quintile_scores(monetary, has_activity, higher_is_better=True)

    segment_ids = [assign_segment(int(r), int(f), int(m), has_activity=bool(active), first_activity_days=int(tenure)) for r, f, m, active, tenure in zip(r_score, f_score, m_score, has_activity, first_activity_days, strict=True)]
    customers = []
    segment_values: dict[str, list[int]] = {segment_id: [] for segment_id in SEGMENT_ORDER}
    for index, segment_id in enumerate(segment_ids):
        segment_values[segment_id].append(index)
        last_activity = "" if not has_activity[index] else date.fromordinal(int(last_ordinals[index])).isoformat()
        customers.append({
            "customer_id": data.customer_ids[index],
            "segment_id": segment_id,
            "recency_days": int(max(0, recency[index])),
            "frequency": int(frequency[index]),
            "monetary_score": round(float(monetary[index]), 2),
            "last_activity_date": last_activity,
        })
    segment_summaries = []
    for segment_id in SEGMENT_ORDER:
        indexes = segment_values[segment_id]
        count = len(indexes)
        segment_summaries.append({
            "segment_id": segment_id,
            "segment_name": SEGMENT_NAMES[segment_id],
            "customer_count": count,
            "percentage": round(100 * count / max(customer_count, 1), 2),
            "average_recency_days": round(float(np.mean(recency[indexes])) if indexes else 0.0, 2),
            "average_frequency": round(float(np.mean(frequency[indexes])) if indexes else 0.0, 2),
            "average_monetary_score": round(float(np.mean(monetary[indexes])) if indexes else 0.0, 2),
        })
    return {
        "customers": customers,
        "segments": segment_summaries,
        "summary": {
            "customer_count": customer_count,
            "active_customers": int(np.count_nonzero(has_activity & (recency <= 90))),
            "high_value_customers": len(segment_values["CHAMPIONS"]) + len(segment_values["LOYAL_CUSTOMERS"]),
            "period_start": data.first_transaction_date.isoformat(),
            "period_end": data.observation_date.isoformat(),
        },
        "features": {
            "frequency": frequency,
            "monetary": monetary,
            "recency_days": recency,
            "first_activity_days": first_activity_days,
            "has_activity": has_activity,
            "segment_ids": segment_ids,
            "r_score": r_score,
            "f_score": f_score,
            "m_score": m_score,
        },
        "methodology": "R, F and M are quintile scores on completed non-fee transaction activity through the observation date. Six segment rules are deterministic and documented; monetary activity is not profit or lifetime value.",
    }
