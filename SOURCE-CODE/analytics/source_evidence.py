"""BancABC challenge source-row evidence, indexed by the ORIGINAL Customer ID.

The CSV provided by the hackathon contains synthetic reference records. Keep the
synthetic names/IDs as supplied, but omit contact, government ID and birth-date
fields. A bucket is fetched only when a customer is inspected in the offline app.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import json
from pathlib import Path

import pandas as pd

COLUMNS = [
    'Customer ID', 'Transaction ID', 'Account ID', 'Date', 'Type',
    'Amount (USD)', 'Status', 'channel', 'currency', 'legal_name',
    'customer_segment', 'customer_status', 'products_held', 'city',
    'province', 'risk_rating', 'kyc_status', 'account_type',
]
BUCKETS = 128


def _text(value: object) -> str:
    return '' if pd.isna(value) else str(value).strip()


def _products(value: str) -> str:
    return ' | '.join(sorted({p.strip() for p in value.replace(';','|').split('|') if p.strip()}))


def build_evidence(csv_path: Path, output_dir: Path, chunk_size: int = 100_000) -> tuple[dict[str, dict], int]:
    """Return source customer profiles; write all transaction rows into 128 small indexed JSON files."""
    profiles: dict[str, dict] = {}
    # 128 buckets keep a customer lookup bounded to ~1 MB over the local HTTP server.
    groups: list[dict[str, list[list]]] = [defaultdict(list) for _ in range(BUCKETS)]
    account_ids: dict[str, set[str]] = defaultdict(set)
    account_types: dict[str, set[str]] = defaultdict(set)
    n_rows = 0
    for chunk in pd.read_csv(csv_path, usecols=COLUMNS, chunksize=chunk_size,
                             dtype={c: 'string' for c in COLUMNS if c != 'Amount (USD)'},
                             encoding='utf-8-sig'):
        dates = pd.to_datetime(chunk['Date'], format='%d/%m/%Y', errors='raise').dt.strftime('%Y-%m-%d').tolist()
        for index, row in enumerate(chunk.itertuples(index=False, name=None)):
            record = dict(zip(chunk.columns, row))
            customer_id = _text(record['Customer ID'])
            if not customer_id.isdigit():
                raise ValueError(f'Unexpected source customer ID: {customer_id!r}')
            if customer_id not in profiles:
                profiles[customer_id] = {
                    'legal_name': _text(record['legal_name']),
                    'bank_segment': _text(record['customer_segment']),
                    'bank_status': _text(record['customer_status']),
                    'products_held': _products(_text(record['products_held'])),
                    'city': _text(record['city']),
                    'province': _text(record['province']),
                    'risk_rating': _text(record['risk_rating']),
                    'kyc_status': _text(record['kyc_status']),
                }
            account_id = _text(record['Account ID'])
            if account_id:
                account_ids[customer_id].add(account_id)
            account_type = _text(record['account_type'])
            if account_type:
                account_types[customer_id].add(account_type)
            groups[int(customer_id) % BUCKETS][customer_id].append([
                dates[index], _text(record['Transaction ID']), account_id,
                _text(record['Type']), float(record['Amount (USD)']),
                _text(record['Status']), _text(record['channel']), _text(record['currency']),
            ])
            n_rows += 1
    for cid, profile in profiles.items():
        profile['account_count'] = len(account_ids[cid])
        profile['account_types'] = ' | '.join(sorted(account_types[cid]))
    output_dir.mkdir(parents=True, exist_ok=True)
    for bucket, data in enumerate(groups):
        for records in data.values():
            records.sort(key=lambda r: (r[0],r[1]), reverse=True)
        (output_dir / f'tx-{bucket:03d}.json').write_text(
            json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    return profiles, n_rows


def enrich_snapshot(csv_path: Path, staging_dir: Path) -> dict:
    """Run before snapshot validation and activation; only for challenge mode."""
    profiles, count = build_evidence(csv_path, staging_dir / 'transactions')
    source = staging_dir / 'customer_segments.json'
    doc = json.loads(source.read_text(encoding='utf-8'))
    ids = {row['customer_id'] for row in doc['customers']}
    if ids != set(profiles):
        raise ValueError('Source customer IDs do not match the analytics customer IDs')
    for row in doc['customers']:
        row.update(profiles[row['customer_id']])
    doc['identifier_policy'] = 'Original Customer ID from the supplied BancABC challenge CSV'
    source.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    manifest_file = staging_dir / 'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    if count != manifest['transaction_count'] or len(profiles) != manifest['customer_count']:
        raise ValueError('Source evidence does not reconcile with the manifest counts')
    manifest['customer_id_display'] = 'Original CSV Customer ID'
    manifest['source_transactions_available'] = True
    manifest['source_transaction_count'] = count
    manifest['source_profile_count'] = len(profiles)
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return {'customers':len(profiles), 'transactions':count}
