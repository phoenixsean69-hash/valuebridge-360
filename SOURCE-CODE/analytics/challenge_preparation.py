"""Privacy-minimising ingestion of the supplied BancABC 2026 synthetic challenge CSV.

Records are processed in bounded chunks, Customer IDs retain their supplied
source values, and only selected analytical fields enter the model features. The input file's order is NOT a time order.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from data_preparation import (PreparedData, MONTH_START, OBSERVATION_FALLBACK,
                              BASELINE_START, RECENT_START, UNIX_EPOCH_ORDINAL,
                              USECOLS, QUALIFYING_EXCLUDED_TYPES, _monthly_labels)


def _normalise_product_list(value: object) -> str:
    if pd.isna(value):
        return ""
    products = {part.strip() for part in str(value).replace(";", "|").split("|") if part.strip()}
    return " | ".join(sorted(products))


def prepare_challenge_transactions(path: Path, customer_count: int = 50_000, chunksize: int = 100_000) -> PreparedData:
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    labels = _monthly_labels(OBSERVATION_FALLBACK)
    n_months = len(labels)
    counts = np.zeros((customer_count, n_months), dtype=np.uint32)
    money = np.zeros((customer_count, n_months), dtype=np.float64)
    month_last = np.full((customer_count, n_months), -1, dtype=np.int32)
    first = np.full(customer_count, np.iinfo(np.int32).max, dtype=np.int32)
    last = np.full(customer_count, -1, dtype=np.int32)
    baseline_days: list[list[int]] = [[] for _ in range(customer_count)]
    baseline_count = np.zeros(customer_count, dtype=np.uint32)
    customer_segments = np.full(customer_count, None, dtype=object)
    customer_statuses = np.full(customer_count, None, dtype=object)
    products_held = np.full(customer_count, None, dtype=object)
    customer_index: dict[str, int] = {}
    accounts: set[str] = set()
    n_rows, n_qualified = 0, 0
    min_date: date | None = None
    max_date: date | None = None
    dtype = {key: "string" for key in ["Account ID", "Customer ID", "Type", "Status", "customer_segment", "customer_status", "products_held"]}
    for chunk in pd.read_csv(path, usecols=USECOLS, dtype=dtype, chunksize=chunksize, encoding="utf-8-sig"):
        n_rows += len(chunk)
        accounts.update(chunk["Account ID"].dropna().astype(str).unique())
        dates = pd.to_datetime(chunk["Date"], format="%d/%m/%Y", errors="coerce")
        if dates.isna().any():
            raise ValueError(f"Cannot parse {int(dates.isna().sum())} transaction date(s) near row {n_rows}")
        chunk_min, chunk_max = dates.min().date(), dates.max().date()
        min_date = min(chunk_min, min_date) if min_date else chunk_min
        max_date = max(chunk_max, max_date) if max_date else chunk_max
        if chunk["Customer ID"].isna().any():
            raise ValueError("Missing customer identifier in the supplied data")
        # First appearance in file order is stable across chunk sizes/reruns.
        for key in pd.unique(chunk["Customer ID"]):
            raw_id = str(key)
            if raw_id not in customer_index:
                if len(customer_index) >= customer_count:
                    raise ValueError(f"Source exceeds the configured {customer_count:,} customers")
                customer_index[raw_id] = len(customer_index)
        indexes = chunk["Customer ID"].map(customer_index).to_numpy(dtype=np.int32)
        unique_indexes, positions = np.unique(indexes, return_index=True)
        for col, target in (("customer_segment", customer_segments), ("customer_status", customer_statuses), ("products_held", products_held)):
            for i, position in zip(unique_indexes, positions, strict=True):
                raw = chunk[col].iat[position]
                value = _normalise_product_list(raw) if col == "products_held" else str(raw).strip() if not pd.isna(raw) else ""
                if target[i] is None:
                    target[i] = value
                elif target[i] != value:
                    raise ValueError(f"Inconsistent {col} for pseudonymous customer CUST-{i+1:05d}")
        status = chunk["Status"].str.strip().str.upper()
        kind = chunk["Type"].str.strip().str.upper()
        qualifying = status.eq("COMPLETED") & ~kind.isin(QUALIFYING_EXCLUDED_TYPES)
        if not bool(qualifying.any()):
            continue
        n_qualified += int(qualifying.sum())
        select = qualifying.to_numpy(dtype=bool)
        idx = indexes[select]
        days = dates[qualifying].to_numpy(dtype="datetime64[D]").astype(np.int32) + UNIX_EPOCH_ORDINAL
        amount = pd.to_numeric(chunk.loc[qualifying, "Amount (USD)"], errors="coerce").to_numpy(dtype=np.float64)
        if not np.isfinite(amount).all() or (amount <= 0).any():
            raise ValueError("Qualifying amount values must be finite and positive")
        months = ((dates[qualifying].dt.year.to_numpy() - MONTH_START.year) * 12 + dates[qualifying].dt.month.to_numpy() - MONTH_START.month).astype(np.int16)
        if (months < 0).any() or (months >= n_months).any():
            raise ValueError("Transaction outside supported source range October 2022–October 2026")
        np.add.at(counts, (idx, months), 1)
        np.add.at(money, (idx, months), amount)
        np.maximum.at(month_last, (idx, months), days)
        np.minimum.at(first, idx, days)
        np.maximum.at(last, idx, days)
        baseline_mask = select & dates.ge(pd.Timestamp(BASELINE_START)).to_numpy() & dates.lt(pd.Timestamp(RECENT_START)).to_numpy()
        if baseline_mask.any():
            baseline_frame = pd.DataFrame({
                "customer": indexes[baseline_mask],
                "day": dates[baseline_mask].to_numpy(dtype="datetime64[D]").astype(np.int32) + UNIX_EPOCH_ORDINAL,
            })
            for i, group in baseline_frame.groupby("customer", sort=False):
                observed_days = group["day"].to_numpy(dtype=np.int32)
                baseline_days[int(i)].extend(observed_days.tolist())
                baseline_count[int(i)] += len(observed_days)
    if not n_rows or min_date is None or max_date is None:
        raise ValueError("Challenge CSV has no rows")
    if len(customer_index) != customer_count:
        raise ValueError(f"Observed {len(customer_index):,} customers, expected {customer_count:,}")
    if any(x is None for x in customer_segments) or any(x is None for x in customer_statuses):
        raise ValueError("At least one customer is missing profile descriptors")
    # All baseline event dates are sorted across chunks. Same-day repeats produce zero
    # day intervals just as genuine simultaneous qualifying events should.
    baseline_intervals = [np.diff(sorted(days)).astype(int).tolist() if len(days) >= 2 else [] for days in baseline_days]
    # Do not roll the observation back to the prior month while still retaining
    # transactions from an incomplete final month: that would make recency
    # negative and leak unobserved future activity into reports.
    observation = max_date
    return PreparedData(
        customer_ids=list(customer_index.keys()),
        customer_segments=customer_segments,
        customer_statuses=customer_statuses,
        products_held=products_held,
        monthly_labels=labels, monthly_counts=counts, monthly_monetary=money,
        monthly_last_activity_ordinal=month_last, first_activity_ordinal=first, last_activity_ordinal=last,
        baseline_interval_days=baseline_intervals, baseline_transaction_counts=baseline_count,
        observation_date=observation, first_transaction_date=min_date,
        transaction_count=n_rows, qualifying_transaction_count=n_qualified,
        account_count=len(accounts), source_bytes=path.stat().st_size,
    )
