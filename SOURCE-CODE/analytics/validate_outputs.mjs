import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pointerPath = resolve(projectRoot, "analytics", "current-snapshot.json");
async function currentDataDirectory() {
  if (process.env.VALUEBRIDGE_DATA_DIR) return resolve(process.env.VALUEBRIDGE_DATA_DIR);
  for (const pointer of [pointerPath, resolve(projectRoot, "analytics", "current-snapshot.previous.json")]) {
    try {
      const value = JSON.parse(await readFile(pointer, "utf8"));
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.snapshot_id ?? "")) continue;
      const candidate = resolve(projectRoot, "analytics-data", "snapshots", value.snapshot_id);
      const manifest = JSON.parse(await readFile(resolve(candidate, "manifest.json"), "utf8"));
      if (manifest.snapshot_id === value.snapshot_id && manifest.validation_status === "PASS") return candidate;
    } catch { /* Try the last known-good pointer. */ }
  }
  const legacy = resolve(projectRoot, "analytics-data");
  await readFile(resolve(legacy, "manifest.json"), "utf8");
  return legacy;
}
const directory = await currentDataDirectory();
const reportDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "reports");
const names = ["manifest.json", "dashboard_summary.json", "customer_segments.json", "retention_risk.json", "product_opportunities.json", "opportunity_rankings.json", "segment_migration.json", "alerts.json", "model_performance.json", "staff_action_queue.json"];
const check = (condition, message) => { if (!condition) throw new Error(message); };
const modelMetricsSummary = model => model.models.every(row => row.roc_auc === null && row.pr_auc === null && row.precision === null && row.recall === null) ? "not evaluated (null)" : "chronological synthetic evaluation";
const docs = Object.fromEntries(await Promise.all(names.map(async name => [name, JSON.parse(await readFile(resolve(directory, name), "utf8"))])));
const segmentsExpected = new Set(["CHAMPIONS", "LOYAL_CUSTOMERS", "POTENTIAL_LOYALISTS", "NEW_CUSTOMERS", "AT_RISK", "HIBERNATING"]);
const manifest = docs["manifest.json"];
const modes = { synthetic: ["synthetic", "illustrative / simulated", "SIMULATED"], competition: ["BancABC 2026 Hackathon CSV (synthetic records)", "challenge dataset / synthetic records", "VALIDATED"] };
check(Object.hasOwn(modes, manifest.data_mode), "unsupported snapshot data mode");
const [source, metricStatus, evaluationStatus] = modes[manifest.data_mode];
check(manifest.data_source === source && manifest.metric_status === metricStatus, "manifest provenance mismatch");
for (const name of names.slice(1)) {
  const d = docs[name]; check(d.schema_version === "1.0.0" && d.data_source === source, `${name}: unsupported schema/source`);
  if (name !== "staff_action_queue.json") check(d.metric_status === metricStatus, `${name}: incorrect metric status`);
}
const customerDoc = docs["customer_segments.json"], customers = customerDoc.customers;
if (manifest.snapshot_id) for (const name of names.slice(1).filter(name => name !== "staff_action_queue.json")) check(docs[name].snapshot_id === manifest.snapshot_id, `${name}: snapshot ID mismatch`);
check(manifest.schema_version === "1.0.0" && manifest.application === "VALUEBRIDGE 360" && manifest.illustrative === true, "manifest identity/mode invalid");
check(customers.length === manifest.customer_count, "customer count mismatch");
const ids = new Set(customers.map(c => c.customer_id)); check(ids.size === customers.length, "customer IDs are not unique");
const segmentRows = customerDoc.segments;
check(segmentRows.length === 6 && segmentRows.every(s => segmentsExpected.has(s.segment_id)), "expected exactly six agreed segments");
check(segmentRows.reduce((sum, s) => sum + s.customer_count, 0) === customers.length, "segment counts do not reconcile");
check(Math.abs(segmentRows.reduce((sum, s) => sum + s.percentage, 0) - 100) <= 0.15, "segment percentages do not reconcile");
const namesSet = new Set(segmentRows.map(s => s.segment_name));
for (const c of customers) check(segmentsExpected.has(c.segment_id) && Number.isInteger(c.frequency) && c.frequency >= 0 && c.recency_days >= 0 && c.monetary_score >= 0 && (c.last_activity_date === "" || !Number.isNaN(Date.parse(c.last_activity_date))), "invalid customer row");
const summary = docs["dashboard_summary.json"].summary; check(summary.customer_count === customers.length, "dashboard customer count mismatch");
const risk = docs["retention_risk.json"]; check(!Number.isNaN(Date.parse(risk.observation_date)) && risk.customers.length === customers.length, "risk observation date or row count invalid");
for (const r of risk.customers) check(ids.has(r.customer_id) && (r.cdi_score === null ? r.risk_category === "UNSCORED" : r.cdi_score >= 0 && r.cdi_score <= 100 && [r.frequency_drop, r.monetary_drop, r.recency_drop].every(n => n >= 0 && n <= 1)), "invalid CDI row");
const recommendations = docs["product_opportunities.json"].recommendations;
for (const r of recommendations) check(ids.has(r.customer_id) && [r.affinity_score, r.support, r.confidence].every(n => n >= 0 && n <= 1) && r.lift >= 0 && r.eligibility_status === "CANDIDATE — pending staff eligibility and suitability review", "invalid candidate recommendation");
const rankings = docs["opportunity_rankings.json"].rankings;
for (let i = 0; i < rankings.length; i++) check(rankings[i].rank === i + 1 && ids.has(rankings[i].customer_id) && rankings[i].opportunity_score >= 0 && rankings[i].opportunity_score <= 1, "invalid opportunity rank");
const migration = docs["segment_migration.json"];
for (const t of migration.transitions) check(namesSet.has(t.from_segment) && namesSet.has(t.to_segment) && Number.isInteger(t.customer_count) && t.customer_count >= 0, "invalid migration row");
for (const a of docs["alerts.json"].alerts) check(ids.has(a.customer_id) && !Number.isNaN(Date.parse(a.created_at)), "invalid alert row");
const model = docs["model_performance.json"]; check(model.evaluation_status === evaluationStatus && model.models.length === 3, "expected three model evaluation records");
for (const m of model.models) {
  for (const key of ["roc_auc", "pr_auc", "precision", "recall", "precision_at_top_k"]) check(m[key] === null || Number.isFinite(m[key]) && m[key] >= 0 && m[key] <= 1, `invalid ${key} metric`);
  check(m.lift_at_top_k === null || Number.isFinite(m.lift_at_top_k) && m.lift_at_top_k >= 0, "invalid lift_at_top_k metric");
}
for (const a of docs["staff_action_queue.json"].actions) check(ids.has(a.customer_id) && ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(a.review_status), "invalid staff action");
const report = { status: "PASS", files_validated: names.length, customer_count: customers.length, account_count: manifest.account_count, transaction_count: manifest.transaction_count, segment_count: segmentRows.length, recommendations: recommendations.length, rankings: rankings.length, migration_rows: migration.transitions.length, alerts: docs["alerts.json"].alerts.length, staff_actions: docs["staff_action_queue.json"].actions.length, model_metrics: modelMetricsSummary(docs["model_performance.json"]), data_mode: manifest.data_mode };
if (!process.env.VALUEBRIDGE_DATA_DIR) {
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(resolve(reportDirectory, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const generationReportPath = resolve(reportDirectory, "generation-report.json");
  try { const generationReport = JSON.parse(await readFile(generationReportPath, "utf8")); generationReport.output_validation_status = "PASS"; await writeFile(generationReportPath, `${JSON.stringify(generationReport, null, 2)}\n`, "utf8"); } catch { /* Stage validation may run before the generation report exists. */ }
}
console.log(JSON.stringify(report, null, 2));
