"""Transparent snapshot co-holding associations (not product adoption probabilities)."""
from __future__ import annotations
from collections import Counter
from itertools import combinations

from data_preparation import PreparedData

DISCLAIMER = "Product co-holding associations from current synthetic challenge snapshots; not adoption probabilities. Only currently Active profiles are shown for potential review, not preapproved. Staff must independently check eligibility and suitability."


def analyze_affinity(data: PreparedData) -> dict:
    portfolios = [
        {p.strip() for p in str(value or "").replace(";", "|").split("|") if p.strip() and p.strip().lower() not in {"nan", "none"}}
        for value in data.products_held
    ]
    products = sorted(set().union(*portfolios)) if portfolios else []
    singles = Counter(p for basket in portfolios for p in basket)
    pairs = Counter(pair for basket in portfolios for pair in combinations(sorted(basket), 2))
    n = max(1, len(portfolios))
    recommendations = []
    for i, basket in enumerate(portfolios):
        # A current customer status is appropriate for the *present-day review
        # queue* but is never used as a historical training feature.
        if str(data.customer_statuses[i]).strip().upper() != "ACTIVE" or not basket:
            continue
        best = None
        for candidate in products:
            if candidate in basket:
                continue
            for owned in basket:
                pair_count = pairs[tuple(sorted((owned, candidate)))]
                if pair_count < 5:
                    continue
                support = pair_count / n
                confidence = pair_count / max(1, singles[owned])
                prevalence = singles[candidate] / n
                lift = confidence / max(1e-12, prevalence)
                score = min(1.0, confidence * min(lift, 5.0) / 5.0)
                row = {
                    "customer_id": data.customer_ids[i], "product_candidate": candidate,
                    "affinity_score": round(score, 4), "support": round(support, 4),
                    "confidence": round(confidence, 4), "lift": round(lift, 4),
                    "reason": f"{owned} co-occurs with {candidate} in {pair_count} customer portfolios; historical portfolio association only.",
                    "eligibility_status": "CANDIDATE — pending staff eligibility and suitability review",
                }
                # One best candidate per eligible customer keeps the portable
                # dashboard usable instead of loading hundreds of thousands of rows.
                if best is None or (score, confidence, candidate) > best[0]:
                    best = ((score, confidence, candidate), row)
        if best is not None:
            recommendations.append(best[1])
    recommendations.sort(key=lambda row: (row["customer_id"], -row["affinity_score"]))
    return {"recommendations": recommendations, "products": products, "methodology": DISCLAIMER}
