#!/usr/bin/env node
// Power tokens check (v0.10.42), on the PLAYGAMA build in headless Chrome:
//   - no tokens and no counters in round 1; from round 2 the Brotherhood counter shows "0/3";
//   - a token spawns, a launched warrior running over it collects it: score +25×round, counter 1/3,
//     token_collected sent;
//   - 3 Brotherhood tokens charge the power: the next launcher carries Brotherhood (rescue_powerup
//     source tokens), counter back to 0/3;
//   - an untouched token vanishes after its lifetime (token_missed);
//   - counts survive a save/reload; screenshots of the HUD at 591 / 960 / 2276.
//
//   npm run pack:playgama && npm run test:tokens
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const SHOTS = path.join(os.tmpdir(), 'fw-tokens-shots');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8131, DEBUG_PORT = 9346;
if (!fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8').includes('playgama-bridge')) {
    console.log('build/web-mobile is not the Playgama variant — run `npm run pack:playgama` first.');
    process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const file = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-tokens-chrome-'));
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
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description}`);
});
const send = (method, params = {}) => new Promise((ok, ko) => { const id = ++seq; pending.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };

let failures = 0;
const check = (label, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); if (!cond) failures++; };
const events = name => logs.filter(l => l.includes(`[Portal] analytics ${name} `)).map(l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch { return null; } });
const waitFor = async (pred, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await pred()) return true; await sleep(100); } return !!(await pred()); };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const waitGame = async () => {
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0`)) return true; } catch { /* loading */ } await sleep(250); }
    return false;
};
const counterText = kind => evaluate(`(() => { const tc = ${GM}.tokenCounters; const n = tc && tc[${JSON.stringify(kind)}]; if (!n || !n.activeInHierarchy) return null; return n.getChildByName('Count').getComponent(cc.Label).string; })()`);
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); };
// No natural token spawns, no new-species bursts and no launch-timer auto-shot: every check below is deterministic.
const freezeAuto = () => evaluate(`(() => { const gm = ${GM}; const f = gm._tokenField; f._clock = -1e6; gm.timerRemaining = 999; if (!f._burstReal) { f._burstReal = f.burst; f.burst = () => {}; } f._burstQueue = []; return true; })()`);

// Clears the track, spawns a token straight up the launch line and fires the launcher through it.
const collectOne = async kind => {
    const before = events('token_collected').length;
    await freezeAuto();
    await waitFor(() => evaluate(`${GM}.state === 1 && !!${GM}.inputCtrl.warrior`), 8000);
    await evaluate(`(() => {
        const gm = ${GM};
        const launcher = gm.inputCtrl.warrior;
        for (const w of gm.warriors.slice()) if (w !== launcher && w.node && w.node.isValid) w.node.destroy();
        gm.warriors = gm.warriors.filter(w => w === launcher);
        gm._tokenField.clear();
        gm._tokenField.spawn(${JSON.stringify(kind)});
        const t = gm._tokenField.current.token;
        t.x = 0; t.y = launcher.node.position.y + 700;
        gm.inputCtrl.autoLaunch();
        return true;
    })()`);
    return waitFor(() => events('token_collected').length > before, 6000);
};

try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 296, height: 640, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    check('game loaded', await waitGame());

    // ---- round 1: nothing
    check('round 1: no counters', (await evaluate(`${GM}.tokenCounters.node.active`)) === false);
    await sleep(5000);
    check('round 1: no token spawned', (await evaluate(`${GM}._tokenField.current === null`)) === true);

    // ---- round 2: Brotherhood unlocked
    await evaluate(`(${GM}).advanceRound(), true`);
    await sleep(4800);
    await freezeAuto();
    check('round 2: no counter before the first token', (await counterText('brotherhood')) === null && (await evaluate(`${GM}.tokenCounters.node.active`)) === false);

    // ---- pickup
    const score0 = await evaluate(`${GM}.score`);
    check('token collected by the launched warrior', await collectOne('brotherhood'));
    check('floating bonus score shown (as for a merge)', await evaluate(`(() => { const ui = cc.director.getScene().getChildByName('Canvas').getChildByName('UILayer'); return ui.children.some(c => c.name === 'FloatingScore'); })()`));
    const tc = events('token_collected')[0];
    check('token_collected payload', tc?.power === 'brotherhood' && tc?.count === 1 && tc?.needed === 3 && tc?.round === 2, tc);
    await sleep(3200);   // star: ~2 s in the air, then the flight to the counter
    check('score +25 × round', (await evaluate(`${GM}.score`)) - score0 >= 50, (await evaluate(`${GM}.score`)) - score0);
    check('counter shown after the first token: 1/3', (await counterText('brotherhood')) === '1/3', await counterText('brotherhood'));
    check('other powers still without a counter', (await counterText('wildRiver')) === null && (await counterText('psychoForce')) === null);
    await shot('hud-phone-1of3');

    // ---- charge the power
    check('2nd token', await collectOne('brotherhood'));
    await sleep(3200);
    check('3rd token', await collectOne('brotherhood'));
    await sleep(3200);
    console.log('     collected:', JSON.stringify(events('token_collected').map(e => e.count)));
    check('counter stays, back to 0/3 after charging', (await counterText('brotherhood')) === '0/3', await counterText('brotherhood'));
    // The power goes to the next launcher activated: if the 3rd shot crossed the line before
    // touching the token, that is the launcher after one more shot.
    let charged = await waitFor(() => events('rescue_powerup').length > 0, 3000);
    if (!charged) {
        await waitFor(() => evaluate(`${GM}.state === 1 && !!${GM}.inputCtrl.warrior`), 8000);
        await evaluate(`(${GM}).inputCtrl.autoLaunch(), true`);
        charged = await waitFor(() => events('rescue_powerup').length > 0, 8000);
    }
    const rp = events('rescue_powerup')[0];
    check('next launcher carries Brotherhood (source tokens)', charged && rp?.powerup === 'brotherhood' && rp?.source === 'tokens', rp);

    // ---- the first Brotherhood opens its tutorial modal (game frozen): close it
    if (await waitFor(() => evaluate(`${GM}._puInfoOpen`), 4000)) {
        await sleep(1500);
        await evaluate(`(${GM}).powerupPanel._close(), true`);
        await waitFor(() => evaluate(`!${GM}._puInfoOpen`), 4000);
    }
    check('tutorial modal closed', (await evaluate(`${GM}._puInfoOpen`)) === false);

    // ---- expiry
    await freezeAuto();
    await waitFor(() => evaluate(`${GM}.state === 1`), 8000);
    await evaluate(`(() => { const gm = ${GM}; const l = gm.inputCtrl.warrior; for (const w of gm.warriors.slice()) if (w !== l && w.node && w.node.isValid) w.node.destroy(); gm.warriors = gm.warriors.filter(w => w === l); gm._tokenField.clear(); return gm._tokenField.spawn('brotherhood'); })()`);
    await sleep(800);
    const order = await evaluate(`(() => { const t = ${GM}._tokenField.current.token.node; const p = t.parent; const w = p.parent.getChildByName('WarriorsLayer'); return { parent: p.name, below: p.getSiblingIndex() < w.getSiblingIndex() }; })()`);
    check('token drawn under the warriors (TokenLayer below WarriorsLayer)', order.parent === 'TokenLayer' && order.below, order);
    // A warrior parked right on the token: it must cover it (screenshot token-under-warrior).
    await evaluate(`(() => { const gm = ${GM}; const t = gm._tokenField.current.token; const w = gm.inputCtrl.warrior; w.node.setPosition(t.x, t.y + 12, 0); return true; })()`);
    await sleep(300);
    await shot('token-under-warrior');
    await evaluate(`(() => { const gm = ${GM}; const w = gm.inputCtrl.warrior; w.node.setPosition(0, w.node.position.y < -100 ? w.node.position.y : -163, 0); return true; })()`);
    await shot('token-on-track-phone');
    const missed = await waitFor(() => events('token_missed').length > 0, 9000);
    check('untouched token vanishes (token_missed)', missed && events('token_missed')[0]?.power === 'brotherhood', events('token_missed')[0]);

    // ---- new species: a burst of 3 tokens, a short delay apart
    await freezeAuto();
    await evaluate(`(() => { const gm = ${GM}; const l = gm.inputCtrl.warrior; for (const w of gm.warriors.slice()) if (w !== l && w.node && w.node.isValid) w.node.destroy(); gm.warriors = gm.warriors.filter(w => w === l); gm._tokenField.clear(); gm._tokenField._burstReal(3, 0.35); return true; })()`);
    await sleep(200);
    const early = await evaluate(`${GM}._tokenField.count`);
    await sleep(1200);
    const after = await evaluate(`${GM}._tokenField.count`);
    check('burst: tokens appear one after the other, 3 in all', early >= 1 && early < 3 && after === 3, { early, after });
    await shot('burst-phone');
    await evaluate(`(${GM})._tokenField.clear(), true`);

    // ---- save / reload keeps the counts
    await collectOne('brotherhood');
    await sleep(1200);
    await evaluate(`(${GM})._saveSnapshot(), true`);
    await send('Page.reload', { ignoreCache: true });
    await sleep(1500);
    check('reloaded into the game', await waitGame());
    await freezeAuto();
    await sleep(1500);
    check('count restored after reload (1/3)', (await counterText('brotherhood')) === '1/3', await counterText('brotherhood'));

    // ---- HUD at the three reference widths
    for (const [w, h, name] of [[591, 1280, 'phone'], [960, 1280, 'tablet'], [2276, 1280, 'desktop']]) {
        await send('Emulation.setDeviceMetricsOverride', { width: Math.round(w / 2), height: Math.round(h / 2), deviceScaleFactor: 2, mobile: w < 1000 });
        await sleep(1500);
        await evaluate(`(() => { const gm = ${GM}; gm._tokenField.clear(); return gm._tokenField.spawn('brotherhood'); })()`);
        await sleep(700);
        await shot(`hud-${name}`);
        const box = await evaluate(`(() => { const n = ${GM}.tokenCounters.node; const ut = n.getComponent('cc.UITransform'); const r = ut.getBoundingBoxToWorld(); const sz = cc.view.getVisibleSize(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: sz.width, vh: sz.height }; })()`);
        check(`${name}: counters inside the screen`, box.x >= 0 && box.x + box.w <= box.vw + 1 && box.y + box.h <= box.vh + 1, box);
    }
    console.log(`     screenshots in ${SHOTS}`);

    const exceptions = logs.filter(l => /EXCEPTION/.test(l));
    check('no exceptions', exceptions.length === 0, exceptions);
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    ws.close(); chrome.kill(); server.close();
}
process.exit(failures ? 1 : 0);
