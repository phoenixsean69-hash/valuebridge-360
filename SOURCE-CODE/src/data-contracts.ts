export const SCHEMA_VERSION = "1.0.0" as const;
export const GENERATOR_VERSION = "1.0.0" as const;
export const SEED = 3602026;
export type DataSource = "synthetic" | "BancABC 2026 Hackathon CSV (synthetic records)";
export type MetricStatus = "illustrative / simulated" | "challenge dataset / synthetic records";

export type SegmentId = "CHAMPIONS" | "LOYAL_CUSTOMERS" | "POTENTIAL_LOYALISTS" | "NEW_CUSTOMERS" | "AT_RISK" | "HIBERNATING";
export interface Metadata { schema_version: typeof SCHEMA_VERSION; data_source: DataSource; metric_status: MetricStatus; snapshot_id?: string }
export interface Customer { customer_id: string; segment_id: SegmentId; recency_days: number; frequency: number; monetary_score: number; last_activity_date: string; legal_name?: string; bank_segment?: string; bank_status?: string; products_held?: string; city?: string; province?: string; kyc_status?: string; risk_rating?: string; account_count?: number; account_types?: string }
export interface SegmentSummary { segment_id: SegmentId; segment_name: string; customer_count: number; percentage: number; average_recency_days: number; average_frequency: number; average_monetary_score: number }
export interface Recommendation { customer_id: string; product_candidate: string; affinity_score: number; support: number; confidence: number; lift: number; reason: string; eligibility_status: "CANDIDATE — pending staff eligibility and suitability review" }
export interface Ranking { rank: number; customer_id: string; segment: string; product_candidate: string; affinity_score: number; customer_value_score: number; opportunity_score: number; explanation: string }
export interface RiskCustomer { customer_id: string; cdi_score: number | null; risk_category: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "UNSCORED"; historical_activity: number; recent_activity: number; activity_change_percent: number | null; frequency_drop: number | null; monetary_drop: number | null; recency_drop: number | null; reason: string; prediction_status: string }

export interface Manifest { schema_version: string; application: string; data_mode: "synthetic" | "competition"; data_source: string; generator_version: string; random_seed: number | null; generated_at: string; customer_count: number; account_count: number; transaction_count: number; illustrative: boolean; metric_status: string; snapshot_id?: string; source_observation_period?: { start: string; end: string }; processing_version?: string; validation_status?: "PASS" | "FAIL" | "PENDING" }
export interface DashboardSummary extends Metadata { summary: { customer_count: number; account_count: number; active_customers: number; at_risk_customers: number; high_value_customers: number; potential_opportunities: number; period_start: string; period_end: string } }
export interface CustomerSegments extends Metadata { segments: SegmentSummary[]; customers: Customer[] }
export interface RetentionRisk extends Metadata { observation_date: string; cdi_methodology_version: string; customers: RiskCustomer[]; monthly_trends: Array<{ month: string; average_cdi: number | null; high_risk_customers: number }> }
export interface ProductOpportunities extends Metadata { recommendations: Recommendation[] }
export interface OpportunityRankings extends Metadata { rankings: Ranking[] }
export interface SegmentMigration extends Metadata { periods: string[]; transitions: Array<{ period: string; from_segment: string; to_segment: string; customer_count: number }> }
export interface Alert { alert_id: string; customer_id: string; alert_type: string; severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"; description: string; created_at: string; status: string }
export interface Alerts extends Metadata { alerts: Alert[] }
export interface ModelPerformance extends Metadata { evaluation_status: "SIMULATED" | "VALIDATED"; prediction_target: string; evaluation_method: string; evaluation_sample_size?: number | null; models: Array<{ model_name: string; model_type: string; roc_auc: number | null; pr_auc: number | null; precision: number | null; recall: number | null; precision_at_top_k: number | null; lift_at_top_k: number | null }> }
export interface StaffAction { action_id: string; customer_id: string; action_type: string; priority: "HIGH" | "NORMAL" | "LOW"; notes: string; review_status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; created_at: string }
export interface StaffActionQueue { schema_version: string; data_source: string; actions: StaffAction[] }
