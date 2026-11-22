import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_SOURCE, GENERATOR_VERSION, METRIC_STATUS, SCHEMA_VERSION, SEED, type Customer, type Recommendation, type Ranking, type RiskCustomer, type SegmentId, type SegmentSummary } from "../src/data-contracts.js";

// Mulberry32 keeps generation deterministic across runs and avoids external dependencies.
function random(seed: number): () => number { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = random(SEED);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outputDir = resolve(process.env.OUTPUT_DIR ?? resolve(root, "analytics-data"));
const reportDir = resolve(process.env.REPORT_DIR ?? resolve(root, "analytics", "reports"));
const day = 86_400_000;
const observed = new Date("2026-10-31T00:00:00.000Z");
const iso = (date: Date) => date.toISOString().slice(0, 10);
const names: Record<SegmentId, string> = { CHAMPIONS: "Champions", LOYAL_CUSTOMERS: "Loyal Customers", POTENTIAL_LOYALISTS: "Potential Loyalists", NEW_CUSTOMERS: "New Customers", AT_RISK: "At Risk", HIBERNATING: "Hibernating" };
const ids: SegmentId[] = ["CHAMPIONS", "LOYAL_CUSTOMERS", "POTENTIAL_LOYALISTS", "NEW_CUSTOMERS", "AT_RISK", "HIBERNATING"];
const weights = [0.12, 0.22, 0.19, 0.11, 0.18, 0.18];
const products = ["SAVINGS_ACCOUNT", "CREDIT_CARD", "PERSONAL_LOAN", "MOBILE_BANKING", "INVESTMENT_ACCOUNT", "OVERDRAFT"];
const frequencyRanges: Record<SegmentId, [number, number]> = { CHAMPIONS: [20, 55], LOYAL_CUSTOMERS: [12, 35], POTENTIAL_LOYALISTS: [5, 18], NEW_CUSTOMERS: [1, 5], AT_RISK: [3, 14], HIBERNATING: [1, 7] };
const summaries = Object.fromEntries(ids.map(id => [id, { segment_id: id, segment_name: names[id], customer_count: 0, percentage: 0, average_recency_days: 0, average_frequency: 0, average_monetary_score: 0, _recency: 0, _frequency: 0, _money: 0 }])) as Record<SegmentId, SegmentSummary & { _recency: number; _frequency: number; _money: number }>;
const customers: Customer[] = [];
const risks: RiskCustomer[] = [];
const recommendations: Recommendation[] = [];
const rankings: Ranking[] = [];
const alerts: Array<Record<string, unknown>> = [];
const actions: Array<Record<string, unknown>> = [];
const migrationRows: Array<{ period: string; from_segment: string; to_segment: string; customer_count: number }> = [];
const migrationPeriods: string[] = [];
const accountCount = 98_475;
const customerCount = Number(process.env.CUSTOMER_COUNT ?? 50_000);
const transactionCount = Number(process.env.TRANSACTION_COUNT ?? 1_048_575);
if (!Number.isInteger(customerCount) || customerCount < 100 || !Number.isInteger(transactionCount) || transactionCount < customerCount) throw new Error("Counts must be integers; require at least 100 customers and one transaction per customer.");

// Synthesise transaction activity in memory in bounded chunks; raw events are never written to dashboard data.
const txCounts = new Uint16Array(customerCount);
for (let offset = 0; offset < transactionCount; offset += 65_536) {
  const end = Math.min(offset + 65_536, transactionCount);
  for (let i = offset; i < end; i++) txCounts[Math.floor(rng() * customerCount)]++;
}
for (let i = 0; i < customerCount; i++) {
  const roll = rng(); let cumulative = 0; let segment = ids.at(-1)!;
  for (let j = 0; j < ids.length; j++) { cumulative += weights[j]; if (roll < cumulative) { segment = ids[j]; break; } }
  const range = frequencyRanges[segment];
  const baselineFrequency = range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
  const freq = Math.max(0, Math.min(baselineFrequency, txCounts[i]));
  const recency = Math.floor(rng() * (segment === "CHAMPIONS" ? 15 : segment === "LOYAL_CUSTOMERS" ? 35 : segment === "AT_RISK" ? 155 : segment === "HIBERNATING" ? 300 : 90));
  const monetary = Math.round((20 + rng() * 980) * (segment === "CHAMPIONS" ? 1.35 : segment === "HIBERNATING" ? 0.55 : 1));
  const customerId = `CUST-${String(i + 1).padStart(5, "0")}`;
  const customer: Customer = { customer_id: customerId, segment_id: segment, recency_days: recency, frequency: freq, monetary_score: monetary, last_activity_date: iso(new Date(observed.getTime() - recency * day)) };
  customers.push(customer);
  const summary = summaries[segment]; summary.customer_count++; summary._recency += recency; summary._frequency += freq; summary._money += monetary;
  const fDrop = +(segment === "AT_RISK" || segment === "HIBERNATING" ? 0.35 + rng() * 0.65 : rng() * 0.2).toFixed(4);
  const recentFrequency = baselineFrequency * (1 - fDrop);
  const measuredFrequencyDrop = Math.max(0, 1 - recentFrequency / baselineFrequency);
  const mDrop = +(segment === "AT_RISK" || segment === "HIBERNATING" ? 0.3 + rng() * 0.7 : rng() * 0.2).toFixed(4);
  const recentMoney = monetary * (1 - mDrop);
  const measuredMonetaryDrop = Math.max(0, 1 - recentMoney / monetary);
  const baselineMedianInterval = Math.max(1, 180 / baselineFrequency);
  const rDrop = Math.min(1, Math.max(0, (recency - baselineMedianInterval) / Math.max(baselineMedianInterval, 1)));
  const cdi = Math.round(100 * (0.4 * measuredFrequencyDrop + 0.4 * measuredMonetaryDrop + 0.2 * rDrop));
  const riskCategory = cdi >= 75 ? "CRITICAL" : cdi >= 50 ? "HIGH" : cdi >= 25 ? "MODERATE" : "LOW";
  risks.push({ customer_id: customerId, cdi_score: cdi, risk_category: riskCategory, historical_activity: Math.round(baselineFrequency * monetary), recent_activity: Math.round(recentFrequency * recentMoney), activity_change_percent: Math.round(-100 * (1 - (recentFrequency * recentMoney) / (baselineFrequency * monetary))), frequency_drop: +measuredFrequencyDrop.toFixed(4), monetary_drop: +measuredMonetaryDrop.toFixed(4), recency_drop: +rDrop.toFixed(4), reason: `${Math.round(measuredFrequencyDrop * 100)}% frequency decline; ${Math.round(measuredMonetaryDrop * 100)}% monetary activity decline; ${recency} days since last transaction.`, prediction_status: "illustrative" });
  const product = products[Math.floor(rng() * products.length)];
  const affinity = +(0.35 + rng() * 0.64).toFixed(4), support = +(0.03 + rng() * 0.2).toFixed(4), confidence = +(0.2 + rng() * 0.7).toFixed(4), lift = +(1.01 + rng() * 2.5).toFixed(4);
  recommendations.push({ customer_id: customerId, product_candidate: product, affinity_score: affinity, support, confidence, lift, reason: `${product.replaceAll("_", " ")} is associated with this customer's ${names[segment]} activity pattern.`, eligibility_status: "CANDIDATE — pending staff eligibility and suitability review" });
  const relativeValue = Math.min(1, monetary / 1400);
  const score = +(0.4 * affinity + 0.3 * relativeValue + 0.3 * (segment === "CHAMPIONS" || segment === "LOYAL_CUSTOMERS" ? 1 : segment === "POTENTIAL_LOYALISTS" ? 0.75 : 0.4)).toFixed(4);
  rankings.push({ rank: 0, customer_id: customerId, segment: names[segment], product_candidate: product, affinity_score: affinity, customer_value_score: +relativeValue.toFixed(4), opportunity_score: score, explanation: `Affinity ${(affinity * 100).toFixed(0)}%; relative activity score ${(relativeValue * 100).toFixed(0)}/100; ${names[segment]} segment contribution.` });
  if (cdi >= 50 && (i < 4000 || rng() < 0.08)) alerts.push({ alert_id: `ALT-${String(alerts.length + 1).padStart(5, "0")}`, customer_id: customerId, alert_type: "CDI_DETERIORATION", severity: riskCategory, description: `CDI ${cdi} (${riskCategory}); recent activity has declined.`, created_at: new Date(observed.getTime() - rng() * 90 * day).toISOString(), status: "OPEN" });
  if (i < 1200) actions.push({ action_id: `ACT-${String(i + 1).padStart(5, "0")}`, customer_id: customerId, action_type: "REVIEW_CUSTOMER", priority: cdi >= 50 ? "HIGH" : "NORMAL", notes: "", review_status: "PENDING", created_at: new Date(observed.getTime() - rng() * 45 * day).toISOString() });
}
for (const id of ids) { const s = summaries[id]; s.percentage = +(100 * s.customer_count / customerCount).toFixed(2); s.average_recency_days = +(s._recency / (s.customer_count || 1)).toFixed(2); s.average_frequency = +(s._frequency / (s.customer_count || 1)).toFixed(2); s.average_monetary_score = +(s._money / (s.customer_count || 1)).toFixed(2); delete (s as Partial<typeof s>)._recency; delete (s as Partial<typeof s>)._frequency; delete (s as Partial<typeof s>)._money; }
rankings.sort((a, b) => b.opportunity_score - a.opportunity_score || a.customer_id.localeCompare(b.customer_id)); rankings.forEach((r, i) => r.rank = i + 1);
for (let month = 0; month < 12; month++) {
  const date = new Date(Date.UTC(2025, 10 + month, 1)); const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; migrationPeriods.push(period);
  const sample = Math.min(5000, customerCount);
  const matrix = new Map<string, number>();
  for (let c = 0; c < sample; c++) { const base = customers[c].segment_id; let to = base; if (rng() < 0.06) to = ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(base) + (rng() < 0.5 ? -1 : 1)))]; const key = `${base}|${to}`; matrix.set(key, (matrix.get(key) ?? 0) + 1); }
  for (const [key, customer_count] of matrix) { const [from, to] = key.split("|"); migrationRows.push({ period, from_segment: names[from as SegmentId], to_segment: names[to as SegmentId], customer_count }); }
}
const meta = { schema_version: SCHEMA_VERSION, data_source: DATA_SOURCE, metric_status: METRIC_STATUS };
const write = async (name: string, value: unknown) => writeFile(resolve(outputDir, name), `${JSON.stringify(value)}\n`, "utf8");
await mkdir(outputDir, { recursive: true });
const generatedAt = new Date().toISOString();
const cdiMean = risks.reduce((sum, item) => sum + (item.cdi_score ?? 0), 0) / customerCount;
const modelRows = ["Naive Recency Baseline", "Logistic Regression", "Gradient Boosting"].map((model_name, i) => ({ model_name, model_type: i === 2 ? "ADVANCED" : "BASELINE", roc_auc: null, pr_auc: null, precision: null, recall: null, precision_at_top_k: null, lift_at_top_k: null }));
const files: Array<[string, unknown]> = [
  ["manifest.json", { schema_version: SCHEMA_VERSION, application: "VALUEBRIDGE 360", data_mode: "synthetic", data_source: DATA_SOURCE, generator_version: GENERATOR_VERSION, random_seed: SEED, generated_at: generatedAt, customer_count: customerCount, account_count: accountCount, transaction_count: transactionCount, illustrative: true, metric_status: METRIC_STATUS }],
  ["dashboard_summary.json", { ...meta, summary: { customer_count: customerCount, account_count: accountCount, active_customers: customers.filter(c => c.recency_days <= 90).length, at_risk_customers: risks.filter(c => (c.cdi_score ?? 0) >= 50).length, high_value_customers: summaries.CHAMPIONS.customer_count + summaries.LOYAL_CUSTOMERS.customer_count, potential_opportunities: customerCount, period_start: "2026-07-01", period_end: "2026-09-30" } }],
  ["customer_segments.json", { ...meta, segments: ids.map(id => summaries[id]), customers }],
  ["retention_risk.json", { ...meta, observation_date: iso(observed), cdi_methodology_version: "1.0.0", customers: risks, monthly_trends: Array.from({ length: 12 }, (_, i) => ({ month: migrationPeriods[i], average_cdi: +(cdiMean * (0.85 + 0.3 * rng())).toFixed(2), high_risk_customers: risks.filter(c => (c.cdi_score ?? 0) >= 50).length })) }],
  ["product_opportunities.json", { ...meta, recommendations }],
  ["opportunity_rankings.json", { ...meta, rankings }],
  ["segment_migration.json", { ...meta, periods: migrationPeriods, transitions: migrationRows }],
  ["alerts.json", { ...meta, alerts }],
  ["model_performance.json", { ...meta, evaluation_status: "SIMULATED", prediction_target: "No qualifying transaction in the following 90 days", evaluation_method: "Chronological leakage-safe evaluation", evaluation_sample_size: null, models: modelRows }],
  ["staff_action_queue.json", { schema_version: SCHEMA_VERSION, data_source: DATA_SOURCE, actions }]
];
for (const [name, content] of files) await write(name, content);
const report = { generator_version: GENERATOR_VERSION, random_seed: SEED, generated_at: generatedAt, customer_count: customerCount, account_count: accountCount, transaction_count: transactionCount, transaction_processing: "synthetic events assigned in bounded chunks; raw events not exported", output_validation_status: "pending validator", data_source: "synthetic; no real customer data accessed" };
await mkdir(reportDir, { recursive: true });
await writeFile(resolve(reportDir, "generation-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
