import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, BriefcaseBusiness, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CreditCard, FileChartColumnIncreasing, LoaderCircle, Menu, Search, ShieldAlert, Sparkles, UsersRound, X } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Alert, Alerts, Customer, CustomerSegments, DashboardSummary, Manifest, ModelPerformance, OpportunityRankings, ProductOpportunities, Ranking, RetentionRisk, RiskCustomer, SegmentMigration, StaffAction, StaffActionQueue } from './data-contracts'
import './App.css'

const PALETTE = ['#16734C', '#29A36A', '#597D6D', '#0B6655', '#B54708', '#82938A']
const SEGMENT_NAMES: Record<string, string> = { CHAMPIONS: 'Champions', LOYAL_CUSTOMERS: 'Loyal Customers', POTENTIAL_LOYALISTS: 'Potential Loyalists', NEW_CUSTOMERS: 'New Customers', AT_RISK: 'At Risk', HIBERNATING: 'Hibernating' }
const NAV = [
  { id: 'segments', label: 'Customer Value Segments', icon: UsersRound },
  { id: 'retention', label: 'Retention & Risk Monitor', icon: ShieldAlert },
  { id: 'products', label: 'Next-Best-Product List', icon: Sparkles },
  { id: 'opportunities', label: 'Opportunity Ranking', icon: Activity },
  { id: 'migration', label: 'Migration & Alerts', icon: Bell },
  { id: 'decisions', label: 'Decision & Performance Centre', icon: FileChartColumnIncreasing },
] as const
type PanelId = typeof NAV[number]['id']
type DataBundle = { manifest: Manifest; summary: DashboardSummary; segments: CustomerSegments; retention: RetentionRisk; products: ProductOpportunities; rankings: OpportunityRankings; migration: SegmentMigration; alerts: Alerts; models: ModelPerformance; queue: StaffActionQueue }
type Column<T> = { key: keyof T | string; label: string; align?: 'left' | 'right'; sortable?: boolean; render?: (row: T) => ReactNode; className?: string }
type SnapshotPointer = { schema_version: string; snapshot_id: string }
const REVIEW_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const ACTION_PRIORITIES = ['HIGH', 'NORMAL', 'LOW']
const SEGMENT_IDS = Object.keys(SEGMENT_NAMES)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isDateString = (value: unknown) => typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
function isValidStaffAction(value: unknown, customerIds: Set<string>): value is StaffAction {
  if (!value || typeof value !== 'object') return false
  const action = value as Partial<StaffAction>
  return typeof action.action_id === 'string' && action.action_id.length > 0
    && typeof action.customer_id === 'string' && customerIds.has(action.customer_id)
    && typeof action.action_type === 'string' && action.action_type.trim().length > 0
    && typeof action.notes === 'string'
    && ACTION_PRIORITIES.includes(action.priority ?? '')
    && REVIEW_STATUSES.includes(action.review_status ?? '')
    && isDateString(action.created_at)
}

async function fetchJson<T>(name: string, snapshotId: string): Promise<T> {
  const response = await fetch(`/analytics-data/snapshots/${encodeURIComponent(snapshotId)}/${name}`)
  if (!response.ok) throw new Error(`${name} could not be loaded (${response.status}).`)
  return response.json() as Promise<T>
}

async function loadData(): Promise<DataBundle> {
  const pointerResponse = await fetch('/analytics/current-snapshot.json', { cache: 'no-store' })
  if (!pointerResponse.ok) throw new Error(`The current analytics snapshot could not be loaded (${pointerResponse.status}).`)
  const pointer = await pointerResponse.json() as SnapshotPointer
  if (pointer.schema_version !== '1.0.0' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(pointer.snapshot_id)) throw new Error('The current analytics snapshot pointer is invalid.')
  const [manifest, summary, segments, retention, products, rankings, migration, alerts, models, queue] = await Promise.all([
    fetchJson<Manifest>('manifest.json', pointer.snapshot_id), fetchJson<DashboardSummary>('dashboard_summary.json', pointer.snapshot_id), fetchJson<CustomerSegments>('customer_segments.json', pointer.snapshot_id),
    fetchJson<RetentionRisk>('retention_risk.json', pointer.snapshot_id), fetchJson<ProductOpportunities>('product_opportunities.json', pointer.snapshot_id), fetchJson<OpportunityRankings>('opportunity_rankings.json', pointer.snapshot_id),
    fetchJson<SegmentMigration>('segment_migration.json', pointer.snapshot_id), fetchJson<Alerts>('alerts.json', pointer.snapshot_id), fetchJson<ModelPerformance>('model_performance.json', pointer.snapshot_id), fetchJson<StaffActionQueue>('staff_action_queue.json', pointer.snapshot_id),
  ])
  const all = [summary, segments, retention, products, rankings, migration, alerts, models]
  if (manifest.schema_version !== '1.0.0' || manifest.application !== 'VALUEBRIDGE 360') throw new Error('The dashboard data uses an unsupported manifest schema.')
  if (manifest.snapshot_id !== pointer.snapshot_id) throw new Error('The loaded manifest does not match the selected snapshot.')
  if (all.some(file => file.schema_version !== manifest.schema_version)) throw new Error('The analytics files use inconsistent schema versions.')
  if (all.some(file => file.snapshot_id !== pointer.snapshot_id)) throw new Error('The analytics files come from different data snapshots. Reload after the data refresh completes.')
  const supportedMode = manifest.data_mode === 'synthetic'
    ? manifest.data_source === 'synthetic' && manifest.metric_status === 'illustrative / simulated'
    : manifest.data_mode === 'competition' && manifest.data_source === 'BancABC 2026 Hackathon CSV (synthetic records)' && manifest.metric_status === 'challenge dataset / synthetic records'
  if (!supportedMode || manifest.illustrative !== true || manifest.validation_status !== 'PASS') throw new Error('The dashboard requires a validated and correctly identified analytics snapshot.')
  if (all.some(file => file.data_source !== manifest.data_source || file.metric_status !== manifest.metric_status)) throw new Error('The analytics files identify inconsistent data sources or metric status.')
  if (queue.schema_version !== manifest.schema_version || queue.data_source !== manifest.data_source) throw new Error('The staff queue uses inconsistent metadata.')
  if (![segments.customers, retention.customers, products.recommendations, rankings.rankings, migration.transitions, alerts.alerts, models.models, queue.actions].every(Array.isArray)) throw new Error('One or more analytics files have an invalid data structure.')
  if (!summary.summary || !Array.isArray(segments.segments) || segments.segments.length !== 6 || !Array.isArray(migration.periods)) throw new Error('A required dashboard summary, segment, or migration field is missing.')
  if (![manifest.customer_count, manifest.account_count, manifest.transaction_count, summary.summary.customer_count, summary.summary.active_customers, summary.summary.at_risk_customers].every(value => Number.isFinite(value) && value >= 0)) throw new Error('The manifest or dashboard summary contains invalid counts.')
  const customerIds = new Set(segments.customers.map(row => row.customer_id))
  if (customerIds.size !== segments.customers.length || segments.customers.some(row => typeof row.customer_id !== 'string' || !row.customer_id || !SEGMENT_IDS.includes(row.segment_id) || !Number.isInteger(row.recency_days) || row.recency_days < 0 || !Number.isInteger(row.frequency) || row.frequency < 0 || !isFiniteNumber(row.monetary_score) || row.monetary_score < 0 || (row.last_activity_date !== '' && !isDateString(row.last_activity_date)))) throw new Error('The customer segment data contains invalid or duplicate customer records.')
  if (segments.segments.some(row => !SEGMENT_IDS.includes(row.segment_id) || typeof row.segment_name !== 'string' || !Number.isInteger(row.customer_count) || row.customer_count < 0 || !isFiniteNumber(row.percentage) || row.percentage < 0 || row.percentage > 100 || !isFiniteNumber(row.average_recency_days) || !isFiniteNumber(row.average_frequency) || !isFiniteNumber(row.average_monetary_score)) || segments.segments.reduce((sum, row) => sum + row.customer_count, 0) !== segments.customers.length) throw new Error('The segment counts or summary values do not match the customer profiles.')
  if (retention.observation_date && !isDateString(retention.observation_date)) throw new Error('The retention observation date is invalid.')
  if (retention.customers.some(row => {
    if (!customerIds.has(row.customer_id) || typeof row.reason !== 'string' || typeof row.risk_category !== 'string') return true
    if (row.cdi_score === null) return row.risk_category !== 'UNSCORED' || [row.frequency_drop, row.monetary_drop, row.recency_drop].some(value => value !== null)
    return !isFiniteNumber(row.cdi_score) || row.cdi_score < 0 || row.cdi_score > 100 || !['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(row.risk_category) || ![row.frequency_drop, row.monetary_drop, row.recency_drop].every(value => isFiniteNumber(value) && value >= 0 && value <= 1)
  })) throw new Error('The retention data contains invalid customer references or CDI scores.')
  if (products.recommendations.some(row => !customerIds.has(row.customer_id) || typeof row.product_candidate !== 'string' || !row.product_candidate || ![row.affinity_score, row.support, row.confidence].every(value => isFiniteNumber(value) && value >= 0 && value <= 1) || !isFiniteNumber(row.lift) || row.lift < 0 || typeof row.eligibility_status !== 'string' || !row.eligibility_status.startsWith('CANDIDATE') || typeof row.reason !== 'string')) throw new Error('The product recommendation data contains invalid metrics or missing review disclaimers.')
  if (rankings.rankings.some((row, index) => row.rank !== index + 1 || !customerIds.has(row.customer_id) || !isFiniteNumber(row.affinity_score) || !isFiniteNumber(row.customer_value_score) || !isFiniteNumber(row.opportunity_score) || row.opportunity_score < 0 || row.opportunity_score > 1 || typeof row.explanation !== 'string')) throw new Error('The opportunity ranking data is inconsistent.')
  if (migration.transitions.some(row => typeof row.period !== 'string' || typeof row.from_segment !== 'string' || typeof row.to_segment !== 'string' || !Number.isInteger(row.customer_count) || row.customer_count < 0)) throw new Error('The segment migration data contains invalid rows.')
  if (alerts.alerts.some(row => !customerIds.has(row.customer_id) || typeof row.alert_id !== 'string' || typeof row.alert_type !== 'string' || typeof row.description !== 'string' || typeof row.severity !== 'string' || !isDateString(row.created_at))) throw new Error('The alert data contains invalid records.')
  if (queue.actions.some(action => !isValidStaffAction(action, customerIds)) || new Set(queue.actions.map(action => action.action_id)).size !== queue.actions.length) throw new Error('The staff action queue contains invalid or duplicate actions.')
  if (models.models.some(model => typeof model.model_name !== 'string' || typeof model.model_type !== 'string' || ['roc_auc', 'pr_auc', 'precision', 'recall', 'precision_at_top_k', 'lift_at_top_k'].some(key => {
    const value = model[key as keyof typeof model]
    return value !== null && (!isFiniteNumber(value) || value < 0 || (key !== 'lift_at_top_k' && value > 1))
  }))) throw new Error('The model evaluation data contains invalid metrics.')
  return { manifest, summary, segments, retention, products, rankings, migration, alerts, models, queue }
}

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value)
const percent = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`
const segmentLabel = (id: string) => SEGMENT_NAMES[id] ?? id
const statusTone = (value: string) => value.toLowerCase().includes('critical') || value.toLowerCase() === 'high' ? 'danger' : value.toLowerCase().includes('moderate') || value.toLowerCase() === 'normal' || value.toLowerCase() === 'in_progress' ? 'warn' : value.toLowerCase() === 'completed' || value.toLowerCase() === 'low' ? 'good' : 'neutral'

function App() {
  const [active, setActive] = useState<PanelId>('segments')
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<{ title: string; children: ReactNode } | null>(null)
  const [actions, setActions] = useState<StaffAction[]>([])
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [compactView, setCompactView] = useState(() => window.matchMedia('(max-width: 850px)').matches)

  useEffect(() => {
    let cancelled = false
    loadData().then(data => {
      if (cancelled) return
      setBundle(data)
      try {
        const saved = localStorage.getItem(`valuebridge360.staffActions.v1.${data.manifest.snapshot_id}`)
        const parsed: unknown = saved ? JSON.parse(saved) : null
        const customerIds = new Set(data.segments.customers.map(customer => customer.customer_id))
        const savedActions = Array.isArray(parsed) && new Set(parsed.map(action => action && typeof action === 'object' ? (action as { action_id?: string }).action_id : undefined)).size === parsed.length && parsed.every(action => isValidStaffAction(action, customerIds))
        setActions(savedActions ? parsed as StaffAction[] : data.queue.actions)
      } catch { setActions(data.queue.actions) }
    }).catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Analytics data could not be loaded.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 850px)')
    const update = () => setCompactView(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  // This effect syncs the editable queue to browser storage; the warning state is the visible quota/error response.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (bundle) { try { localStorage.setItem(`valuebridge360.staffActions.v1.${bundle.manifest.snapshot_id}`, JSON.stringify(actions)) } catch { setToast('Changes could not be saved in this browser.') } } }, [actions, bundle])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer) }, [toast])

  const activeNav = NAV.find(item => item.id === active)!
  const openDetail = (title: string, children: ReactNode) => setSelected({ title, children })

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} aria-hidden={!mobileNav && compactView} inert={!mobileNav && compactView}>
      <div className="brand-lockup"><div className="brand-mark"><span /><span /></div><div className="brand-name">VALUEBRIDGE <b>360</b></div></div>
      <div className="sidebar-caption">CUSTOMER INTELLIGENCE</div>
      <nav aria-label="Primary navigation">
        {NAV.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => { setActive(item.id); setMobileNav(false) }}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{active === item.id && <i />}</button> })}
      </nav>
      <div className="sidebar-bottom"><div className="workflow-title">ANALYTICAL WORKFLOW</div><div className="workflow-list">{['Data intake', 'Preparation', 'Customer profiling', 'Retention analysis', 'Product intelligence', 'Opportunity ranking', 'Dashboard & validation'].map((item, index) => <div key={item} className="workflow-step"><span>{String(index + 1).padStart(2, '0')}</span>{item}</div>)}</div><div className="sidebar-footer"><span className="live-dot" /> Local analytics workspace</div></div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-shell">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activeNav.label}</strong></div><div className="topbar-right"><div className={`mode-pill ${bundle?.manifest.data_mode === 'competition' && (bundle.manifest as Manifest & { validation_status?: string }).validation_status === 'PASS' ? 'mode-real' : 'mode-demo'}`}><span className="mode-dot" />{bundle?.manifest.data_mode === 'competition' && (bundle.manifest as Manifest & { validation_status?: string }).validation_status === 'PASS' ? 'CHALLENGE DATA' : bundle ? 'DEMO MODE' : loadError ? 'DATA UNAVAILABLE' : 'LOADING DATA'}</div><div className="runtime-status"><span className={`runtime-dot ${loadError ? 'runtime-error' : ''}`} />{loadError ? 'Unavailable' : bundle ? 'Workspace ready' : 'Loading'}</div><div className="header-divider" /><div className="date-context"><span>LAST DATA REFRESH</span><strong>{bundle ? new Date(bundle.manifest.generated_at).toLocaleString() : 'â€”'}</strong><small>Snapshot {(bundle?.manifest as (Manifest & { snapshot_id?: string }) | undefined)?.snapshot_id ?? 'Synthetic baseline'}</small></div></div></header>
      <div className="page-content">
        {loading && <div className="state-panel"><LoaderCircle className="spin" size={28} /><strong>Loading analytics</strong><span>Reading the validated dashboard data files.</span></div>}
        {!loading && loadError && <div className="state-panel state-error"><AlertTriangle size={28} /><strong>Analytics data unavailable</strong><span>{loadError}</span><button className="button button-secondary" onClick={() => window.location.reload()}>Retry loading</button></div>}
        {!loading && !loadError && bundle && <>
          <div className="page-heading"><div><div className="eyebrow">VALUEBRIDGE 360 <span>/</span> CUSTOMER INTELLIGENCE</div><h1>{activeNav.label}</h1><p>{pageDescription(active)}</p></div><div className="heading-right"><div className="synthetic-tag"><span className="tag-dot" />{bundle.manifest.data_mode === 'competition' ? 'BANCABC 2026 CSV Â· ORIGINAL IDS' : bundle.manifest.metric_status.toUpperCase()}</div><button className="icon-button help-button" aria-label="Data and metric status" title="Data and metric status" onClick={() => openDetail('About this data', <p>Current dataset status: <b>{bundle.manifest.metric_status}</b>. Source: {bundle.manifest.data_source}. Model results: {bundle.models.evaluation_status}. The challenge CSV contains synthetic reference records, not real banking customers.</p>)}><CircleHelp size={18} /></button></div></div>
          {active === 'segments' && <SegmentsPanel data={bundle} openDetail={openDetail} />}
          {active === 'retention' && <RetentionPanel data={bundle} openDetail={openDetail} />}
          {active === 'products' && <ProductsPanel data={bundle} openDetail={openDetail} />}
          {active === 'opportunities' && <OpportunitiesPanel data={bundle} openDetail={openDetail} />}
          {active === 'migration' && <MigrationPanel data={bundle} openDetail={openDetail} />}
          {active === 'decisions' && <DecisionPanel data={bundle} actions={actions} setActions={setActions} setToast={setToast} openDetail={openDetail} />}
          <footer className="page-footer"><span>VALUEBRIDGE 360</span><span>Python performs the analysis; React and TypeScript present the results.</span><span>Schema {bundle.manifest.schema_version}</span></footer>
        </>}
      </div>
    </main>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null) }}><section className="detail-modal" role="dialog" aria-modal="true" aria-label={selected.title}><div className="modal-head"><h2>{selected.title}</h2><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={18} /></button></div><div className="modal-body">{selected.children}</div></section></div>}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>
}

function pageDescription(id: PanelId) {
  return ({ segments: 'Explore customer engagement, activity patterns and relative value.', retention: 'Monitor the Customer Deterioration Index and review activity changes.', products: 'Review product candidates and the affinity signals behind each suggestion.', opportunities: 'Prioritise customer-product opportunities using relative indicators.', migration: 'Track segment transitions and review emerging customer alerts.', decisions: 'Coordinate follow-up actions and compare available model evaluations.' } as Record<PanelId, string>)[id]
}

function KpiGrid({ items }: { items: Array<{ label: string; value: string | number; note?: string; icon: ReactNode; tone?: string }> }) {
  return <div className="kpi-grid">{items.map(item => <div className="kpi-card" key={item.label}><div className="kpi-top"><span>{item.label}</span><span className={`kpi-icon ${item.tone ?? ''}`}>{item.icon}</span></div><div className="kpi-value">{typeof item.value === 'number' ? formatNumber(item.value) : item.value}</div>{item.note && <div className="kpi-note">{item.note}</div>}</div>)}</div>
}
function PanelGrid({ children }: { children: ReactNode }) { return <div className="panel-grid">{children}</div> }
function ChartCard({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) { return <section className={`card chart-card ${className}`}><div className="card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section> }
function ChartFrame({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`chart-frame ${className}`}>{children}</div> }
function DataTable<T extends object>({ rows, columns, searchPlaceholder, filterSlot, emptyText = 'No matching records', pageSize = 10, onRowClick, rowKey }: { rows: T[]; columns: Column<T>[]; searchPlaceholder: string; filterSlot?: ReactNode; emptyText?: string; pageSize?: number; onRowClick?: (row: T) => void; rowKey: (row: T) => string }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const searched = useMemo(() => rows.filter(row => !query || Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()))), [rows, query])
  const sorted = useMemo(() => {
    if (!sortKey) return searched
    return [...searched].sort((a, b) => {
      const av = a[sortKey as keyof T], bv = b[sortKey as keyof T]
      const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      return comparison * (sortDirection === 'asc' ? 1 : -1)
    })
  }, [searched, sortKey, sortDirection])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const visiblePage = Math.min(page, totalPages)
  const shown = sorted.slice((visiblePage - 1) * pageSize, visiblePage * pageSize)
  return <div className="table-card card"><div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></label><div className="toolbar-filters">{filterSlot}</div><span className="result-count">{formatNumber(sorted.length)} records</span></div><div className="table-scroll"><table><thead><tr>{columns.map(col => <th key={String(col.key)} className={`${col.align === 'right' ? 'numeric' : ''} ${col.className ?? ''}`}><button className={col.sortable === false ? 'plain-header' : 'sort-header'} disabled={col.sortable === false} onClick={() => { if (sortKey === col.key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); else { setSortKey(String(col.key)); setSortDirection('asc') } }}>{col.label}{sortKey === col.key && <span>{sortDirection === 'asc' ? ' â†‘' : ' â†“'}</span>}</button></th>)}</tr></thead><tbody>{shown.map(row => <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick?.(row) } }} tabIndex={onRowClick ? 0 : undefined} className={onRowClick ? 'clickable-row' : ''}>{columns.map(col => <td key={String(col.key)} className={`${col.align === 'right' ? 'numeric' : ''} ${col.className ?? ''}`}>{col.render ? col.render(row) : String(row[col.key as keyof T] ?? 'â€”')}</td>)}</tr>)}{shown.length === 0 && <tr><td className="empty-cell" colSpan={columns.length}>{emptyText}</td></tr>}</tbody></table></div><div className="table-pagination"><span>Showing {sorted.length ? (visiblePage - 1) * pageSize + 1 : 0}â€“{Math.min(visiblePage * pageSize, sorted.length)} of {formatNumber(sorted.length)}</span><div><button className="icon-button" disabled={visiblePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button><span className="page-number">{visiblePage} / {totalPages}</span><button className="icon-button" disabled={visiblePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label="Next page"><ChevronRight size={16} /></button></div></div></div>
}
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`pill ${tone}`}>{children}</span> }
function DetailList({ entries }: { entries: Array<[string, ReactNode]> }) { return <dl className="detail-list">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> }
type FilterOption = string | { value: string; label: string }
function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: FilterOption[] }) { return <label className="filter-select"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(item => { const option = typeof item === 'string' ? { value: item, label: item === 'All' ? 'All ' + label.toLowerCase() : item } : item; return <option key={option.value} value={option.value}>{option.label}</option> })}</select><ChevronDown size={14} /></label> }
function SourceTransactions({ customerId }: { customerId: string }) {
  type SourceTransaction = [string, string, string, string, number, string, string, string]
  const [rows, setRows] = useState<SourceTransaction[] | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch(`/source-transactions/${encodeURIComponent(customerId)}`, { cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(`Source transaction request failed (${response.status})`); return await response.json() as { records: SourceTransaction[] } })
      .then(result => { if (!cancelled) setRows(result.records) })
      .catch(problem => { if (!cancelled) setError(problem instanceof Error ? problem.message : 'Transactions unavailable') })
    return () => { cancelled = true }
  }, [customerId])
  return <section className="source-transactions">
    <h3>Original BancABC CSV transactions</h3>
    <p>Source rows for customer {customerId}; includes all statuses and transaction types, not just qualifying RFM transactions.</p>
    {error && <p role="alert">{error}</p>}
    {!error && !rows && <p>Loading source transactions...</p>}
    {rows && <><p><strong>{formatNumber(rows.length)} source transactions</strong> Â· newest first Â· page {page + 1} of {Math.max(1, Math.ceil(rows.length / 12))}</p>
      <div className="source-table-scroll"><table><thead><tr><th>Date</th><th>Transaction ID</th><th>Account ID</th><th>Type</th><th>USD amount</th><th>Status</th><th>Channel</th></tr></thead><tbody>{rows.slice(page * 12, page * 12 + 12).map((r, i) => <tr key={`${r[1]}-${i}`}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4].toFixed(2)}</td><td>{r[5]}</td><td>{r[6]}</td></tr>)}</tbody></table></div>
      <div className="source-pagination"><button className="button button-secondary" disabled={page === 0} onClick={() => setPage(v => v - 1)}>Previous</button><button className="button button-secondary" disabled={(page + 1) * 12 >= rows.length} onClick={() => setPage(v => v + 1)}>Next</button></div>
    </>}
  </section>
}
function renderCustomerDetail(customer: Customer, risk?: RiskCustomer): ReactNode { return <>
  <div className="customer-id-large">{customer.customer_id}<Pill>{segmentLabel(customer.segment_id)}</Pill></div>
  <DetailList entries={[
    ["Source customer name", customer.legal_name || 'Not supplied'],
    ["BancABC customer ID", customer.customer_id], ["Bank customer segment", customer.bank_segment || 'â€”'],
    ["Account status", customer.bank_status || 'â€”'], ["Account types", customer.account_types || 'â€”'], ["Number of accounts", customer.account_count ?? 'â€”'],
    ["Products held", customer.products_held || 'â€”'], ["City / Province", [customer.city, customer.province].filter(Boolean).join(', ') || 'â€”'],
    ["KYC status", customer.kyc_status || 'â€”'], ["Source risk rating", customer.risk_rating || 'â€”'],
    ["Recency", `${customer.recency_days} days`], ["Frequency (qualifying transactions)", formatNumber(customer.frequency)],
    ["USD monetary activity (qualifying transactions)", formatNumber(customer.monetary_score)], ["Last qualifying activity", customer.last_activity_date || 'Not observed'],
    ...(risk ? [["Customer Deterioration Index", risk.cdi_score == null ? 'Not evaluated' : `${risk.cdi_score} / 100`], ["Risk category", risk.risk_category], ["Reason", risk.reason]] as Array<[string, ReactNode]> : [])
  ]} />
  {/^\d+$/.test(customer.customer_id) && <SourceTransactions customerId={customer.customer_id} />}
</> }

function SegmentsPanel({ data, openDetail }: { data: DataBundle; openDetail: (title: string, children: ReactNode) => void }) {
  const [segment, setSegment] = useState('All')
  const displayed = useMemo(() => segment === 'All' ? data.segments.customers : data.segments.customers.filter(c => c.segment_id === segment), [data.segments.customers, segment])
  const active = data.summary.summary.active_customers
  const chartSegments = data.segments.segments.map((row, i) => ({ ...row, fill: PALETTE[i] }))
  const customerColumns: Column<Customer>[] = [
    { key: 'customer_id', label: 'Customer ID', render: row => <strong className="mono">{row.customer_id}</strong> },
    { key: 'legal_name', label: 'Customer name', render: row => row.legal_name || 'â€”' },
    { key: 'segment_id', label: 'RFM segment', render: row => <Pill tone={row.segment_id === 'AT_RISK' ? 'warn' : row.segment_id === 'HIBERNATING' ? 'neutral' : 'blue'}>{segmentLabel(row.segment_id)}</Pill> },
    { key: 'recency_days', label: 'Recency', align: 'right', render: row => `${row.recency_days} d` },
    { key: 'frequency', label: 'Frequency', align: 'right' },
    { key: 'monetary_score', label: 'Monetary activity score', align: 'right' },
  ]
  return <><KpiGrid items={[{ label: 'Total customers', value: data.summary.summary.customer_count, note: data.manifest.data_mode === 'competition' ? 'Original BancABC CSV IDs' : 'Generated demo profiles', icon: <UsersRound size={18} /> }, { label: 'Active customers', value: active, note: 'Activity in the last 90 days', icon: <Activity size={18} />, tone: 'teal' }, { label: 'Champions', value: data.segments.segments.find(s => s.segment_id === 'CHAMPIONS')?.customer_count ?? 0, note: 'Highest recent engagement group', icon: <Sparkles size={18} />, tone: 'blue' }, { label: 'At-risk customers', value: data.summary.summary.at_risk_customers, note: 'High or critical CDI', icon: <ShieldAlert size={18} />, tone: 'orange' }]} />
    <PanelGrid><ChartCard title="Customer segment distribution" subtitle="Count by RFM engagement group"><div className="segment-distribution"><ChartFrame className="segment-pie-frame"><ResponsiveContainer><PieChart><Pie data={chartSegments} dataKey="customer_count" nameKey="segment_name" cx="50%" cy="50%" innerRadius="48%" outerRadius="78%" paddingAngle={2} isAnimationActive={false}>{chartSegments.map(entry => <Cell key={entry.segment_id} fill={entry.fill} />)}</Pie><Tooltip formatter={(value, name) => [formatNumber(Number(value)), name]} /></PieChart></ResponsiveContainer></ChartFrame><div className="segment-legend">{chartSegments.map(entry => <div className="segment-legend-row" key={entry.segment_id}><span className="segment-swatch" style={{ backgroundColor: entry.fill }} /><span>{entry.segment_name}</span><strong>{formatNumber(entry.customer_count)}</strong></div>)}</div></div></ChartCard>
      <ChartCard title="Engagement comparison" subtitle="Segment averages from the customer profiles"><ChartFrame><ResponsiveContainer><BarChart data={data.segments.segments} margin={{ left: -15, right: 10, bottom: 22 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="segment_name" tick={{ fontSize: 10 }} angle={-18} textAnchor="end" interval={0} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="average_frequency" name="Average frequency" fill="#1769AA" radius={[4, 4, 0, 0]} /><Bar dataKey="average_recency_days" name="Average recency (days)" fill="#13A89E" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard></PanelGrid>
    <section className="section-heading"><div><h2>Customer profiles</h2><p>Source-linked BancABC customer records with derived RFM activity; not profitability or lifetime value.</p></div><FilterSelect label="Segment" value={segment} onChange={setSegment} options={['All', ...data.segments.segments.map(s => ({ value: s.segment_id, label: s.segment_name }))]} /></section>
    <DataTable rows={displayed} columns={customerColumns} searchPlaceholder="Search customer ID, name, product or segment" rowKey={r => r.customer_id} onRowClick={row => openDetail(`Customer ${row.customer_id}`, renderCustomerDetail(row, data.retention.customers.find(risk => risk.customer_id === row.customer_id)))} />
  </>
}

function RetentionPanel({ data, openDetail }: { data: DataBundle; openDetail: (title: string, children: ReactNode) => void }) {
  const [riskFilter, setRiskFilter] = useState('All')
  const riskRows = useMemo(() => riskFilter === 'All' ? data.retention.customers : data.retention.customers.filter(r => r.risk_category.toLowerCase() === riskFilter.toLowerCase()), [data.retention.customers, riskFilter])
  const scoredRows = data.retention.customers.filter(row => row.cdi_score != null)
  const average = scoredRows.reduce((total, row) => total + (row.cdi_score ?? 0), 0) / (scoredRows.length || 1)
  const categories = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((name, i) => ({ name, count: data.retention.customers.filter(r => r.risk_category === name).length, fill: [PALETTE[1], PALETTE[0], '#B54708', '#B54708'][i] }))
  const bins = [{ range: '0â€“24', count: 0 }, { range: '25â€“49', count: 0 }, { range: '50â€“74', count: 0 }, { range: '75â€“100', count: 0 }]
  data.retention.customers.forEach(row => { if (row.cdi_score == null) return; const i = row.cdi_score < 25 ? 0 : row.cdi_score < 50 ? 1 : row.cdi_score < 75 ? 2 : 3; bins[i].count++ })
  const activities = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map(category => { const rows = data.retention.customers.filter(r => r.risk_category === category); return { category, Historical: rows.reduce((n, r) => n + r.historical_activity, 0) / (rows.length || 1), Recent: rows.reduce((n, r) => n + r.recent_activity, 0) / (rows.length || 1) } })
  const columns: Column<RiskCustomer>[] = [{ key: 'customer_id', label: 'Customer ID', render: r => <strong className="mono">{r.customer_id}</strong> }, { key: 'cdi_score', label: 'CDI', align: 'right', render: r => <strong>{r.cdi_score ?? 'Not yet evaluated'}</strong> }, { key: 'risk_category', label: 'Risk', render: r => <Pill tone={statusTone(r.risk_category)}>{r.risk_category}</Pill> }, { key: 'historical_activity', label: 'Historical activity', align: 'right' }, { key: 'recent_activity', label: 'Recent activity', align: 'right' }, { key: 'activity_change_percent', label: 'Change', align: 'right', render: r => r.activity_change_percent == null ? 'â€”' : <span className={r.activity_change_percent < 0 ? 'negative' : 'positive'}>{r.activity_change_percent}%</span> }, { key: 'reason', label: 'Deterioration explanation', sortable: false, className: 'reason-cell' }]
  return <><div className="method-callout"><div className="method-icon"><ShieldAlert size={18} /></div><div><strong>Customer Deterioration Index (CDI)</strong><p>Calculated from dated transaction records in the selected synthetic dataset. CDI is an activity indicator, not a churn probability; customers without enough history are left unscored.</p></div><button className="text-button" onClick={() => openDetail('CDI methodology', <><p>Compare Augâ€“Oct 2026 with the Febâ€“Jul 2026 monthly baseline. CDI combines frequency deterioration (40%), USD activity deterioration (40%) and recency deterioration (20%).</p><div className="formula-box">CDI = 100 Ã— (0.40 Ã— Frequency_Drop + 0.40 Ã— Monetary_Drop + 0.20 Ã— Recency_Drop)</div><DetailList entries={[["0â€“24", 'Low'], ["25â€“49", 'Moderate'], ["50â€“74", 'High'], ["75â€“100", 'Critical'], ["Unscored", 'Baseline requires at least two completed qualifying transactions'], ["Interpretation", 'Relative activity deterioration indicator; not a probability of customer departure']]} /></>)}>How it works <ChevronRight size={14} /></button></div>
    <KpiGrid items={[{ label: 'High deterioration', value: data.retention.customers.filter(r => r.risk_category === 'HIGH').length, note: 'CDI 50â€“74', icon: <ArrowUpRight size={18} />, tone: 'orange' }, { label: 'Critical risk', value: data.retention.customers.filter(r => r.risk_category === 'CRITICAL').length, note: 'CDI 75â€“100', icon: <AlertTriangle size={18} />, tone: 'orange' }, { label: 'Average CDI', value: scoredRows.length ? average.toFixed(1) : 'Not yet evaluated', note: `Scored customers: ${formatNumber(scoredRows.length)}`, icon: <Activity size={18} />, tone: 'blue' }, { label: 'Insufficient history', value: data.retention.customers.length - scoredRows.length, note: 'Not yet evaluated', icon: <CircleHelp size={18} /> }]} />
    <PanelGrid><ChartCard title="CDI distribution" subtitle="Customer count by initial CDI band"><ChartFrame><ResponsiveContainer><BarChart data={bins}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="range" /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={value => formatNumber(Number(value))} /><Bar dataKey="count" name="Customers" fill="#1769AA" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard>
      <ChartCard title="Monthly CDI trend" subtitle="Generated monthly summaries Â· illustrative"><ChartFrame><ResponsiveContainer><AreaChart data={data.retention.monthly_trends}><defs><linearGradient id="cdiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#13A89E" stopOpacity={0.24} /><stop offset="95%" stopColor="#13A89E" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} /><Tooltip /><Area type="monotone" dataKey="average_cdi" name="Average CDI" stroke="#0B6F69" fill="url(#cdiFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></ChartFrame></ChartCard></PanelGrid>
    <PanelGrid><ChartCard title="Risk category distribution" subtitle="Customers by current illustrative category"><ChartFrame><ResponsiveContainer><BarChart data={categories}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="count" name="Customers" radius={[4, 4, 0, 0]}>{categories.map(row => <Cell key={row.name} fill={row.fill} />)}</Bar></BarChart></ResponsiveContainer></ChartFrame></ChartCard><ChartCard title="Historical vs recent activity" subtitle="Average activity index by risk category"><ChartFrame><ResponsiveContainer><BarChart data={activities}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="category" /><YAxis /><Tooltip /><Legend /><Bar dataKey="Historical" fill="#1769AA" radius={[3, 3, 0, 0]} /><Bar dataKey="Recent" fill="#13A89E" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard></PanelGrid>
    <section className="section-heading"><div><h2>Customers for review</h2><p>Prioritisation support only; staff review is required.</p></div><FilterSelect label="Risk" value={riskFilter} onChange={setRiskFilter} options={['All', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'UNSCORED']} /></section>
    <DataTable rows={riskRows} columns={columns} searchPlaceholder="Search customer ID, category or reason" rowKey={r => r.customer_id} onRowClick={row => { const customer = data.segments.customers.find(c => c.customer_id === row.customer_id); openDetail(`Risk review Â· ${row.customer_id}`, <><div className="risk-score-large"><span>{row.cdi_score ?? 'Not yet evaluated'}</span><Pill tone={statusTone(row.risk_category)}>{row.risk_category}</Pill></div><p className="detail-reason">{row.reason}</p>{customer && renderCustomerDetail(customer, row)}</>) }} />
  </>
}

function ProductsPanel({ data, openDetail }: { data: DataBundle; openDetail: (title: string, children: ReactNode) => void }) {
  const [product, setProduct] = useState('All')
  const products = useMemo(() => product === 'All' ? data.products.recommendations : data.products.recommendations.filter(r => r.product_candidate === product), [data.products.recommendations, product])
  const grouped = useMemo(() => groupBy(data.products.recommendations, row => row.product_candidate), [data.products.recommendations])
  const productStats = [...grouped.entries()].map(([name, rows]) => ({ name: name.replaceAll('_', ' '), candidates: rows.length, affinity: average(rows.map(r => r.affinity_score)), support: average(rows.map(r => r.support)), confidence: average(rows.map(r => r.confidence)), lift: average(rows.map(r => r.lift)) })).sort((a, b) => b.candidates - a.candidates)
  const highAffinity = data.products.recommendations.filter(r => r.affinity_score >= 0.75).length
  const columns: Column<(typeof products)[number]>[] = [{ key: 'customer_id', label: 'Customer ID', render: r => <strong className="mono">{r.customer_id}</strong> }, { key: 'product_candidate', label: 'Candidate product', render: r => r.product_candidate.replaceAll('_', ' ') }, { key: 'affinity_score', label: 'Affinity', align: 'right', render: r => percent(r.affinity_score) }, { key: 'support', label: 'Support', align: 'right', render: r => percent(r.support, 1) }, { key: 'confidence', label: 'Confidence', align: 'right', render: r => percent(r.confidence) }, { key: 'lift', label: 'Lift', align: 'right', render: r => r.lift.toFixed(2) }, { key: 'eligibility_status', label: 'Eligibility status', sortable: false, render: () => <span className="candidate-label">CANDIDATE â€” pending staff eligibility and suitability review</span> }]
  return <><div className="candidate-banner"><Sparkles size={18} /><strong>CANDIDATE â€” pending staff eligibility and suitability review.</strong><span>Every suggestion requires individual review.</span></div><KpiGrid items={[{ label: 'Candidate recommendations', value: data.products.recommendations.length, note: 'Synthetic profile suggestions', icon: <Sparkles size={18} /> }, { label: 'Product categories', value: productStats.length, note: 'Represented in this dataset', icon: <CreditCard size={18} />, tone: 'teal' }, { label: 'High-affinity candidates', value: highAffinity, note: 'Affinity score â‰¥ 0.75', icon: <ArrowUpRight size={18} />, tone: 'blue' }, { label: 'Potential product gaps', value: data.products.recommendations.length, note: 'Candidate-level suggestions', icon: <BriefcaseBusiness size={18} /> }]} />
    <PanelGrid><ChartCard title="Product candidate distribution" subtitle="Recommendation count by product"><ChartFrame><ResponsiveContainer><BarChart data={productStats} layout="vertical" margin={{ left: 35 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" /><YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="candidates" name="Candidates" fill="#1769AA" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard><ChartCard title="Affinity and association signals" subtitle="Mean portfolio association metrics by product"><ChartFrame><ResponsiveContainer><BarChart data={productStats}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-18} textAnchor="end" interval={0} /><YAxis domain={[0, 1]} /><Tooltip /><Legend /><Bar dataKey="affinity" fill="#13A89E" /><Bar dataKey="confidence" fill="#1769AA" /><Bar dataKey="support" fill="#7A8FA3" /></BarChart></ResponsiveContainer></ChartFrame></ChartCard></PanelGrid>
    <div className="insight-strip"><div><span className="insight-label">ASSOCIATION RULE GUIDE</span><strong>Support</strong><span>How frequently a product pattern appears.</span></div><div><strong>Confidence</strong><span>How often the candidate appears with the observed pattern.</span></div><div><strong>Lift</strong><span>Relative co-occurrence compared with chance baseline.</span></div><div className="insight-note">The displayed metrics are calculated from the selected synthetic dataset; portfolio co-holding is not adoption propensity.</div></div>
    <section className="section-heading"><div><h2>Candidate recommendations</h2><p>Product suggestions require eligibility and suitability review.</p></div><FilterSelect label="Product" value={product} onChange={setProduct} options={['All', ...productStats.map(p => p.name.replaceAll(' ', '_'))]} /></section>
    <DataTable rows={products} columns={columns} searchPlaceholder="Search customer ID or product" rowKey={r => `${r.customer_id}-${r.product_candidate}`} onRowClick={row => openDetail(`Candidate Â· ${row.customer_id}`, <><div className="candidate-banner modal-candidate"><Sparkles size={16} /><strong>CANDIDATE â€” pending staff eligibility and suitability review.</strong></div><DetailList entries={[["Customer ID", row.customer_id], ["Product candidate", row.product_candidate.replaceAll('_', ' ')], ["Affinity score", percent(row.affinity_score, 1)], ["Support", percent(row.support, 2)], ["Confidence", percent(row.confidence, 1)], ["Lift", row.lift.toFixed(2)], ["Explanation", row.reason]]} /></>)} />
  </>
}

function OpportunitiesPanel({ data, openDetail }: { data: DataBundle; openDetail: (title: string, children: ReactNode) => void }) {
  const [segment, setSegment] = useState('All')
  const [product, setProduct] = useState('All')
  const filtered = useMemo(() => data.rankings.rankings.filter(row => (segment === 'All' || row.segment === segment) && (product === 'All' || row.product_candidate === product)), [data.rankings.rankings, segment, product])
  const bySegment = [...new Set(data.rankings.rankings.map(r => r.segment))].map(name => { const rows = data.rankings.rankings.filter(r => r.segment === name); return { name, average: average(rows.map(r => r.opportunity_score)), count: rows.length } })
  const byProduct = [...groupBy(data.rankings.rankings, r => r.product_candidate)].map(([name, rows]) => ({ name: name.replaceAll('_', ' '), average: average(rows.map(r => r.opportunity_score)) }))
  const bins = Array.from({ length: 5 }, (_, i) => ({ range: `${(i * 20)}â€“${(i + 1) * 20}`, count: 0 }))
  data.rankings.rankings.forEach(row => bins[Math.min(4, Math.floor(row.opportunity_score * 5))].count++)
  const columns: Column<Ranking>[] = [{ key: 'rank', label: 'Rank', align: 'right', render: r => <strong className="rank-number">{formatNumber(r.rank)}</strong> }, { key: 'customer_id', label: 'Customer ID', render: r => <strong className="mono">{r.customer_id}</strong> }, { key: 'segment', label: 'Segment', render: r => <Pill tone="blue">{r.segment}</Pill> }, { key: 'product_candidate', label: 'Candidate product', render: r => r.product_candidate.replaceAll('_', ' ') }, { key: 'affinity_score', label: 'Affinity', align: 'right', render: r => percent(r.affinity_score) }, { key: 'customer_value_score', label: 'Customer value', align: 'right', render: r => percent(r.customer_value_score) }, { key: 'opportunity_score', label: 'Opportunity score', align: 'right', render: r => <span className="score-cell">{percent(r.opportunity_score)}</span> }, { key: 'explanation', label: 'Factors', sortable: false, className: 'reason-cell' }]
  return <><div className="connector-banner"><div className="bridge-symbol"><span /><span /></div><div><strong>Value â†’ affinity â†’ opportunity</strong><p>Relative indicators combine candidate affinity, customer activity and segment contribution.</p></div><span className="connector-status">PRIORITISATION INDICATOR</span></div><KpiGrid items={[{ label: 'Ranked opportunities', value: data.rankings.rankings.length, note: 'One candidate per profile', icon: <FileChartColumnIncreasing size={18} /> }, { label: 'High-priority opportunities', value: data.rankings.rankings.filter(r => r.opportunity_score >= 0.75).length, note: 'Relative score â‰¥ 0.75', icon: <ArrowUpRight size={18} />, tone: 'teal' }, { label: 'Average opportunity score', value: percent(average(data.rankings.rankings.map(r => r.opportunity_score))), note: 'Relative score only', icon: <Activity size={18} />, tone: 'blue' }, { label: 'Represented segments', value: bySegment.length, note: 'Six RFM engagement segments', icon: <UsersRound size={18} /> }]} />
    <PanelGrid><ChartCard title="Opportunity score distribution" subtitle="Relative score bands"><ChartFrame><ResponsiveContainer><BarChart data={bins}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="range" /><YAxis /><Tooltip /><Bar dataKey="count" name="Opportunities" fill="#1769AA" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard><ChartCard title="Average opportunity by segment" subtitle="Mean relative score and volume"><ChartFrame><ResponsiveContainer><BarChart data={bySegment}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" interval={0} /><YAxis domain={[0, 1]} /><Tooltip /><Bar dataKey="average" name="Average score" fill="#13A89E" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard></PanelGrid><ChartCard title="Opportunity comparison by product" subtitle="Average relative opportunity score"><ChartFrame className="short-chart"><ResponsiveContainer><BarChart data={byProduct}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis domain={[0, 1]} /><Tooltip /><Bar dataKey="average" name="Average score" fill="#1769AA" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame></ChartCard>
    <section className="section-heading"><div><h2>Opportunity ranking</h2><p>Scores support staff prioritisation; they are not sales or profitability forecasts.</p></div><div className="filter-row"><FilterSelect label="Segment" value={segment} onChange={setSegment} options={['All', ...bySegment.map(r => r.name)]} /><FilterSelect label="Product" value={product} onChange={setProduct} options={['All', ...byProduct.map(r => r.name.replaceAll(' ', '_'))]} /></div></section><DataTable rows={filtered} columns={columns} searchPlaceholder="Search customer ID, segment or product" rowKey={r => `${r.rank}-${r.customer_id}`} onRowClick={row => openDetail(`Opportunity Â· rank ${row.rank}`, <DetailList entries={[["Rank", formatNumber(row.rank)], ["Customer ID", row.customer_id], ["Segment", row.segment], ["Candidate product", row.product_candidate.replaceAll('_', ' ')], ["Affinity contribution", percent(row.affinity_score)], ["Relative customer activity", percent(row.customer_value_score)], ["Opportunity score", percent(row.opportunity_score)], ["Explanation", row.explanation], ["Interpretation", 'Relative prioritisation score; not a guaranteed sales outcome']]} />)} />
  </>
}

function MigrationPanel({ data, openDetail }: { data: DataBundle; openDetail: (title: string, children: ReactNode) => void }) {
  const [period, setPeriod] = useState(data.migration.periods.at(-1) ?? '')
  const [severity, setSeverity] = useState('All')
  const [status, setStatus] = useState('All')
  const transitions = data.migration.transitions.filter(row => row.period === period)
  const segments = data.segments.segments.map(s => s.segment_name)
  const matrix: Array<Record<string, string | number>> = segments.map(from => ({ from, ...Object.fromEntries(segments.map(to => [to, transitions.find(r => r.from_segment === from && r.to_segment === to)?.customer_count ?? 0])) }))
  const trend = data.migration.periods.map(month => ({ month, ...Object.fromEntries(segments.map(name => [name, data.migration.transitions.filter(r => r.period === month && r.to_segment === name && r.from_segment !== name).reduce((sum, row) => sum + row.customer_count, 0)])) }))
  const filteredAlerts = data.alerts.alerts.filter(a => (severity === 'All' || a.severity === severity) && (status === 'All' || a.status === status))
  const columns: Column<Alert>[] = [{ key: 'alert_id', label: 'Alert ID', render: r => <strong className="mono">{r.alert_id}</strong> }, { key: 'customer_id', label: 'Customer ID', render: r => <strong className="mono">{r.customer_id}</strong> }, { key: 'alert_type', label: 'Alert type' }, { key: 'severity', label: 'Severity', render: r => <Pill tone={statusTone(r.severity)}>{r.severity}</Pill> }, { key: 'description', label: 'Description', sortable: false, className: 'reason-cell' }, { key: 'created_at', label: 'Created', render: r => r.created_at.slice(0, 10) }, { key: 'status', label: 'Status', render: r => <Pill>{r.status}</Pill> }]
  return <><KpiGrid items={[{ label: 'Migration periods', value: data.migration.periods.length, note: 'Source periods in the file', icon: <Activity size={18} /> }, { label: 'Transition rows', value: data.migration.transitions.length, note: `Selected period Â· ${period}`, icon: <ArrowDownRight size={18} />, tone: 'teal' }, { label: 'Open alerts', value: data.alerts.alerts.filter(a => a.status === 'OPEN').length, note: 'From alerts.json', icon: <Bell size={18} />, tone: 'orange' }, { label: 'Critical alerts', value: data.alerts.alerts.filter(a => a.severity === 'CRITICAL').length, note: 'From alerts.json', icon: <AlertTriangle size={18} />, tone: 'orange' }]} />
    <section className="section-heading"><div><h2>Monthly segment migration</h2><p>Transition counts are read from the separate segment migration dataset.</p></div><FilterSelect label="Period" value={period} onChange={setPeriod} options={data.migration.periods} /></section>
    <ChartCard title="Inbound segment movement" subtitle="Customers moving into each segment per month"><ChartFrame><ResponsiveContainer><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Legend />{segments.map((name, i) => <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.14} />)}</AreaChart></ResponsiveContainer></ChartFrame></ChartCard>
    <ChartCard title="Segment transition matrix" subtitle={`From segment (rows) to segment (columns) Â· ${period}`}><div className="matrix-scroll"><table className="matrix-table"><thead><tr><th>From / To</th>{segments.map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{matrix.map(row => <tr key={row.from}><th>{row.from}</th>{segments.map(name => <td key={name} className={row.from === name ? 'matrix-diagonal' : ''}>{formatNumber(Number(row[name] ?? 0))}</td>)}</tr>)}</tbody></table></div></ChartCard>
    <section className="section-heading alerts-heading"><div><h2>Customer alerts</h2><p>Alert records remain independent from migration transitions.</p></div><div className="filter-row"><FilterSelect label="Severity" value={severity} onChange={setSeverity} options={['All', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL']} /><FilterSelect label="Status" value={status} onChange={setStatus} options={['All', ...new Set(data.alerts.alerts.map(a => a.status))]} /></div></section>
    <DataTable rows={filteredAlerts} columns={columns} searchPlaceholder="Search alert ID, customer or description" rowKey={r => r.alert_id} onRowClick={row => openDetail(`Alert Â· ${row.alert_id}`, <DetailList entries={[["Customer ID", row.customer_id], ["Alert type", row.alert_type], ["Severity", row.severity], ["Description", row.description], ["Created", row.created_at], ["Status", row.status]]} />)} />
  </>
}

function DecisionPanel({ data, actions, setActions, setToast, openDetail }: { data: DataBundle; actions: StaffAction[]; setActions: (actions: StaffAction[] | ((current: StaffAction[]) => StaffAction[])) => void; setToast: (message: string) => void; openDetail: (title: string, children: ReactNode) => void }) {
  const [priority, setPriority] = useState('All')
  const [review, setReview] = useState('All')
  const [adding, setAdding] = useState(false)
  const [newCustomer, setNewCustomer] = useState('')
  const [newType, setNewType] = useState('REVIEW_CUSTOMER')
  const [newPriority, setNewPriority] = useState<StaffAction['priority']>('NORMAL')
  const filtered = useMemo(() => actions.filter(a => (priority === 'All' || a.priority === priority) && (review === 'All' || a.review_status === review)), [actions, priority, review])
  const updateAction = (id: string, changes: Partial<StaffAction>) => setActions(current => current.map(action => action.action_id === id ? { ...action, ...changes } : action))
  const addAction = (event: FormEvent) => {
    event.preventDefault()
    const customerId = newCustomer.trim().toUpperCase()
    if (!data.segments.customers.some(customer => customer.customer_id === customerId)) { setToast('Enter a customer ID from the loaded customer data.'); return }
    const nextNumber = actions.reduce((max, row) => Math.max(max, Number(row.action_id.replace('ACT-', '')) || 0), 0) + 1
    setActions(current => [{ action_id: `ACT-${String(nextNumber).padStart(5, '0')}`, customer_id: customerId, action_type: newType, priority: newPriority, notes: '', review_status: 'PENDING', created_at: new Date().toISOString() }, ...current])
    setNewCustomer(''); setAdding(false); setToast('Staff action added and saved in this browser.')
  }
  const columns: Column<StaffAction>[] = [
    { key: 'action_id', label: 'Action ID', render: r => <strong className="mono">{r.action_id}</strong> }, { key: 'customer_id', label: 'Customer ID', render: r => <strong className="mono">{r.customer_id}</strong> }, { key: 'action_type', label: 'Action type' },
    { key: 'priority', label: 'Priority', render: r => <select className="table-select" value={r.priority} onClick={e => e.stopPropagation()} onChange={e => { updateAction(r.action_id, { priority: e.target.value as StaffAction['priority'] }); setToast('Action priority updated.') }}><option>HIGH</option><option>NORMAL</option><option>LOW</option></select> },
    { key: 'notes', label: 'Notes', sortable: false, render: r => <input className="notes-input" aria-label={`Notes for ${r.action_id}`} value={r.notes} placeholder="Add a note" onClick={e => e.stopPropagation()} onChange={e => updateAction(r.action_id, { notes: e.target.value })} onBlur={() => setToast('Action note saved in this browser.')} /> },
    { key: 'review_status', label: 'Review status', render: r => <select className="table-select" value={r.review_status} onClick={e => e.stopPropagation()} onChange={e => { updateAction(r.action_id, { review_status: e.target.value as StaffAction['review_status'] }); setToast('Review status updated.') }}><option>PENDING</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option></select> },
    { key: 'created_at', label: 'Created', render: r => r.created_at.slice(0, 10) },
  ]
  return <><div className="queue-header"><div><span className="eyebrow">STAFF FOLLOW-UP</span><h2>Action queue</h2><p>Changes are stored in this browser and do not modify the source JSON.</p></div><button className="button button-primary" onClick={() => setAdding(value => !value)}>{adding ? <X size={16} /> : <span>ï¼‹</span>}{adding ? 'Close form' : 'Add action'}</button></div>
    {adding && <form className="add-action-form" onSubmit={addAction}><label>Customer ID<input value={newCustomer} onChange={e => setNewCustomer(e.target.value)} placeholder="e.g. 715360" required /></label><label>Action type<select value={newType} onChange={e => setNewType(e.target.value)}><option>REVIEW_CUSTOMER</option><option>RETENTION_FOLLOW_UP</option><option>PRODUCT_REVIEW</option><option>ALERT_REVIEW</option></select></label><label>Priority<select value={newPriority} onChange={e => setNewPriority(e.target.value as StaffAction['priority'])}><option>HIGH</option><option>NORMAL</option><option>LOW</option></select></label><button className="button button-primary" type="submit">Create action</button></form>}
    <div className="queue-kpis"><span><b>{formatNumber(actions.length)}</b> total actions</span><span><b>{formatNumber(actions.filter(a => a.review_status === 'PENDING').length)}</b> pending review</span><span><b>{formatNumber(actions.filter(a => a.review_status === 'IN_PROGRESS').length)}</b> in progress</span><span className="persist-indicator"><Check size={14} /> Browser persistence on</span></div>
    <div className="section-heading"><div><h2>Staff action queue</h2><p>Search, update status, add notes, or open an action for details.</p></div><div className="filter-row"><FilterSelect label="Priority" value={priority} onChange={setPriority} options={['All', 'HIGH', 'NORMAL', 'LOW']} /><FilterSelect label="Status" value={review} onChange={setReview} options={['All', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']} /></div></div>
    <DataTable rows={filtered} columns={columns} searchPlaceholder="Search action ID, customer or notes" rowKey={r => r.action_id} onRowClick={row => openDetail(`Staff action Â· ${row.action_id}`, <DetailList entries={[["Customer ID", row.customer_id], ["Action type", row.action_type], ["Priority", row.priority], ["Notes", row.notes || 'No notes added'], ["Review status", row.review_status], ["Created", row.created_at]]} />)} />
    <div className="section-heading model-heading"><div><span className="eyebrow">MODEL EVALUATION</span><h2>Prediction performance</h2><p>Target: {data.models.prediction_target}</p></div><Pill tone="warn">{data.manifest.data_mode === 'competition' ? 'HISTORICAL HOLDOUT Â· SYNTHETIC CHALLENGE DATA' : 'SIMULATED Â· DEMO DATA'}</Pill></div>
    <div className="model-summary"><div><strong>Evaluation approach</strong><span>{data.models.evaluation_method}</span></div><div><strong>Evaluation sample</strong><span>{data.models.evaluation_sample_size == null ? 'Not available' : formatNumber(data.models.evaluation_sample_size)}</span></div><div><strong>Performance claim</strong><span>Offline historical evaluation on synthetic reference transactions; model comparisons are not deployment evidence.</span></div></div>
    <div className="table-card card"><div className="table-scroll"><table><thead><tr><th>Model</th><th>Type</th><th className="numeric">ROC-AUC</th><th className="numeric">PR-AUC</th><th className="numeric">Precision</th><th className="numeric">Recall</th><th className="numeric">Precision @ top K</th><th className="numeric">Lift @ top K</th></tr></thead><tbody>{data.models.models.map(model => <tr key={model.model_name}><td><strong>{model.model_name}</strong></td><td><Pill tone={model.model_type === 'ADVANCED' ? 'blue' : 'neutral'}>{model.model_type}</Pill></td>{[model.roc_auc, model.pr_auc, model.precision, model.recall, model.precision_at_top_k, model.lift_at_top_k].map((value, i) => <td className="numeric" key={i}>{value == null ? <span className="muted">Not yet evaluated</span> : value.toFixed(3)}</td>)}</tr>)}</tbody></table></div></div>
    <div className="disclaimer-note"><CircleHelp size={16} /><span>These are offline evaluation figures on synthetic records, not deployment validation or observed bank performance. Metric availability depends on the held-out sample.</span></div>
  </>
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) { const groups = new Map<string, T[]>(); rows.forEach(row => { const key = getKey(row); const group = groups.get(key) ?? []; group.push(row); groups.set(key, group) }); return groups }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / (values.length || 1) }

export default App

