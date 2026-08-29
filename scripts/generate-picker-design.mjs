#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

/** @param {unknown} tokens @param {unknown} strings @param {{ tokens: string, strings: string }} sourceHashes */
export function buildGeneratedDesignFiles(tokens, strings, sourceHashes) {
  validateInputs(tokens, strings);
  const { $schema: _schema, description: _description, ...runtimeTokens } = tokens;
  const tokenHeader = `// This file is generated. Do not edit by hand.\n// Canonical token input SHA-256: ${sourceHashes.tokens}\n\n`;
  const stringHeader = `// This file is generated. Do not edit by hand.\n// Canonical locale input SHA-256: ${sourceHashes.strings}\n\n`;
  const localeLines = Object.entries(sortJson(strings.strings))
    .map(([locale, dictionary]) => `  ${JSON.stringify(locale)}: ${JSON.stringify(dictionary)},`)
    .join('\n');
  return {
    'tokens.g.ts': `${tokenHeader}export const seatLayerPickerTokenSourceSha256 = '${sourceHashes.tokens}' as const;\nexport const seatLayerPickerTokenVersion = ${JSON.stringify(runtimeTokens.version ?? null)} as const;\n\nexport const seatLayerPickerTokens = ${JSON.stringify(sortJson(runtimeTokens), null, 2)} as const;\n\nexport type SeatLayerPickerGeneratedTokens = typeof seatLayerPickerTokens;\n`,
    'strings.g.ts': `${stringHeader}export const seatLayerPickerLocaleSourceSha256 = '${sourceHashes.strings}' as const;\n\nexport const seatLayerPickerLocaleStrings = {\n${localeLines}\n} as const;\n\nexport type SeatLayerPickerGeneratedLocale = keyof typeof seatLayerPickerLocaleStrings;\n`,
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
  const [tokens, strings] = await Promise.all([readJson(options.tokens), readJson(options.strings)]);
  const files = buildGeneratedDesignFiles(tokens.value, strings.value, {
    tokens: tokens.sha256,
    strings: strings.sha256,
  });
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
  await Promise.all(stale.map(({ destination, expected }) => writeFile(destination, expected, 'utf8')));
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
