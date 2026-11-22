"""Chunked, privacy-minimising preparation of the synthetic transaction CSV."""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

QUALIFYING_EXCLUDED_TYPES = {"SERVICE FEE"}
CHUNK_SIZE = 100_000
MONTH_START = date(2022, 10, 1)
BASELINE_START = date(2026, 2, 1)
RECENT_START = date(2026, 8, 1)
OBSERVATION_FALLBACK = date(2026, 10, 31)
UNIX_EPOCH_ORDINAL = date(1970, 1, 1).toordinal()
USECOLS = [
    "Date", "Account ID", "Customer ID", "Type", "Amount (USD)", "Status",
    "customer_segment", "customer_status", "products_held",
]


@dataclass
class PreparedData:
    customer_ids: list[str]
    customer_segments: np.ndarray
    customer_statuses: np.ndarray
    products_held: np.ndarray
    monthly_labels: list[str]
    monthly_counts: np.ndarray
    monthly_monetary: np.ndarray
    monthly_last_activity_ordinal: np.ndarray
    first_activity_ordinal: np.ndarray
    last_activity_ordinal: np.ndarray
    baseline_interval_days: list[list[int]]
    baseline_transaction_counts: np.ndarray
    observation_date: date
    first_transaction_date: date
    transaction_count: int
    qualifying_transaction_count: int
    account_count: int
    source_bytes: int

    @property
    def customer_count(self) -> int:
        return len(self.customer_ids)


def _monthly_labels(last_month: date) -> list[str]:
    labels: list[str] = []
    year, month = MONTH_START.year, MONTH_START.month
    while (year, month) <= (last_month.year, last_month.month):
        labels.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return labels


def _customer_indexes(values: pd.Series, customer_count: int) -> np.ndarray:
    suffix = values.str.extract(r"CUST-(\d+)$", expand=False)
    if suffix.isna().any():
        raise ValueError("Customer ID is not in the expected stable pseudonymous format")
    indexes = suffix.astype("int32").to_numpy() - 1
    if len(indexes) and (indexes.min() < 0 or indexes.max() >= customer_count):
        raise ValueError("Customer ID is outside the configured synthetic customer population")
    return indexes


def prepare_transactions(path: Path, customer_count: int = 50_000, chunksize: int = CHUNK_SIZE) -> PreparedData:
    """Read only analytical columns in chunks; direct identifiers are never loaded."""
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    labels = _monthly_labels(OBSERVATION_FALLBACK)
    month_count = len(labels)
    monthly_counts = np.zeros((customer_count, month_count), dtype=np.uint32)
    monthly_monetary = np.zeros((customer_count, month_count), dtype=np.float64)
    monthly_last_activity = np.full((customer_count, month_count), -1, dtype=np.int32)
    first_activity = np.full(customer_count, np.iinfo(np.int32).max, dtype=np.int32)
    last_activity = np.full(customer_count, -1, dtype=np.int32)
    baseline_intervals: list[list[int]] = [[] for _ in range(customer_count)]
    last_baseline_day = np.full(customer_count, -1, dtype=np.int32)
    baseline_counts = np.zeros(customer_count, dtype=np.uint32)
    customer_segments = np.full(customer_count, None, dtype=object)
    customer_statuses = np.full(customer_count, None, dtype=object)
    products_held = np.full(customer_count, None, dtype=object)
    accounts: set[str] = set()
    transaction_count = 0
    qualifying_count = 0
    min_date: date | None = None
    max_date: date | None = None

    dtype = {
        "Account ID": "string", "Customer ID": "string", "Type": "string", "Status": "string",
        "customer_segment": "string", "customer_status": "string", "products_held": "string",
    }
    for chunk in pd.read_csv(path, usecols=USECOLS, dtype=dtype, chunksize=chunksize, encoding="utf-8"):
        transaction_count += len(chunk)
        accounts.update(chunk["Account ID"].dropna().unique().tolist())
        dates = pd.to_datetime(chunk["Date"], format="%d/%m/%Y", errors="coerce")
        if dates.isna().any():
            raise ValueError("A transaction date could not be parsed")
        chunk_min, chunk_max = dates.min().date(), dates.max().date()
        min_date = chunk_min if min_date is None else min(min_date, chunk_min)
        max_date = chunk_max if max_date is None else max(max_date, chunk_max)
        indexes = _customer_indexes(chunk["Customer ID"], customer_count)

        # Snapshot descriptors are used for panel context only; never as historical model inputs.
        unique_indexes, first_positions = np.unique(indexes, return_index=True)
        for column, target in (("customer_segment", customer_segments), ("customer_status", customer_statuses), ("products_held", products_held)):
            for index, position in zip(unique_indexes, first_positions, strict=True):
                value = chunk[column].iat[position]
                if target[index] is None:
                    target[index] = value
                elif target[index] != value:
                    raise ValueError(f"Customer {index + 1} has inconsistent repeated {column} values")

        qualifying = chunk["Status"].eq("Completed") & ~chunk["Type"].isin(QUALIFYING_EXCLUDED_TYPES)
        if not qualifying.any():
            continue
        qualifying_count += int(qualifying.sum())
        selected_indexes = indexes[qualifying.to_numpy()]
        selected_dates = dates[qualifying].to_numpy(dtype="datetime64[D]").astype(np.int32) + UNIX_EPOCH_ORDINAL
        selected_amounts = pd.to_numeric(chunk.loc[qualifying, "Amount (USD)"], errors="coerce").to_numpy(dtype=np.float64)
        if not np.isfinite(selected_amounts).all() or (selected_amounts <= 0).any():
            raise ValueError("Qualifying transaction amounts must be finite and positive")
        selected_months = ((dates[qualifying].dt.year.to_numpy() - 2022) * 12 + dates[qualifying].dt.month.to_numpy() - 10).astype(np.int16)
        if (selected_months < 0).any() or (selected_months >= month_count).any():
            raise ValueError("Transaction falls outside the configured monthly observation range")
        np.add.at(monthly_counts, (selected_indexes, selected_months), 1)
        np.add.at(monthly_monetary, (selected_indexes, selected_months), selected_amounts)
        np.maximum.at(monthly_last_activity, (selected_indexes, selected_months), selected_dates)
        np.minimum.at(first_activity, selected_indexes, selected_dates)
        np.maximum.at(last_activity, selected_indexes, selected_dates)

        baseline_mask = qualifying.to_numpy() & dates.ge(pd.Timestamp(BASELINE_START)).to_numpy() & dates.lt(pd.Timestamp(RECENT_START)).to_numpy()
        if baseline_mask.any():
            baseline_frame = pd.DataFrame({"customer": indexes[baseline_mask], "day": dates[baseline_mask].to_numpy(dtype="datetime64[D]").astype(np.int32) + UNIX_EPOCH_ORDINAL})
            for customer_index, group in baseline_frame.groupby("customer", sort=False):
                days = group["day"].to_numpy(dtype=np.int32)
                previous = int(last_baseline_day[customer_index])
                intervals = np.diff(days)
                if previous >= 0:
                    intervals = np.concatenate(([int(days[0]) - previous], intervals))
                if len(intervals):
                    baseline_intervals[customer_index].extend(intervals.astype(int).tolist())
                last_baseline_day[customer_index] = days[-1]
                baseline_counts[customer_index] += len(days)

    if transaction_count == 0 or min_date is None or max_date is None:
        raise ValueError("Synthetic transaction CSV has no rows")
    if any(value is None for value in customer_segments) or any(value is None for value in customer_statuses):
        raise ValueError("At least one configured customer has no source row")
    final_month_end = calendar.monthrange(max_date.year, max_date.month)[1]
    observation_date = max_date if max_date.day == final_month_end else date(max_date.year, max_date.month, 1) - timedelta(days=1)
    return PreparedData(
        customer_ids=[f"CUST-{index + 1:05d}" for index in range(customer_count)],
        customer_segments=customer_segments, customer_statuses=customer_statuses, products_held=products_held,
        monthly_labels=labels, monthly_counts=monthly_counts, monthly_monetary=monthly_monetary,
        monthly_last_activity_ordinal=monthly_last_activity,
        first_activity_ordinal=first_activity, last_activity_ordinal=last_activity,
        baseline_interval_days=baseline_intervals, baseline_transaction_counts=baseline_counts,
        observation_date=observation_date, first_transaction_date=min_date, transaction_count=transaction_count,
        qualifying_transaction_count=qualifying_count, account_count=len(accounts), source_bytes=path.stat().st_size,
    )
