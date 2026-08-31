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

for (const relativePath of trackedPaths) {
  if (relativePath === 'scripts/check-public-hygiene.mjs' ||
    !textExtensions.has(extname(relativePath).toLowerCase())) continue;
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) continue;
  const contents = readFileSync(absolutePath, 'utf8');
  reportMatches(relativePath, contents, localPathPattern, 'developer-machine path');
  reportMatches(relativePath, contents, credentialPattern, 'credential-like value');
  reportMatches(relativePath, contents, nonPublicHostPattern, 'non-public development host');
}

if (failures.length > 0) {
  console.error('Public hygiene check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Public hygiene check passed for ${trackedPaths.length} repository files.`);
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
    if (entry.isDirectory()) return filesUnder(path, accept);
    return entry.isFile() && accept(entry.name) ? [path] : [];
  });
}
