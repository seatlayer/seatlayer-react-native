#!/usr/bin/env node
// Draws the seat icons' path data as small PNG masks, for apps without a vector
// renderer: `node scripts/generate-seat-icon-masks.mjs [--check]`.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { transform } from 'esbuild';

/** Three device pixels for each unit of the 20-unit box. */
export const seatIconMaskSize = 60;
/** 4 bits for each pixel: an opacity of 0 to 15. */
const levels = 15;

const root = resolve(import.meta.dirname, '..');
const glyphFile = resolve(root, 'src/picker/seatIconGlyphs.ts');
const outFile = resolve(root, 'src/picker/seatIconMasks.g.ts');

/** The path data as the package ships it. */
export async function loadSeatIconGlyphs() {
  const { code } = await transform(await readFile(glyphFile, 'utf8'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/** Splits SVG path data into polylines. */
export function flattenSeatIconPath(data) {
  const lines = [];
  let line;
  let x = 0; let y = 0; let startX = 0; let startY = 0;
  let controlX = 0; let controlY = 0; let last = '';
  const begin = () => { line = [[x, y]]; lines.push(line); };
  const to = (nextX, nextY) => { x = nextX; y = nextY; line.push([x, y]); };
  const curve = (x1, y1, x2, y2, endX, endY) => {
    const fromX = x; const fromY = y;
    for (let step = 1; step <= 48; step += 1) {
      const t = step / 48; const u = 1 - t;
      to(u * u * u * fromX + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * endX,
        u * u * u * fromY + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * endY);
    }
    controlX = x2; controlY = y2;
  };
  for (const [command, values] of pathCommands(data)) {
    const relative = command === command.toLowerCase();
    const atX = relative ? x : 0; const atY = relative ? y : 0;
    switch (command.toUpperCase()) {
      case 'M': x = atX + values[0]; y = atY + values[1]; startX = x; startY = y; begin(); break;
      case 'L': to(atX + values[0], atY + values[1]); break;
      case 'H': to(atX + values[0], y); break;
      case 'V': to(x, atY + values[0]); break;
      case 'C':
        curve(atX + values[0], atY + values[1], atX + values[2], atY + values[3], atX + values[4], atY + values[5]);
        break;
      case 'S': {
        const smooth = last === 'C' || last === 'S';
        curve(smooth ? 2 * x - controlX : x, smooth ? 2 * y - controlY : y,
          atX + values[0], atY + values[1], atX + values[2], atY + values[3]);
        break;
      }
      case 'A':
        for (const point of arcPoints(x, y, values, atX + values[5], atY + values[6])) to(point[0], point[1]);
        break;
      case 'Z': to(startX, startY); begin(); break;
      default: throw new Error(`Seat icon path: unknown command ${command}`);
    }
    last = command.toUpperCase();
  }
  return lines;
}

const argumentCount = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, A: 7, Z: 0 };

function* pathCommands(data) {
  const number = /\s*,?\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/iy;
  const flag = /\s*,?\s*([01])/y;
  let at = 0;
  while (at < data.length) {
    if (/[\s,]/.test(data[at])) { at += 1; continue; }
    let command = data[at];
    const count = argumentCount[command.toUpperCase()];
    if (count === undefined) throw new Error(`Seat icon path: unexpected "${command}" in ${data}`);
    at += 1;
    for (let first = true; ; first = false) {
      const values = [];
      for (let index = 0; index < count; index += 1) {
        const pattern = command.toUpperCase() === 'A' && (index === 3 || index === 4) ? flag : number;
        pattern.lastIndex = at;
        const match = pattern.exec(data);
        if (match === null) {
          if (index === 0 && !first) break;
          throw new Error(`Seat icon path: missing number in ${data}`);
        }
        values.push(Number(match[1]));
        at = pattern.lastIndex;
      }
      if (values.length < count) break;
      yield [command, values];
      if (count === 0) break;
      // What follows a move without a letter of its own is a line.
      if (command === 'M') command = 'L';
      if (command === 'm') command = 'l';
    }
  }
}

/** An SVG circle arc as points; every arc in the set has one radius. */
function arcPoints(fromX, fromY, [rx, ry, , large, sweep], endX, endY) {
  if (rx !== ry) throw new Error('Seat icon path: an arc with two radii');
  const dx = endX - fromX; const dy = endY - fromY;
  const chord = Math.hypot(dx, dy);
  const radius = Math.max(rx, chord / 2);
  const height = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
  const side = large === sweep ? -1 : 1;
  const centreX = (fromX + endX) / 2 - side * height * dy / chord;
  const centreY = (fromY + endY) / 2 + side * height * dx / chord;
  const start = Math.atan2(fromY - centreY, fromX - centreX);
  let turn = Math.atan2(endY - centreY, endX - centreX) - start;
  if (sweep === 1 && turn < 0) turn += 2 * Math.PI;
  if (sweep === 0 && turn > 0) turn -= 2 * Math.PI;
  return Array.from({ length: 64 }, (_, index) => index === 63 ? [endX, endY] : [
    centreX + radius * Math.cos(start + turn * (index + 1) / 64),
    centreY + radius * Math.sin(start + turn * (index + 1) / 64),
  ]);
}

/** One glyph's opacity for each pixel, 0 to 15. */
export function seatIconMask(glyph, { box, stroke, size = seatIconMaskSize }) {
  const scale = size / box;
  const strokes = [
    ...(glyph.circles ?? []).map(([cx, cy, r]) => Array.from({ length: 129 }, (_, index) => [
      cx + r * Math.cos(index * Math.PI / 64), cy + r * Math.sin(index * Math.PI / 64),
    ])),
    ...(glyph.paths ?? []).flatMap(flattenSeatIconPath),
  ];
  const fills = (glyph.fills ?? []).flatMap(flattenSeatIconPath).filter((line) => line.length > 2);
  const mask = new Uint8Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const x = (column + .5) / scale; const y = (row + .5) / scale;
      // Round caps and joins: every point within half a stroke of the line.
      let outside = distance(strokes, x, y) - stroke / 2;
      for (const line of fills) {
        const edge = distance([line], x, y);
        outside = Math.min(outside, contains(line, x, y) ? -edge : edge);
      }
      mask[row * size + column] = Math.round(Math.min(1, Math.max(0, .5 - outside * scale)) * levels);
    }
  }
  return mask;
}

function distance(lines, x, y) {
  let nearest = Infinity;
  for (const line of lines) {
    for (let index = 0; index < Math.max(1, line.length - 1); index += 1) {
      const [ax, ay] = line[index]; const [bx, by] = line[index + 1] ?? line[index];
      const dx = bx - ax; const dy = by - ay; const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length));
      nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return nearest;
}

function contains(line, x, y) {
  let inside = false;
  for (let index = 0, before = line.length - 1; index < line.length; before = index, index += 1) {
    const [ax, ay] = line[index]; const [bx, by] = line[before];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** A 4-bit black PNG whose opacity is the mask. */
export function encodeSeatIconMask(mask, size = seatIconMaskSize) {
  const stride = size / 2;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      raw[row * (stride + 1) + 1 + (column >> 1)] |= mask[row * size + column] << (column % 2 === 0 ? 4 : 0);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header.set([4, 3, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('PLTE', Buffer.alloc((levels + 1) * 3)),
    chunk('tRNS', Buffer.from(Array.from({ length: levels + 1 }, (_, level) => level * 17))),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const named = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const out = Buffer.alloc(named.length + 8);
  out.writeUInt32BE(body.length, 0); named.copy(out, 4); out.writeUInt32BE(crc32(named), named.length + 4);
  return out;
}

/** The mask back out of a PNG written by {@link encodeSeatIconMask}. */
export function decodeSeatIconMask(png, size = seatIconMaskSize) {
  const body = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') body.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(body));
  const mask = new Uint8Array(size * size);
  for (let index = 0; index < mask.length; index += 1) {
    const row = Math.floor(index / size); const column = index % size;
    const pair = raw[row * (size / 2 + 1) + 1 + (column >> 1)];
    mask[index] = column % 2 === 0 ? pair >> 4 : pair & 15;
  }
  return mask;
}

/** Every mask, as the path data draws it now. */
export async function seatIconMasks() {
  const source = await loadSeatIconGlyphs();
  const options = { box: source.seatLayerPickerSeatIconViewBox, stroke: source.seatLayerPickerSeatIconStrokeWidth };
  return Object.entries(source.seatLayerPickerSeatGlyphs).map(([key, glyph]) => [key, seatIconMask(glyph, options)]);
}

/** Compares the pixels, since the same pixels may be compressed in two ways. */
export function seatIconMasksMatch(contents, masks) {
  const written = [...contents.matchAll(/^ {2}'?([\w-]+)'?: '([A-Za-z0-9+/=]+)',$/gm)];
  return written.length === masks.length && masks.every(([key, mask], index) => {
    const [, name, data] = written[index];
    return name === key && decodeSeatIconMask(Buffer.from(data, 'base64'))
      .every((level, pixel) => Math.abs(level - mask[pixel]) <= 1);
  });
}

async function main() {
  const masks = await seatIconMasks();
  if (process.argv.includes('--check')) {
    if (seatIconMasksMatch(await readFile(outFile, 'utf8').catch(() => ''), masks)) return;
    console.error('seatIconMasks.g.ts does not match the path data. Run: pnpm picker:icons');
    process.exitCode = 1;
    return;
  }
  const rows = masks.map(([key, mask]) =>
    `  ${/^\w+$/.test(key) ? key : `'${key}'`}: '${encodeSeatIconMask(mask).toString('base64')}',`);
  await writeFile(outFile, [
    '// Generated by scripts/generate-seat-icon-masks.mjs. Do not edit.',
    '',
    `/** Each seat icon as a ${seatIconMaskSize}-pixel PNG mask, in base64. */`,
    'export const seatLayerPickerSeatIconMasks: Readonly<Record<string, string>> = Object.freeze({',
    ...rows,
    '});',
    '',
  ].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
