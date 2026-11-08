// Compose Playgama covers (800x800, 1080x1920, 1920x1080) from existing game art.
const path = require('path');
const fs = require('fs');
const P = 'D:/Projects/FunWarriors';
const sharp = require(path.join(P, 'node_modules', 'sharp'));
const OUT = path.join(P, 'submission', 'playgama');
fs.mkdirSync(OUT, { recursive: true });

const BG    = `${P}/assets/resources/bg/title_bg.png`;          // 1440x960
const LOGO  = `${P}/assets/textures/menu/title.png`;            // 1488x616
const COVER = `${P}/submission/gamedistribution/thumbnails/funwarriors_cover_1280x720.jpg`;
const W     = `${P}/assets/resources/warriors`;

async function cell(file, cols, rows, col, row, size) {
    const meta = await sharp(file).metadata();
    const cw = Math.floor(meta.width / cols), ch = Math.floor(meta.height / rows);
    return sharp(file).extract({ left: col * cw, top: row * ch, width: cw, height: ch })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
        .png().toBuffer();
}
async function logo(width) {
    return sharp(LOGO).resize({ width, kernel: 'lanczos3' }).png().toBuffer();
}
/** Soft contact shadow under a character. */
function shadow(w, h) {
    const svg = `<svg width="${w}" height="${h}"><ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" fill="black" fill-opacity="0.35"/></svg>`;
    return sharp(Buffer.from(svg)).blur(8).png().toBuffer();
}

(async () => {
    // Landscape 1920x1080 — upscale of the existing marketing cover.
    await sharp(COVER).resize(1920, 1080, { kernel: 'lanczos3' }).sharpen({ sigma: 0.7 })
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(`${OUT}/cover_1920x1080.jpg`);

    // Square 800x800 — castle background + logo + three warriors.
    {
        const bg = await sharp(BG).extract({ left: 240, top: 0, width: 960, height: 960 }).resize(800, 800, { kernel: 'lanczos3' }).toBuffer();
        const lg = await logo(720);
        const lion   = await cell(`${W}/lion_2x3.png`, 2, 3, 1, 2, 290);
        const dragon = await cell(`${W}/dragon_2x4.png`, 2, 4, 0, 3, 290);
        const cat    = await cell(`${W}/cat_2x2.png`, 2, 2, 1, 1, 330);
        await sharp(bg).composite([
            { input: lg, left: 40, top: 30 },
            { input: lion,   left: 15,  top: 490 },
            { input: dragon, left: 495, top: 490 },
            { input: cat,    left: 235, top: 455 },
        ]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(`${OUT}/cover_800x800.jpg`);
    }

    // Portrait 1080x1920 — softened castle background (2x upscale → intentional depth blur) + logo + warriors.
    {
        const bg = await sharp(BG).extract({ left: 450, top: 0, width: 540, height: 960 })
            .resize(1080, 1920, { kernel: 'lanczos3' }).blur(2.5).modulate({ brightness: 0.92 }).toBuffer();
        const lg = await logo(1000);
        const lion   = await cell(`${W}/lion_2x3.png`, 2, 3, 1, 2, 430);
        const dragon = await cell(`${W}/dragon_2x4.png`, 2, 4, 0, 3, 430);
        const cat    = await cell(`${W}/cat_2x2.png`, 2, 2, 1, 1, 500);
        await sharp(bg).composite([
            { input: lg, left: 40, top: 220 },
            { input: lion,   left: 20,  top: 1240 },
            { input: dragon, left: 630, top: 1240 },
            { input: cat,    left: 290, top: 1270 },
        ]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(`${OUT}/cover_1080x1920.jpg`);
    }
    console.log('covers written to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
