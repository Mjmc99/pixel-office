import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 800 },
    // PW_CHROMIUM lets you point at a pre-installed browser; otherwise Playwright's own
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: { command: 'npx vite --port 5174 --strictPort', port: 5174, reuseExistingServer: true },
})
