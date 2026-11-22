import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const dataFiles = [
  'manifest.json', 'dashboard_summary.json', 'customer_segments.json', 'retention_risk.json',
  'product_opportunities.json', 'opportunity_rankings.json', 'segment_migration.json', 'alerts.json',
  'model_performance.json', 'staff_action_queue.json',
]

const projectRoot = process.cwd()
const analyticsDataRoot = resolve(projectRoot, 'analytics-data')
const pointerCandidates = [resolve(projectRoot, 'analytics', 'current-snapshot.json'), resolve(projectRoot, 'analytics', 'current-snapshot.previous.json')]

async function currentSnapshot() {
  for (const pointerPath of pointerCandidates) {
    try {
      const pointer = JSON.parse(await readFile(pointerPath, 'utf8')) as { schema_version?: string; snapshot_id?: string }
      if (pointer.schema_version !== '1.0.0' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(pointer.snapshot_id ?? '')) continue
      const snapshotDirectory = resolve(analyticsDataRoot, 'snapshots', pointer.snapshot_id!)
      const manifest = JSON.parse(await readFile(resolve(snapshotDirectory, 'manifest.json'), 'utf8')) as { snapshot_id?: string; validation_status?: string }
      if (manifest.snapshot_id !== pointer.snapshot_id || manifest.validation_status !== 'PASS') continue
      if (!await Promise.all(dataFiles.map(file => stat(resolve(snapshotDirectory, file)).then(() => true, () => false))).then(checks => checks.every(Boolean))) continue
      return { pointer: { schema_version: '1.0.0', snapshot_id: pointer.snapshot_id }, snapshotDirectory }
    } catch { /* Continue to the last known-good pointer. */ }
  }
  throw new Error('No validated VALUEBRIDGE 360 data snapshot is available.')
}

function analyticsDataPlugin() {
  return {
    name: 'valuebridge-analytics-data',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
        try {
          if (pathname === '/analytics/current-snapshot.json') {
            const { pointer } = await currentSnapshot()
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.setHeader('Cache-Control', 'no-store')
            response.end(JSON.stringify(pointer))
            return
          }
          const match = pathname.match(/^\/analytics-data\/snapshots\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/([^/]+)$/)
          if (!match || !dataFiles.includes(match[2])) return next()
          const snapshotDirectory = resolve(analyticsDataRoot, 'snapshots', match[1])
          const file = await readFile(resolve(snapshotDirectory, match[2]), 'utf8')
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          response.end(file)
        } catch {
          if (request.url?.startsWith('/analytics/')) {
            response.statusCode = 503
            response.end(JSON.stringify({ error: 'No validated analytics snapshot is available.' }))
            return
          }
          response.statusCode = 404
          response.end(JSON.stringify({ error: 'Analytics file unavailable.' }))
        }
      })
    },
    async closeBundle() {
      const { pointer, snapshotDirectory } = await currentSnapshot()
      const snapshotId = pointer.snapshot_id
      if (!snapshotId) throw new Error('Current snapshot pointer has no identifier.')
      const applicationPointer = resolve(projectRoot, 'dist', 'analytics', 'current-snapshot.json')
      const snapshotDestination = resolve(projectRoot, 'dist', 'analytics-data', 'snapshots', snapshotId)
      await mkdir(resolve(projectRoot, 'dist', 'analytics'), { recursive: true })
      await mkdir(resolve(projectRoot, 'dist', 'analytics-data', 'snapshots'), { recursive: true })
      await writeFile(applicationPointer, `${JSON.stringify(pointer)}\n`, 'utf8')
      await cp(snapshotDirectory, snapshotDestination, { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), analyticsDataPlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/]react(?:-dom)?[\\/]/, priority: 20 },
            { name: 'chart-vendor', test: /node_modules[\\/](?:recharts|d3-[^\\/]+)[\\/]/, priority: 15 },
            { name: 'icon-vendor', test: /node_modules[\\/]lucide-react[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
