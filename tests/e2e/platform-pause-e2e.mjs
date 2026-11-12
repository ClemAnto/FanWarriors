#!/usr/bin/env node
// Platform pause check (YouTube Playables requirement, PLAYGAMA.md §5 Y1): on the PLAYGAMA build,
// emits the Bridge's own PAUSE_STATE_CHANGED (mock platform) and verifies that the engine loop,
// physics and music stop, and that everything resumes without a jump; then that the save blob goes
// through bridge.storage (flushed on pause) and survives a reload.
//
//   npm run pack:playgama && node tests/e2e/platform-pause-e2e.mjs
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8126, DEBUG_PORT = 9341;
if (!fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8').includes('playgama-bridge')) {
    console.log('build/web-mobile is not the Playgama variant — run `npm run pack:playgama` first.');
    process.exit(1);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const file = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-pause-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* not up */ }
    if (!wsUrl) await sleep(200);
}
if (!wsUrl) {
    console.log(`Chrome DevTools not reachable on port ${DEBUG_PORT} (CHROME=${CHROME})`);
    chrome.kill(); server.close();
    process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, ko } = pending.get(msg.id); pending.delete(msg.id); msg.error ? ko(new Error(msg.error.message)) : ok(msg.result); return; }
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description}`);
});
const send = (method, params = {}) => new Promise((ok, ko) => { const id = ++seq; pending.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };

let failures = 0;
const check = (label, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); if (!cond) failures++; };

try {
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 450, height: 800, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game'`)) break; } catch { } await sleep(250); }
    await sleep(3000);

    // A moving dynamic body: kick the first dynamic RigidBody2D found.
    const setup = `(() => {
        let body = null; const walk = n => { const rb = n.getComponent('cc.RigidBody2D'); if (!body && rb && rb.type === 2 && n.activeInHierarchy) body = rb; n.children.forEach(walk); };
        walk(cc.director.getScene());
        if (!body) return null;
        window.__body = body; body.wakeUp(); body.linearVelocity = new cc.Vec2(0, 25);
        return body.node.name;
    })()`;
    const bodyName = await evaluate(setup);
    check('found a dynamic body to move', !!bodyName, bodyName);
    const sample = `({ frames: cc.director.getTotalFrames(), y: window.__body ? window.__body.node.worldPosition.y : 0, paused: cc.game.isPaused() })`;
    const music = `(() => { let v = null; const walk = n => { const ss = n.getComponents('cc.AudioSource'); for (const s of ss) if (s.loop) v = s.volume; n.children.forEach(walk); }; for (const n of cc.director.getScene().children) walk(n); return v; })()`;

    const r0 = await evaluate(sample); await sleep(500); const r1 = await evaluate(sample);
    check('running: frames advance', r1.frames > r0.frames, r1.frames - r0.frames);
    check('running: body moves', Math.abs(r1.y - r0.y) > 1, Math.round(r1.y - r0.y));
    const musicBefore = await evaluate(music);

    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, true), true`);
    await sleep(100);
    const p0 = await evaluate(sample); await sleep(2000); const p1 = await evaluate(sample);
    check('paused: cc.game.isPaused()', p1.paused === true);
    check('paused: no frames', p1.frames === p0.frames, p1.frames - p0.frames);
    check('paused: body frozen', Math.abs(p1.y - p0.y) < 0.01, p1.y - p0.y);
    const musicPaused = await evaluate(music);
    check('paused: music silent', musicPaused === 0 || musicPaused === null, { before: musicBefore, paused: musicPaused });

    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, false), true`);
    await sleep(100);
    const s0 = await evaluate(sample); await sleep(500); const s1 = await evaluate(sample);
    check('resumed: not paused', s1.paused === false);
    check('resumed: frames advance', s1.frames > s0.frames, s1.frames - s0.frames);
    check('resumed: no jump right after resume', Math.abs(s0.y - p1.y) < 60, Math.round(s0.y - p1.y));
    check('resumed: music back', (await evaluate(music)) === musicBefore, musicBefore);

    // ---- platform pause that arrives while the tab is hidden: showing the tab again must NOT restart
    // the loop (the engine's own hide/show pause would otherwise cancel the platform pause).
    await evaluate(`cc.game._onHide(), true`);
    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, true), true`);
    await evaluate(`cc.game._onShow(), true`);
    const h0 = await evaluate(sample); await sleep(1000); const h1 = await evaluate(sample);
    check('hidden + platform pause: still stopped after the tab is shown', h1.paused === true && h1.frames === h0.frames, h1.frames - h0.frames);
    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, false), true`);
    const h2 = await evaluate(sample); await sleep(500); const h3 = await evaluate(sample);
    check('hidden + platform pause: platform resume restarts the loop', h3.paused === false && h3.frames > h2.frames, h3.frames - h2.frames);

    // ---- storage: the platform pause flushes the save blob through bridge.storage; after a
    // reload the game resumes the same turn. Nothing of ours goes to raw localStorage.
    const store = `(() => { const st = window.__fwStore || {}; let snap = null; try { snap = JSON.parse(st.fw_game_state || 'null'); } catch { } return { hasStore: !!window.__fwStore, bytes: JSON.stringify(st).length, savedAt: snap?.savedAt ?? null, score: snap?.score ?? null, round: snap?.round ?? null, warriors: snap?.warriors?.length ?? null }; })()`;
    const before = await evaluate(store);
    check('storage: save blob preloaded from bridge.storage', before.hasStore === true);
    check('storage: turn snapshot present', before.savedAt !== null, before);
    check('storage: blob well under YouTube 3 MiB', before.bytes < 64 * 1024, before.bytes);
    // Every save is stamped (fw_meta) with the game version and an epoch-ms time (performance clock).
    const APP_VERSION = JSON.parse(fs.readFileSync(path.join(BUILD, '..', '..', 'package.json'), 'utf8')).version;
    const stamp = await evaluate(`(() => { try { const m = JSON.parse(window.__fwStore.fw_meta); return { s: m.fw_game_state, now: performance.timeOrigin + performance.now() }; } catch { return null; } })()`);
    check('storage: snapshot stamped with the game version', stamp?.s?.v === APP_VERSION, stamp?.s);
    check('storage: stamp time is recent epoch ms', !!stamp && stamp.s.t > 1.7e12 && stamp.now - stamp.s.t >= 0 && stamp.now - stamp.s.t < 120_000, stamp);
    // Mark the in-memory snapshot (score 4321) so the reload proves it came back from bridge.storage:
    // only the pause flush can have written it.
    await evaluate(`(() => { const st = window.__fwStore; const snap = JSON.parse(st.fw_game_state); snap.score = 4321; st.fw_game_state = JSON.stringify(snap); return true; })()`);
    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, true), true`);
    await sleep(800);
    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, false), true`);
    // 'fw_save' is the Bridge's own key (the mock platform keeps it in localStorage); our fw_* keys must not be there.
    const rawKeys = await evaluate(`Object.keys(localStorage).filter(k => k.startsWith('fw_') && k !== 'fw_save')`);
    check('storage: no fw_* keys written to raw localStorage', rawKeys.length === 0, rawKeys);
    await send('Page.reload', { ignoreCache: true });
    await sleep(1500);
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game'`)) break; } catch { } await sleep(250); }
    await sleep(2500);
    const after = await evaluate(store);
    check('storage: snapshot survives the reload', after.score === 4321 && after.round === before.round, { before, after });
    check('storage: reload resumes into the game', (await evaluate(`cc.director.getScene()?.name`)) === 'Game');
    const hudScore = await evaluate(`(() => { let t = null; const w = n => { const l = n.getComponent('cc.Label'); if (l && /^4[^0-9]?321$/.test(l.string)) t = l.string; n.children.forEach(w); }; w(cc.director.getScene()); return t; })()`);
    check('storage: HUD shows the restored score', hudScore !== null, hudScore);
    // A save stamped by a build older than SNAPSHOT_MIN_VERSION is discarded at load: back to the menu.
    await evaluate(`(() => { const st = window.__fwStore; const m = JSON.parse(st.fw_meta); m.fw_game_state.v = '0.10.30'; st.fw_meta = JSON.stringify(m); return true; })()`);
    await evaluate(`bridge.platform._platformBridge.emit(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, true), true`);
    await sleep(800);
    await send('Page.reload', { ignoreCache: true });
    await sleep(1500);
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && !!cc.director.getScene()?.name`)) break; } catch { } await sleep(250); }
    await sleep(2500);
    const old = await evaluate(`({ scene: cc.director.getScene()?.name, snap: 'fw_game_state' in (window.__fwStore || {}) })`);
    check('storage: old-version save discarded at load', old.scene === 'MainMenu' && old.snap === false, old);
    const pauseLogs = logs.filter(l => /PlatformPause|SafeStorage|restored|discarded|EXCEPTION|error:/i.test(l));
    console.log(pauseLogs.join('\n'));
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    ws.close(); chrome.kill(); server.close();
}
process.exit(failures ? 1 : 0);
