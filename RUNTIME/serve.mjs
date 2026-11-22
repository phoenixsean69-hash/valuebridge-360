import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appRoot = resolve(root, 'APPLICATION')
const dataRoot = resolve(root, 'DATA', 'analytics-data')
const pointerFile = resolve(root, 'DATA', 'analytics', 'current-snapshot.json')
const previousPointerFile = resolve(root, 'DATA', 'analytics', 'current-snapshot.previous.json')
const dataFiles = new Set(['manifest.json', 'dashboard_summary.json', 'customer_segments.json', 'retention_risk.json', 'product_opportunities.json', 'opportunity_rankings.json', 'segment_migration.json', 'alerts.json', 'model_performance.json', 'staff_action_queue.json'])
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' }
const port = Number(process.env.VALUEBRIDGE_PORT || 4174)

async function activeSnapshot() {
  for (const file of [pointerFile, previousPointerFile]) {
    try {
      const pointer = JSON.parse(await readFile(file, 'utf8'))
      const id = pointer.snapshot_id
      if (pointer.schema_version !== '1.0.0' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id || '')) continue
      const dir = resolve(dataRoot, 'snapshots', id)
      const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'))
      if (manifest.snapshot_id !== id || manifest.validation_status !== 'PASS' || manifest.data_mode !== 'competition' || manifest.customer_id_display !== 'Original CSV Customer ID') continue
      await Promise.all([...dataFiles].map(name => stat(resolve(dir, name))))
      return { id, dir }
    } catch { /* Try last known-good pointer. */ }
  }
  throw new Error('No validated analytics snapshot is available.')
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname)
    if (pathname === '/__valuebridge_health') {
      const { id } = await activeSnapshot()
      return send(res, 200, JSON.stringify({ ok: true, snapshot_id: id, source: 'BancABC 2026 CSV', original_customer_ids: true }), 'application/json; charset=utf-8')
    }
    const evidenceMatch = pathname.match(/^\/source-transactions\/([0-9]{1,12})$/)
    if (evidenceMatch) {
      const customerId = evidenceMatch[1]
      const active = await activeSnapshot()
      const manifest = JSON.parse(await readFile(resolve(active.dir, 'manifest.json'), 'utf8'))
      if (manifest.data_mode !== 'competition' || manifest.source_transactions_available !== true)
        return send(res, 404, 'Source transaction evidence is not available.')
      const bucket = String(Number(customerId) % 128).padStart(3, '0')
      const file = resolve(active.dir, 'transactions', `tx-${bucket}.json`)
      const allRows = JSON.parse(await readFile(file, 'utf8'))
      if (!Object.prototype.hasOwnProperty.call(allRows, customerId)) return send(res, 404, 'Customer ID not in source CSV.')
      const records = allRows[customerId]
      return send(res, 200, JSON.stringify({ customer_id: customerId, count: records.length, records }), 'application/json; charset=utf-8')
    }
    if (pathname === '/analytics/current-snapshot.json') {
      const { id } = await activeSnapshot()
      return send(res, 200, JSON.stringify({ schema_version: '1.0.0', snapshot_id: id }), 'application/json; charset=utf-8')
    }
    const match = pathname.match(/^\/analytics-data\/snapshots\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/([^/]+)$/)
    if (match && dataFiles.has(match[2])) {
      const active = await activeSnapshot()
      if (match[1] !== active.id) return send(res, 404, 'Snapshot is not active.')
      return send(res, 200, await readFile(resolve(active.dir, match[2])), 'application/json; charset=utf-8')
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    const file = resolve(appRoot, relative)
    if (file !== appRoot && !file.startsWith(appRoot + sep)) return send(res, 400, 'Invalid path.')
    const info = await stat(file)
    if (!info.isFile()) return send(res, 404, 'Not found.')
    return send(res, 200, await readFile(file), mime[extname(file).toLowerCase()] || 'application/octet-stream')
  } catch (error) {
    if (error?.code === 'EADDRINUSE') return
    send(res, 404, 'The requested local file is unavailable.')
  }
})

server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Close the other application or set VALUEBRIDGE_PORT to an available port.`)
    process.exitCode = 1
  } else {
    console.error(error)
    process.exitCode = 1
  }
})

server.listen(port, '127.0.0.1', async () => {
  const address = `http://127.0.0.1:${port}/`
  console.log(`VALUEBRIDGE 360 is running at ${address}`)
  console.log('Keep this window open during the demonstration. Press Ctrl+C to stop the local server.')
  try { await activeSnapshot() } catch (error) { console.error(error.message); server.close(); process.exitCode = 1; return }
  if (process.env.VALUEBRIDGE_NO_BROWSER !== '1') {
    const cmdExe = resolve(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    const child = spawn(cmdExe, ['/d', '/s', '/c', 'start', '""', address], { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => console.log(`Open this address in your browser: ${address}`))
  }
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
