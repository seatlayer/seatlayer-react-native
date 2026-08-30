import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { seatLayerSdkVersion } from '../src/types';

describe('package version metadata', () => {
  it('keeps the runtime-reported SDK version aligned with package.json', async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: string };

    expect(manifest.version).toBeDefined();
    expect(seatLayerSdkVersion).toBe(manifest.version);
  });
});
