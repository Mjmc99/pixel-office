import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  // UI checks get more time: shared CI runners can be several times slower than a laptop
  expect: { timeout: 15_000 },
  // on CI, failing tests are also annotated on the GitHub run page
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 800 },
    // PW_CHROMIUM lets you point at a pre-installed browser; otherwise Playwright's own
    launchOptions: {
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      // fake camera + mic so call tests run anywhere, including CI
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
    permissions: ['camera', 'microphone'],
  },
  webServer: { command: 'npx vite --port 5174 --strictPort', port: 5174, reuseExistingServer: true },
})
