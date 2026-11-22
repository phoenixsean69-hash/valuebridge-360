import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const installedChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(installedChrome) ? { executablePath: installedChrome } : {},
    viewport: { width: 1920, height: 1080 },
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
