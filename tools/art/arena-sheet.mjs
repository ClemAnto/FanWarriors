#!/usr/bin/env node
// Arena art (background + track skin, data/Arenas.ts): AI images → a PSD to retouch → the game.
//
//   npm run arena:prep -- <arena> [--force]   graphics/arenas/<arena>/{background,track}-source.png → arena.psd
//   npm run arena:export -- <arena>           arena.psd → assets/resources/arenas/<arena>/{background.jpg, track.png} + .meta
//
// Prep: the background is cover-scaled to the game background size (1440x768, like
// assets/textures/background/background.jpg); the track skin is fitted onto the silhouette of the
// original track (assets/textures/track/track.png, 1024x955): the bounding box of its opaque pixels
// is mapped onto the original's, so walls and floor edges land where the colliders are
// (the Track walls are built from the TrackSprite size, not from the picture).
// PSD (canvas: background on top, track below): pezzi/background, pezzi/track (retouch here; extra
// layers allowed), guide/ (the original track outline, hidden from the export), leggimi/ none.
// Export: every visible layer under pezzi/<name>/ → background JPG (q 86, no alpha) and track PNG,
// with sprite-frame metas (linear filtering, no trim). Lazy-loaded with resources.load.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { writePsd, readPsd, compositeLayers } from '../lib/psd.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arena = args.find(a => !a.startsWith('--'));
if (!arena || !/^[a-z0-9-]+$/.test(arena)) { console.error('Usage: node tools/art/arena-sheet.mjs <arena> [--force] | --export'); process.exit(1); }
const DIR = path.join(ROOT, 'graphics', 'arenas', arena);
const PSD_FILE = path.join(DIR, 'arena.psd');
const OUT_DIR = path.join(ROOT, 'assets', 'resources', 'arenas', arena);
const ORIG_TRACK = path.join(ROOT, 'assets', 'textures', 'track', 'track.png');
const BG_W = 1440, BG_H = 768, GAP = 40;

const raw = async (input) => {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
};
const bboxOf = ({ rgba, w, h }) => {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (rgba[(y * w + x) * 4 + 3] < 128) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

if (args.includes('--export')) await exportArena();
else await prepare();

async function prepare() {
    if (fs.existsSync(PSD_FILE) && !args.includes('--force')) { console.error(`${PSD_FILE} exists (retouched by hand?): pass --force to rebuild it`); process.exit(1); }
    const bgSrc = path.join(DIR, 'background-source.png'), trSrc = path.join(DIR, 'track-source.png');
    for (const f of [bgSrc, trSrc]) if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }

    const bg = await raw(await sharp(bgSrc).resize(BG_W, BG_H, { fit: 'cover', kernel: 'lanczos3' }).png().toBuffer());

    const orig = await raw(ORIG_TRACK);
    const ob = bboxOf(orig);
    const src = await raw(trSrc);
    const sb = bboxOf(src);
    const fitted = await sharp(trSrc).extract({ left: sb.x, top: sb.y, width: sb.w, height: sb.h })
        .resize(ob.w, ob.h, { fit: 'fill', kernel: 'lanczos3' })
        .extend({ left: ob.x, top: ob.y, right: orig.w - ob.x - ob.w, bottom: orig.h - ob.y - ob.h, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
    const track = await raw(fitted);

    // silhouette match (intersection over union of the opaque pixels)
    let inter = 0, uni = 0;
    for (let i = 0; i < orig.w * orig.h; i++) {
        const a = orig.rgba[i * 4 + 3] >= 128, b = track.rgba[i * 4 + 3] >= 128;
        if (a && b) inter++; if (a || b) uni++;
    }
    // guide: the original outline (alpha edge) in red
    const guide = new Uint8Array(orig.w * orig.h * 4);
    const op = (x, y) => x >= 0 && y >= 0 && x < orig.w && y < orig.h && orig.rgba[(y * orig.w + x) * 4 + 3] >= 128;
    for (let y = 0; y < orig.h; y++) for (let x = 0; x < orig.w; x++) {
        if (op(x, y) && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) guide.set([255, 40, 40, 255], (y * orig.w + x) * 4);
    }

    const W = BG_W, H = BG_H + GAP + orig.h;
    const tx = Math.round((W - orig.w) / 2), ty = BG_H + GAP;
    const backdrop = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) backdrop.set([0x1e, 0x16, 0x1c, 255], i * 4);
    const merged = Uint8Array.from(backdrop);
    const put = (img, ox, oy) => {
        for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
            const s = (y * img.w + x) * 4, d = ((y + oy) * W + x + ox) * 4, a = img.rgba[s + 3] / 255;
            for (let c = 0; c < 3; c++) merged[d + c] = Math.round(img.rgba[s + c] * a + merged[d + c] * (1 - a));
        }
    };
    put(bg, 0, 0); put(track, tx, ty);
    const tree = [
        { name: 'sfondo', x: 0, y: 0, width: W, height: H, rgba: backdrop },
        { group: 'pezzi', children: [
            { group: 'track', children: [{ name: 'track', x: tx, y: ty, width: orig.w, height: orig.h, rgba: track.rgba }] },
            { group: 'background', children: [{ name: 'background', x: 0, y: 0, width: BG_W, height: BG_H, rgba: bg.rgba }] },
        ] },
        { group: 'guide', hidden: true, children: [{ name: 'original track outline', x: tx, y: ty, width: orig.w, height: orig.h, rgba: guide }] },
    ];
    fs.writeFileSync(PSD_FILE, writePsd(W, H, tree, merged, { rle: true }));
    fs.writeFileSync(path.join(DIR, 'arena.json'), JSON.stringify({ width: W, height: H, pieces: [
        { name: 'background', slot: { x: 0, y: 0, w: BG_W, h: BG_H }, format: 'jpg' },
        { name: 'track', slot: { x: tx, y: ty, w: orig.w, h: orig.h }, format: 'png' },
    ] }, null, 1) + '\n');
    console.log(`${path.relative(ROOT, PSD_FILE)} (${W}x${H}): track silhouette match ${(inter / uni * 100).toFixed(1)}% — retouch pezzi/, then npm run arena:export -- ${arena}`);
}

async function exportArena() {
    const layoutFile = path.join(DIR, 'arena.json');
    if (!fs.existsSync(PSD_FILE) || !fs.existsSync(layoutFile)) { console.error(`${PSD_FILE} or arena.json missing: run arena:prep first`); process.exit(1); }
    const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
    const psd = readPsd(PSD_FILE);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const piece of layout.pieces) {
        const layers = psd.layers.filter(l => !l.hidden && (l.path[0] || '').trim().toLowerCase() === 'pezzi' && (l.path[1] || '').trim() === piece.name);
        if (!layers.length) { console.warn(`WARNING: no visible layers for "${piece.name}" in pezzi/`); continue; }
        const art = compositeLayers(layers);
        for (const note of art.notes) console.warn(`WARNING: "${piece.name}": ${note}`);
        const { x, y, w, h } = piece.slot;
        const rgba = Buffer.alloc(w * h * 4);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const lx = x + xx - art.left, ly = y + yy - art.top;
            if (lx < 0 || ly < 0 || lx >= art.width || ly >= art.height) continue;
            rgba.set(art.rgba.subarray((ly * art.width + lx) * 4, (ly * art.width + lx) * 4 + 4), (yy * w + xx) * 4);
        }
        const img = sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
        const file = path.join(OUT_DIR, `${piece.name}.${piece.format}`);
        const buf = piece.format === 'jpg'
            ? await img.flatten({ background: '#000000' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
            : await img.png({ compressionLevel: 9, palette: true, quality: 85, dither: 0.6 }).toBuffer();
        fs.writeFileSync(file, buf);
        writeMeta(file, w, h, piece.format === 'png');
        console.log(`${path.relative(ROOT, file)} ${w}x${h} ${(buf.length / 1024).toFixed(0)} KB`);
    }
    for (const d of [path.dirname(OUT_DIR), OUT_DIR]) {
        if (!fs.existsSync(d + '.meta')) fs.writeFileSync(d + '.meta', JSON.stringify({ ver: '1.2.0', importer: 'directory', imported: true, uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {} }, null, 2) + '\n');
    }
}

/** Sprite-frame meta (linear filtering, no trim). Keeps the uuid and Cocos' own fields. */
function writeMeta(file, w, h, hasAlpha) {
    const metaFile = file + '.meta';
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : { ver: '1.0.27', importer: 'image', imported: false, uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {} };
    const uuid = meta.uuid, name = path.basename(file).replace(/\.[^.]+$/, '');
    meta.userData = { ...meta.userData, type: 'sprite-frame', hasAlpha };
    const subs = meta.subMetas || (meta.subMetas = {});
    subs['6c48a'] = { importer: 'texture', uuid: `${uuid}@6c48a`, displayName: name, id: '6c48a', name: 'texture', ver: '1.0.22', imported: false, files: [], subMetas: {}, ...subs['6c48a'],
        userData: { ...(subs['6c48a'] || {}).userData, wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge', minfilter: 'linear', magfilter: 'linear', mipfilter: 'none', anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: uuid, visible: false } };
    subs.f9941 = { importer: 'sprite-frame', uuid: `${uuid}@f9941`, displayName: name, id: 'f9941', name: 'spriteFrame', ver: '1.0.12', imported: false, files: [], subMetas: {}, ...subs.f9941,
        // track: auto trim like the original track.png (TrackSprite draws the trimmed rect into its size)
        userData: { ...(subs.f9941 || {}).userData, trimType: hasAlpha ? 'auto' : 'none', trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: w, height: h, rawWidth: w, rawHeight: h,
            borderLeft: 0, borderTop: 0, borderRight: 0, borderBottom: 0, packable: false, pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0, isUuid: true, imageUuidOrDatabaseUri: `${uuid}@6c48a`, atlasUuid: '' } };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
}
