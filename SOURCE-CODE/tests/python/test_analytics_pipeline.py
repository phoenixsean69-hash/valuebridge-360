from __future__ import annotations
import unittest
from datetime import date
import calendar
from pathlib import Path
import sys
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"analytics"))
from data_preparation import PreparedData
from rfm_analysis import analyze_rfm
from retention_analysis import analyze_retention
from product_affinity import analyze_affinity
from opportunity_scoring import rank_opportunities
from migration_analysis import analyze_migration
from migration_analysis import _segments_at

def fixture() -> PreparedData:
    n=100; labels=[f"{y:04d}-{m:02d}" for y in (2022,2023,2024,2025,2026) for m in range(1,13) if (y,m)>=(2022,10) and (y,m)<=(2026,10)]
    counts=np.zeros((n,len(labels)),dtype=np.uint32); money=np.zeros((n,len(labels)),dtype=float)
    for i in range(80): counts[i,:]=3; counts[i,-9:]=1; money[i,:]=counts[i,:]*25
    for i in range(80,95): counts[i,:]=0
    for i in range(95,100): counts[i,-1]=1; money[i,-1]=10
    first=date(2022,10,1).toordinal(); last=np.full(n,first+30,dtype=np.int32); last[:80]=date(2026,10,15).toordinal(); last[95:]=date(2026,10,15).toordinal(); last[80:95]=-1
    firsts=np.full(n,first,dtype=np.int32); firsts[95:]=date(2026,10,15).toordinal(); firsts[80:]=np.iinfo(np.int32).max
    monthly_last=np.full((n,len(labels)),-1,dtype=np.int32)
    for column,label in enumerate(labels):
        year,month=map(int,label.split("-")); monthly_last[:80,column]=date(year,month,calendar.monthrange(year,month)[1]).toordinal()
    monthly_last[95:,-1]=date(2026,10,15).toordinal()
    return PreparedData([f"CUST-{i+1:05d}" for i in range(n)],np.array(["Retail"]*n,dtype=object),np.array(["Active"]*n,dtype=object),np.array(["Current Account|Mobile Banking" if i%2 else "Current Account|Savings" for i in range(n)],dtype=object),labels,counts,money,monthly_last,firsts,last,[[30,31,29] if i<80 else [] for i in range(n)],np.full(n,20,dtype=np.uint32),date(2026,10,31),date(2022,10,1),1000,900,140,5000)

class AnalyticsTests(unittest.TestCase):
    def test_rfm_conserves_customers_and_unobserved_state(self):
        d=fixture(); result=analyze_rfm(d)
        self.assertEqual(len(result["customers"]),d.customer_count)
        self.assertEqual(sum(s["customer_count"] for s in result["segments"]),d.customer_count)
        self.assertEqual(result["customers"][85]["segment_id"],"HIBERNATING")
        self.assertEqual(result["customers"][85]["last_activity_date"],"")

    def test_retention_leaves_insufficient_baseline_unscored(self):
        result=analyze_retention(fixture())
        self.assertEqual(result["customers"][95]["cdi_score"],None)
        self.assertEqual(result["customers"][95]["risk_category"],"UNSCORED")
        self.assertTrue(all(row["cdi_score"] is None or 0<=row["cdi_score"]<=100 for row in result["customers"]))

    def test_affinity_candidate_is_not_already_held(self):
        d=fixture(); result=analyze_affinity(d)
        held={p for p in str(d.products_held[0]).split("|")}
        self.assertTrue(all(r["product_candidate"] not in set(str(d.products_held[int(r["customer_id"][-5:])-1]).split("|")) for r in result["recommendations"]))
        ranked=rank_opportunities(d,analyze_rfm(d),result)
        self.assertEqual([r["rank"] for r in ranked],list(range(1,len(ranked)+1)))

    def test_migration_counts_full_population_for_each_period(self):
        result=analyze_migration(fixture())
        for period in result["periods"][-3:]:
            self.assertEqual(sum(r["customer_count"] for r in result["transitions"] if r["period"]==period),100)

    def test_historical_migration_cutoff_does_not_use_future_rows(self):
        original=fixture(); changed=fixture(); cutoff_index=20
        changed.monthly_counts[:,cutoff_index+1:]=0
        changed.monthly_monetary[:,cutoff_index+1:]=0
        changed.monthly_last_activity_ordinal[:,cutoff_index+1:]=-1
        cutoff=date(2024,6,30)
        self.assertEqual(_segments_at(original,cutoff_index,cutoff),_segments_at(changed,cutoff_index,cutoff))

if __name__=="__main__": unittest.main()
