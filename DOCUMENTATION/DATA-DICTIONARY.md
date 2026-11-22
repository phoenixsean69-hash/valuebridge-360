> **Source-linked release (21 Nov 2026):** This packaged app now shows original source CSV Customer IDs and synthetic legal names, plus indexed transaction evidence. It includes only the supplied BancABC synthetic challenge snapshot. Previous demo-mode statements and `4173` references below are legacy historical documentation; the active launcher uses port `4174`. For current use, read `../README-START-HERE.txt` and `../SOURCE-CODE/analytics/CHALLENGE-IMPORT.md`.

# Synthetic source data dictionary

The demonstration source CSV contains 1,048,575 synthetic transaction rows and the following 64 ordered columns. Entity attributes repeat on transaction records as source fields. Blank values are documented synthetic missingness or not-applicable attributes; the validator checks the configured counts. All rates and identifiers are fictional.

| # | Source column | Description |
|---:|---|---|
| 1 | `Date` | Transaction calendar date in day/month/year format; retained for source compatibility. |
| 2 | `Account ID` | Synthetic account identifier linked to the customer and transaction. |
| 3 | `Customer ID` | Stable synthetic customer identifier; not a real banking identifier. |
| 4 | `Transaction ID` | Synthetic transaction-row identifier. |
| 5 | `Branch ID` | Synthetic identifier for the transaction servicing branch. |
| 6 | `Email` | Synthetic placeholder email using the reserved example.invalid domain. |
| 7 | `Type` | Transaction type such as POS_PURCHASE or BILL_PAYMENT. |
| 8 | `Amount (USD)` | Transaction value expressed as the synthetic USD equivalent. |
| 9 | `Status` | Transaction processing status. |
| 10 | `dr_cr_indicator` | Debit or credit direction for the transaction. |
| 11 | `currency` | Transaction currency code. |
| 12 | `amount` | Transaction amount in the stated transaction currency. |
| 13 | `exchange_rate_per_usd` | Synthetic units-per-USD conversion factor for the transaction date and currency. |
| 14 | `channel` | Synthetic channel through which the transaction occurred. |
| 15 | `merchant_id` | Synthetic merchant identifier; blank where a merchant is not applicable. |
| 16 | `balance_after` | Synthetic account balance after the transaction, in account currency. |
| 17 | `transaction_date` | Transaction timestamp in ISO-compatible form; chronology is validated. |
| 18 | `legal_name` | Fictional customer or organisation display name. |
| 19 | `customer_segment` | Synthetic retail, SME, corporate, NGO/NPO or trust classification. |
| 20 | `gender` | Synthetic demographic value; never represents a real person. |
| 21 | `date_of_birth_or_establishment` | Synthetic customer birth date or organisation establishment date. |
| 22 | `national_id_or_registration` | Synthetic identifier placeholder; contains no real identity number. |
| 23 | `city` | Synthetic customer city. |
| 24 | `province` | Synthetic customer province. |
| 25 | `mobile_number` | Synthetic phone placeholder; not a callable real customer number. |
| 26 | `onboarding_date` | Synthetic customer relationship start date. |
| 27 | `risk_rating` | Synthetic profile risk band; not a credit decision. |
| 28 | `kyc_status` | Synthetic know-your-customer status. |
| 29 | `estimated_monthly_income_usd` | Synthetic estimated monthly income expressed in USD equivalent. |
| 30 | `customer_status` | Synthetic relationship status, such as Active, Dormant or Restricted. |
| 31 | `account_customer_id` | Customer identifier for the account relationship; expected to match Customer ID. |
| 32 | `account_home_branch_id` | Synthetic home-branch identifier for the account. |
| 33 | `account_type` | Synthetic account product/type classification. |
| 34 | `account_currency` | Currency denomination of the account. |
| 35 | `account_opened_date` | Synthetic date the account was opened. |
| 36 | `account_status` | Synthetic account lifecycle status. |
| 37 | `account_current_balance` | Synthetic current account balance in account currency. |
| 38 | `account_interest_rate_pct` | Illustrative synthetic account interest-rate percentage. |
| 39 | `account_digital_enabled_flag` | Synthetic indicator for digital access availability. |
| 40 | `branch_name` | Fictional servicing branch name. |
| 41 | `branch_city` | Fictional branch city. |
| 42 | `branch_province` | Fictional branch province. |
| 43 | `branch_opened_date` | Synthetic branch opening date. |
| 44 | `branch_status` | Synthetic branch operating status. |
| 45 | `merchant_name` | Fictional merchant name; blank for non-merchant transactions. |
| 46 | `merchant_category` | Synthetic merchant category; blank when not applicable. |
| 47 | `merchant_city` | Fictional merchant city. |
| 48 | `merchant_province` | Fictional merchant province. |
| 49 | `merchant_segment` | Synthetic merchant size/relationship grouping. |
| 50 | `merchant_status` | Synthetic merchant operating status. |
| 51 | `rate_date` | Effective date of the synthetic reference rate. |
| 52 | `units_per_usd_mid_rate` | Fictional mid reference units per USD; not a historical market quote. |
| 53 | `units_per_usd_sell_rate` | Fictional sell reference units per USD; not a historical market quote. |
| 54 | `rate_source` | Text label identifying the rate as a synthetic reference rate. |
| 55 | `service_reasons` | Synthetic customer-service reason categories. |
| 56 | `last_service_interaction` | Synthetic date of the latest service interaction. |
| 57 | `products_held` | Synthetic set of customer-held product categories at the recorded observation. |
| 58 | `loan_types` | Synthetic loan-product categories held; missing values represent no recorded loan type. |
| 59 | `card_types` | Synthetic card-product categories held; missing values represent no recorded card type. |
| 60 | `card_schemes` | Synthetic card-scheme categories; missing values represent no recorded scheme. |
| 61 | `last_digital_session` | Synthetic timestamp of the latest digital session. |
| 62 | `digital_channels_used` | Synthetic set of digital channels used. |
| 63 | `customer_currencies` | Synthetic currencies associated with the customer relationship. |
| 64 | `customer_last_transaction` | Synthetic latest transaction date associated with the customer. |

## Data handling notes

- All customer, account, branch, merchant and transaction identifiers/names are synthetic. Email addresses use `example.invalid`; no actual bank/customer source is included.
- `Amount (USD)` and `amount` have different units. The former is an equivalent measure; the latter is denominated in `currency`.
- The rate columns are synthetic and should never be presented as historical or current exchange rates.
- Transaction-level rows repeat customer/account reference attributes to make the source self-contained for demonstration analysis.
