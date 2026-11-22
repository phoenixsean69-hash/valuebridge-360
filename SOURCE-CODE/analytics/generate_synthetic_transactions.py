"""Generate a fictional, structurally representative VALUEBRIDGE transaction CSV."""
from __future__ import annotations

import argparse
import csv
import math
import random
from collections import Counter
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable

SEED = 3602026
CUSTOMER_TARGET = 50_000
ACCOUNT_TARGET = 98_475
TRANSACTION_TARGET = 1_048_575
DATE_TARGET = 1_490
MISSING_LOAN_CARD_TARGET = 786_431
MISSING_DIGITAL_TARGET = 349_532
REFERENCE_SOURCE = "Synthetic treasury reference rate"

SEGMENT_WEIGHTS = (40_000, 2_500, 2_500, 2_500, 2_500)
SEGMENT_VALUES = ("Retail", "SME", "Corporate", "NGO/NPO", "Trust")
STATUS_WEIGHTS = (30_039, 10_000, 9_961)
STATUS_VALUES = ("Active", "Dormant", "Restricted")
TRANSACTION_WEIGHTS = (174_763, 174_763, 174_763, 174_762, 174_762, 174_762)
TRANSACTION_TYPES = ("SERVICE FEE", "FOREX_PURCHASE", "CASH_DEPOSIT", "POS_PURCHASE", "ATM_WITHDRAWAL", "BILL_PAYMENT")
CHANNELS = ("ATM", "POS", "Branch", "Internet Banking", "API", "Mobile App", "USSD")
CURRENCIES = ("USD", "ZWG", "ZAR", "EUR", "GBP")
CURRENCY_BASES = {"USD": 1.0, "ZWG": 13_500.0, "ZAR": 18.5, "EUR": 0.92, "GBP": 0.79}
SOURCE_COLUMNS = (
    "Date", "Account ID", "Customer ID", "Transaction ID", "Branch ID", "Email", "Type", "Amount (USD)", "Status",
    "dr_cr_indicator", "currency", "amount", "exchange_rate_per_usd", "channel", "merchant_id", "balance_after", "transaction_date",
    "legal_name", "customer_segment", "gender", "date_of_birth_or_establishment", "national_id_or_registration", "city", "province",
    "mobile_number", "onboarding_date", "risk_rating", "kyc_status", "estimated_monthly_income_usd", "customer_status",
    "account_customer_id", "account_home_branch_id", "account_type", "account_currency", "account_opened_date", "account_status",
    "account_current_balance", "account_interest_rate_pct", "account_digital_enabled_flag",
    "branch_name", "branch_city", "branch_province", "branch_opened_date", "branch_status",
    "merchant_name", "merchant_category", "merchant_city", "merchant_province", "merchant_segment", "merchant_status",
    "rate_date", "units_per_usd_mid_rate", "units_per_usd_sell_rate", "rate_source",
    "service_reasons", "last_service_interaction", "products_held", "loan_types", "card_types", "card_schemes",
    "last_digital_session", "digital_channels_used", "customer_currencies", "customer_last_transaction",
)
assert len(SOURCE_COLUMNS) == 64

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "local-data" / "synthetic" / "transactions.csv"


def apportion(total: int, weights: Iterable[float]) -> list[int]:
    """Largest-remainder allocation; returned counts sum exactly to total."""
    values = list(weights)
    denominator = sum(values)
    if total < 0 or not values or denominator <= 0:
        raise ValueError("Allocation requires a nonnegative total and positive weights")
    raw = [total * value / denominator for value in values]
    result = [math.floor(value) for value in raw]
    remainder = total - sum(result)
    order = sorted(range(len(raw)), key=lambda index: (-(raw[index] - result[index]), index))
    for index in order[:remainder]:
        result[index] += 1
    return result


def proportional_target(total: int, reference_count: int, reference_total: int) -> int:
    return int(total * reference_count / reference_total + 0.5)


def calendar_dates() -> list[date]:
    current = date(2022, 10, 1)
    end = date(2026, 10, 31)
    dates: list[date] = []
    while current <= end:
        if current not in {date(2023, 2, 28), date(2025, 2, 28)}:
            dates.append(current)
        current += timedelta(days=1)
    if len(dates) != DATE_TARGET or dates[0] != date(2022, 10, 1) or dates[-1] != end:
        raise AssertionError("Configured synthetic calendar does not match the documented date target")
    return dates


def month_index(day: date) -> int:
    return (day.year - 2022) * 12 + day.month - 10


def rate_for(currency: str, day: date) -> float:
    """Dated fictional rates; intentionally not historical market rates."""
    month = month_index(day)
    currency_index = CURRENCIES.index(currency)
    wave = 1 + 0.018 * math.sin(month * 0.37 + currency_index * 1.3) + 0.006 * math.cos(month * 0.19 + currency_index)
    return CURRENCY_BASES[currency] * wave


def _distribution(values: Iterable[str], counts: list[int]) -> list[str]:
    result = [value for value, count in zip(values, counts, strict=True) for _ in range(count)]
    return result


def _account_type(segment: str, rng: random.Random) -> str:
    choices = {
        "Retail": ("Current", "Savings", "Fixed Deposit"),
        "SME": ("Business Current", "Savings", "Fixed Deposit"),
        "Corporate": ("Business Current", "Current", "Fixed Deposit"),
        "NGO/NPO": ("Business Current", "Current", "Savings"),
        "Trust": ("Fixed Deposit", "Current", "Savings"),
    }
    return rng.choices(choices[segment], weights=(0.55, 0.32, 0.13), k=1)[0]


def _date_text(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _month_days(dates_by_month: dict[int, list[date]], month: int, earliest: date, latest: date) -> list[date]:
    return [day for day in dates_by_month[month] if earliest <= day <= latest]


def _sample_datetime(profile: dict, dates_by_month: dict[int, list[date]], rng: random.Random) -> datetime:
    first_month = month_index(profile["onboarding"])
    last_month = month_index(profile["cutoff"])
    span = max(0, last_month - first_month)
    behavior = profile["behavior"]
    if behavior in {"DECLINING", "DORMANT_EARLY", "DORMANT_RECENT", "RESTRICTED"}:
        offset = int((rng.random() ** 1.65) * (span + 1))
    elif behavior in {"GROWING", "NEW"}:
        offset = int((1 - (1 - rng.random()) ** 1.65) * (span + 1))
    elif behavior == "IRREGULAR" and rng.random() < 0.35:
        offset = min(span, max(0, profile["burst_month"] - first_month + rng.randint(-1, 1)))
    else:
        offset = rng.randint(0, span)
    target_month = min(last_month, first_month + offset)
    candidate_days = _month_days(dates_by_month, target_month, profile["onboarding"], profile["cutoff"])
    if not candidate_days:
        candidate_days = [day for day in dates_by_month[target_month] if profile["onboarding"] <= day <= profile["cutoff"]]
    day = rng.choice(candidate_days)
    return datetime.combine(day, time(rng.randrange(7, 22), rng.randrange(60), rng.randrange(60)))


def _new_profiles(customer_count: int, rng: random.Random, dates: list[date]) -> tuple[list[dict], dict[str, list[int]]]:
    segment_counts = apportion(customer_count, SEGMENT_WEIGHTS)
    status_counts = apportion(customer_count, STATUS_WEIGHTS)
    segments = _distribution(SEGMENT_VALUES, segment_counts)
    statuses = _distribution(STATUS_VALUES, status_counts)
    rng.shuffle(segments)
    rng.shuffle(statuses)

    # Margins give 25% of transaction rows loan/card snapshots and two-thirds digital snapshots.
    # The four customer cohorts are sized so their separately allocated row quotas add exactly.
    population_counts = apportion(customer_count, (20, 10, 50, 20))  # both, loan-only, digital-only, neither
    group_names = ("both", "loan_only", "digital_only", "neither")
    shuffled_ids = list(range(customer_count))
    rng.shuffle(shuffled_ids)
    groups: dict[str, list[int]] = {}
    cursor = 0
    for name, count in zip(group_names, population_counts, strict=True):
        groups[name] = shuffled_ids[cursor:cursor + count]
        cursor += count
    group_by_index = {index: name for name, indices in groups.items() for index in indices}
    date_groups: dict[int, list[date]] = {}
    for day in dates:
        date_groups.setdefault(month_index(day), []).append(day)

    profiles: list[dict] = []
    status_months = {"Active": 48, "Dormant": 43, "Restricted": 47}
    behavior_weights = {
        "Active": ("STEADY", "HIGH_VALUE", "GROWING", "DECLINING", "IRREGULAR", "NEW"),
        "Dormant": ("DORMANT_EARLY", "DORMANT_RECENT", "DECLINING", "IRREGULAR"),
        "Restricted": ("RESTRICTED",),
    }
    for index in range(customer_count):
        segment, status = segments[index], statuses[index]
        if status == "Active":
            behavior = rng.choices(behavior_weights[status], weights=(30, 12, 16, 20, 14, 8), k=1)[0]
        elif status == "Dormant":
            behavior = rng.choices(behavior_weights[status], weights=(48, 32, 12, 8), k=1)[0]
        else:
            behavior = "RESTRICTED"
        max_month = status_months[status]
        if behavior in {"DORMANT_EARLY", "DORMANT_RECENT"}:
            max_month = rng.randint(26, 43) if behavior == "DORMANT_EARLY" else rng.randint(42, 45)
        elif status == "Restricted":
            max_month = rng.randint(20, 47)
        start_month = rng.randint(36, 47) if behavior == "NEW" else 0
        if start_month > max_month:
            start_month = max_month
        start_candidates = date_groups[start_month]
        onboarding = rng.choice(start_candidates)
        cutoff_candidates = date_groups[max_month]
        cutoff = cutoff_candidates[-1]
        profile = {
            # Preserve the existing pseudonymous ID sequence so saved staff actions remain linked.
            "index": index, "customer_id": f"CUST-{index + 1:05d}", "segment": segment, "status": status,
            "behavior": behavior, "onboarding": onboarding, "cutoff": cutoff, "burst_month": rng.randint(start_month, max_month),
            "cohort": group_by_index[index],
        }
        profile.update(_customer_attributes(profile, rng))
        profiles.append(profile)
    return profiles, groups


def _customer_attributes(profile: dict, rng: random.Random) -> dict:
    index = profile["index"] + 1
    segment = profile["segment"]
    is_organisation = segment != "Retail"
    cities = ("Synthetic City 01", "Synthetic City 02", "Synthetic City 03", "Synthetic City 04", "Synthetic City 05")
    provinces = ("Synthetic Province 01", "Synthetic Province 02", "Synthetic Province 03", "Synthetic Province 04")
    loans = "PERSONAL_LOAN|SMALL_BUSINESS_LOAN" if segment in {"SME", "NGO/NPO"} else "PERSONAL_LOAN|MORTGAGE"
    cards = "DEBIT|CREDIT"
    schemes = "VISA|MASTERCARD"
    cohort = profile["cohort"]
    has_credit_products = cohort in {"both", "loan_only"}
    has_digital = cohort in {"both", "digital_only"}
    held = ["CURRENT_ACCOUNT", "SAVINGS_ACCOUNT"]
    if has_credit_products:
        held.extend(["CREDIT_CARD", "PERSONAL_LOAN"])
        if segment in {"SME", "Corporate", "NGO/NPO"}:
            held.append("BUSINESS_LOAN")
    if has_digital:
        held.append("MOBILE_BANKING")
    currencies = rng.sample(list(CURRENCIES), k=rng.choices((1, 2, 3), weights=(0.5, 0.38, 0.12), k=1)[0])
    service_reasons = ""
    last_service = ""
    if rng.random() < 0.55:
        reasons = rng.sample(["ACCOUNT_QUERY", "CARD_SUPPORT", "DIGITAL_SUPPORT", "PAYMENT_QUERY", "PROFILE_UPDATE"], k=rng.randint(1, 2))
        service_reasons = "|".join(reasons)
        service_day = profile["cutoff"] - timedelta(days=rng.randint(0, 240))
        service_day = max(profile["onboarding"], service_day)
        last_service = datetime.combine(service_day, time(9, 0)).strftime("%d/%m/%Y %H:%M")
    dob_year = rng.randint(1950, 2005) if not is_organisation else rng.randint(1980, 2020)
    birth_date = date(dob_year, rng.randint(1, 12), 1)
    gender = rng.choice(("Female", "Male", "Unspecified")) if not is_organisation else "Organisation"
    behavior_factor = {"HIGH_VALUE": 1.8, "DECLINING": 0.9, "GROWING": 1.15, "NEW": 0.7}.get(profile["behavior"], 1.0)
    segment_income = {"Retail": 1.0, "SME": 4.0, "Corporate": 9.0, "NGO/NPO": 5.0, "Trust": 6.0}[segment]
    digital_channels = "|".join(rng.sample(["Internet Banking", "Mobile App", "USSD", "API"], k=rng.randint(1, 3))) if has_digital else ""
    return {
        "email": f"synthetic.customer.{index:06d}@example.invalid",
        "legal_name": f"Synthetic {'Organisation' if is_organisation else 'Individual'} {index:06d}",
        "gender": gender,
        "birth_date": birth_date,
        "national_id": f"SYNTH-ID-{index:010d}",
        "city": rng.choice(cities),
        "province": rng.choice(provinces),
        "mobile": f"+000{index:010d}",
        "risk_rating": rng.choices(("Low", "Medium", "High"), weights=(0.62, 0.29, 0.09), k=1)[0],
        "kyc_status": rng.choices(("Verified", "Review Required"), weights=(0.93, 0.07), k=1)[0],
        "income": round(rng.uniform(350, 6500) * segment_income * behavior_factor, 2),
        "has_credit_products": has_credit_products,
        "loan_types": loans if has_credit_products else "",
        "card_types": cards if has_credit_products else "",
        "card_schemes": schemes if has_credit_products else "",
        "has_digital": has_digital,
        "digital_channels": digital_channels,
        "products_held": "|".join(held),
        "service_reasons": service_reasons,
        "last_service": last_service,
        "currencies": currencies,
    }


def _activity_weight(profile: dict, rng: random.Random) -> float:
    segment_factor = {"Retail": 1.0, "SME": 1.18, "Corporate": 1.3, "NGO/NPO": 1.08, "Trust": 0.92}[profile["segment"]]
    status_factor = {"Active": 1.32, "Dormant": 0.78, "Restricted": 0.68}[profile["status"]]
    behavior_factor = {"HIGH_VALUE": 1.45, "GROWING": 1.2, "NEW": 0.62, "DECLINING": 0.9, "DORMANT_EARLY": 0.72, "DORMANT_RECENT": 0.82, "RESTRICTED": 0.75, "IRREGULAR": 1.0}.get(profile["behavior"], 1.0)
    return segment_factor * status_factor * behavior_factor * rng.lognormvariate(0, 0.35)


def _allocate_customer_counts(indices: list[int], quota: int, profiles: list[dict], rng: random.Random) -> dict[int, int]:
    if quota < len(indices):
        raise ValueError(f"Cohort transaction quota {quota} is below its {len(indices)} customers")
    weights = [_activity_weight(profiles[index], rng) for index in indices]
    total_weight = sum(weights)
    extra = quota - len(indices)
    raw = [extra * weight / total_weight for weight in weights]
    additions = [math.floor(value) for value in raw]
    remaining = extra - sum(additions)
    order = sorted(range(len(indices)), key=lambda j: (-(raw[j] - additions[j]), j))
    for local_index in order[:remaining]:
        additions[local_index] += 1
    return {index: addition + 1 for index, addition in zip(indices, additions, strict=True)}


def _make_calendar_and_rates() -> tuple[list[date], dict[int, list[date]]]:
    dates = calendar_dates()
    by_month: dict[int, list[date]] = {}
    for day in dates:
        by_month.setdefault(month_index(day), []).append(day)
    return dates, by_month


def _make_accounts(profiles: list[dict], account_count: int, rng: random.Random) -> tuple[list[dict], list[list[int]]]:
    customer_count = len(profiles)
    if account_count < customer_count:
        raise ValueError("Every customer must receive at least one account")
    extras = list(range(customer_count))
    rng.shuffle(extras)
    extra_owners = set(extras[:account_count - customer_count])
    owners = [index for index in range(customer_count) for _ in range(1 + (index in extra_owners))]
    account_lists: list[list[int]] = [[] for _ in profiles]
    accounts: list[dict] = []
    for number, owner in enumerate(owners, start=1):
        customer = profiles[owner]
        account_type = _account_type(customer["segment"], rng)
        account_currency = rng.choices(CURRENCIES, weights=(0.48, 0.23, 0.15, 0.08, 0.06), k=1)[0]
        opened = customer["onboarding"]
        opening_usd = rng.uniform(2_500, 18_000) * (1.4 if customer["behavior"] == "HIGH_VALUE" else 1.0)
        opening_balance = round(opening_usd * rate_for(account_currency, opened), 2)
        account_id = f"SYN-ACC-{number:07d}"
        account = {
            "account_id": account_id, "owner": owner, "customer_id": customer["customer_id"],
            "home_branch": rng.randint(1, 30), "account_type": account_type, "currency": account_currency,
            "opened": opened, "opening_balance": opening_balance, "balance": opening_balance,
            "status": "Frozen" if customer["status"] == "Restricted" and rng.random() < 0.22 else "Dormant" if customer["status"] == "Dormant" else "Active",
            "interest": round(rng.uniform(0.2, 4.8) if account_type in {"Savings", "Fixed Deposit"} else 0.0, 2),
            "digital_flag": "Y" if customer["has_digital"] else "N",
        }
        account_lists[owner].append(number - 1)
        accounts.append(account)
    return accounts, account_lists


def _anchor_dates(profiles: list[dict], counts: list[int], dates: list[date], rng: random.Random) -> list[list[date]]:
    anchors: list[list[date]] = [[] for _ in profiles]
    slots = counts.copy()
    for day in dates:
        for _ in range(200):
            index = rng.randrange(len(profiles))
            profile = profiles[index]
            if slots[index] > 0 and profile["onboarding"] <= day <= profile["cutoff"]:
                anchors[index].append(day)
                slots[index] -= 1
                break
        else:
            # Recent dates are anchored to the active population, which always remains eligible.
            eligible = [i for i, profile in enumerate(profiles) if slots[i] > 0 and profile["status"] == "Active" and profile["onboarding"] <= day]
            if not eligible:
                raise ValueError(f"Cannot assign required distinct date {day.isoformat()} within customer history")
            index = rng.choice(eligible)
            anchors[index].append(day)
            slots[index] -= 1
    return anchors


def _choose_type(remaining: list[int], rng: random.Random) -> int:
    total = sum(remaining)
    draw = rng.randrange(total)
    for index, count in enumerate(remaining):
        if draw < count:
            remaining[index] -= 1
            return index
        draw -= count
    raise AssertionError("Transaction-type quota selection failed")


def _channel_for(transaction_type: str, rng: random.Random) -> str:
    if transaction_type == "ATM_WITHDRAWAL":
        return "ATM"
    if transaction_type == "POS_PURCHASE":
        return "POS"
    options = {
        "SERVICE FEE": CHANNELS,
        "FOREX_PURCHASE": ("Branch", "Internet Banking", "Mobile App", "API"),
        "CASH_DEPOSIT": ("Branch", "ATM"),
        "BILL_PAYMENT": ("Internet Banking", "Mobile App", "USSD", "API", "Branch"),
    }
    return rng.choice(options[transaction_type])


def _base_usd(transaction_type: str, segment: str, behavior: str, day: date, rng: random.Random) -> float:
    bounds = {
        "SERVICE FEE": (0.5, 15), "FOREX_PURCHASE": (12, 1200), "CASH_DEPOSIT": (20, 2200),
        "POS_PURCHASE": (2, 420), "ATM_WITHDRAWAL": (5, 650), "BILL_PAYMENT": (4, 360),
    }[transaction_type]
    multiplier = {"Retail": 1.0, "SME": 1.45, "Corporate": 2.1, "NGO/NPO": 1.55, "Trust": 1.7}[segment]
    if behavior == "HIGH_VALUE":
        multiplier *= 1.8
    month = month_index(day)
    if behavior == "DECLINING" and month >= 45:
        multiplier *= 0.48
    elif behavior in {"GROWING", "NEW"} and month >= 45:
        multiplier *= 1.25
    return round(rng.uniform(*bounds) * multiplier, 2)


def _make_initial_balances(accounts: list[dict]) -> list[float]:
    return [float(account["opening_balance"]) for account in accounts]


def _iter_rows(
    profiles: list[dict], accounts: list[dict], account_lists: list[list[int]], counts: list[int], anchors: list[list[date]],
    transaction_quotas: list[int], by_month: dict[int, list[date]], seed: int, balances: list[float],
) -> Iterable[tuple[int, int, datetime, list[str]]]:
    rng = random.Random(seed + 37)
    remaining_types = transaction_quotas.copy()
    transaction_number = 0
    for index, customer in enumerate(profiles):
        event_dates = [datetime.combine(day, time(12, 0)) for day in anchors[index]]
        while len(event_dates) < counts[index]:
            event_dates.append(_sample_datetime(customer, by_month, rng))
        event_dates.sort()
        account_ids = account_lists[index]
        account_offset = rng.randrange(len(account_ids))
        for local_number, stamp in enumerate(event_dates):
            type_index = _choose_type(remaining_types, rng)
            transaction_type = TRANSACTION_TYPES[type_index]
            account_index = account_ids[(local_number + account_offset) % len(account_ids)]
            account = accounts[account_index]
            currency = rng.choices(CURRENCIES, weights=(0.48, 0.23, 0.15, 0.08, 0.06), k=1)[0]
            tx_rate = rate_for(currency, stamp.date())
            acct_rate = rate_for(account["currency"], stamp.date())
            usd = _base_usd(transaction_type, customer["segment"], customer["behavior"], stamp.date(), rng)
            is_credit = transaction_type == "CASH_DEPOSIT"
            native_amount = round(usd * tx_rate, 2)
            usd_amount = round(native_amount / tx_rate, 2)
            direction = "CR" if is_credit else "DR"
            next_balance = round(balances[account_index] + (1 if is_credit else -1) * usd_amount * acct_rate, 2)
            balances[account_index] = next_balance
            day = stamp.date()
            rate = rate_for(currency, day)
            branch_number = rng.randint(1, 30)
            merchant = transaction_type in {"POS_PURCHASE", "BILL_PAYMENT"}
            merchant_number = rng.randint(1, 300) if merchant else None
            channel = _channel_for(transaction_type, rng)
            transaction_number += 1
            row = [
                _date_text(day), account["account_id"], customer["customer_id"], f"SYN-TXN-{transaction_number:07d}",
                f"SYN-BR-{branch_number:03d}", customer["email"], transaction_type, f"{usd_amount:.2f}", "Completed", direction,
                currency, f"{native_amount:.2f}", f"{tx_rate:.8f}", channel, f"SYN-MER-{merchant_number:04d}" if merchant else "",
                f"{balances[account_index]:.2f}", stamp.strftime("%d/%m/%Y %H:%M:%S"), customer["legal_name"], customer["segment"],
                customer["gender"], _date_text(customer["birth_date"]), customer["national_id"], customer["city"], customer["province"],
                customer["mobile"], _date_text(customer["onboarding"]), customer["risk_rating"], customer["kyc_status"],
                f"{customer['income']:.2f}", customer["status"], account["customer_id"], f"SYN-BR-{account['home_branch']:03d}",
                account["account_type"], account["currency"], _date_text(account["opened"]), account["status"], "", f"{account['interest']:.2f}",
                account["digital_flag"], f"Synthetic Branch {branch_number:03d}", f"Synthetic City {(branch_number % 5) + 1:02d}",
                f"Synthetic Province {(branch_number % 4) + 1:02d}", "01/01/1990", "Active",
                f"Synthetic Merchant {merchant_number:04d}" if merchant else "", rng.choice(("Grocery", "Fuel", "Utilities", "Travel", "Health", "General Retail")) if merchant else "",
                f"Synthetic City {(merchant_number % 5) + 1:02d}" if merchant else "", f"Synthetic Province {(merchant_number % 4) + 1:02d}" if merchant else "",
                rng.choice(("Retail", "SME", "Corporate")) if merchant else "", "Active" if merchant else "",
                _date_text(day), f"{rate:.8f}", f"{rate * 1.015:.8f}", REFERENCE_SOURCE, customer["service_reasons"], customer["last_service"],
                customer["products_held"], customer["loan_types"], customer["card_types"], customer["card_schemes"],
                "" if not customer["has_digital"] else "PENDING_CUSTOMER_SNAPSHOT", customer["digital_channels"],
                "|".join(customer["currencies"]), "PENDING_CUSTOMER_SNAPSHOT",
            ]
            if len(row) != len(SOURCE_COLUMNS):
                raise AssertionError(f"Generated row has {len(row)} fields rather than 64")
            yield index, account_index, stamp, row
    if any(remaining_types):
        raise AssertionError(f"Transaction type quotas were not exhausted: {remaining_types}")


def _transaction_quotas(transaction_count: int) -> list[int]:
    return apportion(transaction_count, TRANSACTION_WEIGHTS)


def _cohort_transaction_quotas(transaction_count: int) -> dict[str, int]:
    loan_rows = proportional_target(transaction_count, TRANSACTION_TARGET - MISSING_LOAN_CARD_TARGET, TRANSACTION_TARGET)
    digital_rows = proportional_target(transaction_count, TRANSACTION_TARGET - MISSING_DIGITAL_TARGET, TRANSACTION_TARGET)
    both_rows = proportional_target(transaction_count, 209_715, TRANSACTION_TARGET)
    both_rows = min(both_rows, loan_rows, digital_rows)
    loan_only = loan_rows - both_rows
    digital_only = digital_rows - both_rows
    neither = transaction_count - loan_rows - digital_rows + both_rows
    return {"both": both_rows, "loan_only": loan_only, "digital_only": digital_only, "neither": neither}


def generate_dataset(customer_count: int, transaction_count: int, account_count: int, output: Path, seed: int = SEED) -> dict:
    if customer_count < 100 or transaction_count < customer_count or account_count < customer_count:
        raise ValueError("Require at least 100 customers and at least one transaction and account per customer")
    if customer_count > CUSTOMER_TARGET or transaction_count > TRANSACTION_TARGET or account_count > ACCOUNT_TARGET:
        raise ValueError("Counts cannot exceed the documented synthetic target")
    profile_rng = random.Random(seed)
    profiles, groups = _new_profiles(customer_count, profile_rng, calendar_dates())
    account_count_rng = random.Random(seed + 1)
    accounts, account_lists = _make_accounts(profiles, account_count, account_count_rng)
    for profile, owned in zip(profiles, account_lists, strict=True):
        profile["currencies"] = list(dict.fromkeys(accounts[index]["currency"] for index in owned))
    transaction_quotas = _transaction_quotas(transaction_count)
    cohort_quotas = _cohort_transaction_quotas(transaction_count)
    counts = [0] * customer_count
    allocation_rng = random.Random(seed + 2)
    for cohort, indices in groups.items():
        allocation = _allocate_customer_counts(indices, cohort_quotas[cohort], profiles, allocation_rng)
        for index, count in allocation.items():
            counts[index] = count
    if sum(counts) != transaction_count or any(count < 1 for count in counts):
        raise AssertionError("Customer transaction allocation failed to reconcile")

    dates, by_month = _make_calendar_and_rates()
    anchors = _anchor_dates(profiles, counts, dates[:min(len(dates), transaction_count)], random.Random(seed + 3))
    first_ledger = _make_initial_balances(accounts)
    last_customer_tx = [datetime.min] * customer_count
    for customer_index, _account_index, stamp, _row in _iter_rows(profiles, accounts, account_lists, counts, anchors, transaction_quotas, by_month, seed, first_ledger):
        if stamp > last_customer_tx[customer_index]:
            last_customer_tx[customer_index] = stamp
    for profile, last in zip(profiles, last_customer_tx, strict=True):
        profile["last_tx"] = last
        digital_day = max(profile["onboarding"], last.date() - timedelta(days=profile_rng.randint(0, 35)))
        profile["digital_last"] = datetime.combine(digital_day, time(10, 0)).strftime("%d/%m/%Y %H:%M") if profile["has_digital"] else ""
    final_balances = first_ledger
    for account, balance in zip(accounts, final_balances, strict=True):
        account["balance"] = balance

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.with_suffix(output.suffix + ".staging")
    second_ledger = _make_initial_balances(accounts)
    with staging.open("w", encoding="utf-8", newline="", buffering=1024 * 1024) as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(SOURCE_COLUMNS)
        for customer_index, account_index, stamp, row in _iter_rows(profiles, accounts, account_lists, counts, anchors, transaction_quotas, by_month, seed, second_ledger):
            row[36] = f"{final_balances[account_index]:.2f}"
            row[60] = profiles[customer_index]["digital_last"]
            row[63] = profiles[customer_index]["last_tx"].strftime("%d/%m/%Y %H:%M:%S")
            writer.writerow(row)
    if second_ledger != final_balances:
        staging.unlink(missing_ok=True)
        raise AssertionError("Deterministic replay produced different account balances")
    staging.replace(output)
    return {
        "status": "GENERATED",
        "data_source": "synthetic",
        "seed": seed,
        "customer_count": customer_count,
        "account_count": account_count,
        "transaction_count": transaction_count,
        "column_count": len(SOURCE_COLUMNS),
        "distinct_calendar_dates": min(DATE_TARGET, transaction_count),
        "output_file": str(output),
        "output_bytes": output.stat().st_size,
        "transaction_type_counts": dict(zip(TRANSACTION_TYPES, transaction_quotas, strict=True)),
        "cohort_row_quotas": cohort_quotas,
        "financial_assumption": "balance_after and account_current_balance use account_currency; transaction amounts convert through synthetic dated rates",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--customers", type=int, default=CUSTOMER_TARGET)
    parser.add_argument("--transactions", type=int, default=TRANSACTION_TARGET)
    parser.add_argument("--accounts", type=int, default=None)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    accounts = args.accounts if args.accounts is not None else int(args.customers * ACCOUNT_TARGET / CUSTOMER_TARGET + 0.5)
    print(__import__("json").dumps(generate_dataset(args.customers, args.transactions, accounts, args.output, args.seed), indent=2))


if __name__ == "__main__":
    main()
