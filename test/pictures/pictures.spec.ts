import { expect, test } from '@playwright/test';

import { cellName, pictureCells } from './matrix';
import { openCell, stopClock } from './open';

test.describe('pictures', () => {
  // The recorded pictures are the CI machine's. Elsewhere text is drawn a
  // little differently, so nothing is compared.
  test.skip(process.env.PICTURES_COMPARE !== '1', 'compared on CI');

  for (const cell of pictureCells) {
    test(cellName(cell), async ({ page }) => {
      await stopClock(page);
      await openCell(page, cell);
      await expect(page).toHaveScreenshot(`${cellName(cell)}.png`);
    });
  }
});
