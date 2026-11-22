from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from analytics.generate_synthetic_transactions import (
    ACCOUNT_TARGET, CUSTOMER_TARGET, MISSING_DIGITAL_TARGET, MISSING_LOAN_CARD_TARGET,
    TRANSACTION_TARGET, _cohort_transaction_quotas, apportion, generate_dataset,
)
from analytics.validate_synthetic_source import validate


class SyntheticGeneratorTests(unittest.TestCase):
    def test_largest_remainder_and_cohort_margins_reconcile(self) -> None:
        self.assertEqual(sum(apportion(1_048_575, (174_763, 174_763, 174_763, 174_762, 174_762, 174_762))), 1_048_575)
        quotas = _cohort_transaction_quotas(TRANSACTION_TARGET)
        self.assertEqual(sum(quotas.values()), TRANSACTION_TARGET)
        self.assertEqual(quotas["both"] + quotas["loan_only"], TRANSACTION_TARGET - MISSING_LOAN_CARD_TARGET)
        self.assertEqual(quotas["both"] + quotas["digital_only"], TRANSACTION_TARGET - MISSING_DIGITAL_TARGET)
        self.assertEqual(ACCOUNT_TARGET / CUSTOMER_TARGET, 1.9695)

    def test_1000_customer_source_validates_and_is_reproducible(self) -> None:
        customers = 1_000
        transactions = 20_972
        accounts = 1_970
        with tempfile.TemporaryDirectory(prefix="valuebridge-stageb-") as directory:
            first = Path(directory) / "first.csv"
            second = Path(directory) / "second.csv"
            result = generate_dataset(customers, transactions, accounts, first)
            first_validation = validate(first, customers, accounts, transactions)
            generate_dataset(customers, transactions, accounts, second)
            second_validation = validate(second, customers, accounts, transactions)
            digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(digest(first), digest(second))
            self.assertEqual(result["column_count"], 64)
            self.assertEqual(first_validation["status"], "PASS")
            self.assertEqual(first_validation, second_validation)


if __name__ == "__main__":
    unittest.main()
