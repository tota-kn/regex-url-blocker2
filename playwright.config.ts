import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 4,
  fullyParallel: true,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
})
