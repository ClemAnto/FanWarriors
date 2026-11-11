// Minimal PSD (Photoshop, version 1, RGB 8-bit) reader and writer for the art tools.
// Reader: layer pixels with raw or RLE (PackBits) channels — what Photoshop saves by default —
// unicode layer names, hidden flag, layer masks, opacity (layer × fill × folders), blend mode and
// clipping. Adjustment layers cannot be applied: they are listed in `adjustments` so the tools can
// say so. compositeLayers() blends layers the way Photoshop does for the modes the art uses.

import fs from 'node:fs';

// ---------------------------------------------------------------------------------------
// Writer

const u8 = v => { const b = Buffer.alloc(1); b.writeUInt8(v); return b; };
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const i16 = v => { const b = Buffer.alloc(2); b.writeInt16BE(v); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; };
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
/** 'luni' block: the layer name as UTF-16 (Photoshop shows this one). */
const unicodeName = s => {
    const chars = [...s];
    let body = Buffer.concat([u32(chars.length), ...chars.map(ch => u16(ch.charCodeAt(0)))]);
    if (body.length % 2) body = Buffer.concat([body, Buffer.alloc(1)]);
    return Buffer.concat([Buffer.from('8BIM'), Buffer.from('luni'), u32(body.length), body]);
};
const pascal4 = s => {
    const name = Buffer.from(s, 'latin1').subarray(0, 255);
    const pad = (4 - ((1 + name.length) % 4)) % 4;
    return Buffer.concat([u8(name.length), name, Buffer.alloc(pad)]);
};

/**
 * layers bottom → top: { name, x, y, width, height, rgba | null, hidden }, or a folder
 * { group: name, children: [...same, bottom → top], hidden }.
 * `merged` is the flattened canvas (width*height*4) Photoshop shows as the composite.
 */
export function writePsd(width, height, tree, merged, options = {}) {
    // Folders are written the Photoshop way: a hidden "</Layer group>" divider, the children,
    // then the folder record itself (lsct 3 = divider, 1 = open folder).
    const layers = [];
    const flatten = list => {
        for (const item of list) {
            if (item.group) {
                layers.push({ name: '</Layer group>', rgba: null, section: 3 });
                flatten(item.children || []);
                layers.push({ name: item.group, rgba: null, section: 1, hidden: item.hidden });
            } else layers.push(item);
        }
    };
    flatten(tree);
    // Optional PackBits (RLE) layer channels — what Photoshop writes; used by the tests.
    const encodeChannel = (plane, w, h) => {
        if (!options.rle || plane.length === 0) return Buffer.concat([u16(0), plane]);
        const rows = [];
        for (let y = 0; y < h; y++) {
            const row = plane.subarray(y * w, (y + 1) * w);
            const parts = [];
            let i = 0;
            while (i < row.length) {
                let run = 1;
                while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
                if (run >= 3) { parts.push(Buffer.from([257 - run, row[i]])); i += run; continue; }
                let lit = 1;
                while (i + lit < row.length && lit < 128 && !(i + lit + 2 < row.length && row[i + lit] === row[i + lit + 1] && row[i + lit] === row[i + lit + 2])) lit++;
                parts.push(Buffer.from([lit - 1]), row.subarray(i, i + lit)); i += lit;
            }
            rows.push(Buffer.concat(parts));
        }
        return Buffer.concat([u16(1), ...rows.map(r => u16(r.length)), ...rows]);
    };
    const planes = (rgba, w, h) => [3, 0, 1, 2].map(c => {
        const p = Buffer.alloc(w * h);
        for (let i = 0; i < w * h; i++) p[i] = rgba[i * 4 + c];
        return p;
    });
    const records = [];
    const images = [];
    for (const l of layers) {
        const empty = !l.rgba;
        const rect = empty ? [0, 0, 0, 0] : [l.y, l.x, l.y + l.height, l.x + l.width];
        const channels = (empty ? [0, 1, 2, 3].map(() => Buffer.alloc(0)) : planes(l.rgba, l.width, l.height))
            .map(c => encodeChannel(c, l.width || 0, l.height || 0));
        const rec = [...rect.map(i32), u16(4)];
        [-1, 0, 1, 2].forEach((id, k) => rec.push(i16(id), u32(channels[k].length)));
        const blocks = [unicodeName(l.name)];
        if (l.section) blocks.push(Buffer.concat([Buffer.from('8BIM'), Buffer.from('lsct'), u32(4), u32(l.section)]));
        const extra = Buffer.concat([u32(0), u32(0), pascal4(l.name), ...blocks]);
        rec.push(Buffer.from('8BIM'), Buffer.from('norm'), u8(255), u8(0), u8(l.hidden ? 2 : 0), u8(0), u32(extra.length), extra);
        records.push(Buffer.concat(rec));
        for (const c of channels) images.push(c);
    }
    let info = Buffer.concat([i16(-layers.length), ...records, ...images]);
    if (info.length % 2) info = Buffer.concat([info, Buffer.alloc(1)]);
    const section = Buffer.concat([u32(info.length), info, u32(0)]);
    const [a, r, g, b] = planes(merged, width, height);
    return Buffer.concat([
        Buffer.from('8BPS'), u16(1), Buffer.alloc(6), u16(4), u32(height), u32(width), u16(8), u16(3),
        u32(0), u32(0), u32(section.length), section, u16(0), r, g, b, a,
    ]);
}

// ---------------------------------------------------------------------------------------
// Reader

function unpackBits(src, pos, end, out, outPos, count) {
    let o = outPos;
    while (pos < end && o < outPos + count) {
        const n = src.readInt8(pos++);
        if (n >= 0) { src.copy(out, o, pos, pos + n + 1); pos += n + 1; o += n + 1; }
        else if (n !== -128) { out.fill(src[pos++], o, o + 1 - n); o += 1 - n; }
    }
}

/** Decodes one channel (raw or RLE) of w×h into a new buffer. */
function readChannel(buf, start, length, w, h) {
    const out = Buffer.alloc(w * h);
    if (length < 2 || w * h === 0) return out;
    const compression = buf.readUInt16BE(start);
    let pos = start + 2;
    if (compression === 0) {
        buf.copy(out, 0, pos, pos + w * h);
    } else if (compression === 1) {
        const counts = [];
        for (let y = 0; y < h; y++) { counts.push(buf.readUInt16BE(pos)); pos += 2; }
        for (let y = 0; y < h; y++) { unpackBits(buf, pos, pos + counts[y], out, y * w, w); pos += counts[y]; }
    } else {
        throw new Error('ZIP-compressed PSD channels are not supported: save with "Maximize compatibility" (default)');
    }
    return out;
}

/**
 * → { width, height, layers: [{ name, path, left, top, width, height, rgba, hidden }] } (bottom → top).
 * `path` lists the folders containing the layer, outermost first (e.g. ["arredo", "divano"]);
 * `hidden` is true when the layer or any of its folders is hidden.
 */
export function readPsd(file) {
    const buf = fs.readFileSync(file);
    if (buf.toString('latin1', 0, 4) !== '8BPS') throw new Error(`${file}: not a PSD`);
    if (buf.readUInt16BE(4) !== 1) throw new Error(`${file}: PSB (large document) is not supported`);
    const height = buf.readUInt32BE(14), width = buf.readUInt32BE(18);
    const depth = buf.readUInt16BE(22), mode = buf.readUInt16BE(24);
    if (depth !== 8 || mode !== 3) throw new Error(`${file}: use RGB colour, 8 bits/channel (Image › Mode)`);
    let p = 26;
    p += 4 + buf.readUInt32BE(p);              // colour mode data
    p += 4 + buf.readUInt32BE(p);              // image resources
    const lmLength = buf.readUInt32BE(p); p += 4;
    if (lmLength === 0) return { width, height, layers: [] };
    const liLength = buf.readUInt32BE(p); p += 4;
    if (liLength === 0) return { width, height, layers: [] };
    const count = Math.abs(buf.readInt16BE(p)); p += 2;

    const records = [];
    for (let k = 0; k < count; k++) {
        const top = buf.readInt32BE(p), left = buf.readInt32BE(p + 4), bottom = buf.readInt32BE(p + 8), right = buf.readInt32BE(p + 12);
        p += 16;
        const nch = buf.readUInt16BE(p); p += 2;
        const channels = [];
        for (let c = 0; c < nch; c++) { channels.push({ id: buf.readInt16BE(p), length: buf.readUInt32BE(p + 2) }); p += 6; }
        const blend = buf.toString('latin1', p + 4, p + 8); p += 8;   // '8BIM' + blend key
        const opacity = buf[p], clipped = buf[p + 1] === 1; p += 2;
        const flags = buf[p]; p += 2;            // flags, filler
        const extraLength = buf.readUInt32BE(p); p += 4;
        const extraEnd = p + extraLength;
        // layer mask data: the user mask's rectangle, colour outside it and flags (bit 1 = disabled)
        const maskLength = buf.readUInt32BE(p);
        let mask = null;
        if (maskLength >= 20) {
            const mt = buf.readInt32BE(p + 4), ml = buf.readInt32BE(p + 8), mb = buf.readInt32BE(p + 12), mr = buf.readInt32BE(p + 16);
            mask = { top: mt, left: ml, width: mr - ml, height: mb - mt, outside: buf[p + 20], disabled: (buf[p + 21] & 2) !== 0 };
        }
        p += 4 + maskLength;
        p += 4 + buf.readUInt32BE(p);            // blending ranges
        const nameLength = buf[p];
        let name = buf.toString('latin1', p + 1, p + 1 + nameLength);
        p += Math.ceil((1 + nameLength) / 4) * 4;
        let section = 0, fill = 255, adjustment = null;
        while (p + 12 <= extraEnd) {             // additional layer information
            const key = buf.toString('latin1', p + 4, p + 8);
            const len = buf.readUInt32BE(p + 8);
            const data = p + 12;
            if (key === 'luni') {
                const n = buf.readUInt32BE(data);
                let s = '';
                for (let i = 0; i < n; i++) s += String.fromCharCode(buf.readUInt16BE(data + 4 + i * 2));
                name = s.replace(/\0+$/, '');
            } else if (key === 'lsct' || key === 'lsdk') {
                section = buf.readUInt32BE(data);
            } else if (key === 'iOpa') {
                fill = buf[data];
            } else if (ADJUSTMENT_KEYS.has(key)) {
                adjustment = key;
            }
            p = data + len + (len % 2);
        }
        p = extraEnd;
        records.push({ name, top, left, width: right - left, height: bottom - top, channels, hidden: (flags & 2) !== 0, section, mask, blend, opacity: opacity / 255 * fill / 255, clipped, adjustment });
    }
    for (const r of records) {
        const planes = {};
        for (const ch of r.channels) {
            if (ch.id >= -1 && ch.id <= 2) planes[ch.id] = readChannel(buf, p, ch.length, r.width, r.height);
            else if (ch.id === -2 && r.mask && r.mask.width > 0 && r.mask.height > 0) planes[-2] = readChannel(buf, p, ch.length, r.mask.width, r.mask.height);
            p += ch.length;
        }
        if (r.width <= 0 || r.height <= 0 || r.section) { r.rgba = null; continue; }
        const rgba = Buffer.alloc(r.width * r.height * 4);
        // the user mask (Photoshop "layer mask") hides pixels: alpha × mask
        const m = r.mask && !r.mask.disabled && planes[-2] ? r.mask : null;
        for (let i = 0; i < r.width * r.height; i++) {
            rgba[i * 4] = planes[0] ? planes[0][i] : 0;
            rgba[i * 4 + 1] = planes[1] ? planes[1][i] : 0;
            rgba[i * 4 + 2] = planes[2] ? planes[2][i] : 0;
            let a = planes[-1] ? planes[-1][i] : 255;
            if (m) {
                const mx = (i % r.width) + r.left - m.left, my = ((i / r.width) | 0) + r.top - m.top;
                const v = mx >= 0 && my >= 0 && mx < m.width && my < m.height ? planes[-2][my * m.width + mx] : m.outside;
                a = Math.round(a * v / 255);
            }
            rgba[i * 4 + 3] = a;
        }
        r.rgba = rgba;
    }
    // Folders: records go bottom → top; a divider (lsct 3) opens a folder whose name and
    // visibility come with its closing record (lsct 1 or 2).
    // A folder's opacity multiplies its children; a folder blend other than pass-through is noted.
    const stack = [];
    for (const r of records) {
        if (r.section === 3) { stack.push([]); continue; }
        if (r.section === 1 || r.section === 2) {
            const children = stack.pop() || [];
            for (const child of children) {
                child.path.unshift(r.name);
                child.hidden = child.hidden || r.hidden;
                child.opacity *= r.opacity;
                if (r.blend !== 'pass' && r.blend !== 'norm') child.folderBlend = r.blend;
            }
            if (stack.length) stack[stack.length - 1].push(...children);
            continue;
        }
        r.path = [];
        if (stack.length) stack[stack.length - 1].push(r);
    }
    const pick = ({ name, path, left, top, width: w, height: h, rgba, hidden, blend, opacity, clipped, folderBlend }) =>
        ({ name, path: path || [], left, top, width: w, height: h, rgba, hidden, blend, opacity, clipped, folderBlend: folderBlend || null });
    return {
        width, height,
        layers: records.filter(r => r.rgba).map(pick),
        adjustments: records.filter(r => r.adjustment && !r.section).map(r => ({ name: r.name, path: r.path || [], hidden: r.hidden, kind: r.adjustment })),
    };
}

/** Additional-info keys of adjustment (and fill) layers: they change the pixels below them. */
const ADJUSTMENT_KEYS = new Set(['levl', 'curv', 'brit', 'hue ', 'hue2', 'blnc', 'mixr', 'selc', 'thrs', 'nvrt', 'post',
    'phfl', 'grdm', 'expA', 'vibA', 'blwh', 'clrL', 'SoCo', 'GdFl', 'PtFl']);

/** Blend modes compositeLayers() reproduces (Photoshop keys): backdrop b, source s, 0..255. */
const BLENDS = {
    'norm': (b, s) => s,
    'mul ': (b, s) => b * s / 255,
    'scrn': (b, s) => 255 - (255 - b) * (255 - s) / 255,
    'over': (b, s) => (b < 128 ? 2 * b * s / 255 : 255 - 2 * (255 - b) * (255 - s) / 255),
    'lddg': (b, s) => Math.min(255, b + s),
    'dark': (b, s) => Math.min(b, s),
    'lite': (b, s) => Math.max(b, s),
};
const BLEND_NAMES = {
    'diss': 'Dissolve', 'idiv': 'Color Burn', 'lbrn': 'Linear Burn', 'dkCl': 'Darker Color', 'div ': 'Color Dodge', 'lgCl': 'Lighter Color',
    'sLit': 'Soft Light', 'hLit': 'Hard Light', 'vLit': 'Vivid Light', 'lLit': 'Linear Light', 'pLit': 'Pin Light', 'hMix': 'Hard Mix',
    'diff': 'Difference', 'smud': 'Exclusion', 'fsub': 'Subtract', 'fdiv': 'Divide', 'hue ': 'Hue', 'sat ': 'Saturation', 'colr': 'Color', 'lum ': 'Luminosity',
};

/**
 * Blends layers (bottom → top, as readPsd lists them) like Photoshop: opacity, clipping masks
 * (a clipped layer shows only over the layer it clips to) and the blend modes in BLENDS. Returns
 * { left, top, width, height, rgba, notes }: notes name what could not be reproduced (other blend
 * modes are drawn as Normal), so the caller can warn.
 */
export function compositeLayers(layers) {
    const notes = [];
    const minX = Math.min(...layers.map(l => l.left)), minY = Math.min(...layers.map(l => l.top));
    const w = Math.max(...layers.map(l => l.left + l.width)) - minX, h = Math.max(...layers.map(l => l.top + l.height)) - minY;
    const rgba = Buffer.alloc(w * h * 4);
    let base = null;      // the layer clipped layers clip to: the nearest unclipped one below
    for (const l of layers) {
        if (l.folderBlend) notes.push(`"${l.name}": folder blend mode ${BLEND_NAMES[l.folderBlend] || l.folderBlend} ignored`);
        const blend = l.blend || 'norm';
        const fn = BLENDS[blend] || BLENDS.norm;
        if (!BLENDS[blend]) notes.push(`"${l.name}": blend mode ${BLEND_NAMES[blend] || blend} drawn as Normal`);
        const clipTo = l.clipped ? base : null;
        if (l.clipped && !base) notes.push(`"${l.name}": clipped to nothing (no layer below it)`);
        const opacity = l.opacity ?? 1;
        for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
            const s = (y * l.width + x) * 4;
            let a = l.rgba[s + 3] / 255 * opacity;
            if (clipTo) {
                const bx = x + l.left - clipTo.left, by = y + l.top - clipTo.top;
                a *= bx >= 0 && by >= 0 && bx < clipTo.width && by < clipTo.height ? clipTo.rgba[(by * clipTo.width + bx) * 4 + 3] / 255 : 0;
            }
            if (!a) continue;
            const d = ((y + l.top - minY) * w + (x + l.left - minX)) * 4, da = rgba[d + 3] / 255;
            const oa = a + da * (1 - a);
            for (let k = 0; k < 3; k++) {
                // separable blending: over a transparent backdrop the layer's own colour shows
                const cs = (1 - da) * l.rgba[s + k] + da * fn(rgba[d + k], l.rgba[s + k]);
                rgba[d + k] = Math.round((cs * a + rgba[d + k] * da * (1 - a)) / oa);
            }
            rgba[d + 3] = Math.round(oa * 255);
        }
        if (!l.clipped) base = l;
    }
    return { left: minX, top: minY, width: w, height: h, rgba, notes: [...new Set(notes)] };
}

/**
 * The visible art layers of the "arredo" folder grouped by item (its subfolder, or the layer
 * itself): `items` Map name → layers bottom → top. "parts" layers (Pixel Outline's hand-picked
 * parts) are never art. `adjustments` Map name → names of the adjustment layers found in that item
 * (they cannot be applied: the tools warn).
 */
export function arredoItems(psd) {
    const inArredo = l => (l.path[0] || '').trim().toLowerCase() === 'arredo';
    const items = new Map();
    for (const l of psd.layers) {
        if (l.hidden || /^parts$/i.test(l.name.trim()) || !inArredo(l)) continue;
        const name = (l.path[1] ?? l.name).trim();
        if (!items.has(name)) items.set(name, []);
        items.get(name).push(l);
    }
    const adjustments = new Map();
    for (const a of psd.adjustments || []) {
        if (a.hidden || !inArredo(a)) continue;
        const name = (a.path[1] ?? a.name).trim();
        if (!adjustments.has(name)) adjustments.set(name, []);
        adjustments.get(name).push(a.name);
    }
    return { items, adjustments };
}
