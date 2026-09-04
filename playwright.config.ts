import { defineConfig, devices } from '@playwright/test';

// story-10 AC2-AC4: smoke test headless chống-flaky — timeout 10s/test + retry 1 lần (EventSource mock qua
// route có thể lệch nhịp trên máy CI chậm). KHÔNG dùng `webServer` của Playwright: 2 static server (host
// page vs widget/API mock) tự khởi trong tests/smoke.spec.ts (beforeAll/afterAll) để mô phỏng đúng kiến
// trúc cross-origin thật (loader.ts §1 — xem Dev Notes story-10).
export default defineConfig({
  testDir: './tests',
  timeout: 10_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
