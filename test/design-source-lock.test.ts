import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { seatLayerPickerLocaleSourceSha256 } from '../src/picker/strings.g';
import { seatLayerPickerTokenSourceSha256 } from '../src/picker/tokens.g';

const designDirectory = join(process.cwd(), 'design');
const tokensPath = join(designDirectory, 'tokens.json');
const localeStringsPath = join(designDirectory, 'locale_strings.json');
const sourceLockPath = join(designDirectory, 'source-lock.json');

interface DesignSourceLock {
  readonly version?: number;
  readonly tokensSha256?: string;
  readonly localeStringsSha256?: string;
}

async function sha256OfFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function readSourceLock(): Promise<DesignSourceLock> {
  return JSON.parse(await readFile(sourceLockPath, 'utf8')) as DesignSourceLock;
}

describe('design source lock', () => {
  it('pins the copied design inputs to the approved cross-platform shas', async () => {
    const lock = await readSourceLock();
    expect(lock.version).toBe(1);
    expect(await sha256OfFile(tokensPath)).toBe(lock.tokensSha256);
    expect(await sha256OfFile(localeStringsPath)).toBe(lock.localeStringsSha256);
  });

  it('keeps the generated picker output on the locked inputs', async () => {
    const lock = await readSourceLock();
    expect(seatLayerPickerTokenSourceSha256).toBe(lock.tokensSha256);
    expect(seatLayerPickerLocaleSourceSha256).toBe(lock.localeStringsSha256);
  });

  it('ships the copied specification alongside the machine-read inputs', async () => {
    const [components, spec] = await Promise.all([
      readFile(join(designDirectory, 'components.md'), 'utf8'),
      readFile(join(designDirectory, 'picker-spec.md'), 'utf8'),
    ]);
    expect(components.length).toBeGreaterThan(0);
    expect(spec.length).toBeGreaterThan(0);
  });
});
