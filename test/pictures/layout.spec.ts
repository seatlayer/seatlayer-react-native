import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { cellName, layoutCells, sideways, upright } from './matrix';
import { openCell, stopClock } from './open';

/**
 * What the layout checks find today: for each finding, the number of cells it
 * is in on each screen. A change that adds one fails, and so does a change
 * that mends one and leaves it here.
 * `UPDATE_KNOWN=1 pnpm pictures` writes the file again.
 */
const knownPath = new URL('known-layout.json', import.meta.url);
type Counts = Record<string, Record<string, number>>;
const known = JSON.parse(readFileSync(knownPath, 'utf8')) as Counts;
const update = process.env.UPDATE_KNOWN === '1';
const found: Counts = {};

/** Where the picker asks over the map, what is under it is out of reach. */
const asking = new Set(['confirmation', 'table-card', 'general-admission', 'variable-table']);

for (const screen of [...upright, ...sideways]) {
  test(`layout ${screen.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await stopClock(page);
    const cellsOf = new Map<string, string[]>();
    for (const cell of layoutCells.filter((candidate) => candidate.screen === screen)) {
      await openCell(page, cell);
      const findings = await page.evaluate(readLayout, {
        asking: asking.has(cell.scenario),
        bottom: screen.bottom,
        side: screen.side ?? 0,
        top: screen.top,
      });
      for (const finding of findings) {
        cellsOf.set(finding, [...(cellsOf.get(finding) ?? []), cellName(cell)]);
      }
    }
    const wrong: string[] = [];
    for (const [finding, names] of cellsOf) {
      (found[finding] ??= {})[screen.name] = names.length;
      const before = known[finding]?.[screen.name] ?? 0;
      if (names.length !== before) {
        wrong.push(`${finding}: ${names.length} cells, was ${before}: ${names.join(', ')}`);
      }
    }
    for (const [finding, screens] of Object.entries(known)) {
      if (screens[screen.name] !== undefined && !cellsOf.has(finding)) {
        wrong.push(`${finding}: mended on ${screen.name}, take it out`);
      }
    }
    if (!update) expect(wrong).toEqual([]);
  });
}

test.afterAll(() => {
  if (!update) return;
  const sorted = Object.fromEntries(
    Object.entries(found).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
  writeFileSync(knownPath, `${JSON.stringify(sorted, null, 2)}\n`);
});

/** Runs in the page. Every finding is one sentence without a coordinate. */
function readLayout(inset: {
  asking: boolean;
  bottom: number;
  side: number;
  top: number;
}): string[] {
  const findings = new Set<string>();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const label = (element: Element) =>
    (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40) ||
    element.getAttribute('data-testid') || 'unnamed';
  const shown = (element: Element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 &&
      getComputedStyle(element).visibility !== 'hidden';
  };
  const scrolled = (element: Element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(parent);
      if (/auto|scroll/.test(overflowX) || /auto|scroll/.test(overflowY)) return true;
    }
    return false;
  };
  if (document.scrollingElement!.scrollWidth > width) findings.add('page: wider than the screen');

  const anyControl = '[role=button],[role=switch],[role=radio],[role=checkbox]';
  const controls = [...document.querySelectorAll(anyControl)].filter(shown);
  for (const control of controls) {
    const box = control.getBoundingClientRect();
    if (scrolled(control)) continue;
    if (box.left < inset.side - 0.5 || box.right > width - inset.side + 0.5 ||
      box.top < inset.top - 0.5 || box.bottom > height - inset.bottom + 0.5) {
      findings.add(`${label(control)}: outside the safe area`);
    }
    if (control.getAttribute('aria-disabled') === 'true') continue;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    // A sheet or a scrim over a control is meant to be there; another control
    // on top of it is not.
    const over = inset.asking ? undefined : hit?.closest(anyControl);
    if (over && over !== control && !control.contains(over) && !over.contains(control)) {
      findings.add(`${label(control)}: under ${label(over)}`);
    }
    const slop = JSON.parse(control.getAttribute('data-slop') ?? '{}') as Record<string, number>;
    if (box.width + (slop.left ?? 0) + (slop.right ?? 0) < 43.5 ||
      box.height + (slop.top ?? 0) + (slop.bottom ?? 0) < 43.5) {
      findings.add(`${label(control)}: touch area under 44`);
    }
  }

  for (const text of document.querySelectorAll('[dir=auto]')) {
    if (!shown(text) || !text.textContent?.trim()) continue;
    if (text.closest('[data-testid=seatlayer-visual-fixture-map]')) continue;
    const box = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    if (style.textOverflow === 'ellipsis' && text.scrollWidth > text.clientWidth + 2) {
      findings.add(`${label(text)}: text ends in …`);
    }
    let parent = text.parentElement;
    while (parent && parent !== document.body) {
      const clip = getComputedStyle(parent);
      if (clip.overflowY === 'hidden' && !/auto|scroll/.test(clip.overflowX)) {
        const edge = parent.getBoundingClientRect();
        if (box.bottom > edge.bottom + 1.5 || box.top < edge.top - 1.5) {
          findings.add(`${label(text)}: cut at the top or bottom`);
        }
        break;
      }
      if (/auto|scroll/.test(clip.overflowY)) break;
      parent = parent.parentElement;
    }
  }
  return [...findings].sort();
}
