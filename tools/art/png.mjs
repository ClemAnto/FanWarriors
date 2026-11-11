// Minimal PNG read/write for the art tools (no dependencies).
import fs from 'node:fs';
import zlib from 'node:zlib';

/** Decodes 8-bit PNGs (RGBA, RGB, grey, grey+alpha, palette), non-interlaced → { width, height, rgba }. */
export function readPng(file) {
    const buf = fs.readFileSync(file);
    let pos = 8, width = 0, height = 0, colorType = 6, bitDepth = 8, interlace = 0;
    let palette = null, trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
        else if (type === 'PLTE') palette = data;
        else if (type === 'tRNS') trns = data;
        else if (type === 'IDAT') idat.push(data);
        pos += 12 + len;
    }
    if (bitDepth !== 8 || interlace !== 0) throw new Error(`${file}: export as 8-bit, non-interlaced PNG`);
    const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * bpp;
    const px = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? px[y * stride + x - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + x] : 0;
            const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
            let v = raw[y * (stride + 1) + 1 + x];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            px[y * stride + x] = v & 255;
        }
    }
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const o = i * 4, s = i * bpp;
        if (colorType === 6) px.copy(rgba, o, s, s + 4);
        else if (colorType === 2) { rgba[o] = px[s]; rgba[o + 1] = px[s + 1]; rgba[o + 2] = px[s + 2]; rgba[o + 3] = 255; }
        else if (colorType === 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]; rgba[o + 3] = 255; }
        else if (colorType === 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]; rgba[o + 3] = px[s + 1]; }
        else { const k = px[s]; rgba[o] = palette[k * 3]; rgba[o + 1] = palette[k * 3 + 1]; rgba[o + 2] = palette[k * 3 + 2]; rgba[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    return { width, height, rgba };
}

/** Encodes RGBA → PNG buffer. */
export function encodePng(width, height, rgba) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    const chunk = (type, body) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
        const td = Buffer.concat([Buffer.from(type), body]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
