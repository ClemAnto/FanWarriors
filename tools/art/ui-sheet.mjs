#!/usr/bin/env node
// UI sheet (panels, cards, icons, scrollbar): an AI sheet → a PSD to finish the pieces by hand,
// and the way back to the game, like the room shell (shell-sheet.mjs).
//
//   npm run ui:prep -- graphics/sheets/<sheet> [--force]   source.png → ui.psd (never overwrites it without --force)
//   npm run ui:export -- graphics/sheets/<sheet>         ui.psd → assets/ui/<name>.png + .meta
//
// The folder holds source.png and manifest.json: { "pieces": [{ name, src: [x0, y0, x1, y1],
// size: [w, h] (game size, design units), slice: [left, top, right, bottom] (9-slice borders in
// game px, 0 = none), group?: object the piece belongs to (its states sit side by side),
// scale?: this piece's own texture scale (e.g. 1 for a thin scrollbar whose caps must stay
// small), state?: caption of this state ("normale", "premuto") }], groups?: { "<group>": "what it is
// used for" }, scale?: texture resolution (default 1; 2 = "@2x" textures, sharp on
// high-density screens: the PNG is size × scale and the .meta borders slice × scale) }.
// A @2x piece is shown at `size`: SIMPLE sprites with sizeMode CUSTOM; SLICED sprites draw the
// borders in texture px, so their node has content size × scale and scale 1/scale (TECH).
// Prep: the opaque art inside `src` (alpha ≥ 128: AI sheets have faint halos) is scaled to `size`
// by area average (soft edges, like the reference UI: this art is not pixel art). The PSD is meant
// to be handed to an artist, kept short: a header with the sheet's `title` and `use` (manifest), then per object
// "NAME (9-SLICE|SIMPLE)", one line on where it is used, its states side by side captioned with
// the state only. Layers: pezzi/<group>/<name>/ (the art, retouch
// here; extra layers allowed), guide/ (piece areas, 9-slice lines), leggimi/ (labels), sfondo/;
// everything but pezzi is locked. ui.json: the slots.
// Export: every visible layer under pezzi/…/<name>/, blended like Photoshop (lib/psd.mjs), cropped
// to the slot → the game PNG; its .meta is a sprite-frame with linear filtering, no trim and the
// 9-slice borders, so Cocos imports it ready for Sprite type SLICED.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import agPsd from 'ag-psd';
import { readPng, encodePng } from './png.mjs';
import { readPsd, compositeLayers } from '../lib/psd.mjs';
import { fileURLToPath } from 'node:url';
import { drawText, textWidth, FONT_HEIGHT } from '../lib/pixel-font.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
if (!dir) { console.error('Usage: node tools/art/ui-sheet.mjs <sheet-dir> [--force] | --export'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const PSD_FILE = path.join(dir, 'ui.psd'), LAYOUT_FILE = path.join(dir, 'ui.json');
// assets/ui: used by the scene and prefabs, not loaded by path. A sheet may set "outDir" (e.g.
// assets/resources/<x> for art loaded on demand with resources.load).
const OUT_DIR = path.join(ROOT, manifest.outDir ?? path.join('assets', 'ui'));
const PAD = 24;
const BACKGROUND = [0x1e, 0x16, 0x1c, 255], SLOT = [0x3a, 0x2a, 0x36, 255], GUIDE = [0x3c, 0xe0, 0xc8, 255];
const INK = [0xf4, 0xec, 0xe6, 255], DIM = [0x9a, 0x88, 0x94, 255], ACCENT = [0x3c, 0xe0, 0xc8, 255], BAND = [0x2c, 0x21, 0x29, 255];

const SCALE = manifest.scale ?? 1;
if (!Number.isInteger(SCALE) || SCALE < 1) { console.error(`manifest: "scale" must be a whole number ≥ 1 (got ${manifest.scale})`); process.exit(1); }

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
for (const p of manifest.pieces || []) {
    if (!ID.test(p.name || '')) { console.error(`manifest: "${p.name}" must be an id (lowercase, dashes)`); process.exit(1); }
}

if (args.includes('--export')) exportPieces();
else prepare();

// ---------------------------------------------------------------------------------------

/** Area-average resample of premultiplied RGBA (soft, for downscaling). */
function resample(src, sw, sh, dw, dh) {
    const out = new Uint8Array(dw * dh * 4);
    const fx = sw / dw, fy = sh / dh;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        const x0 = x * fx, x1 = (x + 1) * fx, y0 = y * fy, y1 = (y + 1) * fy;
        for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
            const wx = Math.min(x1, sx + 1) - Math.max(x0, sx), wy = Math.min(y1, sy + 1) - Math.max(y0, sy), w = wx * wy;
            if (w <= 0) continue;
            const i = (sy * sw + sx) * 4, al = src[i + 3] / 255;
            r += src[i] * al * w; g += src[i + 1] * al * w; b += src[i + 2] * al * w; a += al * w; n += w;
        }
        const o = (y * dw + x) * 4;
        if (a <= 0) continue;
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a);
        const alpha = a / n;
        out[o + 3] = alpha > 0.97 ? 255 : Math.round(alpha * 255);   // the sheet's "opaque" is 253
    }
    return out;
}

function prepare() {
    if (fs.existsSync(PSD_FILE) && !args.includes('--force')) {
        console.error(`${PSD_FILE} exists and may hold hand edits: use --export to bring it to the game, or --force to prepare it again from source.png.`);
        process.exit(1);
    }
    if (fs.existsSync(PSD_FILE)) {
        const backup = PSD_FILE.replace(/\.psd$/, `.bak-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.psd`);
        fs.copyFileSync(PSD_FILE, backup);
        console.log(`backup: ${backup}`);
    }
    const sheet = readPng(path.join(dir, 'source.png'));
    const pieces = manifest.pieces.map(p => {
        const [x0, y0, x1, y1] = p.src, sw = x1 - x0 + 1, sh = y1 - y0 + 1;
        const crop = new Uint8Array(sw * sh * 4);
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
            const s = ((y + y0) * sheet.width + x + x0) * 4, d = (y * sw + x) * 4;
            if (sheet.rgba[s + 3] < 128) continue;              // halos
            crop.set(sheet.rgba.subarray(s, s + 3), d);
            crop[d + 3] = sheet.rgba[s + 3];
        }
        const k = p.scale ?? SCALE;                               // a piece may keep its own scale (thin bars at 1x)
        const [w, h] = p.size.map(v => v * k);                    // texture px
        return { ...p, k, w, h, cut: p.slice.map(v => v * k), rgba: resample(crop, sw, sh, w, h) };
    });
    // --- layout: a short header, then one block per object: "NAME (TYPE)", where it is used, its
    // states side by side with just the state as caption
    const groups = [];
    for (const p of pieces) {
        const title = p.group || p.name;
        let g = groups.find(x => x.title === title);
        if (!g) groups.push(g = { title, use: (manifest.groups || {})[title] || '', pieces: [] });
        g.pieces.push(p);
    }
    const kindOf = ([l, t, r, b]) => (l || r || t || b ? '9-slice' : 'simple');
    const sheetName = path.basename(path.resolve(dir));
    const T = 2, LINE = FONT_HEIGHT * T + 8;                      // body text: font dots of 2×2 px
    const texts = [];                                            // { s, x, y, color, scale }
    const say = (s, x, y, color = INK, scale = T) => { texts.push({ s, x, y, color, scale }); return textWidth(s, scale); };
    const header = [[manifest.title || sheetName, ACCENT, 3]];
    if (manifest.use) header.push([manifest.use, INK, T]);
    let y = PAD, width = 0;
    for (const [s, color, scale] of header) { width = Math.max(width, say(s, PAD, y, color, scale)); y += FONT_HEIGHT * scale + 8; }
    const headerBottom = y + PAD / 2;
    y = headerBottom + PAD;
    const MAX_W = Math.max(1400, width, ...pieces.map(p => p.w + 2 * PAD));
    for (const g of groups) {
        say(`${g.title} (${kindOf(g.pieces[0].cut)})`, PAD, y, ACCENT); y += LINE;
        if (g.use) { say(g.use, PAD, y, DIM); y += LINE; }
        y += 4;
        let x = PAD, rowH = 0;
        for (const p of g.pieces) {
            const lines = p.state ? [[p.state, INK]] : [];
            const colW = Math.max(p.w, ...lines.map(([s]) => textWidth(s, T)));
            if (x > PAD && x + colW > MAX_W) { y += rowH + PAD; x = PAD; rowH = 0; }
            p.slot = { x, y, w: p.w, h: p.h };
            lines.forEach(([s, color], i) => say(s, x, y + p.h + 8 + i * LINE, color));
            rowH = Math.max(rowH, p.h + 8 + lines.length * LINE);
            x += colW + 2 * PAD;
        }
        y += rowH + 2 * PAD;
    }
    width = Math.max(MAX_W, ...pieces.map(p => p.slot.x + p.slot.w), ...texts.map(t => t.x + textWidth(t.s, t.scale))) + PAD;
    const height = y;
    const full = () => new Uint8Array(width * height * 4);
    const fill = (cv, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cv.set(c, (y * width + x) * 4); };
    const bg = full(), slots = full(), guides = full(), labels = full();
    fill(bg, 0, 0, width, height, BACKGROUND);
    fill(bg, 0, 0, width, headerBottom, BAND);
    for (const t of texts) drawText(labels, width, t.s, t.x, t.y, t.color, t.scale);
    for (const p of pieces) {
        const { x, y, w, h } = p.slot;
        fill(slots, x, y, w, h, SLOT);
        const [l, t, r, b] = p.cut;
        // dashed 9-slice lines, just outside the art so they do not hide it
        for (let i = 0; i < Math.max(w, h) + 8; i += 2) {
            if (l) fill(guides, x + l, Math.max(0, y - 4 + i), 1, i < h + 8 ? 1 : 0, GUIDE);
            if (r) fill(guides, x + w - r, Math.max(0, y - 4 + i), 1, i < h + 8 ? 1 : 0, GUIDE);
            if (t) fill(guides, Math.max(0, x - 4 + i), y + t, i < w + 8 ? 1 : 0, 1, GUIDE);
            if (b) fill(guides, Math.max(0, x - 4 + i), y + h - b, i < w + 8 ? 1 : 0, 1, GUIDE);
        }
    }
    const image = (w, h, rgba) => ({ width: w, height: h, data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length) });
    const locked = { transparency: true, composite: true, position: true };
    const layer = (name, rgba) => ({ name, left: 0, top: 0, imageData: image(width, height, rgba), protected: locked });
    // ag-psd: children[0] is the bottom layer (see tests/art.test.mjs), so lists are reversed to
    // show the objects in the Layers panel in the same order as on the canvas
    const doc = {
        width, height,
        children: [
            { name: 'sfondo', layerColor: 'gray', protected: locked, children: [layer('sfondo', bg), layer('riquadri dei pezzi', slots)] },
            { name: 'pezzi', opened: true, layerColor: 'green', children: [...groups].reverse().map(g => ({
                name: g.title, opened: true,
                children: [...g.pieces].reverse().map(p => ({ name: p.name, children: [{ name: p.name, left: p.slot.x, top: p.slot.y, imageData: image(p.w, p.h, p.rgba) }] })),
            })) },
            { name: 'guide 9-slice', layerColor: 'violet', protected: locked, children: [layer('bordi 9-slice', guides)] },
            { name: 'leggimi', layerColor: 'yellow', protected: locked, children: [layer('etichette', labels)] },
        ],
    };
    fs.writeFileSync(PSD_FILE, agPsd.writePsdBuffer(doc, { generateThumbnail: false, noBackground: true }));
    // slot and slice in texture px (the PSD's own pixels)
    fs.writeFileSync(LAYOUT_FILE, JSON.stringify({ width, height, scale: SCALE, pieces: pieces.map(p => ({ name: p.name, slot: p.slot, slice: p.cut, ...(p.k !== SCALE ? { scale: p.k } : {}) })) }, null, 1) + '\n');
    console.log(`${PSD_FILE} (${width}x${height}, ${pieces.length} pieces${SCALE > 1 ? `, @${SCALE}x` : ''}): retouch pezzi/<name>, then npm run ui:export -- ${dir}`);
}

function exportPieces() {
    if (!fs.existsSync(PSD_FILE) || !fs.existsSync(LAYOUT_FILE)) { console.error(`${PSD_FILE} or ui.json missing: run ui:prep first`); process.exit(1); }
    const layout = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
    const psd = readPsd(PSD_FILE);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    let written = 0;
    const names = new Set(layout.pieces.map(p => p.name));
    for (const piece of layout.pieces) {
        // pezzi/<name>/… (first PSDs) or pezzi/<group>/<name>/…
        // the owner is the innermost folder named after a piece (a group may share a piece's name)
        const owner = l => [...l.path.slice(1)].reverse().map(f => f.trim()).find(f => names.has(f)) ?? (l.path.length === 1 ? l.name.trim() : null);
        const layers = psd.layers.filter(l => !l.hidden && (l.path[0] || '').trim().toLowerCase() === 'pezzi' && owner(l) === piece.name);
        if (!layers.length) { console.warn(`WARNING: no visible layers for "${piece.name}" in pezzi/`); continue; }
        const art = compositeLayers(layers);
        for (const note of art.notes) console.warn(`WARNING: "${piece.name}": ${note}`);
        const { x, y, w, h } = piece.slot;
        const rgba = new Uint8Array(w * h * 4);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const lx = x + xx - art.left, ly = y + yy - art.top;
            if (lx < 0 || ly < 0 || lx >= art.width || ly >= art.height) continue;
            rgba.set(art.rgba.subarray((ly * art.width + lx) * 4, (ly * art.width + lx) * 4 + 4), (yy * w + xx) * 4);
        }
        const file = path.join(OUT_DIR, `${piece.name}.png`);
        const png = encodePng(w, h, rgba);
        if (!fs.existsSync(file) || !fs.readFileSync(file).equals(png)) { fs.writeFileSync(file, png); written++; }
        writeUiMeta(file, w, h, piece.slice);
        const scale = piece.scale ?? layout.scale ?? 1;
        console.log(`${path.relative(ROOT, file)} ${w}x${h}${scale > 1 ? ` (@${scale}x: shown at ${w / scale}x${h / scale})` : ''}${piece.slice.some(v => v) ? ` 9-slice ${piece.slice.join(',')} texture px` : ''}`);
    }
    if (!fs.existsSync(OUT_DIR + '.meta')) {
        fs.writeFileSync(OUT_DIR + '.meta', JSON.stringify({ ver: '1.2.0', importer: 'directory', imported: true, uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {} }, null, 2) + '\n');
    }
    console.log(`${written} image(s) updated in ${path.relative(ROOT, OUT_DIR)}`);
}

/**
 * Sprite-frame meta: linear filtering (soft UI art, scaled), no trim (the 9-slice borders are
 * measured on the whole image) and the borders. Keeps the uuid and Cocos' own fields.
 */
function writeUiMeta(file, w, h, [left, top, right, bottom]) {
    const metaFile = file + '.meta';
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : { ver: '1.0.27', importer: 'image', imported: false, uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {} };
    const uuid = meta.uuid, name = path.basename(file, '.png');
    meta.userData = { ...meta.userData, type: 'sprite-frame', hasAlpha: true };
    const subs = meta.subMetas || (meta.subMetas = {});
    subs['6c48a'] = { importer: 'texture', uuid: `${uuid}@6c48a`, displayName: name, id: '6c48a', name: 'texture', ver: '1.0.22', imported: false, files: [], subMetas: {}, ...subs['6c48a'],
        userData: { ...(subs['6c48a'] || {}).userData, wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge', minfilter: 'linear', magfilter: 'linear', mipfilter: 'none', anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: uuid, visible: false } };
    subs.f9941 = { importer: 'sprite-frame', uuid: `${uuid}@f9941`, displayName: name, id: 'f9941', name: 'spriteFrame', ver: '1.0.12', imported: false, files: [], subMetas: {}, ...subs.f9941,
        userData: { ...(subs.f9941 || {}).userData, trimType: 'none', trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: w, height: h, rawWidth: w, rawHeight: h,
            borderLeft: left, borderTop: top, borderRight: right, borderBottom: bottom, packable: true, pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0, isUuid: true, imageUuidOrDatabaseUri: `${uuid}@6c48a`, atlasUuid: '' } };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
}
