import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configured = process.env.VALUEBRIDGE_PYTHON
const candidates = [
  ...(configured ? [configured] : []),
  resolve(root, '.venv', 'Scripts', 'python.exe'),
  resolve(root, '.venv', 'bin', 'python'),
]
const executable = candidates.find(path => existsSync(path))
if (!executable) {
  console.error('VALUEBRIDGE Python runtime not found. Create the project .venv or set VALUEBRIDGE_PYTHON to a Python 3.11+ executable.')
  process.exit(2)
}
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node analytics/python_runtime.mjs <python arguments>')
  process.exit(2)
}
const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true })
if (result.error) {
  console.error(`Could not start the configured Python runtime: ${result.error.message}`)
  process.exit(2)
}
process.exit(result.status ?? 1)
