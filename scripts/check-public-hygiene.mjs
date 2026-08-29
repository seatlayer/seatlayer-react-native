import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

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
const failures = [];

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

if (failures.length > 0) {
  console.error('Public hygiene check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Public hygiene check passed for ${proseFiles.length} public prose files.`);
}

function reportMatches(relativePath, contents, expression, description) {
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
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, accept);
    return entry.isFile() && accept(entry.name) ? [path] : [];
  });
}
