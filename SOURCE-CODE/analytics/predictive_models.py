"""Chronological synthetic-only next-90-day activity evaluation."""
from __future__ import annotations
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_score, recall_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from data_preparation import PreparedData

def evaluate_models(data: PreparedData) -> dict:
    # Training cutoffs are strictly before the held-out Aug-Oct 2026 period.
    months=data.monthly_labels
    cutoffs=[i for i,m in enumerate(months) if m in {"2023-12","2024-06","2024-12","2025-06","2025-12"}]
    X=[]; y=[]
    for cutoff in cutoffs:
        end=min(cutoff+3,len(months)-1)
        history=data.monthly_counts[:,:cutoff+1]
        freq=history.sum(axis=1).astype(float)
        active_months=(history>0).sum(axis=1).astype(float)
        last=np.full(data.customer_count,-1,dtype=np.int64)
        for j in range(cutoff+1): last=np.where(history[:,j]>0,j,last)
        recency=np.where(last>=0,cutoff-last,cutoff+1)
        labels=(data.monthly_counts[:,cutoff+1:end+1].sum(axis=1)==0).astype(np.int8)
        X.append(np.column_stack([np.log1p(freq),active_months,recency, np.log1p(history[:,-3:].sum(axis=1))])); y.append(labels)
    if not X: return {"evaluation_sample_size":None,"models":[]}
    x=np.vstack(X); target=np.concatenate(y)
    import calendar
    last_month = data.observation_date
    last_complete = len(months) - 1
    if last_month.day != calendar.monthrange(last_month.year, last_month.month)[1]:
        last_complete -= 1
    cutoff = last_complete - 3  # next three FULL calendar months form test outcome
    if cutoff < 0:
        return {"evaluation_sample_size": None, "models": []}
    history=data.monthly_counts[:,:cutoff+1]; freq=history.sum(axis=1).astype(float); active=(history>0).sum(axis=1).astype(float)
    last=np.full(data.customer_count,-1,dtype=np.int64)
    for j in range(cutoff+1): last=np.where(history[:,j]>0,j,last)
    rec=np.where(last>=0,cutoff-last,cutoff+1)
    test_x=np.column_stack([np.log1p(freq),active,rec,np.log1p(history[:,-3:].sum(axis=1))])
    test_y=(data.monthly_counts[:,cutoff+1:cutoff+4].sum(axis=1)==0).astype(np.int8)
    def metrics(name,model,baseline=False):
        if baseline: scores=rec.astype(float)
        else:
            model.fit(x,target); scores=model.predict_proba(test_x)[:,1]
        pred=scores>=np.quantile(scores,0.8)
        return {"model_name":name,"model_type":"BASELINE" if baseline or name=="Logistic Regression" else "ADVANCED","roc_auc":float(roc_auc_score(test_y,scores)) if len(np.unique(test_y))>1 else None,"pr_auc":float(average_precision_score(test_y,scores)) if len(np.unique(test_y))>1 else None,"precision":float(precision_score(test_y,pred,zero_division=0)),"recall":float(recall_score(test_y,pred,zero_division=0)),"precision_at_top_k":float(precision_score(test_y,pred,zero_division=0)),"lift_at_top_k":float(precision_score(test_y,pred,zero_division=0)/max(float(test_y.mean()),1e-12))}
    models=[metrics("Naive Recency Baseline",None,True),metrics("Logistic Regression",make_pipeline(StandardScaler(),LogisticRegression(max_iter=300,class_weight="balanced"))),metrics("Gradient Boosting",HistGradientBoostingClassifier(max_iter=80,max_leaf_nodes=15,l2_regularization=1.0))]
    return {"evaluation_sample_size":int(len(test_y)),"models":models,"evaluation_method":f"Historical training cutoffs end in 2025-12; held-out features through {months[cutoff]}, with inactivity measured over the three following complete calendar months ({months[cutoff+1]} to {months[cutoff+3]}). No future information is used as a feature. Synthetic challenge patterns are not evidence of bank deployment performance."}
