import type { Page } from '@playwright/test';

import { type Cell, cellAddress } from './matrix';

const build = new URL('.build/', import.meta.url).href;
const clock = 1_735_689_600_000;

/** Open one cell and let the picker come to rest on a stopped clock. */
export async function openCell(page: Page, cell: Cell): Promise<void> {
  await page.setViewportSize({ width: cell.screen.width, height: cell.screen.height });
  await page.goto(build + cellAddress(cell));
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.clock.runFor(5_000);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The picker reads the time, and nothing in a picture may depend on it. */
export async function stopClock(page: Page): Promise<void> {
  await page.clock.install({ time: clock });
  await page.clock.pauseAt(clock + 1_000);
}
