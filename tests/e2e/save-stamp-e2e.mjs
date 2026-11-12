#!/usr/bin/env node
// Save stamps (SafeStorage `fw_meta`: game version + epoch-ms time of every write) and saved-game
// validity at load, on the DEFAULT build (localStorage backend). Each case rewrites localStorage,
// reloads, and checks where the boot lands (Game = resumed, MainMenu = save discarded).
// The Playgama backend (bridge.storage blob) is covered by platform-pause-e2e.mjs.
//
//   npm run build && node tests/e2e/save-stamp-e2e.mjs
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8127, DEBUG_PORT = 9342;
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
if (fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8').includes('playgama-bridge')) {
    console.log('build/web-mobile is the Playgama variant — run `npm run build` first (default build).');
    process.exit(1);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const file = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-stamp-chrome-'));
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
let seq = 0; const pending = new Map(); let logs = [];
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

const HOUR = 3600_000;
const LS = `(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; })()`;
const NOW = `performance.timeOrigin + performance.now()`;

/** Wait until a scene is running, then let the boot routing (MainMenu → Game) settle. */
async function waitBoot() {
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && !!cc.director.getScene()?.name`)) break; } catch { } await sleep(250); }
    await sleep(3500);
}

/** Replace localStorage with `entries` (null value = absent), reload, report where the boot landed. */
async function bootWith(entries) {
    await evaluate(`(() => { localStorage.clear(); const e = ${JSON.stringify(entries)}; for (const k in e) if (e[k] !== null) localStorage.setItem(k, e[k]); return true; })()`);
    logs = [];
    await send('Page.reload', { ignoreCache: true });
    await waitBoot();
    const ls = await evaluate(LS);
    let meta = null; try { meta = JSON.parse(ls.fw_meta ?? 'null'); } catch { meta = 'CORRUPT'; }
    return { scene: await evaluate(`cc.director.getScene()?.name`), ls, meta, logs: logs.slice() };
}

const errorsIn = l => l.filter(x => /EXCEPTION|^error:/i.test(x));

try {
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 450, height: 800, deviceScaleFactor: 1, mobile: true });

    // ── 1. First visit, empty storage: boot goes straight into a game, every write is stamped ──
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await waitBoot();
    await evaluate(`(localStorage.clear(), true)`);
    logs = [];
    await send('Page.reload', { ignoreCache: true });
    await waitBoot();
    for (let i = 0; i < 40 && !(await evaluate(`!!localStorage.getItem('fw_game_state')`)); i++) await sleep(250);
    const first = await evaluate(LS);
    const now1 = await evaluate(NOW);
    let meta1 = null; try { meta1 = JSON.parse(first.fw_meta); } catch { }
    check('first visit: boot opens the game', (await evaluate(`cc.director.getScene()?.name`)) === 'Game');
    check('first visit: saved game written', !!first.fw_game_state);
    check('first visit: fw_meta is a JSON map', !!meta1 && typeof meta1 === 'object', first.fw_meta);
    const fwKeys = Object.keys(first).filter(k => k.startsWith('fw_') && k !== 'fw_meta');
    const unstamped = fwKeys.filter(k => !meta1?.[k]);
    check('every fw_* key written this session is stamped', unstamped.length === 0, { keys: fwKeys, unstamped });
    const orphan = Object.keys(meta1 ?? {}).filter(k => !(k in first));
    check('no stamp without its key', orphan.length === 0, orphan);
    check('fw_meta does not stamp itself', !meta1?.fw_meta);
    const badV = Object.entries(meta1 ?? {}).filter(([, s]) => s.v !== APP_VERSION);
    check(`stamps carry the game version ${APP_VERSION}`, badV.length === 0, badV);
    const badT = Object.entries(meta1 ?? {}).filter(([, s]) => !(Number.isInteger(s.t) && s.t > 1.7e12 && s.t <= now1 + 1 && now1 - s.t < 120_000));
    check('stamps carry a recent epoch-ms time (performance clock)', badT.length === 0, { badT, now: Math.round(now1) });
    let snap1 = null; try { snap1 = JSON.parse(first.fw_game_state); } catch { }
    check('snapshot embeds version and epoch-ms savedAt', snap1?.version === APP_VERSION && Math.abs(snap1.savedAt - meta1.fw_game_state.t) < 1000, { version: snap1?.version, savedAt: snap1?.savedAt, stamp: meta1?.fw_game_state });
    check('first visit: no errors', errorsIn(logs).length === 0, errorsIn(logs));

    // Baseline for the load cases: a played-once player with a saved game (marked score 4321).
    const snapMarked = JSON.stringify({ ...snap1, score: 4321 });
    const base = { ...first, fw_game_state: snapMarked, fw_menu_on_boot: null, fw_best_score: '1234' };
    meta1.fw_best_score = { ...meta1.fw_game_state };
    const stampAt = (v, t) => JSON.stringify({ ...meta1, fw_game_state: { v, t } });
    const nowMs = Math.round(await evaluate(`Date.now()`));
    const resumed = r => r.scene === 'Game' && r.logs.some(l => /state restored from snapshot/.test(l));
    const discarded = r => r.scene === 'MainMenu' && !('fw_game_state' in r.ls) && !(r.meta && r.meta.fw_game_state) && r.logs.some(l => /saved game discarded/.test(l));
    const brief = r => ({ scene: r.scene, snap: 'fw_game_state' in r.ls, stamp: r.meta?.fw_game_state ?? null, log: r.logs.filter(l => /snapshot|discarded/.test(l)) });

    // ── 2. Load-time validity of the saved game ──
    let r = await bootWith({ ...base, fw_meta: stampAt(APP_VERSION, nowMs - 60_000) });
    check('valid stamp (current version, 1 min old): game resumed', resumed(r), brief(r));
    const score = await evaluate(`(() => { let t = null; const w = n => { const l = n.getComponent('cc.Label'); if (l && /^4[^0-9]?321$/.test(l.string)) t = l.string; n.children.forEach(w); }; w(cc.director.getScene()); return t; })()`);
    check('valid stamp: HUD shows the saved score', score !== null, score);
    check('valid stamp: no errors', errorsIn(r.logs).length === 0, errorsIn(r.logs));

    r = await bootWith({ ...base, fw_meta: stampAt('0.10.30', nowMs - 60_000) });
    check('stamp from an older build (0.10.30): discarded, menu', discarded(r), brief(r));
    check('discard keeps the other saves and their stamps', r.ls.fw_best_score === '1234' && r.ls.fw_played_once === '1' && !!r.meta?.fw_best_score && !!r.meta?.fw_played_once, { best: r.ls.fw_best_score, played: r.ls.fw_played_once, stamps: Object.keys(r.meta ?? {}) });
    const menuBest = await evaluate(`(() => { let t = null; const w = n => { const l = n.getComponent('cc.Label'); if (l && /1[^0-9]?234/.test(l.string)) t = l.string; n.children.forEach(w); }; w(cc.director.getScene()); return t; })()`);
    check('menu shows the kept best score', menuBest !== null, menuBest);

    r = await bootWith({ ...base, fw_meta: stampAt('99.0.0', nowMs - 60_000) });
    check('stamp from a newer build (99.0.0): discarded, menu', discarded(r), brief(r));

    r = await bootWith({ ...base, fw_meta: stampAt(APP_VERSION, nowMs - 13 * HOUR) });
    check('stamp 13 h old: discarded, menu', discarded(r), brief(r));

    r = await bootWith({ ...base, fw_meta: stampAt(APP_VERSION, nowMs - 11 * HOUR) });
    check('stamp 11 h old: game resumed', resumed(r), brief(r));

    r = await bootWith({ ...base, fw_meta: stampAt(APP_VERSION, nowMs + HOUR) });
    check('stamp 1 h in the future: discarded, menu', discarded(r), brief(r));

    // Saves written before stamps existed (no fw_meta): the snapshot's own version/savedAt decide.
    const legacy = (version, savedAt) => ({ ...base, fw_meta: null, fw_game_state: JSON.stringify({ ...snap1, score: 4321, version, savedAt }) });
    r = await bootWith(legacy(APP_VERSION, nowMs - 60_000));
    check('legacy save (no fw_meta), current version: game resumed', resumed(r), brief(r));
    check('legacy save: stamped again on the next write', r.meta?.fw_game_state?.v === APP_VERSION, r.meta?.fw_game_state);
    r = await bootWith(legacy('0.10.35', nowMs - 60_000));
    check('legacy save from 0.10.35 (old round thresholds): discarded, menu', discarded(r), brief(r));
    r = await bootWith(legacy(APP_VERSION, nowMs - 13 * HOUR));
    check('legacy save 13 h old: discarded, menu', discarded(r), brief(r));

    // Corrupt fw_meta: no crash, falls back to the snapshot's own fields, rewritten clean.
    r = await bootWith({ ...base, fw_meta: '{not json' });
    check('corrupt fw_meta: game still resumed from the snapshot fields', resumed(r), brief(r));
    check('corrupt fw_meta: rewritten as valid JSON', r.meta && r.meta !== 'CORRUPT' && r.meta.fw_game_state?.v === APP_VERSION, r.ls.fw_meta);
    check('corrupt fw_meta: no errors', errorsIn(r.logs).length === 0, errorsIn(r.logs));

    // Stamps of the other keys survive unrelated writes (a stamp is per key, not global).
    r = await bootWith({ ...base, fw_meta: JSON.stringify({ ...meta1, fw_best_score: { v: '0.10.1', t: 1 }, fw_game_state: { v: APP_VERSION, t: nowMs } }) });
    check('per-key stamps: an untouched key keeps its own stamp', r.meta?.fw_best_score?.v === '0.10.1' && r.meta?.fw_best_score?.t === 1, r.meta?.fw_best_score);

    // Menu-on-boot (Quit/Menu) still wins over a valid saved game.
    r = await bootWith({ ...base, fw_menu_on_boot: '1', fw_meta: stampAt(APP_VERSION, nowMs - 60_000) });
    check('menu-on-boot set: boot stays on the menu, saved game kept', r.scene === 'MainMenu' && 'fw_game_state' in r.ls, brief(r));
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    ws.close(); chrome.kill(); server.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
