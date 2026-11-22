"""Validate the synthetic transaction CSV without emitting source rows."""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
from datetime import date, datetime
from pathlib import Path

try:
    from .generate_synthetic_transactions import (
        DATE_TARGET, MISSING_DIGITAL_TARGET, MISSING_LOAN_CARD_TARGET, SEGMENT_VALUES, SEGMENT_WEIGHTS,
        SOURCE_COLUMNS, STATUS_VALUES, STATUS_WEIGHTS, TRANSACTION_TARGET, TRANSACTION_TYPES,
        TRANSACTION_WEIGHTS, apportion, proportional_target,
        rate_for,
    )
except ImportError:
    from generate_synthetic_transactions import (
        DATE_TARGET, MISSING_DIGITAL_TARGET, MISSING_LOAN_CARD_TARGET, SEGMENT_VALUES, SEGMENT_WEIGHTS,
        SOURCE_COLUMNS, STATUS_VALUES, STATUS_WEIGHTS, TRANSACTION_TARGET, TRANSACTION_TYPES,
        TRANSACTION_WEIGHTS, apportion, proportional_target,
        rate_for,
    )


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate(path: Path, expected_customers: int, expected_accounts: int, expected_transactions: int) -> dict:
    _require(path.is_file(), f"CSV not found: {path}")
    customer_profiles: dict[str, tuple[str, ...]] = {}
    account_owners: dict[str, tuple[str, ...]] = {}
    last_account_activity: dict[str, tuple[datetime, float]] = {}
    account_opening_balances: dict[str, float] = {}
    type_counts: Counter[str] = Counter()
    date_values: set[date] = set()
    segment_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()
    blank_counts: Counter[str] = Counter()
    required_population = expected_customers
    required_accounts = expected_accounts
    required_transactions = expected_transactions
    customer_fields = ("Email", "legal_name", "customer_segment", "customer_status", "onboarding_date", "customer_last_transaction", "products_held", "loan_types", "card_types", "card_schemes", "last_digital_session", "digital_channels_used")
    account_fields = ("account_customer_id", "account_currency", "account_status", "account_current_balance")
    merchant_fields = ("merchant_id", "merchant_name", "merchant_category", "merchant_city", "merchant_province", "merchant_segment", "merchant_status")
    product_fields = ("loan_types", "card_types", "card_schemes")
    digital_fields = ("last_digital_session", "digital_channels_used")
    stream = path.open("r", encoding="utf-8-sig", newline="")
    reader = csv.reader(stream)
    row_number = 0
    try:
        header = next(reader, None)
        _require(header == list(SOURCE_COLUMNS), "Source header does not match the exact 64-column contract and order")
        for row_number, row in enumerate(reader, start=1):
            _require(len(row) == 64, f"Row {row_number} has {len(row)} fields rather than 64")
            data = dict(zip(SOURCE_COLUMNS, row, strict=True))
            customer_id = data["Customer ID"]
            account_id = data["Account ID"]
            _require(data["Transaction ID"] == f"SYN-TXN-{row_number:07d}", f"Transaction ID sequence/uniqueness failed at row {row_number}")
            _require(customer_id.startswith("CUST-") and account_id.startswith("SYN-ACC-"), "Synthetic pseudonymous identifier format is invalid")
            _require(data["legal_name"].startswith("Synthetic ") and data["Email"].endswith("@example.invalid") and data["mobile_number"].startswith("+000") and data["national_id_or_registration"].startswith("SYNTH-ID-"), "A privacy-safe synthetic contact/identity marker is missing")
            _require(data["Status"] == "Completed", "Non-completed transaction found")
            _require(data["customer_segment"] in SEGMENT_VALUES and data["customer_status"] in STATUS_VALUES, "Unknown customer segment/status")
            _require(data["Type"] in TRANSACTION_TYPES and data["channel"] in {"ATM", "POS", "Branch", "Internet Banking", "API", "Mobile App", "USSD"}, "Unknown transaction type or channel")
            _require(data["currency"] in {"USD", "ZWG", "ZAR", "EUR", "GBP"} and data["account_currency"] in {"USD", "ZWG", "ZAR", "EUR", "GBP"}, "Unknown transaction/account currency")
            _require(data["account_customer_id"] == customer_id, f"Account/customer relationship mismatch at row {row_number}")
            _require(data["rate_source"] == "Synthetic treasury reference rate", "Synthetic rate source label is missing")

            stamp = datetime.strptime(data["transaction_date"], "%d/%m/%Y %H:%M:%S")
            tx_day = datetime.strptime(data["Date"], "%d/%m/%Y").date()
            _require(stamp.date() == tx_day and data["rate_date"] == data["Date"], f"Transaction/rate date mismatch at row {row_number}")
            _require(datetime.strptime(data["onboarding_date"], "%d/%m/%Y").date() <= tx_day and datetime.strptime(data["account_opened_date"], "%d/%m/%Y").date() <= tx_day, "Transaction predates customer onboarding or account opening")
            declared_last = datetime.strptime(data["customer_last_transaction"], "%d/%m/%Y %H:%M:%S")
            _require(declared_last >= stamp, "Customer last-transaction snapshot precedes one of its transactions")

            amount_usd = float(data["Amount (USD)"])
            amount_native = float(data["amount"])
            rate = float(data["exchange_rate_per_usd"])
            _require(amount_usd > 0 and rate > 0 and abs(amount_native / rate - amount_usd) <= 0.011, f"Currency conversion mismatch at row {row_number}")
            balance_after = float(data["balance_after"])
            account_snapshot = float(data["account_current_balance"])
            _require(math.isfinite(balance_after) and math.isfinite(account_snapshot), f"Non-finite account balance at row {row_number}")
            expected_direction = "CR" if data["Type"] == "CASH_DEPOSIT" else "DR"
            _require(data["dr_cr_indicator"] == expected_direction, f"Transaction direction mismatch at row {row_number}")
            delta = (1 if expected_direction == "CR" else -1) * amount_usd * rate_for(data["account_currency"], tx_day)

            current_customer = tuple(data[field] for field in customer_fields)
            if customer_id in customer_profiles:
                _require(customer_profiles[customer_id] == current_customer, f"Customer snapshot fields vary between rows for {customer_id}")
            else:
                customer_profiles[customer_id] = current_customer
                segment_counts[data["customer_segment"]] += 1
                status_counts[data["customer_status"]] += 1
            current_account = tuple(data[field] for field in account_fields)
            if account_id in account_owners:
                _require(account_owners[account_id] == current_account, f"Account snapshot fields vary between rows for {account_id}")
            else:
                account_owners[account_id] = current_account
            prior_account = last_account_activity.get(account_id)
            _require(prior_account is None or stamp >= prior_account[0], f"Account transactions are not chronological for {account_id}")
            if prior_account is None:
                account_opening_balances[account_id] = round(balance_after - delta, 2)
                _require(account_opening_balances[account_id] > 0, f"Account opening balance is invalid for {account_id}")
            else:
                _require(abs(round(prior_account[1] + delta, 2) - balance_after) <= 0.01, f"Account balance ledger does not reconcile at row {row_number}")
            last_account_activity[account_id] = (stamp, balance_after)

            type_counts[data["Type"]] += 1
            date_values.add(tx_day)
            for field in merchant_fields + product_fields + digital_fields:
                if not data[field].strip():
                    blank_counts[field] += 1
            merchant_is_applicable = data["Type"] in {"POS_PURCHASE", "BILL_PAYMENT"}
            _require(all(bool(data[field].strip()) == merchant_is_applicable for field in merchant_fields), f"Merchant-field applicability mismatch at row {row_number}")
            _require(all(bool(data[field].strip()) == bool(data["loan_types"].strip()) for field in product_fields), f"Loan/card field relationship mismatch at row {row_number}")
            _require(bool(data["last_digital_session"].strip()) == bool(data["digital_channels_used"].strip()), f"Digital-field relationship mismatch at row {row_number}")
    finally:
        stream.close()

    _require(row_number == required_transactions, f"Expected {required_transactions} transaction rows, found {row_number}")
    _require(len(customer_profiles) == required_population, f"Expected {required_population} customers, found {len(customer_profiles)}")
    _require(len(account_owners) == required_accounts, f"Expected {required_accounts} accounts, found {len(account_owners)}")
    _require(all(account_owners[account_id][0] in customer_profiles for account_id in account_owners), "An account references an unknown customer")
    _require(all(abs(float(account_owners[account_id][3]) - last_account_activity[account_id][1]) <= 0.01 for account_id in account_owners), "Account snapshot balance does not match its latest transaction balance")
    _require(segment_counts == Counter(dict(zip(SEGMENT_VALUES, apportion(expected_customers, SEGMENT_WEIGHTS), strict=True))), "Customer segment counts do not match the scaled generation targets")
    _require(status_counts == Counter(dict(zip(STATUS_VALUES, apportion(expected_customers, STATUS_WEIGHTS), strict=True))), "Customer status counts do not match the scaled generation targets")
    _require(type_counts == Counter(dict(zip(TRANSACTION_TYPES, apportion(expected_transactions, TRANSACTION_WEIGHTS), strict=True))), "Transaction type counts do not match scaled targets")
    _require(len(date_values) == min(DATE_TARGET, expected_transactions), "Distinct transaction date count does not match the scaled target")
    if expected_transactions >= DATE_TARGET:
        _require(min(date_values) == date(2022, 10, 1) and max(date_values) == date(2026, 10, 31), "Transaction date range endpoints are incorrect")

    expected_merchant_blank = expected_transactions - type_counts["POS_PURCHASE"] - type_counts["BILL_PAYMENT"]
    expected_product_blank = expected_transactions - proportional_target(expected_transactions, TRANSACTION_TARGET - MISSING_LOAN_CARD_TARGET, TRANSACTION_TARGET)
    expected_digital_blank = expected_transactions - proportional_target(expected_transactions, TRANSACTION_TARGET - MISSING_DIGITAL_TARGET, TRANSACTION_TARGET)
    _require(all(blank_counts[field] == expected_merchant_blank for field in merchant_fields), "Merchant missing-value counts do not match the transaction-type target")
    _require(all(blank_counts[field] == expected_product_blank for field in product_fields), "Loan/card missing-value counts do not match the scaled target")
    _require(all(blank_counts[field] == expected_digital_blank for field in digital_fields), "Digital missing-value counts do not match the scaled target")
    return {
        "status": "PASS", "data_source": "synthetic", "columns": len(SOURCE_COLUMNS), "customers": len(customer_profiles),
        "accounts": len(account_owners), "transactions": row_number, "distinct_transaction_dates": len(date_values),
        "date_range": [min(date_values).isoformat(), max(date_values).isoformat()],
        "transaction_types": dict(type_counts), "customer_segments": dict(segment_counts), "customer_statuses": dict(status_counts),
        "missing_values": {field: blank_counts[field] for field in merchant_fields + product_fields + digital_fields},
        "conversion_tolerance_usd": 0.011, "customer_identifiers": "fictional stable CUST-* references retained for staff-action compatibility; contact domains use example.invalid",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--customers", type=int, required=True)
    parser.add_argument("--accounts", type=int, required=True)
    parser.add_argument("--transactions", type=int, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = validate(args.csv_path, args.customers, args.accounts, args.transactions)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
