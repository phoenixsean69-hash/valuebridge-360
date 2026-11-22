import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const screenshotDir = resolve('analytics/reports/stage2-screenshots')
const navButton = (page, name) => page.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
async function currentSnapshotDirectory() {
  const pointer = JSON.parse(await readFile(resolve('analytics/current-snapshot.json'), 'utf8'))
  return resolve('analytics-data', 'snapshots', pointer.snapshot_id)
}

async function emptyDataFixtures() {
  const names = ['manifest', 'dashboard_summary', 'customer_segments', 'retention_risk', 'product_opportunities', 'opportunity_rankings', 'segment_migration', 'alerts', 'model_performance', 'staff_action_queue']
  const directory = await currentSnapshotDirectory()
  const files = Object.fromEntries(await Promise.all(names.map(async name => [name, JSON.parse(await readFile(resolve(directory, `${name}.json`), 'utf8'))])))
  files.manifest.customer_count = 0; files.manifest.account_count = 0; files.manifest.transaction_count = 0
  Object.assign(files.dashboard_summary.summary, { customer_count: 0, account_count: 0, active_customers: 0, at_risk_customers: 0, high_value_customers: 0, potential_opportunities: 0 })
  files.customer_segments.customers = []; files.customer_segments.segments.forEach(segment => Object.assign(segment, { customer_count: 0, percentage: 0, average_recency_days: 0, average_frequency: 0, average_monetary_score: 0 }))
  files.retention_risk.customers = []; files.retention_risk.monthly_trends = []
  files.product_opportunities.recommendations = []; files.opportunity_rankings.rankings = []
  files.segment_migration.periods = []; files.segment_migration.transitions = []; files.alerts.alerts = []; files.staff_action_queue.actions = []
  return Object.fromEntries(Object.entries(files).map(([name, value]) => [`${name}.json`, value]))
}

test('Stage 2 dashboard panels, interactions, persistence and responsive layouts', async ({ page, browser }) => {
  await mkdir(screenshotDir, { recursive: true })
  const consoleErrors = []
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`) })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
  await expect(page.locator('.kpi-card')).toHaveCount(4)
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible()
  await expect(page.locator('.recharts-pie-sector').first()).toBeVisible()
  await expect(page.locator('.segment-legend-row')).toHaveCount(6)
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  await expect(page.locator('.table-card tbody tr')).toHaveCount(10)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, '01-main-dashboard.png'), fullPage: false, animations: 'disabled' })
  await page.screenshot({ path: resolve(screenshotDir, '02-customer-value-segments.png'), fullPage: false, animations: 'disabled' })

  const search = page.getByPlaceholder('Search customer ID or segment')
  await search.fill('CUST-00001')
  await expect(page.locator('.table-card tbody tr')).toHaveCount(1)
  await page.locator('.table-card tbody tr').first().focus()
  await page.locator('.table-card tbody tr').first().press('Enter')
  await expect(page.getByRole('dialog')).toContainText('Relative monetary activity score')
  await page.getByRole('button', { name: 'Close details' }).click()
  await search.fill('NO-MATCH')
  await expect(page.getByText('No matching records')).toBeVisible()
  await expect(page.getByText('0 records')).toBeVisible()
  await search.fill('')
  await page.locator('.section-heading .filter-select select').first().selectOption('CHAMPIONS')
  expect((await page.locator('.table-card tbody tr').allTextContents()).every(row => row.includes('Champions'))).toBe(true)
  await page.locator('.section-heading .filter-select select').first().selectOption('All')
  await page.getByRole('button', { name: 'Recency' }).click()
  await expect(page.getByRole('button', { name: /Recency ↑/ })).toBeVisible()
  const sortedRecencies = (await page.locator('.table-card tbody tr td:nth-child(3)').allTextContents()).map(text => Number.parseInt(text, 10))
  expect(sortedRecencies).toEqual([...sortedRecencies].sort((a, b) => a - b))
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.locator('.page-number')).toContainText('2 /')

  await navButton(page, 'Retention & Risk Monitor').click()
  await expect(page.getByRole('heading', { name: 'Retention & Risk Monitor' })).toBeVisible()
  expect(await page.locator('svg.recharts-surface').count()).toBeGreaterThanOrEqual(4)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, '03-retention-and-risk-monitor.png'), fullPage: false, animations: 'disabled' })
  await page.getByRole('button', { name: /How it works/ }).click()
  await expect(page.getByRole('dialog')).toContainText('40%')
  await expect(page.getByRole('dialog')).toContainText('not a probability of customer departure')
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByPlaceholder('Search customer ID, category or reason').fill('CUST-00001')
  await page.locator('.table-card tbody tr').first().click()
  await expect(page.getByRole('dialog')).toContainText('Customer Deterioration Index')
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByPlaceholder('Search customer ID, category or reason').fill('')
  await page.locator('.section-heading .filter-select select').last().selectOption('HIGH')
  await expect(page.locator('.table-card tbody tr').first()).toContainText('HIGH')

  await navButton(page, 'Next-Best-Product List').click()
  await expect(page.getByText('CANDIDATE — pending staff eligibility and suitability review.').first()).toBeVisible()
  expect(await page.locator('svg.recharts-surface').count()).toBeGreaterThanOrEqual(2)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, '04-next-best-product-list.png'), fullPage: false, animations: 'disabled' })
  await page.locator('.section-heading .filter-select select').selectOption({ index: 1 })
  await expect(page.locator('.table-card .result-count')).not.toContainText('0 records')
  await page.locator('.section-heading .filter-select select').selectOption('All')
  await page.getByPlaceholder('Search customer ID or product').fill('CUST-00001')
  await page.locator('.table-card tbody tr').first().click()
  await expect(page.getByRole('dialog')).toContainText('pending staff eligibility and suitability review')
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByPlaceholder('Search customer ID or product').fill('')

  await navButton(page, 'Opportunity Ranking').click()
  await expect(page.getByRole('heading', { name: 'Opportunity Ranking', exact: true })).toBeVisible()
  expect(await page.locator('svg.recharts-surface').count()).toBeGreaterThanOrEqual(3)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, '05-opportunity-ranking.png'), fullPage: false, animations: 'disabled' })
  await page.locator('.section-heading .filter-select select').first().selectOption('Champions')
  await expect(page.locator('.table-card tbody tr').first()).toContainText('Champions')
  await page.getByPlaceholder('Search customer ID, segment or product').fill('CUST-00001')
  await page.locator('.table-card tbody tr').first().click()
  await expect(page.getByRole('dialog')).toContainText('Relative prioritisation score')
  await page.getByRole('button', { name: 'Close details' }).click()

  await navButton(page, 'Migration & Alerts').click()
  await expect(page.getByRole('heading', { name: 'Migration & Alerts' })).toBeVisible()
  expect(await page.locator('svg.recharts-surface').count()).toBeGreaterThanOrEqual(1)
  await expect(page.locator('.matrix-table tbody tr')).toHaveCount(6)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, '06-migration-and-alerts.png'), fullPage: false, animations: 'disabled' })
  await page.getByPlaceholder('Search alert ID, customer or description').fill('ALT-00001')
  await page.locator('.table-card tbody tr').first().click()
  await expect(page.getByRole('dialog')).toContainText('CDI_DETERIORATION')
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByPlaceholder('Search alert ID, customer or description').fill('')

  await navButton(page, 'Decision & Performance Centre').click()
  await expect(page.getByRole('heading', { name: 'Decision & Performance Centre' })).toBeVisible()
  const evaluatedBaseline = page.getByRole('row', { name: /Naive Recency Baseline/ })
  await expect(evaluatedBaseline).toContainText(/\d\.\d{3}/)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, '07-decision-and-performance-centre.png'), fullPage: false, animations: 'disabled' })
  await page.getByRole('button', { name: 'Add action' }).click()
  await page.getByPlaceholder('CUST-00001').fill('CUST-00001')
  await page.getByRole('button', { name: 'Create action' }).click()
  await expect(page.getByRole('status')).toContainText('Staff action added')
  const actionSearch = page.getByPlaceholder('Search action ID, customer or notes')
  await actionSearch.fill('ACT-01201')
  const actionRow = page.locator('.table-card tbody tr').filter({ hasText: 'ACT-01201' })
  await expect(actionRow).toBeVisible()
  await actionRow.locator('.notes-input').fill('QA persistence note')
  await actionRow.locator('.table-select').nth(0).selectOption('HIGH')
  await actionRow.locator('.table-select').nth(1).selectOption('IN_PROGRESS')
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('valuebridge360.staffActions.v1') || '[]').find(item => item.action_id === 'ACT-01201'))).toMatchObject({ notes: 'QA persistence note', priority: 'HIGH', review_status: 'IN_PROGRESS' })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
  await navButton(page, 'Decision & Performance Centre').click()
  await actionSearch.fill('ACT-01201')
  const reloadedAction = page.locator('.table-card tbody tr').filter({ hasText: 'ACT-01201' })
  await expect(reloadedAction.locator('.notes-input')).toHaveValue('QA persistence note')
  await expect(reloadedAction.locator('.table-select').nth(0)).toHaveValue('HIGH')
  await expect(reloadedAction.locator('.table-select').nth(1)).toHaveValue('IN_PROGRESS')

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const isMobileNav = viewport.width <= 850
    if (isMobileNav) {
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
      await expect(page.locator('.sidebar')).toHaveAttribute('aria-hidden', 'true')
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
      await expect(page.locator('.sidebar')).toHaveAttribute('aria-hidden', 'false')
      await navButton(page, 'Customer Value Segments').click()
      await expect(page.locator('.sidebar')).toHaveAttribute('aria-hidden', 'true')
      await expect.poll(async () => (await page.locator('.sidebar').boundingBox())?.x ?? 0).toBeLessThanOrEqual(-210)
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
      await navButton(page, 'Customer Value Segments').click()
    }
    await expect(page.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible()
    await expect(page.locator('.segment-pie-frame .recharts-pie-sector')).toHaveCount(6)
    const layout = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth, sidebar: getComputedStyle(document.querySelector('.sidebar')).transform, kpiColumns: getComputedStyle(document.querySelector('.kpi-grid')).gridTemplateColumns.split(' ').length, chart: document.querySelector('svg.recharts-surface').getBoundingClientRect().width, tableClient: document.querySelector('.table-scroll').clientWidth, tableScroll: document.querySelector('.table-scroll').scrollWidth }))
    expect(layout.body).toBeLessThanOrEqual(layout.viewport + 1)
    expect(layout.kpiColumns).toBe(viewport.width <= 600 ? 2 : 4)
    expect(layout.chart).toBeGreaterThan(0)
    if (viewport.width <= 600) expect(layout.tableScroll).toBeGreaterThan(layout.tableClient)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: resolve(screenshotDir, `responsive-${viewport.width}x${viewport.height}.png`), fullPage: false, animations: 'disabled' })
  }

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])

  const invalidStorageContext = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const invalidStoragePage = await invalidStorageContext.newPage()
  await invalidStoragePage.addInitScript(() => localStorage.setItem('valuebridge360.staffActions.v1', '{invalid json'))
  await invalidStoragePage.goto('/')
  await expect(invalidStoragePage.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
  await navButton(invalidStoragePage, 'Decision & Performance Centre').click()
  await expect(invalidStoragePage.locator('.table-card tbody tr').first()).toContainText('ACT-00001')
  await invalidStorageContext.close()

  const nullMetricsContext = await browser.newContext()
  const nullMetricsPage = await nullMetricsContext.newPage()
  const nullMetrics = JSON.parse(await readFile(resolve(await currentSnapshotDirectory(), 'model_performance.json'), 'utf8'))
  nullMetrics.models[0].roc_auc = null
  await nullMetricsPage.route('**/analytics-data/snapshots/**/model_performance.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(nullMetrics) }))
  await nullMetricsPage.goto('/')
  await navButton(nullMetricsPage, 'Decision & Performance Centre').click()
  await expect(nullMetricsPage.getByRole('row', { name: /Naive Recency Baseline/ }).getByText('Not yet evaluated')).toBeVisible()
  await nullMetricsContext.close()

  const missingContext = await browser.newContext()
  const missingPage = await missingContext.newPage()
  await missingPage.route('**/analytics-data/snapshots/**/manifest.json', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"missing"}' }))
  await missingPage.goto('/')
  await expect(missingPage.getByText('Analytics data unavailable', { exact: true })).toBeVisible()
  await missingContext.close()

  const emptyContext = await browser.newContext()
  const emptyPage = await emptyContext.newPage()
  const fixtures = await emptyDataFixtures()
  await emptyPage.route('**/analytics-data/snapshots/**/*.json', route => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtures[filename]) })
  })
  await emptyPage.goto('/')
  await expect(emptyPage.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
  await navButton(emptyPage, 'Migration & Alerts').click()
  await expect(emptyPage.getByText('No matching records')).toBeVisible()
  await expect(emptyPage.getByText('0 records')).toBeVisible()
  await emptyContext.close()

  const malformedContext = await browser.newContext()
  const malformedPage = await malformedContext.newPage()
  let returnMalformed = true
  await malformedPage.route('**/analytics-data/snapshots/**/manifest.json', route => {
    if (returnMalformed) { returnMalformed = false; return route.fulfill({ contentType: 'application/json', body: '{bad json' }) }
    return route.continue()
  })
  await malformedPage.goto('/')
  await expect(malformedPage.getByText('Analytics data unavailable', { exact: true })).toBeVisible()
  await malformedPage.getByRole('button', { name: 'Retry loading' }).click()
  await expect(malformedPage.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
  await malformedContext.close()

  const schemaContext = await browser.newContext()
  const schemaPage = await schemaContext.newPage()
  const unsupportedManifest = JSON.parse(await readFile(resolve(await currentSnapshotDirectory(), 'manifest.json'), 'utf8'))
  unsupportedManifest.schema_version = '99.0.0'
  await schemaPage.route('**/analytics-data/snapshots/**/manifest.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(unsupportedManifest) }))
  await schemaPage.goto('/')
  await expect(schemaPage.getByText(/unsupported manifest schema/)).toBeVisible()
  await schemaContext.close()

  const invalidContext = await browser.newContext()
  const invalidPage = await invalidContext.newPage()
  const invalidCustomers = JSON.parse(await readFile(resolve(await currentSnapshotDirectory(), 'customer_segments.json'), 'utf8'))
  invalidCustomers.customers[0].recency_days = -1
  await invalidPage.route('**/analytics-data/snapshots/**/customer_segments.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(invalidCustomers) }))
  await invalidPage.goto('/')
  await expect(invalidPage.getByText(/invalid or duplicate customer records/)).toBeVisible()
  await invalidContext.close()

  const optionalContext = await browser.newContext()
  const optionalPage = await optionalContext.newPage()
  const optionalManifest = JSON.parse(await readFile(resolve(await currentSnapshotDirectory(), 'manifest.json'), 'utf8'))
  delete optionalManifest.source_observation_period
  delete optionalManifest.processing_version
  await optionalPage.route('**/analytics-data/snapshots/**/manifest.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(optionalManifest) }))
  await optionalPage.goto('/')
  await expect(optionalPage.getByRole('heading', { name: 'Customer Value Segments' })).toBeVisible()
  await optionalContext.close()

  const offlineContext = await browser.newContext()
  const offlinePage = await offlineContext.newPage()
  const externalRequests = []
  await offlinePage.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4173') return route.continue()
    externalRequests.push(route.request().url())
    return route.abort()
  })
  await offlinePage.goto('/')
  for (const panel of ['Retention & Risk Monitor', 'Next-Best-Product List', 'Opportunity Ranking', 'Migration & Alerts', 'Decision & Performance Centre', 'Customer Value Segments']) {
    await navButton(offlinePage, panel).click()
    await expect(offlinePage.getByRole('heading', { name: panel, exact: true })).toBeVisible()
  }
  expect(externalRequests).toEqual([])
  await offlineContext.close()
})
