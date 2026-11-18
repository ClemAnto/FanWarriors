#!/usr/bin/env node
// Early progression + physics pace check (v0.10.42), on the PLAYGAMA build in headless Chrome:
//   1. a new game opens with Frog only: 3 identical level-1 prefill warriors that do NOT pull together,
//      and the launcher / next are Frogs too;
//   2. species unlock one per round: Cat at 2, Chicken at 3, Wolf at 4; the game-over line stays up
//      through rounds 1–3 and steps down at round 4;
//   3. physics pace: the same straight shot lands in the same place at speed 1.35 as at 1, in less time.
//
//   npm run pack:playgama && npm run test:early
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8128, DEBUG_PORT = 9343;
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-early-chrome-'));
// No swiftshader frame-rate throttling surprises: real-time measurements below use wall-clock time.
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
let seq = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, ko } = pending.get(msg.id); pending.delete(msg.id); msg.error ? ko(new Error(msg.error.message)) : ok(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description}`);
});
const send = (method, params = {}) => new Promise((ok, ko) => { const id = ++seq; pending.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };

let failures = 0;
const check = (label, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); if (!cond) failures++; };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const waitGame = async () => {
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0`)) return true; } catch { /* loading */ } await sleep(250); }
    return false;
};
const newGame = async () => {
    await evaluate(`(() => { const gm = ${GM}; if (gm) gm.constructor._forceNewGame = true; cc.director.loadScene('Game'); return true; })()`);
    await sleep(500);
    return waitGame();
};
const board = `(() => { const gm = ${GM}; return gm.warriors.filter(w => w.node && w.node.isValid).map(w => ({ type: w.type, level: w.level, x: Math.round(w.node.position.x * 10) / 10, y: Math.round(w.node.position.y * 10) / 10, launched: !!w.launched, launcher: w === gm.inputCtrl.warrior })); })()`;

// One straight half-power shot from the launcher on an empty track; returns real seconds until it stops and where.
const shot = async speed => {
    check(`new game for the shot at speed ${speed}`, await newGame());
    await sleep(1500);
    return evaluate(`new Promise(resolve => {
        const gm = ${GM};
        const launcher = gm.inputCtrl.warrior;
        for (const w of gm.warriors.slice()) if (w !== launcher && w.node && w.node.isValid) { w.node.destroy(); }
        gm.warriors = gm.warriors.filter(w => w === launcher);
        // fwPhysicsSpeed exists only in QA builds: retime the engine's (already sped-up) physics step directly.
        const ps = cc.director.getSystem('PHYSICS_2D');
        if (!ps.__fwBase) { ps.__fwBase = ps.fixedTimeStep * 60; ps.__fwPost = ps.postUpdate; }
        const k = ${speed};
        ps.fixedTimeStep = k / 60;
        ps.postUpdate = function (dt) { ps.__fwPost.call(this, dt * k / ps.__fwBase); };
        const t0 = performance.now();
        gm.inputCtrl.autoLaunch();
        let moved = false;
        const poll = setInterval(() => {
            const v = launcher.velocity.length();
            if (v > 1) moved = true;
            if ((moved && v < 0.4) || performance.now() - t0 > 15000) {
                clearInterval(poll);
                resolve({ sec: Math.round((performance.now() - t0)) / 1000, y: Math.round(launcher.node.position.y), x: Math.round(launcher.node.position.x), fps: Math.round(cc.game.frameRate) });
            }
        }, 16);
    })`);
};

try {
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 450, height: 800, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    check('first visit lands in the Game', await waitGame());

    // ---- 1. round 1 = Frog only
    const b0 = await evaluate(board);
    const parked = b0.filter(w => !w.launcher && !w.launched);
    check('3 prefill warriors, all Frog level 1', parked.length === 3 && parked.every(w => w.type === 0 && w.level === 1), parked);
    const launcher = await evaluate(`(() => { const w = ${GM}.inputCtrl.warrior; return w ? { type: w.type, level: w.level } : null; })()`);
    check('launcher is a Frog', launcher?.type === 0, launcher);
    check('next is a Frog', (await evaluate(`${GM}.spawnMgr.next.type`)) === 0);
    check('active species = [Frog]', JSON.stringify(await evaluate(`${GM}.spawnMgr._activeSpecies`)) === '[0]');
    await sleep(4000);
    const b1 = await evaluate(board);
    const parked1 = b1.filter(w => !w.launcher && !w.launched);
    const drift = parked.map((w, i) => Math.hypot(w.x - (parked1[i]?.x ?? 1e9), w.y - (parked1[i]?.y ?? 1e9)));
    check('prefill Frogs do not pull together (still 3, no drift after 4 s)', parked1.length === 3 && drift.every(d => d < 1), { drift, parked1 });

    // ---- 2. one species per round, line up through round 3
    const lineAt = [];
    lineAt.push(await evaluate(`${GM}._goLineRaisePx`));
    const species = {};
    for (const round of [2, 3, 4, 5]) {
        await evaluate(`(${GM}).advanceRound(), true`);
        await sleep(300);
        species[round] = await evaluate(`${GM}.spawnMgr._activeSpecies.slice().sort()`);
        lineAt.push(await evaluate(`${GM}._goLineRaisePx`));
        await sleep(4500);  // round-up pause
    }
    check('round 2 adds Cat', JSON.stringify(species[2]) === '[0,1]', species[2]);
    check('round 3 adds Chicken', JSON.stringify(species[3]) === '[0,1,2]', species[3]);
    check('round 4 adds Wolf', JSON.stringify(species[4]) === '[0,1,2,3]', species[4]);
    check('round 5 adds Eagle', JSON.stringify(species[5]) === '[0,1,2,3,4]', species[5]);
    check('game-over line raised and unchanged in rounds 1–3', lineAt[0] > 0 && lineAt[1] === lineAt[0] && lineAt[2] === lineAt[0], lineAt);
    check('game-over line steps down at round 4 and 5', lineAt[3] < lineAt[2] && lineAt[4] < lineAt[3], lineAt);

    // ---- 3. physics pace
    const slow = await shot(1);
    const fast = await shot(1.35);
    console.log('     shot speed 1:', JSON.stringify(slow), ' speed 1.35:', JSON.stringify(fast));
    const reach = Math.abs(fast.y - slow.y) / Math.max(1, Math.abs(slow.y));
    check('same landing point (±4%)', reach < 0.04 && Math.abs(fast.x - slow.x) < 5, { slowY: slow.y, fastY: fast.y, diff: reach });
    check('faster flight (≥ 20% less time)', fast.sec < slow.sec * 0.8, { slow: slow.sec, fast: fast.sec });

    const exceptions = logs.filter(l => /EXCEPTION/.test(l));
    check('no exceptions', exceptions.length === 0, exceptions);
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    ws.close(); chrome.kill(); server.close();
}
process.exit(failures ? 1 : 0);
