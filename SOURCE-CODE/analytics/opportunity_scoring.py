"""Relative activity and affinity ranking; no revenue or profitability claims."""
from __future__ import annotations
import numpy as np
from data_preparation import PreparedData

def rank_opportunities(data: PreparedData, rfm: dict, affinity: dict) -> list[dict]:
    customers=rfm["customers"]; features=rfm["features"]
    rows=[]
    by_customer={}
    for rec in affinity["recommendations"]:
        current=by_customer.get(rec["customer_id"])
        if current is None or rec["affinity_score"]>current["affinity_score"]: by_customer[rec["customer_id"]]=rec
    monetary=features["monetary"]
    maximum=float(np.quantile(monetary,0.95)) if len(monetary) else 0
    for i,c in enumerate(customers):
        rec=by_customer.get(c["customer_id"])
        if not rec: continue
        relative=min(1.0,float(monetary[i])/maximum) if maximum>0 else 0.0
        score=0.6*rec["affinity_score"]+0.4*relative
        rows.append({"customer_id":c["customer_id"],"segment":c["segment_id"].replace("_"," ").title(),"product_candidate":rec["product_candidate"],"affinity_score":rec["affinity_score"],"customer_value_score":round(relative,4),"opportunity_score":round(score,4),"explanation":"60% portfolio-association affinity + 40% capped relative USD transaction activity; not revenue or profitability."})
    rows.sort(key=lambda x:(-x["opportunity_score"],x["customer_id"]))
    for rank,row in enumerate(rows,1): row["rank"]=rank
    return rows
