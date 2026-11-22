"""Focused regression checks for the hackathon CSV ingestion path."""
from __future__ import annotations
import csv
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "analytics"))
from challenge_preparation import prepare_challenge_transactions, _normalise_product_list

class ChallengeIngestionTests(unittest.TestCase):
    def test_normalises_products_and_out_of_order_events_across_chunks(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "mini.csv"
            columns = ["Date", "Account ID", "Customer ID", "Type", "Amount (USD)", "Status", "customer_segment", "customer_status", "products_held"]
            rows = [
                ["10/2/2026", "11", "700", "POS_PURCHASE", 10, "Completed", "Retail", "Active", "Digital Banking | Savings Account"],
                ["1/2/2026", "12", "300", "POS_PURCHASE", 20, "Completed", "Retail", "Restricted", "Digital Banking"],
                ["1/2/2026", "11", "700", "POS_PURCHASE", 10, "Completed", "Retail", "Active", "Savings Account| Digital Banking "],
                ["20/2/2026", "11", "700", "POS_PURCHASE", 10, "Completed", "Retail", "Active", "Savings Account |Digital Banking"],
                ["28/10/2026", "12", "300", "ATM_WITHDRAWAL", 50, "Completed", "Retail", "Restricted", "Digital Banking"],
                ["15/9/2026", "13", "900", "SERVICE FEE", 5, "Completed", "SME", "Dormant", "Current Account"],
            ]
            with source.open("w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f); writer.writerow(columns); writer.writerows(rows)
            d = prepare_challenge_transactions(source, customer_count=3, chunksize=2)
            self.assertEqual(d.customer_ids, ["700", "300", "900"])
            self.assertEqual(d.account_count, 3)
            self.assertEqual(d.transaction_count, 6)
            self.assertEqual(d.qualifying_transaction_count, 5)
            self.assertEqual(d.baseline_interval_days[0], [9, 10])
            self.assertEqual(d.baseline_transaction_counts[0], 3)
            self.assertEqual(d.products_held[0], "Digital Banking | Savings Account")
            self.assertEqual(d.customer_statuses[1], "Restricted")
            self.assertEqual(d.monthly_counts.sum(), 5)
            self.assertEqual(d.observation_date.isoformat(), "2026-10-28")  # actual last observed date; October is partial

    def test_product_sorting_and_cleaning(self):
        self.assertEqual(_normalise_product_list("Current Account |  Credit Card |Current Account"), "Credit Card | Current Account")

if __name__ == "__main__":
    unittest.main()
