import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * §4.4 — ONE accessor decides.
 *
 * The rule is not "most surfaces ask": a surface that forgets is a surface
 * that animates for a buyer who asked it not to. So this walks the picker's
 * own source and insists that every file that starts an animation also reads
 * the preference, and that every duration it hands to that animation came from
 * the motion module rather than from a number typed into the view.
 */

const directory = new URL('../src/picker/', import.meta.url);
const files = readdirSync(directory).filter((name) => /\.tsx?$/.test(name));

function read(name: string): string {
  return readFileSync(new URL(name, directory), 'utf8');
}

const animating = files.filter((name) => /Animated\.(timing|spring|loop|decay)\(/.test(read(name)));

describe('§4.4 reduced motion routes through one accessor', () => {
  it('finds the surfaces that animate at all', () => {
    expect(animating.length).toBeGreaterThan(0);
  });

  it.each(animating)('%s reads the preference before it moves anything', (name) => {
    const source = read(name);
    expect(source).toMatch(/useSeatLayerPickerReducedMotion|reducedMotion/);
  });

  it.each(animating)('%s takes its durations from the motion module, never a literal', (name) => {
    const source = read(name);
    const literals = [...source.matchAll(/duration:\s*([0-9][0-9_.]*)/g)].map((match) => match[1]);
    for (const literal of literals) {
      // A literal is allowed only inside a block the preference has already
      // switched off — those blocks return early under reduced motion, which
      // is what `skipped` means for an effect with no reduced form.
      const at = source.indexOf(`duration: ${literal}`);
      const window = source.slice(Math.max(0, at - 600), at);
      expect(window, `${name} hands ${literal}ms to an animation that never asked`).toMatch(/reducedMotion/);
    }
  });

  it('gives a spring — which has no duration to shorten — a reduced form too', () => {
    for (const name of animating) {
      const source = read(name);
      for (const match of source.matchAll(/Animated\.spring\(/g)) {
        const window = source.slice(Math.max(0, match.index - 500), match.index + 300);
        expect(window, `${name} springs without asking`).toMatch(/reducedMotion/);
      }
    }
  });

  it('keeps the accessor out of the accessibility module, so nobody reads it twice', () => {
    expect(read('a11y.ts')).not.toContain('ReduceMotion');
    expect(read('reducedMotion.ts')).toContain('isReduceMotionEnabled');
  });
});
