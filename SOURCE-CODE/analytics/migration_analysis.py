"""Full-population month-end RFM segment transitions from transaction history."""
from __future__ import annotations
from datetime import date
import calendar
import numpy as np
from data_preparation import PreparedData
from rfm_analysis import SEGMENT_NAMES, assign_segment, quintile_scores

def _segments_at(data: PreparedData, end_index: int, cutoff: date) -> list[str]:
    counts=data.monthly_counts[:,:end_index+1].sum(axis=1,dtype=np.uint64)
    money=data.monthly_monetary[:,:end_index+1].sum(axis=1)
    dates=data.monthly_last_activity_ordinal[:,:end_index+1].max(axis=1).astype(np.int64)
    dates[counts==0]=cutoff.toordinal()
    recency=np.maximum(0,cutoff.toordinal()-dates)
    active=counts>0
    r=quintile_scores(recency,active,False); f=quintile_scores(counts,active); m=quintile_scores(money,active)
    has_history=counts>0
    first=np.where(has_history,np.maximum(0,cutoff.toordinal()-data.first_activity_ordinal.astype(np.int64)),0)
    return [assign_segment(int(a),int(b),int(c),has_activity=bool(d),first_activity_days=int(e)) for a,b,c,d,e in zip(r,f,m,active,first,strict=True)]

def analyze_migration(data: PreparedData) -> dict:
    counts={}
    previous=None
    for i,label in enumerate(data.monthly_labels):
        year,month=map(int,label.split("-")); import calendar
        cutoff=date(year,month,calendar.monthrange(year,month)[1])
        current=_segments_at(data,i,cutoff)
        if previous is not None:
            for old,new in zip(previous,current,strict=True): counts[(label,old,new)]=counts.get((label,old,new),0)+1
        previous=current
    rows=[{"period":period,"from_segment":SEGMENT_NAMES[old],"to_segment":SEGMENT_NAMES[new],"customer_count":n} for (period,old,new),n in sorted(counts.items())]
    return {"periods":data.monthly_labels[1:],"transitions":rows,"methodology":"Each transition is calculated on the full customer population by recomputing RFM segments at successive month ends from transactions available through that date."}
