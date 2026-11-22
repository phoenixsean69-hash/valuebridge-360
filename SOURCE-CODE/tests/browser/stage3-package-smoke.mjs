import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseURL = process.env.VALUEBRIDGE_BASE_URL || 'http://127.0.0.1:4173'
const screenshotDir = resolve('analytics/reports/stage3-screenshots')
const panels = [
  'Customer Value Segments', 'Retention & Risk Monitor', 'Next-Best-Product List',
  'Opportunity Ranking', 'Migration & Alerts', 'Decision & Performance Centre',
]
await mkdir(screenshotDir, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const externalRequests = []
await context.route('**/*', route => {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
  externalRequests.push(url.href)
  return route.abort()
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
await page.goto(baseURL, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: panels[0] }).waitFor()
await page.locator('svg.recharts-surface').first().waitFor()
await page.screenshot({ path: resolve(screenshotDir, '01-main-dashboard.png'), animations: 'disabled' })
for (let i = 0; i < panels.length; i++) {
  const name = panels[i]
  await page.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  await page.getByRole('heading', { name, exact: true }).waitFor()
  if (i < 5) await page.locator('svg.recharts-surface').first().waitFor()
  await page.locator('.table-card').first().waitFor()
  const filename = `${String(i + 2).padStart(2, '0')}-${['customer-value-segments','retention-and-risk-monitor','next-best-product-list','opportunity-ranking','migration-and-alerts','decision-and-performance-centre'][i]}.png`
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(screenshotDir, filename), animations: 'disabled' })
}
await page.getByRole('button', { name: 'Add action' }).click()
await page.getByPlaceholder('CUST-00001').fill('CUST-00001')
await page.getByRole('button', { name: 'Create action' }).click()
const actionSearch = page.getByPlaceholder('Search action ID, customer or notes')
await actionSearch.fill('ACT-01201')
const action = page.locator('.table-card tbody tr').filter({ hasText: 'ACT-01201' })
await action.locator('.notes-input').fill('Extracted package persistence check')
await action.locator('.table-select').nth(0).selectOption('HIGH')
await action.locator('.table-select').nth(1).selectOption('IN_PROGRESS')
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Decision & Performance Centre/ }).click()
await page.getByPlaceholder('Search action ID, customer or notes').fill('ACT-01201')
const persisted = page.locator('.table-card tbody tr').filter({ hasText: 'ACT-01201' })
await persisted.locator('.notes-input').waitFor()
if (await persisted.locator('.notes-input').inputValue() !== 'Extracted package persistence check') throw new Error('Action notes did not persist after refresh')
if (await persisted.locator('.table-select').nth(0).inputValue() !== 'HIGH') throw new Error('Action priority did not persist after refresh')
if (await persisted.locator('.table-select').nth(1).inputValue() !== 'IN_PROGRESS') throw new Error('Action review status did not persist after refresh')
const responsive = []
await page.getByRole('button', { name: /Customer Value Segments/ }).click()
for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport)
  await page.getByRole('heading', { name: 'Customer Value Segments', exact: true }).waitFor()
  await page.waitForTimeout(350)
  const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, kpiColumns: getComputedStyle(document.querySelector('.kpi-grid')).gridTemplateColumns.split(' ').length, chartWidth: document.querySelector('svg.recharts-surface').getBoundingClientRect().width }))
  if (metrics.document > metrics.viewport + 1 || metrics.chartWidth <= 0) throw new Error(`Responsive layout failed at ${viewport.width}: ${JSON.stringify(metrics)}`)
  responsive.push(metrics)
}
await page.setViewportSize({ width: 390, height: 844 })
await page.getByRole('button', { name: 'Open navigation' }).click()
await page.getByRole('navigation', { name: 'Primary navigation' }).waitFor()
await page.getByRole('button', { name: /Customer Value Segments/ }).click()
await page.getByRole('heading', { name: 'Customer Value Segments', exact: true }).waitFor()
if (await page.locator('.sidebar').getAttribute('aria-hidden') !== 'true') throw new Error('Mobile navigation did not close after selecting a panel')
for (const storedValue of ['{invalid json', JSON.stringify([{ action_id: 'bad-row' }])]) {
  const recoveryContext = await browser.newContext()
  const recoveryPage = await recoveryContext.newPage()
  await recoveryPage.addInitScript(value => localStorage.setItem('valuebridge360.staffActions.v1', value), storedValue)
  await recoveryPage.goto(baseURL, { waitUntil: 'networkidle' })
  await recoveryPage.getByRole('button', { name: /Decision & Performance Centre/ }).click()
  await recoveryPage.getByPlaceholder('Search action ID, customer or notes').fill('ACT-00001')
  await recoveryPage.locator('.table-card tbody tr').filter({ hasText: 'ACT-00001' }).waitFor()
  await recoveryContext.close()
}
if (errors.length || externalRequests.length) throw new Error(JSON.stringify({ errors, externalRequests }))
console.log(JSON.stringify({ status: 'PASS', panels, responsive, mobileNavigation: 'PASS', actionPersistence: 'PASS', malformedAndInvalidStorageRecovery: 'PASS', externalRequests: 0, consoleErrors: errors.length, screenshotDir }, null, 2))
await context.close()
await browser.close()
