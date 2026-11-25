import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '.results',
  snapshotPathTemplate: '{testDir}/recorded/{arg}{ext}',
  // One process: the layout checks share one list of findings.
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    deviceScaleFactor: 1,
    // Text is as wide on every machine as its font says.
    launchOptions: { args: ['--font-render-hinting=none'] },
  },
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
});
