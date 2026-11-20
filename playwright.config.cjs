const { defineConfig } = require('playwright/test');

const profiles = [
  ['desktop-1920x1080', 1920, 1080],
  ['laptop-1366x768', 1366, 768],
  ['tablet-portrait-768x1024', 768, 1024],
  ['tablet-landscape-1024x768', 1024, 768],
  ['mobile-portrait-390x844', 390, 844],
  ['mobile-landscape-844x390', 844, 390],
];

module.exports = defineConfig({
  testDir: './tests/device-preview',
  outputDir: './artifacts/device-preview-results',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: './artifacts/device-preview-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://ccai.ur-project.biz:4173',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      args: [
        '--no-proxy-server',
        '--host-resolver-rules=MAP ccai.ur-project.biz 127.0.0.1',
        '--unsafely-treat-insecure-origin-as-secure=http://ccai.ur-project.biz:4173',
      ],
    },
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: profiles.map(([name, width, height]) => ({
    name,
    use: { viewport: { width, height }, deviceScaleFactor: 1, isMobile: width <= 500, hasTouch: width <= 500 },
  })),
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
