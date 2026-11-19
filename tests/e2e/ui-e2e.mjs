#!/usr/bin/env node
// UI end-to-end check on the web build: serves build/web-mobile, drives headless Chrome through
// the DevTools protocol at phone / tablet / desktop / 1:1 / 9:16 sizes, opens every screen and modal through
// the game's own components, saves a screenshot of each and fails on console errors or on
// on-screen layout problems (nodes outside the visible area, overlapping buttons).
//
//   npm run build && node tests/e2e/ui-e2e.mjs [--out <dir>] [--url <published page>] [--only phone,square]
//
// Needs Chrome (default path below or $CHROME). No extra npm packages (Node ≥ 22 WebSocket).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? process.argv[outArg + 1] : path.join(os.tmpdir(), 'funwarriors-ui-e2e');
// --url <page>: test a published build (e.g. GitHub Pages) instead of the local build/web-mobile.
const urlArg = process.argv.indexOf('--url');
// Saved values: on the Playgama build SafeStorage keeps them in window.__fwStore (bridge.storage), not in localStorage.
const STORE_GET = key => `(window.__fwStore && ('${key}' in window.__fwStore) ? window.__fwStore['${key}'] : cc.sys.localStorage.getItem('${key}'))`;
const STORE_DEL = key => `(window.__fwStore && delete window.__fwStore['${key}'], cc.sys.localStorage.removeItem('${key}'), true)`;
const PAGE_URL = urlArg > 0 ? process.argv[urlArg + 1] : null;
const PORT = 8125, DEBUG_PORT = 9335;
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
    { name: 'phone', width: 390, height: 844, mobile: true },      // 9:19.5 → ~591 design px wide
    { name: 'tablet', width: 768, height: 1024, mobile: true },    // 3:4 → 960
    { name: 'desktop', width: 1600, height: 900, mobile: false },  // 16:9 → 2276
    // YouTube Playables asks for 1:1, 16:9 and 9:16 (PLAYGAMA.md §5 Y1).
    { name: 'square', width: 900, height: 900, mobile: false },    // 1:1
    { name: 'portrait916', width: 450, height: 800, mobile: true }, // 9:16
];
// --only phone,square: run a subset of the viewports.
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? (process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean) : null;
const RUN_VIEWPORTS = ONLY ? VIEWPORTS.filter(v => ONLY.includes(v.name)) : VIEWPORTS;
if (!RUN_VIEWPORTS.length) {
    console.log(`--only matched no viewport (known: ${VIEWPORTS.map(v => v.name).join(', ')})`);
    process.exit(1);
}

// ------------------------------------------------------------------ static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const p = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(BUILD) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
}).listen(PORT);

// ------------------------------------------------------------------ chrome + CDP
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-e2e-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
    for (let i = 0; i < 50; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
            const page = list.find(t => t.type === 'page');
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
const consoleErrors = [];
ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, ko } = pending.get(msg.id); pending.delete(msg.id); msg.error ? ko(new Error(msg.error.message)) : ok(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(`exception: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((ok, ko) => { const id = ++seq; pending.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  in: ${expr.slice(0, 120)}`);
    return r.result.value;
}
async function waitFor(expr, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* page reloading */ } await sleep(250); }
    throw new Error(`timeout waiting for: ${expr}`);
}
async function shot(name) {
    await sleep(350);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

// In-page helpers: find components by class name (inactive nodes included), and an audit of the
// visible UI: every active node with a Sprite/Label must sit inside the visible area, and active
// buttons must not overlap each other.
const HELPERS = `
window.__fw = {
  comp(name) {
    const scene = cc.director.getScene(); let hit = null;
    const walk = n => { if (hit) return; const c = n.getComponent(name); if (c) { hit = c; return; } n.children.forEach(walk); };
    walk(scene); return hit;
  },
  scene() { return cc.director.getScene()?.name || ''; },
  audit(rootName) {
    const scene = cc.director.getScene();
    let root = scene; if (rootName && rootName[0] === '#') { const walk = n => n.name === rootName.slice(1) ? n : n.children.map(walk).find(Boolean); root = walk(scene) || scene; } else if (rootName) { const c = this.comp(rootName); root = c ? c.node : scene; }
    const vs = cc.view.getVisibleSize();
    const canvas = cc.find('Canvas');
    const cut = [], buttons = [], texts = [];
    const cssPerUnit = document.querySelector('canvas').getBoundingClientRect().height / vs.height;
    const box = n => { const ut = n.getComponent('cc.UITransform'); return ut ? ut.getBoundingBoxToWorld() : null; };
    const cp = canvas.worldPosition; const cw = new cc.Rect(cp.x - vs.width / 2, cp.y - vs.height / 2, vs.width, vs.height);
    const walk = n => {
      if (!n.activeInHierarchy) return;
      const op = n.getComponent('cc.UIOpacity'); if (op && op.opacity === 0 && n !== root) return;
      const vis = n.getComponent('cc.Sprite') || n.getComponent('cc.Label');
      const b = box(n);
      if (vis && b && b.width > 1 && b.height > 1 && n.name !== 'Background' && n.name !== 'Dim' && n.name !== 'skin' && n.name !== 'flag_red' /* HUD banners hang from above the top edge by design */) {
        const tol = 2;
        if (b.xMin < cw.xMin - tol || b.xMax > cw.xMax + tol || b.yMin < cw.yMin - tol || b.yMax > cw.yMax + tol) cut.push(n.name + ' ' + [b.xMin, b.yMin, b.width, b.height].map(Math.round).join(','));
      }
      if (n.getComponent('cc.Button') && b) buttons.push({ name: n.name, b });
      const lab = n.getComponent('cc.Label');
      if (lab && lab.string && lab.string.trim()) {
        const size = (lab.overflow === 2 && lab.actualFontSize ? lab.actualFontSize : lab.fontSize) * Math.abs(n.worldScale.y) * cssPerUnit;
        texts.push({ name: n.name, px: Math.round(size * 10) / 10, text: lab.string.slice(0, 24).split(String.fromCharCode(10)).join(' ') });
      }
      n.children.forEach(walk);
    };
    walk(root);
    const overlaps = [];
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) if (buttons[i].b.intersects(buttons[j].b)) overlaps.push(buttons[i].name + '×' + buttons[j].name);
    texts.sort((a, b) => a.px - b.px);
    return { visible: [Math.round(vs.width), Math.round(vs.height)], cut, overlaps, texts };
  },
};
true`;

const problems = [];
// Readability (YouTube review rejects "small" UI): rendered glyph size in CSS px. Report-only.
const MIN_TEXT_PX = Number(process.env.MIN_TEXT_PX || 12);
const smallTexts = new Map();
async function check(tag, rootName) {
    await evaluate(HELPERS);
    const a = await evaluate(`__fw.audit(${JSON.stringify(rootName || '')})`);
    for (const c of a.cut) problems.push(`${tag}: outside the screen → ${c}`);
    for (const o of a.overlaps) problems.push(`${tag}: buttons overlap → ${o}`);
    const small = a.texts.filter(t => t.px < MIN_TEXT_PX);
    for (const t of small) smallTexts.set(`${tag} · ${t.name} "${t.text}"`, t.px);
    console.log(`  ${tag.padEnd(28)} visible ${a.visible.join('x')}  cut ${a.cut.length}  overlaps ${a.overlaps.length}  min text ${a.texts[0]?.px ?? '-'}px${small.length ? `  small ${small.length}` : ''}`);
}

const ok = tag => console.log(`    ok   ${tag}`);
const fail = tag => { console.log(`    FAIL ${tag}`); problems.push(`interaction failed: ${tag}`); };
async function expect(tag, expr) { (await evaluate(expr)) ? ok(tag) : fail(tag); }

/** CSS-pixel centre of the active node at `path` (last segments of its node path). */
async function nodeCenter(p) {
    return evaluate(`(() => {
      const parts = ${JSON.stringify(p)}.split('/'); let hit = null;
      const w = (n, trail) => { const t = trail.concat(n.name); const tail = t.slice(-parts.length).join('/');
        if (!hit && tail === parts.join('/') && n.activeInHierarchy) hit = n; n.children.forEach(c => w(c, t)); };
      w(cc.director.getScene(), []);
      if (!hit) return null;
      const cam = cc.director.getScene().getComponentsInChildren(cc.Camera).find(c => c.node.activeInHierarchy && (c.visibility & hit.layer));
      const sp = cam.worldToScreen(hit.worldPosition);
      const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
      const k = r.width / cv.width;
      return { x: r.left + sp.x * k, y: r.top + (cv.height - sp.y) * k };
    })()`);
}
async function tapNode(p, vp) {
    const c = await nodeCenter(p);
    if (!c) { fail(`node ${p} not found / not active`); return; }
    if (vp.mobile) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
        await sleep(60);
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
        await sleep(60);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    }
}

/** Press (and hold) the node, check that it shrank, then release (= a normal tap). */
async function pressCheck(p, vp, tag) {
    const c = await nodeCenter(p);
    if (!c) { fail(`node ${p} not found / not active`); return; }
    if (vp.mobile) await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
    else { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 }); }
    await sleep(200);
    const parts = p.split('/');
    await expect(tag, `(() => { let hit = null; const w = (n, t) => { const tt = t.concat(n.name); if (!hit && tt.slice(-${parts.length}).join('/') === ${JSON.stringify(p)} && n.activeInHierarchy) hit = n; n.children.forEach(c => w(c, tt)); }; w(cc.director.getScene(), []); return hit && hit.scale.x < 0.97 && hit.scale.x > 0.85; })()`);
    if (vp.mobile) await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
}

/** Zoomed illustration state: scale, position and the pan limits for that scale. */
const ZOOM_STATE = `(() => { const c = __fw.comp('PowerupInfoPanel'); const n = c.zoomSprite.node; const t = n.getComponent('cc.UITransform'); const vs = cc.view.getVisibleSize(); const s = n.scale.x;
    return { open: c.zoomNode.active, s, x: n.position.x, y: n.position.y, angle: n.angle, w: t.width, h: t.height, vw: vs.width, vh: vs.height,
             mx: Math.max(0, (t.width * s - vs.width) / 2), my: Math.max(0, (t.height * s - vs.height) / 2) }; })()`;

/** Real input on the zoomed illustration: pinch (touch) or wheel (mouse) in, zoom cap, drag-scroll
 *  to both corners, device rotation while zoomed (touch viewports), zoom back out to the fitted size. */
async function zoomGestures(p, vp) {
    const c = await nodeCenter('Zoom/Big');
    if (!c) { fail(`${p} zoomed art not found`); return; }
    const near = (a, b) => Math.abs(a - b) < 1;
    const inside = z => Math.abs(z.x) <= z.mx + 0.5 && Math.abs(z.y) <= z.my + 0.5;
    const pinch = async (cx, cy, from, to) => {
        const pts = d => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
        for (let i = 1; i <= 10; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * i / 10) }); await sleep(30); }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(300);
    };
    const wheel = async (n, dy) => {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
        for (let i = 0; i < n; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: dy }); await sleep(30); }
        await sleep(300);
    };
    const drag = async (dx, dy) => {
        if (vp.mobile) {
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
            for (let i = 1; i <= 8; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + dx * i / 8, y: c.y + dy * i / 8 }] }); await sleep(25); }
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
            for (let i = 1; i <= 8; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x + dx * i / 8, y: c.y + dy * i / 8, button: 'left', buttons: 1 }); await sleep(25); }
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x + dx, y: c.y + dy, button: 'left', buttons: 0, clickCount: 1 });
        }
        await sleep(250);
    };
    const how = vp.mobile ? 'pinch' : 'wheel';

    if (vp.mobile) await pinch(c.x, c.y, 40, 260); else await wheel(6, -120);
    let z = await evaluate(ZOOM_STATE);
    (z.open && z.s > 1.8 && z.s <= 4.0001 && inside(z)) ? ok(`${p} ${how} zooms in (x${z.s.toFixed(2)}), art inside its edges, still open`) : fail(`${p} ${how} zooms in: ${JSON.stringify(z)}`);

    if (vp.mobile) await pinch(c.x, c.y, 20, 320); else await wheel(20, -120);
    z = await evaluate(ZOOM_STATE);
    near(z.s * 100, 400) ? ok(`${p} zoom capped at 4x`) : fail(`${p} zoom capped at 4x: s=${z.s}`);

    // Drag towards bottom-right well past the art: it scrolls to its top-left corner and stops; no close.
    const step = Math.min(vp.width, vp.height) * 0.3;
    for (let i = 0; i < 12; i++) await drag(step, step);
    z = await evaluate(ZOOM_STATE);
    (z.open && z.mx > 0 && near(z.x, z.mx) && near(z.y, -z.my)) ? ok(`${p} drag scrolls to the top-left corner and stops (zoom stays open)`) : fail(`${p} drag to the top-left corner: ${JSON.stringify(z)}`);
    await shot(`${p}-10b3-powerup-zoom-in`);
    for (let i = 0; i < 30; i++) await drag(-step, -step);   // corner to corner: twice the way (4x art on desktop is ~9000 px wide)
    z = await evaluate(ZOOM_STATE);
    (z.open && near(z.x, -z.mx) && near(z.y, z.my)) ? ok(`${p} drag back reaches the bottom-right corner`) : fail(`${p} drag to the bottom-right corner: ${JSON.stringify(z)}`);

    if (vp.mobile) {
        // Device turned while zoomed: upright, re-fitted to the new screen, pan still clamped; then back.
        for (const [w, h, tag] of [[vp.height, vp.width, 'rotated'], [vp.width, vp.height, 'rotated back']]) {
            await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
            await sleep(1500);
            z = await evaluate(ZOOM_STATE);
            const fitted = z.w <= z.vw - 39 && z.h <= z.vh - 19 && (near(z.w, z.vw - 40) || near(z.h, z.vh - 40));
            (z.open && z.angle === 0 && fitted && inside(z)) ? ok(`${p} ${tag} while zoomed: upright, re-fitted, inside the edges`) : fail(`${p} ${tag} while zoomed: ${JSON.stringify(z)}`);
            if (tag === 'rotated') await shot(`${p}-10b4-powerup-zoom-rotated`);
        }
        const c2 = await nodeCenter('Zoom/Dim');
        await pinch(c2.x, c2.y, 320, 20);
    } else {
        await wheel(25, 120);
    }
    z = await evaluate(ZOOM_STATE);
    (z.open && near(z.s * 100, 100) && near(z.x, 0) && near(z.y, 0)) ? ok(`${p} zooming out stops at the fitted size, centred`) : fail(`${p} zoom out to fitted: ${JSON.stringify(z)}`);
}

async function load(scene) {
    await evaluate(`new Promise(r => cc.director.loadScene(${JSON.stringify(scene)}, () => r(true)))`);
    await waitFor(`cc.director.getScene()?.name === ${JSON.stringify(scene)}`);
    await sleep(900);
    await evaluate(HELPERS);
}

// ------------------------------------------------------------------ run
await send('Runtime.enable');
await send('Page.enable');
try {
    for (const vp of RUN_VIEWPORTS) {
        console.log(`\n[${vp.name}] ${vp.width}x${vp.height}`);
        await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
        await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile });
        await send('Page.navigate', { url: PAGE_URL ?? `http://127.0.0.1:${PORT}/index.html` });
        await waitFor(`typeof cc !== 'undefined' && !!cc.director && !!cc.director.getScene() && ['Game','MainMenu'].includes(cc.director.getScene().name)`, 60000);
        await sleep(2500);
        await evaluate(HELPERS);
        const first = await evaluate('__fw.scene()');
        if (first !== 'Game') await load('Game');
        await sleep(1500);
        const p = vp.name;

        await shot(`${p}-01-game-hud`); await check(`${p} game HUD`, null);

        await evaluate(`__fw.comp('Settings').open(), true`); await sleep(500);
        await shot(`${p}-02-game-settings`); await check(`${p} game settings`, 'Settings');
        await evaluate(`__fw.comp('Settings').close(), true`); await sleep(500);

        await evaluate(`__fw.comp('PausePanel').open(), true`); await sleep(600);
        await shot(`${p}-03-pause`); await check(`${p} pause`, 'PausePanel');
        await evaluate(`__fw.comp('PausePanel').close(), true`); await sleep(400);

        await evaluate(`__fw.comp('BoostOffer').openPanel(), true`); await sleep(600);
        await shot(`${p}-04-boost`); await check(`${p} boost`, 'BoostOffer');
        await evaluate(`(() => { const b = __fw.comp('BoostOffer'); b.panel.active = false; return true; })()`);

        // Powerup tutorial: the real trigger (Aura on the launcher → after 0.6 s the game freezes and
        // the modal opens), then its own view with a ticked "don't show again".
        const puOpen = `(() => { const c = __fw.comp('PowerupInfoPanel'); return !!c && c.node.active; })()`;
        await evaluate(`__fw.comp('GameManager').activateAura(), true`);
        await waitFor(puOpen, 5000).then(() => ok(`${p} Aura on launcher opens the powerup modal`), () => fail(`${p} Aura on launcher opens the powerup modal`));
        await expect(`${p} powerup badge above the launcher`, `(() => { let b = null; const w = n => { if (n.name === 'PowerupBadge' && n.activeInHierarchy) b = n; n.children.forEach(w); }; w(cc.director.getScene()); return !!b; })()`);
        await expect(`${p} game paused under the powerup modal`, `__fw.comp('GameManager').state === 5`);
        // Intro: frozen scene dims, the medallion pops big over the warrior, then flies into the card.
        const spotOn = `(() => { const c = __fw.comp('PowerupInfoPanel'); return !!c.spotlightNode && c.spotlightNode.active; })()`;
        await sleep(450);
        await expect(`${p} intro: spotlight on, card still hidden`, `(() => { const c = __fw.comp('PowerupInfoPanel'); return ${spotOn} && c.cardNode.getComponent('cc.UIOpacity').opacity < 30 && c.spotlightMedal.node.scale.x > 1 && c.dimNode.getComponent('cc.Sprite').color.a >= 230; })()`);
        await expect(`${p} intro: medallion starts above the launcher`, `(() => { const c = __fw.comp('PowerupInfoPanel'); const gm = __fw.comp('GameManager'); const w = gm._activeLauncherWarrior; const cam = cc.director.getScene().getComponentsInChildren(cc.Camera); const sc = n => cam.find(k => k.node.activeInHierarchy && (k.visibility & n.layer)).worldToScreen(n.worldPosition); const a = sc(c.spotlightNode), b = sc(w.viewNode); return Math.abs(a.x - b.x) < 60 && a.y > b.y; })()`);
        // Tap "Got it" while the intro still runs (before the screenshot: on big viewports a shot outlasts the intro).
        await expect(`${p} intro still running before the tap`, spotOn);
        await tapNode('Card/Close', vp); await sleep(100);
        await expect(`${p} intro: Got it ignored until the card is in`, puOpen);
        await shot(`${p}-04a-powerup-intro`);
        await waitFor(`!${spotOn}`, 4000).then(() => ok(`${p} intro ends`), () => fail(`${p} intro ends`));
        await expect(`${p} after the intro the card is fully in`, `(() => { const c = __fw.comp('PowerupInfoPanel'); return c.cardNode.getComponent('cc.UIOpacity').opacity === 255 && Math.abs(c.cardNode.scale.x - 1) < 0.01 && c.iconSprite.enabled && c.dimNode.getComponent('cc.Sprite').color.a === 200; })()`);
        await sleep(300);
        await shot(`${p}-04b-powerup-aura`); await check(`${p} powerup modal`, 'PowerupInfoPanel');
        await tapNode('Card/Close', vp); await sleep(600);
        await expect(`${p} Got it closes the modal and resumes`, `!${puOpen} && __fw.comp('GameManager').state !== 5`);
        await shot(`${p}-04d-powerup-badge`);
        await evaluate(`__fw.comp('GameManager').activateAura(true), true`); await sleep(900);
        await expect(`${p} BOOST Golden Aura on the launcher`, `(() => { const a = __fw.comp('AuraEffect'); return !!a && a.golden === true; })()`);
        await shot(`${p}-04e-golden-aura`);
        await evaluate(`__fw.comp('PowerupInfoPanel').showSingle('brotherhood', () => {}), true`); await sleep(1200);
        await shot(`${p}-04c-powerup-brotherhood`); await check(`${p} powerup brotherhood`, 'PowerupInfoPanel');
        await tapNode('Card/DontShow', vp); await sleep(300);
        await expect(`${p} don't-show checkbox ticks`, `(() => { let m = null; const w = n => { if (n.name === 'Checkmark' && n.parent?.name === 'Box') m = n; n.children.forEach(w); }; w(cc.director.getScene()); return m && m.active; })()`);
        await tapNode('Card/Close', vp); await sleep(600);
        await expect(`${p} closing with the box ticked mutes it`, `(${STORE_GET('fw_pu_mute_brotherhood')} === '1')`);
        await evaluate(STORE_DEL('fw_pu_mute_brotherhood'));

        // End panels: GameOver with REVIVE, GameOver without, Victory with a new best.
        const showEnd = (illu, args) => `(() => { const s = cc.director.getScene(); const ps = []; const walk = n => { const c = n.getComponent('EndPanel'); if (c) ps.push(c); n.children.forEach(walk); }; walk(s);
            const p = ps.find(x => x.illustrationPath.includes(${JSON.stringify(illu)})); ps.forEach(x => x.node.active = false); p.show(${args}); return true; })()`;
        const fadeIn = `(() => { const s = cc.director.getScene(); const walk = n => { const c = n.getComponent('EndPanel'); if (c && c.node.active) { const o = c.node.getComponent('cc.UIOpacity'); cc.Tween.stopAllByTarget(o); o.opacity = 255; } n.children.forEach(walk); }; walk(s); return true; })()`;
        for (const [tag, illu, args] of [['05-gameover-revive', 'game_over', '12450, 7, 15000, false, true'], ['06-gameover', 'game_over', '12450, 7, 15000, false, false'], ['07-victory-newbest', 'win', '48900, 20, 30000, true, false']]) {
            await evaluate(showEnd(illu, args)); await sleep(1500); await evaluate(fadeIn); await sleep(300);
            await shot(`${p}-${tag}`); await check(`${p} ${tag}`, 'EndPanel');
        }
        await evaluate(`(() => { const s = cc.director.getScene(); const walk = n => { const c = n.getComponent('EndPanel'); if (c) c.hide(); n.children.forEach(walk); }; walk(s); return true; })()`);

        await load('MainMenu');
        await shot(`${p}-08-menu`); await check(`${p} menu`, null);
        await evaluate(`__fw.comp('Settings').open(), true`); await sleep(500);
        await shot(`${p}-09-menu-settings`); await check(`${p} menu settings`, 'Settings');
        await evaluate(`__fw.comp('Settings').close(), true`); await sleep(400);
        await evaluate(`__fw.comp('PrivacyPanel').open(), true`); await sleep(600);
        await shot(`${p}-10-privacy`); await check(`${p} privacy`, '#PrivacyPanelRoot');
        await evaluate(`__fw.comp('PrivacyPanel').close(), true`); await sleep(400);

        await tapNode('Center/Powerups', vp); await sleep(1300);
        await expect(`${p} menu Powerups opens the catalog`, `(() => { const c = __fw.comp('PowerupInfoPanel'); return c.node.active && c.titleLabel.string === 'AURA'; })()`);
        await shot(`${p}-10b-powerups-catalog`); await check(`${p} powerups catalog`, 'PowerupInfoPanel');
        await tapNode('Frame/Art', vp); await sleep(600);
        await expect(`${p} tap on the illustration zooms it`, `__fw.comp('PowerupInfoPanel').zoomNode.active`);
        await expect(`${p} zoomed illustration upright and inside the screen`, `(() => { const z = __fw.comp('PowerupInfoPanel').zoomSprite.node; const t = z.getComponent('cc.UITransform'); const vs = cc.view.getVisibleSize(); return z.angle === 0 && t.width <= vs.width && t.height <= vs.height; })()`);
        await shot(`${p}-10b2-powerup-zoom`);
        await zoomGestures(p, vp);
        await tapNode('Zoom/Dim', vp); await sleep(500);
        await expect(`${p} tap closes the zoom`, `!__fw.comp('PowerupInfoPanel').zoomNode.active`);
        // Reopen: the zoom must start fitted again (scale 1, centred), not where the last one was left.
        await tapNode('Frame/Art', vp); await sleep(600);
        await expect(`${p} reopened zoom starts fitted and centred`, `(() => { const n = __fw.comp('PowerupInfoPanel').zoomSprite.node; return Math.abs(n.scale.x - 1) < 0.01 && Math.abs(n.position.x) < 0.5 && Math.abs(n.position.y) < 0.5; })()`);
        await tapNode('Zoom/Dim', vp); await sleep(500);
        await tapNode('Card/Next', vp); await sleep(700);
        await expect(`${p} catalog → shows the next (locked) powerup`, `__fw.comp('PowerupInfoPanel').titleLabel.string === '???'`);
        await shot(`${p}-10c-powerups-locked`); await check(`${p} powerups locked`, 'PowerupInfoPanel');
        await tapNode('Card/Close', vp); await sleep(500);
        await expect(`${p} catalog closes`, `!__fw.comp('PowerupInfoPanel').node.active`);

        await load('Ranking');
        await sleep(2500);
        await shot(`${p}-11-ranking`); await check(`${p} ranking`, 'LeaderboardPanel');
        await evaluate(`(() => { const lp = __fw.comp('LeaderboardPanel'); lp.boardNode.active = false; const ne = __fw.comp('NameEntry'); ne.node.active = true; ne.open(48900, () => {}); return true; })()`); await sleep(700);
        await shot(`${p}-12-name-entry`); await check(`${p} name entry`, 'NameEntry');

        // ---- real input: taps (phone/tablet) or mouse clicks (desktop) on the new buttons
        console.log(`  ${p} interactions:`);
        await tapNode('Slot0/Up', vp); await sleep(300);
        await expect(`${p} name entry ▲ changes the letter`, `__fw.comp('NameEntry').letterLabels[0].string !== 'A'`);
        await tapNode('Slot0/Down', vp); await sleep(300);
        await expect(`${p} name entry ▼ restores it`, `__fw.comp('NameEntry').letterLabels[0].string === 'A'`);

        await load('Ranking'); await sleep(1500);
        await tapNode('Board/Close', vp);
        await waitFor(`cc.director.getScene()?.name === 'MainMenu'`).then(() => ok(`${p} ranking Close → menu`), () => fail(`${p} ranking Close → menu`));
        await sleep(1200); await evaluate(HELPERS);
        await tapNode('HUD/MenuButton', vp); await sleep(500);
        await expect(`${p} menu cog opens settings`, `(() => { let d = null; const w = n => { if (n.name === 'Dialog') d = n; n.children.forEach(w); }; w(cc.director.getScene()); return d && d.activeInHierarchy; })()`);
        const sfxBefore = await evaluate(`(() => { let t = null; const w = n => { if (n.name === 'Sfx') t = n.getComponent('cc.Toggle'); n.children.forEach(w); }; w(cc.director.getScene()); return t.isChecked; })()`);
        await tapNode('Layout/Sfx', vp); await sleep(400);
        await expect(`${p} Sound checkbox toggles`, `(() => { let t = null; const w = n => { if (n.name === 'Sfx') t = n.getComponent('cc.Toggle'); n.children.forEach(w); }; w(cc.director.getScene()); return t.isChecked !== ${sfxBefore}; })()`);
        await tapNode('Layout/Sfx', vp); await sleep(400);
        await tapNode('wood/CloseButton', vp); await sleep(700);
        await expect(`${p} Close hides settings`, `(() => { let d = null; const w = n => { if (n.name === 'Dialog') d = n; n.children.forEach(w); }; w(cc.director.getScene()); return !d.activeInHierarchy; })()`);
        // The LEADERBOARD button is hidden on portals that show their own leaderboard (Playgama Bridge).
        if (await evaluate(`(() => { let b = null; const w = n => { if (n.name === 'Ranking' && n.parent?.name === 'Center') b = n; n.children.forEach(w); }; w(cc.director.getScene()); return !!b && b.activeInHierarchy; })()`)) {
            await pressCheck('Center/Ranking', vp, `${p} pressed button shrinks`);
            await waitFor(`cc.director.getScene()?.name === 'Ranking'`).then(() => ok(`${p} menu Ranking → ranking`), () => fail(`${p} menu Ranking → ranking`));
        } else ok(`${p} menu Ranking hidden on this portal (platform leaderboard)`);
        await load('MainMenu'); await sleep(800);
        await tapNode('Center/PlayButton', vp);
        await waitFor(`cc.director.getScene()?.name === 'Game'`, 30000).then(() => ok(`${p} PLAY → game`), () => fail(`${p} PLAY → game`));
        await sleep(2000); await evaluate(HELPERS);
        await evaluate(showEnd('game_over', '900, 2, 15000, false, false')); await sleep(2300);
        await tapNode('Column/Continue', vp);
        await waitFor(`['Ranking','MainMenu'].includes(cc.director.getScene()?.name)`, 30000).then(() => ok(`${p} game over Continue → next screen`), () => fail(`${p} game over Continue → next screen`));
    }

    // First visit lands in the game; leaving it with Quit is a completed first access: the menu
    // must stay (no bounce back into the game), also after a reload.
    console.log('\n[first visit → Quit → menu]');
    const vp0 = VIEWPORTS[0];
    await send('Emulation.setDeviceMetricsOverride', { width: vp0.width, height: vp0.height, deviceScaleFactor: 1, mobile: vp0.mobile });
    await evaluate(`localStorage.clear(), true`);
    const home = PAGE_URL ?? `http://127.0.0.1:${PORT}/index.html`;
    await send('Page.navigate', { url: home });
    await waitFor(`typeof cc !== 'undefined' && !!cc.director && cc.director.getScene()?.name === 'Game'`, 60000).then(() => ok('first visit opens the game'), () => fail('first visit opens the game'));
    await sleep(2500); await evaluate(HELPERS);
    await evaluate(`__fw.comp('Settings').onQuit(), true`);
    await waitFor(`cc.director.getScene()?.name === 'MainMenu'`, 30000).then(() => ok('Quit → menu'), () => fail('Quit → menu'));
    await expect('Quit deletes the saved game (PLAY starts a new one)', `${STORE_GET('fw_game_state')} == null`);
    await sleep(4000);
    await expect('menu stays after Quit (no bounce into the game)', `cc.director.getScene()?.name === 'MainMenu'`);
    await send('Page.navigate', { url: home });
    await waitFor(`typeof cc !== 'undefined' && !!cc.director && ['Game','MainMenu'].includes(cc.director.getScene()?.name)`, 60000);
    await sleep(4000);
    await expect('after a reload the boot still opens the menu', `cc.director.getScene()?.name === 'MainMenu'`);
    await expect('POWERUPS hidden until a powerup is discovered', `(() => { let b = null; const w = n => { if (n.name === 'Powerups' && n.parent?.name === 'Center') b = n; n.children.forEach(w); }; w(cc.director.getScene()); return b && !b.active; })()`);
} catch (e) {
    problems.push(`run aborted: ${e.message}`);
} finally {
    ws.close(); chrome.kill(); server.close();
}

if (smallTexts.size) { console.log(`
text under ${MIN_TEXT_PX} CSS px (report only):`); for (const [k, v] of smallTexts) console.log(`  ${v}px  ${k}`); }
const relevantErrors = consoleErrors.filter(e => !/firestore|firebase|poki|crazygames|playgama|gamedistribution|net::|Failed to load resource|AudioContext/i.test(e));
console.log(`\nscreenshots: ${OUT}`);
if (relevantErrors.length) { console.log('console errors:'); relevantErrors.forEach(e => console.log('  ' + e)); }
if (problems.length) { console.log('problems:'); problems.forEach(e => console.log('  ' + e)); }
process.exit(problems.length || relevantErrors.length ? 1 : 0);
