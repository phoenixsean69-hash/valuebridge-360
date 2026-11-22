"""Regressions for the complete source-linked customer transaction drill-down."""
from __future__ import annotations
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'analytics'))
from source_evidence import build_evidence, COLUMNS

class SourceEvidenceTests(unittest.TestCase):
    def test_profiles_original_ids_and_source_transaction_sort(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            sample=root/'sample.csv'
            common={
                'Customer ID':'715360', 'Account ID':'1001', 'Type':'POS_PURCHASE',
                'Amount (USD)':'8.5', 'Status':'Completed', 'channel':'ATM',
                'currency':'USD', 'legal_name':'Rufaro Mushonga',
                'customer_segment':'Retail', 'customer_status':'Dormant',
                'products_held':'Savings Account | Digital Banking',
                'city':'Harare', 'province':'Harare', 'risk_rating':'High',
                'kyc_status':'Pending', 'account_type':'Savings'
            }
            with sample.open('w',encoding='utf-8',newline='') as stream:
                writer=csv.DictWriter(stream, fieldnames=COLUMNS)
                writer.writeheader()
                writer.writerow({**common,'Transaction ID':'T1','Date':'1/10/2022'})
                writer.writerow({**common,'Transaction ID':'T2','Date':'4/11/2026','Status':'Failed'})
                writer.writerow({**common,'Transaction ID':'T3','Date':'2/11/2026','Account ID':'1002'})
            profiles, count=build_evidence(sample,root/'tx',chunk_size=2)
            self.assertEqual(count,3)
            self.assertEqual(list(profiles),['715360'])
            self.assertEqual(profiles['715360']['legal_name'],'Rufaro Mushonga')
            self.assertEqual(profiles['715360']['account_count'],2)
            self.assertEqual(profiles['715360']['products_held'],'Digital Banking | Savings Account')
            data=json.loads((root/'tx'/f'tx-{715360%128:03d}.json').read_text())
            self.assertEqual([row[1] for row in data['715360']],['T2','T3','T1'])
            self.assertEqual(data['715360'][0][5],'Failed')
            self.assertEqual(len(list((root/'tx').glob('tx-*.json'))),128)

if __name__ == '__main__':
    unittest.main()
