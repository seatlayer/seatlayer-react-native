import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createSeatLayerPickerStringResolver,
  formatSeatLayerPickerString,
  translateSeatLayerPickerString,
} from '../src/picker/locale';
import {
  seatLayerPickerLocaleSourceSha256,
  seatLayerPickerLocaleStrings,
} from '../src/picker/strings.g';
import {
  seatLayerPickerTokenSourceSha256,
  seatLayerPickerTokens,
} from '../src/picker/tokens.g';
import {
  deriveSeatLayerPickerOnAccent,
  resolveSeatLayerPickerTheme,
} from '../src/picker/theme';

const generator = join(process.cwd(), 'scripts/generate-picker-design.mjs');
const designDirectory = join(process.cwd(), 'design');
const canonicalTokens = join(designDirectory, 'tokens.json');
const canonicalStrings = join(designDirectory, 'locale_strings.json');
const canonicalSourceLock = join(designDirectory, 'source-lock.json');
const generatedDirectory = join(process.cwd(), 'src/picker');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function sha256(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seatlayer-picker-design-'));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, 'tokens.json'), JSON.stringify({
    $schema: 'https://example.invalid/schema.json',
    description: 'Process-only prose that must not be shipped',
    version: 7,
    size: { minimumHitTarget: 44, phoneBreakpoint: 640 },
    radius: { button: 8, card: 18 },
    strings: { close: 'Close' },
    color: {
      light: { accent: '#111111', divider: '#80112233' },
      dark: { accent: '#eeeeee', divider: '#3DA5AEC2' },
    },
  }));
  await writeFile(join(directory, 'strings.json'), JSON.stringify({ strings: { en: { welcome: 'Welcome {name}' } } }));
  return directory;
}

function generate(tokens: string, strings: string, output: string, check = false): void {
  execFileSync(process.execPath, [generator, '--tokens', tokens, '--strings', strings, '--out-dir', output, ...(check ? ['--check'] : [])], { stdio: 'pipe' });
}

describe('picker design generator', () => {
  it('exposes repository-local generate and no-write check commands', async () => {
    const manifest = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string | undefined>;
    };
    expect(manifest.scripts?.['picker:design']).toBe(
      'node scripts/generate-picker-design.mjs --tokens design/tokens.json --strings design/locale_strings.json --out-dir src/picker',
    );
    expect(manifest.scripts?.['picker:design:check']).toBe(
      'node scripts/generate-picker-design.mjs --tokens design/tokens.json --strings design/locale_strings.json --out-dir src/picker --check',
    );
  });

  it('uses repository-local canonical inputs, matches checked-in output, and detects stale output', async () => {
    const directory = await fixtureDirectory();
    const [tokenInput, stringInput] = await Promise.all([
      readFile(canonicalTokens), readFile(canonicalStrings),
    ]);
    expect(() => generate(canonicalTokens, canonicalStrings, generatedDirectory, true)).not.toThrow();
    generate(canonicalTokens, canonicalStrings, directory);
    const firstTokens = await readFile(join(directory, 'tokens.g.ts'), 'utf8');
    const firstStrings = await readFile(join(directory, 'strings.g.ts'), 'utf8');
    generate(canonicalTokens, canonicalStrings, directory);
    expect(await readFile(join(directory, 'tokens.g.ts'), 'utf8')).toBe(firstTokens);
    expect(firstTokens).toContain(`SHA-256: ${sha256(tokenInput)}`);
    expect(firstTokens).toContain(`seatLayerPickerTokenSourceSha256 = '${sha256(tokenInput)}'`);
    expect(firstStrings).toContain(`SHA-256: ${sha256(stringInput)}`);
    expect(firstStrings).toContain(`seatLayerPickerLocaleSourceSha256 = '${sha256(stringInput)}'`);
    expect(firstTokens).not.toContain('$schema');
    expect(firstTokens).not.toContain('Process-only prose');
    expect(firstTokens).toContain('"divider": "#17203329"');
    expect(firstTokens).toContain('"divider": "#A5AEC23D"');
    expect(firstStrings.split('\n').length).toBeLessThanOrEqual(800);
    expect(() => generate(canonicalTokens, canonicalStrings, directory, true)).not.toThrow();
    await writeFile(join(directory, 'tokens.g.ts'), '// stale\n');
    expect(() => generate(canonicalTokens, canonicalStrings, directory, true)).toThrow();
  });

  it('rejects structurally unsafe geometry without pinning canonical measurements', async () => {
    const directory = await fixtureDirectory();
    await writeFile(join(directory, 'tokens.json'), JSON.stringify({
      version: 7,
      size: { minimumHitTarget: 0 },
      radius: { button: 12, card: 20 },
      strings: { close: 'Close' },
      color: { light: {}, dark: {} },
    }));

    expect(() => generate(join(directory, 'tokens.json'), join(directory, 'strings.json'), directory)).toThrow();
  });

  it('accepts deliberate canonical measurement changes', async () => {
    const directory = await fixtureDirectory();
    await writeFile(join(directory, 'tokens.json'), JSON.stringify({
      version: 7,
      size: { minimumHitTarget: 40 },
      radius: { button: 10, card: 20 },
      strings: { close: 'Close' },
      color: { light: {}, dark: {} },
    }));

    expect(() => generate(join(directory, 'tokens.json'), join(directory, 'strings.json'), directory)).not.toThrow();
    expect(await readFile(join(directory, 'tokens.g.ts'), 'utf8')).toContain('"button": 10');
  });
});

describe('checked-in picker design output', () => {
  it('matches the approved cross-platform design source lock', async () => {
    const [tokenInput, stringInput, lockInput] = await Promise.all([
      readFile(canonicalTokens),
      readFile(canonicalStrings),
      readFile(canonicalSourceLock, 'utf8'),
    ]);
    const lock = JSON.parse(lockInput) as {
      version?: number;
      tokensSha256?: string;
      localeStringsSha256?: string;
    };
    expect(lock.version).toBe(1);
    expect(sha256(tokenInput)).toBe(lock.tokensSha256);
    expect(sha256(stringInput)).toBe(lock.localeStringsSha256);
  });

  it('contains all locale dictionaries and matches source-hash comments', async () => {
    const [tokenInput, stringInput, tokens, strings] = await Promise.all([
      readFile(canonicalTokens),
      readFile(canonicalStrings),
      readFile(join(process.cwd(), 'src/picker/tokens.g.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src/picker/strings.g.ts'), 'utf8'),
    ]);
    const localTokens = JSON.parse(tokenInput.toString('utf8')) as { strings?: Record<string, string> };
    const localStrings = JSON.parse(stringInput.toString('utf8')) as { strings?: Record<string, unknown> };
    expect(Object.keys(seatLayerPickerLocaleStrings)).toHaveLength(Object.keys(localStrings.strings ?? {}).length);
    expect(seatLayerPickerTokens.strings).toEqual(localTokens.strings);
    expect(seatLayerPickerTokenSourceSha256).toBe(sha256(tokenInput));
    expect(seatLayerPickerLocaleSourceSha256).toBe(sha256(stringInput));
    expect(tokens).toContain(`SHA-256: ${seatLayerPickerTokenSourceSha256}`);
    expect(strings).toContain(`SHA-256: ${seatLayerPickerLocaleSourceSha256}`);
    expect(strings.split('\n').length).toBeLessThanOrEqual(800);
  });

  it('converts canonical Flutter ARGB alpha colours to React Native RGBA order', () => {
    expect(seatLayerPickerTokens.color.light.divider).toBe('#17203329');
    expect(seatLayerPickerTokens.color.dark.divider).toBe('#A5AEC23D');
  });

  it('keeps native-only cart, prompt, and immersive wording in the canonical token source', () => {
    expect(seatLayerPickerTokens.radius).toMatchObject({ button: 8, card: 18 });
    expect(seatLayerPickerTokens.size.minimumHitTarget).toBeGreaterThanOrEqual(44);
    expect(seatLayerPickerTokens.strings).toMatchObject({
      addTickets: 'Add tickets',
      chooseTableGuests: 'Choose the number of guests for this table',
      collapseCart: 'Collapse cart',
      confirmTable: 'Confirm table',
      expandCart: 'Expand cart',
      fromPrice: 'From {price}',
      generalAdmission: 'General admission',
      moreCount: '+{count} more',
      moveVenue: 'Drag to move venue',
      placeNumberIdentity: 'Place {place}',
      orbitMode: 'Rotate venue',
      panMode: 'Move venue',
      placesAvailable: '{count} places currently available',
      removeSeat: 'Remove ticket',
      rowIdentity: 'Row {row}',
      rotateVenue: 'Drag to rotate venue',
      seatNumberIdentity: 'Seat {seat}',
      selectTicketTier: 'Select a ticket type',
      tierCompanionGuidance: 'Requires the adjacent wheelchair place.',
    });
  });
});

describe('picker theme', () => {
  it('pins explicit modes and gives host mode precedence over system mode for auto', () => {
    expect(resolveSeatLayerPickerTheme({ themeMode: 'auto', hostThemeMode: 'light', systemThemeMode: 'dark' }).themeMode).toBe('light');
    expect(resolveSeatLayerPickerTheme({ themeMode: 'auto', systemThemeMode: 'dark' }).themeMode).toBe('dark');
    expect(resolveSeatLayerPickerTheme({ themeMode: 'light', hostThemeMode: 'dark', systemThemeMode: 'dark' }).themeMode).toBe('light');
    const brandedOptions = {
      brand: 'night-owl',
      brands: { 'night-owl': { themeMode: 'light' as const } },
    };
    expect(resolveSeatLayerPickerTheme({ ...brandedOptions, themeMode: 'dark' }).themeMode).toBe('dark');
    expect(resolveSeatLayerPickerTheme({ ...brandedOptions, themeMode: 'auto', systemThemeMode: 'dark' }).themeMode).toBe('dark');
    const theme = resolveSeatLayerPickerTheme({
      brand: 'sunshine',
      brands: { sunshine: { colors: { accent: '#FFFF00' } } },
    });
    expect(theme.colors.onAccent).toBe('#000000');
    expect(theme.roles.primaryAction.foreground).toBe('#000000');
    expect(deriveSeatLayerPickerOnAccent('#000066', '#111111')).toBe('#FFFFFF');
  });

  it('resolves a complete immutable theme from sparse snapshot branding', () => {
    const theme = resolveSeatLayerPickerTheme({
      organizerBranding: { accent: undefined, muted: undefined, logoUrl: undefined },
    });
    expect(theme.colors).toEqual(expect.objectContaining({
      background: '#F6F7FB',
      surface: '#FFFFFF',
      accent: '#5B4B8A',
      onAccent: '#FFFFFF',
      mapSelection: '#5B4B8A',
    }));
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.colors)).toBe(true);
    expect(theme.layout).toBe(theme.metrics);
  });

  it('keeps caller accents with matching ink or derives a readable replacement', () => {
    const derived = resolveSeatLayerPickerTheme({
      theme: { colors: { accent: '#FFFF00' } },
      organizerBranding: { accent: '#000066', accentInk: '#FFFFFF' },
    });
    const explicit = resolveSeatLayerPickerTheme({
      theme: { colors: { accent: '#FFFF00', onAccent: '#101010' } },
      organizerBranding: { accent: '#000066', accentInk: '#FFFFFF' },
    });
    expect(derived.colors.onAccent).toBe('#000000');
    expect(explicit.colors.onAccent).toBe('#101010');
    expect(derived.roles.primaryAction.foreground).toBe('#000000');
  });

  it('applies authored accent ink by precedence without borrowing a lower pairing', () => {
    const hostInk = resolveSeatLayerPickerTheme({
      theme: { colors: { onAccent: '#AABBCC' } },
      organizerBranding: { accent: '#224488', accentInk: '#FFFFFF' },
    });
    const brandInk = resolveSeatLayerPickerTheme({
      brand: 'festival',
      brands: { festival: { colors: { onAccent: '#102030' } } },
      organizerBranding: { accent: '#224488', accentInk: '#FFFFFF' },
    });
    const hostAccent = resolveSeatLayerPickerTheme({
      theme: { colors: { accent: '#FFFF00' } },
      organizerBranding: { accent: '#224488', accentInk: '#FFFFFF' },
    });
    const organizerPair = resolveSeatLayerPickerTheme({
      organizerBranding: { accent: '#224488', accentInk: '#F0F0F0' },
    });
    expect(hostInk.colors.onAccent).toBe('#AABBCC');
    expect(brandInk.colors.onAccent).toBe('#102030');
    expect(hostAccent.colors.onAccent).toBe('#000000');
    expect(organizerPair.colors).toMatchObject({ accent: '#224488', onAccent: '#F0F0F0' });
  });

  it('applies explicit, brand, organizer, and generated visual precedence coherently', () => {
    const theme = resolveSeatLayerPickerTheme({
      brand: 'festival',
      brands: {
        festival: {
          colors: { accent: '#224488', surface: '#EEEEEE' },
          radius: 20,
          fontFamily: 'Brand Sans',
          mapTheme: { textColor: '#123456' },
        },
      },
      theme: {
        colors: { accent: '#FFCC00' },
        radius: 24,
        fontFamily: 'Host Sans',
        mapTheme: { background: '#101010' },
      },
      mapTheme: { selectionColor: '#FEDCBA' },
      organizerBranding: {
        accent: '#660066',
        accentInk: '#FFFFFF',
        radius: 30,
        fontFamily: 'Organizer Sans',
      },
    });
    expect(theme.colors.accent).toBe('#FFCC00');
    expect(theme.colors.surface).toBe('#EEEEEE');
    expect(theme.radius).toBe(24);
    expect(theme.radii).toMatchObject({
      base: 24,
      card: 24,
      sheet: 24,
      button: 8,
      chip: 999,
      pill: 999,
    });
    expect(theme.buttonRadius).toBe(8);
    expect(theme.fontFamily).toBe('Host Sans');
    expect(theme.mapTheme).toEqual({
      background: '#101010',
      rowLabelColor: '#334155',
      textColor: '#123456',
      selectionColor: '#FEDCBA',
    });
    expect(theme.roles.map).toMatchObject({
      background: '#101010',
      foreground: '#123456',
      accent: '#FEDCBA',
    });
  });

  it('preserves immutable host images before theme, brand, and organizer fallbacks', () => {
    const hostObject = { uri: 'file:///bundle/host.png', headers: { 'x-image-source': 'host' } };
    const hostArray = [{ uri: 'file:///bundle/one.png' }, { uri: 'file:///bundle/two.png' }];
    const asset = resolveSeatLayerPickerTheme({
      logoSource: 17,
      organizerBranding: { logoUrl: 'https://cdn.example.test/organizer.png' },
    });
    const uri = resolveSeatLayerPickerTheme({
      logoSource: 'https://cdn.example.test/host.png',
      organizerBranding: { logoUrl: 'https://cdn.example.test/organizer.png' },
    });
    const organizer = resolveSeatLayerPickerTheme({
      organizerBranding: { logoUrl: 'https://cdn.example.test/organizer.png' },
    });
    const preferred = resolveSeatLayerPickerTheme({
      logoSource: hostObject,
      theme: { logoSource: { uri: 'https://cdn.example.test/theme.png' } },
      brand: 'festival',
      brands: { festival: { logoSource: { uri: 'https://cdn.example.test/brand.png' } } },
      organizerBranding: { logoUrl: 'https://cdn.example.test/organizer.png' },
    });
    const array = resolveSeatLayerPickerTheme({ logoSource: hostArray });
    const invalidAsset = resolveSeatLayerPickerTheme({ logoSource: -1 });
    const fractionalAsset = resolveSeatLayerPickerTheme({ logoSource: 1.5 });
    const nonFiniteAsset = resolveSeatLayerPickerTheme({ logoSource: Number.NaN });
    expect(asset.logoSource).toBe(17);
    expect(uri.logoSource).toEqual({ uri: 'https://cdn.example.test/host.png' });
    expect(organizer.logoSource).toEqual({ uri: 'https://cdn.example.test/organizer.png' });
    expect(preferred.logoSource).toEqual(hostObject);
    expect(preferred.logoSource).not.toBe(hostObject);
    expect(Object.isFrozen(preferred.logoSource)).toBe(true);
    expect(Object.isFrozen((preferred.logoSource as { headers: object }).headers)).toBe(true);
    expect(array.logoSource).toEqual(hostArray);
    expect(array.logoSource).not.toBe(hostArray);
    expect(Object.isFrozen(array.logoSource)).toBe(true);
    expect(invalidAsset.logoSource).toBeUndefined();
    expect(fractionalAsset.logoSource).toBeUndefined();
    expect(nonFiniteAsset.logoSource).toBeUndefined();
  });

  it('derives the live map palette from theme colors and honors explicit overrides', () => {
    const dark = resolveSeatLayerPickerTheme({ themeMode: 'dark' });
    const explicit = resolveSeatLayerPickerTheme({
      themeMode: 'light',
      mapTheme: { background: '#010203', rowLabelColor: '#040506' },
    });
    expect(dark.mapTheme).toEqual({
      background: '#0F1522',
      rowLabelColor: '#D7DEEA',
      textColor: '#F4F7FB',
      selectionColor: '#9B8AFB',
    });
    expect(explicit.mapTheme).toEqual({
      background: '#010203',
      rowLabelColor: '#040506',
      textColor: '#172033',
      selectionColor: '#5B4B8A',
    });
  });
});

describe('picker locale', () => {
  it('falls back from regional locale, pluralises, and preserves missing placeholders', () => {
    expect(translateSeatLayerPickerString('close', { locale: 'fr-CA' })).toBe('Fermer');
    expect(translateSeatLayerPickerString('ticketCount', { locale: 'en-GB', count: 2 })).toBe('2 tickets');
    expect(translateSeatLayerPickerString('chooseSeats', { locale: 'not-a-locale' })).toBe('Choose your seats');
    expect(formatSeatLayerPickerString('Hello {name}; {missing}', { name: 'Ada' })).toBe('Hello Ada; {missing}');
  });

  it('keeps the full native-chrome English surface while overlaying generated locales', () => {
    expect(translateSeatLayerPickerString('allFloors', { locale: 'de-DE' })).toBe('All floors');
    expect(translateSeatLayerPickerString('findBestSeats', { count: 1 })).toBe('Find 1 best seat');
    expect(translateSeatLayerPickerString('findBestSeats', { locale: 'unsupported-ZZ', count: 1 })).toBe('Find 1 best seat');
    expect(translateSeatLayerPickerString('findBestSeats', { locale: 'en-GB', count: 1 })).toBe('Find 1 best seat');
    expect(translateSeatLayerPickerString('continueWithTotal', { locale: 'fr-CA', values: { money: '$320' } })).toBe('Continuer · $320');
    expect(translateSeatLayerPickerString('continueWithTotal', { locale: 'de-DE', values: { total: '$320' } })).toBe('Weiter · $320');
    expect(translateSeatLayerPickerString('ticketCount', { locale: 'zh-TW', count: 2 })).toBe('2 張票');
    expect(translateSeatLayerPickerString('reselectSeats', { count: 1 })).toBe('Select it again');
    expect(translateSeatLayerPickerString('reselectSeats', { locale: 'fr-CA', count: 2 })).toBe('Les sélectionner à nouveau');
    expect(translateSeatLayerPickerString('seatsNotRecovered', { count: 2 })).toBe('2 could not be recovered');
    expect(translateSeatLayerPickerString('fromPrice', { values: { price: '$20' } })).toBe('From $20');
    expect(translateSeatLayerPickerString('moreCount', { count: 3 })).toBe('+3 more');
    expect(translateSeatLayerPickerString('placeNumberIdentity', { values: { place: 4 } })).toBe('Place 4');
    expect(translateSeatLayerPickerString('rowIdentity', { values: { row: 'C' } })).toBe('Row C');
    expect(translateSeatLayerPickerString('seatNumberIdentity', { values: { seat: 6 } })).toBe('Seat 6');
    expect(translateSeatLayerPickerString('futureRuntimeLabel')).toBe('futureRuntimeLabel');
  });

  it('uses immutable typed overrides without allowing accessors or formatter failures to crash rendering', () => {
    let accessorRead = false;
    const overrides = {
      allFloors: 'Every level',
      ticketCount: ({ count }: { count?: number }) => `Selected: ${count}`,
      chooseTickets: () => { throw new Error('formatter failure'); },
      accessNeeds: { wheelchair: 'Wheelchair spaces' },
    };
    Object.defineProperty(overrides, 'close', {
      get: () => {
        accessorRead = true;
        throw new Error('accessor failure');
      },
    });
    const strings = createSeatLayerPickerStringResolver({ overrides });
    overrides.allFloors = 'Changed after construction';
    expect(strings.translate('allFloors')).toBe('Every level');
    expect(strings.translate('ticketCount', { count: 2 })).toBe('Selected: 2');
    expect(strings.translate('chooseTickets')).toBe('Choose tickets');
    expect(strings.accessNeed('wheelchair', 3)).toBe('Wheelchair spaces · 3');
    expect(strings.accessNeed('wheelchair')).toBe('Wheelchair spaces');
    expect(accessorRead).toBe(false);
    expect(Object.isFrozen(strings)).toBe(true);

    const unsafeOptions = {} as { overrides?: unknown };
    Object.defineProperty(unsafeOptions, 'overrides', { get: () => { throw new Error('options accessor failure'); } });
    expect(translateSeatLayerPickerString('allFloors', unsafeOptions as never)).toBe('All floors');
  });
});
