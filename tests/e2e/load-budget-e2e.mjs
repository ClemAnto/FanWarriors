#!/usr/bin/env node
// Download budget (Playgama Performance guide, 2026-11-19): everything fetched before the first
// playable frame should stay under 5 MB (20 MB hard cap), the rest must arrive after game_ready.
// Measures, on the built game in headless Chrome (first visit → straight into the Game scene):
//   - initial download: bytes of every response finished before the game is playable;
//   - background download in the first 20 s of play (lazy species, end-panel art, next arena…);
//   - that no arena art (resources/arenas) is fetched before the first playable frame.
//
//   npm run build (or pack:playgama) && node tests/e2e/load-budget-e2e.mjs
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8149, DEBUG_PORT = 9363;
const INITIAL_TARGET = 5 * 1024 * 1024, INITIAL_CAP = 20 * 1024 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.cconb': 'application/octet-stream' };
const server = http.createServer((req, res) => {
    const file = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-load-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* not up */ }
    if (!wsUrl) await sleep(200);
}
if (!wsUrl) { console.log(`Chrome DevTools not reachable on port ${DEBUG_PORT}`); chrome.kill(); server.close(); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
const reqs = new Map();      // requestId → url
const done = [];             // { url, bytes, t }
let playableAt = Infinity;
ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, ko } = pending.get(msg.id); pending.delete(msg.id); msg.error ? ko(new Error(msg.error.message)) : ok(msg.result); return; }
    if (msg.method === 'Network.requestWillBeSent') reqs.set(msg.params.requestId, msg.params.request.url);
    if (msg.method === 'Network.loadingFinished') done.push({ url: reqs.get(msg.params.requestId) || '?', bytes: msg.params.encodedDataLength, t: Date.now() });
});
const send = (method, params = {}) => new Promise((ok, ko) => { const id = ++seq; pending.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };
let failures = 0;
const check = (label, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + detail : ''}`); if (!cond) failures++; };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const mb = b => `${(b / 1024 / 1024).toFixed(2)} MB`;
const short = u => u.replace(`http://127.0.0.1:${PORT}/`, '');
const sum = list => list.reduce((s, r) => s + r.bytes, 0);

try {
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const t0 = Date.now();
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    for (let i = 0; i < 480; i++) {
        try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0`)) { playableAt = Date.now(); break; } } catch { /* loading */ }
        await sleep(125);
    }
    check('game playable', playableAt < Infinity, `${((playableAt - t0) / 1000).toFixed(1)} s in headless Chrome (software GL: slower than a phone)`);
    await sleep(20000);
    const initial = done.filter(r => r.t <= playableAt);
    const later = done.filter(r => r.t > playableAt);
    const local = l => l.filter(r => r.url.startsWith(`http://127.0.0.1:${PORT}/`));
    fs.writeFileSync(path.join(os.tmpdir(), 'fw-load-budget.json'), JSON.stringify({ initial: initial.map(r => ({ url: short(r.url), bytes: r.bytes })), later: later.map(r => ({ url: short(r.url), bytes: r.bytes })) }, null, 1));
    console.log(`\ninitial download: ${mb(sum(initial))} (${initial.length} files, of which external ${mb(sum(initial) - sum(local(initial)))})`);
    for (const r of [...initial].sort((a, b) => b.bytes - a.bytes).slice(0, 12)) console.log(`   ${mb(r.bytes).padStart(9)}  ${short(r.url).slice(0, 110)}`);
    console.log(`after the first playable frame (20 s): ${mb(sum(later))} (${later.length} files)`);
    for (const r of [...later].sort((a, b) => b.bytes - a.bytes).slice(0, 8)) console.log(`   ${mb(r.bytes).padStart(9)}  ${short(r.url).slice(0, 110)}`);
    console.log('');
    check(`initial download under the 5 MB target`, sum(initial) < INITIAL_TARGET, mb(sum(initial)));
    check(`initial download under the 20 MB cap`, sum(initial) < INITIAL_CAP, mb(sum(initial)));
    const arenaUuids = new Set();
    const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.meta')) { try { arenaUuids.add(JSON.parse(fs.readFileSync(p, 'utf8')).uuid); } catch { /* dir meta */ } } } };
    walk(path.join(ROOT, 'assets', 'resources', 'arenas'));
    const arenaEarly = initial.filter(r => [...arenaUuids].some(u => r.url.includes(u)));
    check('no arena art before the first playable frame', arenaEarly.length === 0, arenaEarly.map(r => short(r.url)).join(', '));
} catch (e) {
    console.log('FAIL exception:', e.message); failures++;
} finally {
    console.log(failures ? `${failures} FAILED` : 'ALL OK');
    try { ws.close(); } catch { /* closed */ }
    chrome.kill(); server.close();
    process.exit(failures ? 1 : 0);
}
