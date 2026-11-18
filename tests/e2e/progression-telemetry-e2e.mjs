#!/usr/bin/env node
// Progression telemetry check (Playgama telemetry guide): on the PLAYGAMA build, plays three short
// games in headless Chrome and verifies the product funnel events sent through bridge.analytics:
//   tutorial_started/_completed (step 'aim'), milestone_reached (first_launch), progression_started,
//   progression_completed (round_up, victory), progression_failed (game_over), progression_abandoned (menu).
// Events are read from the PlaygamaPortal console trace ("[Portal] analytics <name> <json>").
//
//   npm run pack:playgama && npm run test:telemetry
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-telemetry-chrome-'));
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
const waitFor = async (pred, ms = 15000) => { for (let t = 0; t < ms && !pred(); t += 100) await sleep(100); return pred(); };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const waitGame = async () => {
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0`)) return true; } catch { /* loading */ } await sleep(250); }
    return false;
};
const startNewGame = async () => {
    logs.length = 0;
    await evaluate(`(() => { const s = cc.director.getScene(); const gm = s.getComponentInChildren('GameManager'); if (gm) gm.constructor._forceNewGame = true; cc.director.loadScene('Game'); return true; })()`);
    await sleep(500);
    check('new game loaded', await waitGame());
    await waitFor(() => events('progression_started').length > 0);
};

try {
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 450, height: 800, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    check('first visit lands in the Game', await waitGame());
    await waitFor(() => events('tutorial_started').length > 0);

    // ---- game 1 (first-time player): tutorial aim → first launch → round 1 cleared → quit to menu
    const ps1 = events('progression_started')[0];
    check('progression_started round_1 at game start', ps1?.level_id === 'round_1' && ps1?.step_index === 1 && ps1?.restored === false, ps1);
    const ts = events('tutorial_started')[0];
    check('tutorial_started aim (fresh profile)', ts?.step_id === 'aim' && ts?.step_index === 1, ts);
    const order = logs.filter(l => /analytics (game_started|tutorial_started) /.test(l)).map(l => l.match(/analytics (\w+)/)[1]);
    check('tutorial_started comes after game_started', order[0] === 'game_started', order);

    await evaluate(`(${GM}).inputCtrl.autoLaunch(), true`);
    await waitFor(() => events('milestone_reached').length > 0, 5000);
    const tc = events('tutorial_completed')[0];
    check('tutorial_completed aim on the first shot', tc?.step_id === 'aim', tc);
    const ml = events('milestone_reached')[0];
    check('milestone_reached first_launch', ml?.milestone_id === 'first_launch' && ml?.level_id === 'round_1', ml);

    await sleep(1500);
    await evaluate(`(${GM}).advanceRound(), true`);
    await waitFor(() => events('progression_started').length > 1, 3000);
    const pc = events('progression_completed')[0];
    check('progression_completed round_1 (round_up) with its launches', pc?.level_id === 'round_1' && pc?.result === 'round_up' && pc?.launches === 1, pc);
    const ps2 = events('progression_started')[1];
    check('progression_started round_2 after the round-up', ps2?.level_id === 'round_2' && ps2?.step_index === 2, ps2);
    check('round_reached still sent (continuity)', events('round_reached').some(e => e?.round === 2));

    await sleep(4000);  // round-up pause
    await evaluate(`(${GM}).pausePanel.onMenu(), true`);
    await waitFor(() => events('progression_abandoned').length > 0, 3000);
    const pa = events('progression_abandoned')[0];
    check('progression_abandoned round_2 reason menu', pa?.level_id === 'round_2' && pa?.reason === 'menu' && pa?.game_launches === 1, pa);
    for (let i = 0; i < 80; i++) { try { if (await evaluate(`cc.director.getScene()?.name === 'MainMenu'`)) break; } catch { /* switching */ } await sleep(250); }

    // ---- game 2: game over in round 1 (no tutorial: already seen)
    await startNewGame();
    check('no tutorial_started for a returning player', events('tutorial_started').length === 0, events('tutorial_started'));
    await evaluate(`(${GM}).triggerGameOver(), true`);
    await waitFor(() => events('progression_failed').length > 0, 3000);
    const pf = events('progression_failed')[0];
    check('progression_failed round_1 reason game_over', pf?.level_id === 'round_1' && pf?.reason === 'game_over' && pf?.launches === 0 && pf?.revive_used === false, pf);
    await evaluate(`(${GM}).pausePanel.onMenu(), true`);
    await sleep(500);
    check('no progression_abandoned after a game over', events('progression_abandoned').length === 0, events('progression_abandoned'));

    // ---- game 3: victory
    await startNewGame();
    await evaluate(`(${GM}).triggerVictory(), true`);
    await waitFor(() => events('progression_completed').length > 0, 3000);
    const pv = events('progression_completed')[0];
    check('progression_completed result victory', pv?.result === 'victory' && pv?.level_id === 'round_1', pv);

    const exceptions = logs.filter(l => /EXCEPTION/.test(l));
    check('no exceptions', exceptions.length === 0, exceptions);
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    ws.close(); chrome.kill(); server.close();
}
process.exit(failures ? 1 : 0);
