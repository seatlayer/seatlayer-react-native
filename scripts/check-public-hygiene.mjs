import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const trackedPaths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
).split('\0').filter(Boolean);
const failures = [];

for (const relativePath of trackedPaths) {
  const normalized = relativePath.replaceAll('\\', '/');
  const lower = normalized.toLowerCase();
  const basename = lower.slice(lower.lastIndexOf('/') + 1);

  if (/^(?:doc|docs|design)\//.test(lower)) {
    if (/(?:^|\/)(?:internal|evidence)(?:\/|$)/.test(lower)) {
      failures.push(`${relativePath} uses a forbidden internal/evidence path`);
    }
    if (/(?:audit|comparison|parity|planning|review|validation)/.test(basename)) {
      failures.push(`${relativePath} is a development-process document`);
    }
    if (/20\d{2}-\d{2}-\d{2}/.test(basename)) {
      failures.push(`${relativePath} is a dated development artifact`);
    }
  }

  if (/\.(?:gif|jpe?g|mov|mp4|png)$/i.test(lower) &&
    !/^(?:\.github\/social-preview\.png|docs?\/media\/|tests?\/)/.test(lower)) {
    failures.push(`${relativePath} is media outside an approved public or test-fixture location`);
  }
}

const proseFiles = [
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  ...markdownFiles(resolve(root, 'docs')).map((file) => relative(root, file)),
];
const forbiddenRendererCopy = /\bWebView\b/g;
const plausibleEventLiteral = /(['"`])ev_[A-Za-z0-9_-]+\1/g;
const internalParityCopy = /\b(?:Flutter[-/ ](?:public[-/ ]?)?parity|public[- ]parity)\b/gi;

for (const relativePath of proseFiles) {
  const contents = readFileSync(resolve(root, relativePath), 'utf8');
  reportMatches(relativePath, contents, forbiddenRendererCopy, 'standalone renderer implementation copy');
  reportMatches(relativePath, contents, plausibleEventLiteral, 'plausible private/live event literal');
}

for (const relativePath of sourceFiles(resolve(root, 'src'), resolve(root, 'test'))) {
  const contents = readFileSync(resolve(root, relativePath), 'utf8');
  reportMatches(relativePath, contents, internalParityCopy, 'internal parity/process copy');
}

reportMatches(
  'package.json',
  readFileSync(resolve(root, 'package.json'), 'utf8'),
  /"webview"/g,
  'renderer implementation keyword',
);

const textExtensions = new Set([
  '', '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx',
  '.txt', '.yaml', '.yml',
]);
const localPathPattern = new RegExp('(?:/Users/[^/]+/|/home/[^/]+/|C:\\\\Users\\\\[^\\\\]+\\\\)', 'g');
const credentialPattern = new RegExp(
  '(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)',
  'g',
);
const nonPublicHostPattern = /https?:\/\/[^\s'"`]*(?:-dev\.|\.internal(?:[/:]|$))/gi;

/**
 * Names that identified a pilot customer and its hosts while the example app
 * was wired to one. The example is neutral now, and these must never come
 * back: this repository is a brand surface, and a customer's name, host or
 * integration shape is theirs, not ours to publish.
 *
 * Matched case-insensitively across the whole repository below, and again over
 * every file under example/, src/, test/ and docs/ so a new file cannot land
 * with one in a path the sweep above skips by extension.
 */
const customerDenylist = [
  { pattern: /desipass/gi, description: 'a pilot customer name' },
  { pattern: /flutterscript/gi, description: 'a pilot customer host' },
];
const scannedDirectories = ['example', 'src', 'test', 'docs'];

for (const relativePath of trackedPaths) {
  if (relativePath === 'scripts/check-public-hygiene.mjs' ||
    !textExtensions.has(extname(relativePath).toLowerCase())) continue;
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) continue;
  const contents = readFileSync(absolutePath, 'utf8');
  reportMatches(relativePath, contents, localPathPattern, 'developer-machine path');
  reportMatches(relativePath, contents, credentialPattern, 'credential-like value');
  reportMatches(relativePath, contents, nonPublicHostPattern, 'non-public development host');
  reportCustomerNames(relativePath, contents);
}

// The sweep above reads only the text extensions it knows; these directories
// are read whole — every file, and its path — because a customer's name in an
// unrecognised extension or a directory name is published just the same.
for (const relativePath of everyFileUnder(...scannedDirectories)) {
  reportCustomerNames(relativePath, relativePath);
  if (!textExtensions.has(extname(relativePath).toLowerCase())) continue;
  reportCustomerNames(relativePath, readFileSync(resolve(root, relativePath), 'utf8'));
}

if (failures.length > 0) {
  console.error('Public hygiene check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Public hygiene check passed for ${trackedPaths.length} repository files.`);
}

function reportCustomerNames(relativePath, contents) {
  for (const { pattern, description } of customerDenylist) {
    reportMatches(relativePath, contents, pattern, description);
  }
}

function everyFileUnder(...directories) {
  const seen = new Set();
  return directories.flatMap((directory) =>
    filesUnder(resolve(root, directory), (name) => name !== 'node_modules'),
  ).map((file) => relative(root, file)).filter((file) => {
    if (seen.has(file)) return false;
    seen.add(file);
    return true;
  });
}

function reportMatches(relativePath, contents, expression, description) {
  expression.lastIndex = 0;
  for (const match of contents.matchAll(expression)) {
    const line = contents.slice(0, match.index).split('\n').length;
    failures.push(`${relativePath}:${line} contains ${description}: ${match[0]}`);
  }
}

function markdownFiles(directory) {
  return filesUnder(directory, (name) => /\.mdx?$/.test(name));
}

function sourceFiles(...directories) {
  return directories.flatMap((directory) =>
    filesUnder(directory, (name) => /\.tsx?$/.test(name)),
  ).map((file) => relative(root, file));
}

function filesUnder(directory, accept) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    if (entry.isDirectory()) return filesUnder(path, accept);
    return entry.isFile() && accept(entry.name) ? [path] : [];
  });
}
