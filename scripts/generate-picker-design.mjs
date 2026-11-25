#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const usage = `Usage: node scripts/generate-picker-design.mjs --tokens <tokens.json> --strings <locale_strings.json> [--out-dir <directory>] [--check]`;

const requiredPositiveNumberTokenPaths = Object.freeze([
  ['radius', 'button'],
  ['radius', 'card'],
  ['size', 'minimumHitTarget'],
]);

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Readonly<Record<string, unknown>>} value @param {readonly string[]} path */
function atPath(value, path) {
  let current = value;
  for (const key of path) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

/** @param {unknown} value */
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

/**
 * Flutter's canonical design source uses Color's #AARRGGBB notation, while
 * React Native consumes eight-digit hex colours as #RRGGBBAA. Keep that
 * platform conversion at generation time so host-supplied RN colours retain
 * their normal syntax.
 * @param {unknown} value
 */
function normalizeReactNativeColorTokens(value) {
  if (Array.isArray(value)) return value.map(normalizeReactNativeColorTokens);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeReactNativeColorTokens(child)]),
    );
  }
  if (typeof value !== 'string') return value;
  const match = /^#([0-9a-fA-F]{8})$/.exec(value);
  if (!match) return value;
  const argb = match[1];
  return `#${argb.slice(2)}${argb.slice(0, 2)}`;
}

/** @param {string} path */
async function readJson(path) {
  try {
    const source = await readFile(path, 'utf8');
    return {
      value: JSON.parse(source),
      sha256: createHash('sha256').update(source).digest('hex'),
    };
  } catch (error) {
    throw new Error(`Could not read JSON input ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** @param {unknown} tokens @param {unknown} strings */
function validateInputs(tokens, strings) {
  if (!isRecord(tokens) || !isRecord(tokens.color) || !isRecord(tokens.size) || !isRecord(tokens.radius) || !isRecord(tokens.strings)) {
    throw new Error('Token input must contain color, size, radius, and strings objects.');
  }
  for (const [group, key] of requiredPositiveNumberTokenPaths) {
    const value = atPath(tokens, [group, key]);
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Token input must contain a positive finite ${group}.${key} number.`);
    }
  }
  for (const [key, value] of Object.entries(tokens.strings)) {
    if (typeof value !== 'string') throw new Error(`Token string ${key} must be a string.`);
  }
  if (!isRecord(strings) || !isRecord(strings.strings)) {
    throw new Error('Locale input must contain a strings object.');
  }
  for (const [locale, dictionary] of Object.entries(strings.strings)) {
    if (!isRecord(dictionary)) throw new Error(`Locale dictionary ${locale} must be an object.`);
    for (const [key, value] of Object.entries(dictionary)) {
      if (typeof value !== 'string') throw new Error(`Locale string ${locale}.${key} must be a string.`);
    }
  }
}

const sourceRoot = resolve(import.meta.dirname, '../src');
const publishedKeysPath = resolve(import.meta.dirname, 'picker-published-keys.json');

/** Every name the source writes as a string or reads from the English table. */
export async function readUsedNames(root = sourceRoot) {
  const names = new Set();
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.g.ts')) {
        const code = (await readFile(path, 'utf8'))
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|\s)\/\/.*$/gm, '$1');
        for (const match of code.matchAll(/(['"`])([A-Za-z][\w.-]*)\1|[sS]trings\.(\w+)/g)) {
          names.add(match[2] ?? match[3]);
        }
      }
    }
  };
  await walk(root);
  return names;
}

/** The keys a published version had stay, so an app that names one still gets it. */
export async function readPublishedKeys() {
  return JSON.parse(await readFile(publishedKeysPath, 'utf8'));
}

/** @param {{ used: Set<string>, published: { english: string[], dictionaries: string[] } }} keys */
export function keyFilters({ used, published }) {
  const english = new Set(published.english);
  const dictionaries = new Set(published.dictionaries);
  const base = (key) => key.replace(/\.(zero|one|two|few|many|other)$/, '');
  return {
    english: (key) => {
      const counted = key.replace(/(One|Other)$/, '');
      return english.has(key) || used.has(key) || (counted !== key && used.has(counted));
    },
    dictionary: (key) => dictionaries.has(key) || dictionaries.has(`${base(key)}.other`) ||
      used.has(key) || used.has(base(key)) || used.has(`${base(key)}.one`) ||
      key.startsWith('accessNeeds.'),
  };
}

function only(record, keep) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keep(key)));
}

/** @param {unknown} tokens @param {unknown} strings @param {{ tokens: string, strings: string }} sourceHashes @param {ReturnType<typeof keyFilters>} keep */
export function buildGeneratedDesignFiles(tokens, strings, sourceHashes, keep) {
  validateInputs(tokens, strings);
  const { $schema: _schema, description: _description, ...runtimeTokens } = tokens;
  const reactNativeTokens = {
    ...runtimeTokens,
    color: normalizeReactNativeColorTokens(runtimeTokens.color),
    strings: only(runtimeTokens.strings, keep.english),
  };
  const tokenHeader = `// This file is generated. Do not edit by hand.\n// Canonical token input SHA-256: ${sourceHashes.tokens}\n// Canonical #AARRGGBB colours are emitted as React Native #RRGGBBAA.\n\n`;
  const stringHeader = `// This file is generated. Do not edit by hand.\n// Canonical locale input SHA-256: ${sourceHashes.strings}\n\n`;
  const locales = Object.entries(sortJson(strings.strings));
  const nameOf = (locale) => `${locale.replace(/-/g, '')}Words`;
  const imports = locales
    .map(([locale]) => `import { ${nameOf(locale)} } from './locales/${locale}.g';`)
    .join('\n');
  const rows = locales.map(([locale]) => `  ${JSON.stringify(locale)}: ${nameOf(locale)},`).join('\n');
  return {
    'tokens.g.ts': `${tokenHeader}export const seatLayerPickerTokenSourceSha256 = '${sourceHashes.tokens}' as const;\nexport const seatLayerPickerTokenVersion = ${JSON.stringify(runtimeTokens.version ?? null)} as const;\n\nexport const seatLayerPickerTokens = ${JSON.stringify(sortJson(reactNativeTokens), null, 2)} as const;\n\nexport type SeatLayerPickerGeneratedTokens = typeof seatLayerPickerTokens;\n`,
    'strings.g.ts': `${stringHeader}${imports}\n\nexport const seatLayerPickerLocaleSourceSha256 = '${sourceHashes.strings}' as const;\n\n/** One language is built when it is first asked for. */\nexport const seatLayerPickerLocaleSources = {\n${rows}\n} as const;\n\nexport type SeatLayerPickerGeneratedLocale = keyof typeof seatLayerPickerLocaleSources;\n`,
    ...Object.fromEntries(locales.map(([locale, dictionary]) => [
      `locales/${locale}.g.ts`,
      `${stringHeader}export const ${nameOf(locale)} = (): Readonly<Record<string, string>> => (${JSON.stringify(only(dictionary, keep.dictionary))});\n`,
    ])),
  };
}

/** @param {string[]} args */
export function parseArgs(args) {
  const options = { tokens: undefined, strings: undefined, outDir: 'src/picker', check: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') {
      options.check = true;
      continue;
    }
    if (argument === '--tokens' || argument === '--strings' || argument === '--out-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
      if (argument === '--tokens') options.tokens = value;
      if (argument === '--strings') options.strings = value;
      if (argument === '--out-dir') options.outDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.tokens || !options.strings) throw new Error('Both --tokens and --strings are required.');
  return options;
}

/** @param {{ tokens: string, strings: string, outDir: string, check: boolean }} options */
export async function generatePickerDesign(options) {
  const [tokens, strings, used, published] = await Promise.all([
    readJson(options.tokens), readJson(options.strings), readUsedNames(), readPublishedKeys(),
  ]);
  const files = buildGeneratedDesignFiles(tokens.value, strings.value, {
    tokens: tokens.sha256,
    strings: strings.sha256,
  }, keyFilters({ used, published }));
  const outputDir = resolve(options.outDir);
  const stale = [];

  for (const [name, expected] of Object.entries(files)) {
    const destination = resolve(outputDir, name);
    let actual;
    try {
      actual = await readFile(destination, 'utf8');
    } catch {
      actual = undefined;
    }
    if (actual !== expected) stale.push({ destination, expected });
  }

  if (options.check) return stale.map(({ destination }) => destination);
  await mkdir(outputDir, { recursive: true });
  await Promise.all(stale.map(async ({ destination, expected }) => {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, expected, 'utf8');
  }));
  return [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const stale = await generatePickerDesign(options);
    if (options.check && stale.length > 0) {
      console.error(`Generated picker design files are stale:\n${stale.map((path) => `- ${path}`).join('\n')}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
  }
}
