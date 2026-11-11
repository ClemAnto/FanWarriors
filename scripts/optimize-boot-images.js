/**
 * One-shot boot-weight optimizer (2026-11-11) — shrinks the images on the first-load path.
 *
 *   node scripts/optimize-boot-images.js
 *
 * UUIDs are preserved (each .meta is kept / renamed with its file), so scenes and prefabs need
 * no changes. PNG → JPG only for images WITHOUT alpha (hasAlpha:false in the meta): JPG stays
 * truecolor, so no gradient banding (the reason backgrounds were kept truecolor PNG before).
 *
 *  - hud/cog.png            1024² → 192² (shown at 60 px), texture compression off (it shipped
 *                           as 3×512 KB PVR/ETC/ASTC + PNG)
 *  - menu/title.png         1488 → 1000 px wide (shown at 500 px)
 *  - background.png         → background.jpg (no alpha)
 *  - resources/bg/title_bg  → title_bg.jpg (no alpha)
 *  - illustrations/game_over, win → 512² JPG, MOVED to resources/illustrations/ so they leave the
 *                           Game-scene dependencies (EndPanel lazy-loads them)
 *  - build-templates/web-mobile/title.png → title.webp (HTML loading-screen logo, 720 px wide)
 *
 * Not re-runnable as-is (sources are renamed/moved): restore from git to run again.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const abs = (p) => path.join(ROOT, p);
const kb = (n) => `${Math.round(n / 1024)} KB`;

function moveMeta(fromPng, toFile, metaPatch) {
    const meta = JSON.parse(fs.readFileSync(abs(fromPng) + '.meta', 'utf8'));
    meta.files = (meta.files || []).map(f => (f === '.png' ? path.extname(toFile) : f));
    if (metaPatch) metaPatch(meta);
    fs.writeFileSync(abs(toFile) + '.meta', JSON.stringify(meta, null, 2));
    if (abs(fromPng) !== abs(toFile)) {
        fs.unlinkSync(abs(fromPng) + '.meta');
        fs.unlinkSync(abs(fromPng));
    }
}

async function job(label, from, to, pipeline, metaPatch) {
    const before = fs.statSync(abs(from)).size;
    const buf = await pipeline(sharp(abs(from))).toBuffer();
    fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
    if (abs(from) === abs(to)) {
        fs.writeFileSync(abs(to), buf);
        if (metaPatch) moveMeta(from, to, metaPatch);
    } else {
        fs.writeFileSync(abs(to), buf);
        if (fs.existsSync(abs(from) + '.meta')) moveMeta(from, to, metaPatch);
        else fs.unlinkSync(abs(from));
    }
    console.log(`${label.padEnd(22)} ${kb(before).padStart(7)} → ${kb(buf.length).padStart(7)}  ${to}`);
}

const fit = (w, h) => (img) => img.resize({ width: w, height: h ?? w, fit: 'inside', withoutEnlargement: true });
// q80 + 4:2:0: ~45% smaller than q85/4:4:4 on these painted backgrounds, no visible loss at game size.
const jpg = (img) => img.jpeg({ quality: 80, progressive: true, chromaSubsampling: '4:2:0' });

(async () => {
    await job('cog', 'assets/textures/hud/cog.png', 'assets/textures/hud/cog.png',
        (img) => fit(192)(img).png({ compressionLevel: 9, adaptiveFiltering: true }),
        (meta) => { meta.userData.compressSettings = { useCompressTexture: false }; });
    await job('menu title', 'assets/textures/menu/title.png', 'assets/textures/menu/title.png',
        (img) => fit(1000, 1000)(img).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }));  // source is already palette PNG: truecolor output would grow
    await job('game background', 'assets/textures/background/background.png', 'assets/textures/background/background.jpg', jpg);
    await job('menu background', 'assets/resources/bg/title_bg.png', 'assets/resources/bg/title_bg.jpg', jpg);
    await job('game over art', 'assets/textures/illustrations/game_over.png', 'assets/resources/illustrations/game_over.jpg',
        (img) => jpg(fit(512)(img)));
    await job('victory art', 'assets/textures/illustrations/win.png', 'assets/resources/illustrations/win.jpg',
        (img) => jpg(fit(512)(img)));
    await job('loading logo', 'build-templates/web-mobile/title.png', 'build-templates/web-mobile/title.webp',
        (img) => fit(720, 720)(img).webp({ quality: 85, alphaQuality: 90, effort: 6 }));
})().catch((e) => { console.error(e); process.exit(1); });
