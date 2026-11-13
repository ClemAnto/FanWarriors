#!/usr/bin/env node
// Video of the powerup tutorial on a phone: frozen scene dims, the medallion pops over the
// warrior and flies into the card, then the illustration zoom (pinch, drag, tap to close) and
// "Got it". Headless Chrome screencast → ffmpeg (variable frame timing kept) → MP4.
//
//   npm run build && node tests/e2e/record-powerup.mjs [--out <file.mp4>] [--size 390x844]
//
// Needs Chrome ($CHROME) and ffmpeg on PATH.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', path.join(os.tmpdir(), 'funwarriors-powerup-intro.mp4'));
const [W, H] = arg('--size', '390x844').split('x').map(Number);
const PORT = 8126, DEBUG_PORT = 9336;
const FRAMES = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-rec-'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const p = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(BUILD) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
}).listen(PORT);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-rec-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
    for (let i = 0; i < 50; i++) {
        try {
            const page = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find(t => t.type === 'page');
            if (page) return page.webSocketDebuggerUrl;
        } catch { /* not up yet */ }
        await sleep(200);
    }
    throw new Error('Chrome DevTools not reachable');
}
const ws = new WebSocket(await connect());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const frames = [];   // { file, t }
ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, ko } = pending.get(msg.id); pending.delete(msg.id); msg.error ? ko(new Error(msg.error.message)) : ok(msg.result); return; }
    if (msg.method === 'Page.screencastFrame') {
        const file = path.join(FRAMES, `f${String(frames.length).padStart(5, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(msg.params.data, 'base64'));
        frames.push({ file, t: msg.params.metadata.timestamp });
        send('Page.screencastFrameAck', { sessionId: msg.params.sessionId });
    }
});
const send = (method, params = {}) => new Promise((ok, ko) => { const id = ++seq; pending.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  in: ${expr.slice(0, 120)}`);
    return r.result.value;
}
async function waitFor(expr, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* reloading */ } await sleep(200); }
    throw new Error(`timeout waiting for: ${expr}`);
}
const COMP = `(name => { let hit = null; const w = n => { if (hit) return; const c = n.getComponent(name); if (c) { hit = c; return; } n.children.forEach(w); }; w(cc.director.getScene()); return hit; })`;
async function center(p) {
    return evaluate(`(() => {
      const parts = ${JSON.stringify(p)}.split('/'); let hit = null;
      const w = (n, trail) => { const t = trail.concat(n.name); if (!hit && t.slice(-parts.length).join('/') === parts.join('/') && n.activeInHierarchy) hit = n; n.children.forEach(c => w(c, t)); };
      w(cc.director.getScene(), []);
      if (!hit) return null;
      const cam = cc.director.getScene().getComponentsInChildren(cc.Camera).find(c => c.node.activeInHierarchy && (c.visibility & hit.layer));
      const sp = cam.worldToScreen(hit.worldPosition);
      const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const k = r.width / cv.width;
      return { x: r.left + sp.x * k, y: r.top + (cv.height - sp.y) * k };
    })()`);
}
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts });
async function tap(p) {
    const c = await center(p);
    if (!c) throw new Error(`${p} not on screen`);
    await touch('touchStart', [{ x: c.x, y: c.y }]); await sleep(70); await touch('touchEnd', []);
}
async function pinch(c, from, to, steps = 18) {
    const pts = d => [{ x: c.x - d / 2, y: c.y, id: 1 }, { x: c.x + d / 2, y: c.y, id: 2 }];
    await touch('touchStart', pts(from));
    for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(from + (to - from) * i / steps)); await sleep(40); }
    await touch('touchEnd', []);
}
async function drag(c, dx, dy, steps = 20) {
    await touch('touchStart', [{ x: c.x, y: c.y }]);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: c.x + dx * i / steps, y: c.y + dy * i / steps }]); await sleep(35); }
    await touch('touchEnd', []);
}

try {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await waitFor(`typeof cc !== 'undefined' && !!cc.director?.getScene() && ['Game','MainMenu'].includes(cc.director.getScene().name)`, 60000);
    await sleep(2000);
    if (await evaluate(`cc.director.getScene().name`) !== 'Game') {
        await evaluate(`new Promise(r => cc.director.loadScene('Game', () => r(true)))`);
        await waitFor(`cc.director.getScene()?.name === 'Game'`);
    }
    await sleep(2500);

    await send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
    await sleep(1200);
    await evaluate(`${COMP}('GameManager').activateAura(), true`);   // Aura lands on the launcher → intro after 0.6 s
    await waitFor(`${COMP}('PowerupInfoPanel').node.active`, 5000);
    await waitFor(`!${COMP}('PowerupInfoPanel').spotlightNode.active`, 6000);
    await sleep(1500);                                                // read the card
    await tap('Frame/Art'); await sleep(1000);                        // zoom the illustration
    const c = await center('Zoom/Dim');
    await pinch(c, 60, 260); await sleep(700);                       // pinch in
    await drag(c, 140, 0); await sleep(500);                          // scroll right
    await drag(c, -260, 0); await sleep(700);                         // scroll left
    await pinch(c, 300, 40); await sleep(700);                        // pinch out → fitted
    await tap('Zoom/Dim'); await sleep(900);                          // tap closes the zoom
    await tap('Card/Close'); await sleep(1500);                       // Got it → game resumes
    await send('Page.stopScreencast');
    await sleep(300);

    // Concat list with each frame's real duration (screencast frames arrive irregularly).
    const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${(((frames[i + 1]?.t ?? f.t + 0.1) - f.t)).toFixed(3)}`).join('\n')
        + `\nfile '${frames.at(-1).file.replace(/\\/g, '/')}'\n`;
    const listFile = path.join(FRAMES, 'list.txt');
    fs.writeFileSync(listFile, list);
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', OUT], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg failed');
    console.log(`${frames.length} frames → ${OUT}`);
} catch (e) {
    console.error(`recording failed: ${e.message}`);
    process.exitCode = 1;
} finally {
    ws.close();
    chrome.kill();
    server.close();
    fs.rmSync(FRAMES, { recursive: true, force: true });
}
