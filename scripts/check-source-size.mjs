import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'src');
const maximumLines = 800;
const oversized = [];

for (const file of sourceFiles(sourceRoot)) {
  const contents = readFileSync(file, 'utf8');
  const lines = lineCount(contents);
  if (lines > maximumLines) oversized.push({ file: relative(root, file), lines });
}

if (oversized.length > 0) {
  console.error(`Source-size check failed: src .ts/.tsx files must not exceed ${maximumLines} lines.`);
  for (const entry of oversized) console.error(`- ${entry.file}: ${entry.lines} lines`);
  process.exitCode = 1;
} else {
  console.log(`Source-size check passed: no src .ts/.tsx file exceeds ${maximumLines} lines.`);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

function lineCount(contents) {
  if (contents.length === 0) return 0;
  return contents.endsWith('\n') ? contents.split('\n').length - 1 : contents.split('\n').length;
}
