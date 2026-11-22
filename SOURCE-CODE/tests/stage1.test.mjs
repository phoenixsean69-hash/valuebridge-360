import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productionDataDir = resolve(root, "analytics-data");
const testRoot = await mkdtemp(resolve(tmpdir(), "valuebridge-stage1-"));
const dataDir = resolve(testRoot, "analytics-data");
const reportDir = resolve(testRoot, "reports");
const runGenerator = () => {
  const run = spawnSync("node", ["generator-dist/generator/generate.js"], { cwd: root, encoding: "utf8", env: { ...process.env, CUSTOMER_COUNT: "300", TRANSACTION_COUNT: "6000", OUTPUT_DIR: dataDir, REPORT_DIR: reportDir } });
  assert.equal(run.status, 0, run.stderr || run.stdout);
};
const normalizedOutputs = async () => {
  const names = (await readdir(dataDir)).filter(name => name.endsWith(".json") && name !== "generation-report.json" && name !== "validation-report.json").sort();
  return Promise.all(names.map(async name => {
    const doc = JSON.parse(await readFile(resolve(dataDir, name), "utf8"));
    if (name === "manifest.json") delete doc.generated_at;
    return [name, createHash("sha256").update(JSON.stringify(doc)).digest("hex")];
  }));
};

test("same generator version and seed reproduce all analytical outputs", async () => {
  runGenerator(); const first = await normalizedOutputs();
  runGenerator(); const second = await normalizedOutputs();
  assert.deepEqual(second, first);
});

test("all ten output contracts and references reconcile", async () => {
  const required = ["manifest.json", "dashboard_summary.json", "customer_segments.json", "retention_risk.json", "product_opportunities.json", "opportunity_rankings.json", "segment_migration.json", "alerts.json", "model_performance.json", "staff_action_queue.json"];
  for (const name of required) assert.ok((await readdir(dataDir)).includes(name), `missing ${name}`);
  const load = async name => JSON.parse(await readFile(resolve(dataDir, name), "utf8"));
  const manifest = await load("manifest.json"), customerDoc = await load("customer_segments.json"), risk = await load("retention_risk.json"), recs = await load("product_opportunities.json"), rankings = await load("opportunity_rankings.json"), models = await load("model_performance.json");
  const ids = new Set(customerDoc.customers.map(c => c.customer_id));
  assert.equal(manifest.data_source, "synthetic"); assert.equal(manifest.illustrative, true);
  assert.equal(customerDoc.customers.length, manifest.customer_count);
  assert.equal(customerDoc.segments.reduce((sum, s) => sum + s.customer_count, 0), manifest.customer_count);
  assert.equal(risk.customers.length, manifest.customer_count);
  assert.ok(risk.customers.every(c => ids.has(c.customer_id) && c.cdi_score >= 0 && c.cdi_score <= 100));
  assert.ok(recs.recommendations.every(r => ids.has(r.customer_id) && r.eligibility_status.startsWith("CANDIDATE")));
  assert.ok(rankings.rankings.every((r, i) => r.rank === i + 1 && ids.has(r.customer_id)));
  assert.ok(models.models.every(m => m.roc_auc === null && m.pr_auc === null && m.precision === null && m.recall === null));
});

test("checked-in full-scale dataset remains untouched by reproducibility tests", async () => {
  const manifest = JSON.parse(await readFile(resolve(productionDataDir, "manifest.json"), "utf8"));
  assert.equal(manifest.customer_count, 50000);
  assert.equal(manifest.transaction_count, 1048575);
});

test.after(async () => rm(testRoot, { recursive: true, force: true }));
