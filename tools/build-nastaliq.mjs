// متن‌های نستعلیق را با HarfBuzz به مسیر SVG تبدیل می‌کند تا در همهٔ مرورگرها یکسان دیده شوند.
// پس از هر تغییر در static/data/fortunes.json دوباره اجرا شود:
//   npm install --no-save harfbuzzjs@0.4
//   node tools/build-nastaliq.mjs
// خروجی: static/data/nastaliq.json (متن‌های فال) و قطعه‌های ثابت برای index.html (با --static)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(process.env.HB_FROM || join(root, 'package.json'));
const hb = await require('harfbuzzjs');

const blob = hb.createBlob(readFileSync(join(root, 'static/fonts/IranNastaliq.ttf')));
const face = hb.createFace(blob, 0);
const font = hb.createFont(face);
const upem = face.upem;

// متریک عمودی از جدول hhea، تا خط‌کرسی دقیقاً جای متن معمولی مرورگر بیفتد
const hhea = Buffer.from(face.reference_table('hhea'));
const ascender = hhea.readInt16BE(4);
const descender = -hhea.readInt16BE(6);

function shape(text) {
  const buffer = hb.createBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  buffer.setLanguage('fa');
  hb.shape(font, buffer);
  let x = 0;
  const glyphs = [];
  for (const g of buffer.json()) {
    if (g.g === 0) throw new Error(`Missing glyph in: ${text}`);
    glyphs.push([g.g, x + g.dx, g.dy]);
    x += g.ax;
  }
  buffer.destroy();
  return { width: x, glyphs };
}

const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))));

if (process.argv[2] === '--static') {
  // قطعه‌های ثابت: یک مسیر یکپارچه به‌ازای هر عبارت
  const out = {};
  for (const text of ['حافظ', 'شب یلدا', 'با نیتی روشن و دلی آرام']) {
    const { width, glyphs } = shape(text);
    out[text] = {
      width,
      paths: glyphs
        .map(([id, x, y]) => [round(font.glyphToPath(id)), x, y])
        .filter(([d]) => d)
        .map(([d, x, y]) => `<path transform="translate(${x} ${y})" d="${d}"/>`)
        .join('')
    };
  }
  console.log(JSON.stringify({ upem, ascender, descender, out }));
} else {
  const fortunes = JSON.parse(readFileSync(join(root, 'static/data/fortunes.json'), 'utf8').replace(/^﻿/, ''));
  const glyphs = {};
  const lines = {};
  for (const text of fortunes.flatMap((f) => [f.title, ...f.poem])) {
    const shaped = shape(text);
    for (const [id] of shaped.glyphs) {
      if (!(id in glyphs)) glyphs[id] = round(font.glyphToPath(id));
    }
    lines[text] = [shaped.width, shaped.glyphs.filter(([id]) => glyphs[id])];
  }
  const json = JSON.stringify({ upem, ascender, descender, glyphs, lines });
  writeFileSync(join(root, 'static/data/nastaliq.json'), json);
  console.log(`lines=${Object.keys(lines).length} glyphs=${Object.keys(glyphs).length} bytes=${Buffer.byteLength(json)}`);
}
