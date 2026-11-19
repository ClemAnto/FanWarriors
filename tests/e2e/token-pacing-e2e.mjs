#!/usr/bin/env node
// Power-token pacing check (2026-11-18 tuning), on the PLAYGAMA build in headless Chrome:
//   - lifetime: the game's first token stays 12 s, the others 8 s (then token_missed);
//   - interval from one appearance to the next, by warriors on the track: 20 s (<15), 12 s (15–24),
//     8 s (25+), counted also while the previous token is still on the track; a crowd that grows
//     mid-wait shortens it at once;
//   - unlocks: PsychoForce tokens only from round 7, 4 to charge (counter "n/4");
//   - new species: Cat / Eagle / Lion drop 3 tokens of the power unlocked with them, Chicken 1;
//   - token_collected carries on_track and age_sec, token_missed on_track.
// The warriors-on-track count is stubbed (deps.onTrack) so the timings don't depend on the physics.
//
//   npm run pack:playgama && npm run test:token-pacing
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8132, DEBUG_PORT = 9347;
const TOL = 0.8;   // s, tolerance on measured timings (frame steps + polling)
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-pacing-chrome-'));
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
const near = (v, want) => typeof v === 'number' && Math.abs(v - want) <= TOL;
const events = name => logs.filter(l => l.includes(`[Portal] analytics ${name} `)).map(l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch { return null; } });
const waitFor = async (pred, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await pred()) return true; await sleep(100); } return !!(await pred()); };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const F = `${GM}._tokenField`;
const waitGame = async () => {
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0`)) return true; } catch { /* loading */ } await sleep(250); }
    return false;
};
const counterText = kind => evaluate(`(() => { const tc = ${GM}.tokenCounters; const n = tc && tc[${JSON.stringify(kind)}]; if (!n || !n.activeInHierarchy) return null; return n.getChildByName('Count').getComponent(cc.Label).string; })()`);

// Spawn / expiry log kept in the page, in seconds of page time.
const hook = () => evaluate(`(() => {
    const f = ${F};
    window.__tk = [];
    if (!f.__hooked) {
        const sp = f.deps.onSpawn, ex = f.deps.onExpire;
        f.deps.onSpawn = k => { window.__tk.push({ e: 'spawn', k, t: performance.now() / 1000 }); sp(k); };
        f.deps.onExpire = k => { window.__tk.push({ e: 'expire', k, t: performance.now() / 1000 }); ex(k); };
        f.__hooked = true;
    }
    return true;
})()`);
const tk = () => evaluate(`window.__tk`);
const setCrowd = n => evaluate(`(() => { ${F}.deps.onTrack = () => ${n}; return true; })()`);
/** Empty track (but the launcher), no token, clock restarted from now. */
const resetField = () => evaluate(`(() => {
    const gm = ${GM}; const f = gm._tokenField; const l = gm.inputCtrl.warrior;
    for (const w of gm.warriors.slice()) if (w !== l && w.node && w.node.isValid) w.node.destroy();
    gm.warriors = gm.warriors.filter(w => w === l);
    f.clear(); f._clock = 0; window.__tk = [];
    return true;
})()`);
const toRound = async r => {
    await evaluate(`(() => { const gm = ${GM}; while (gm.currentRound < ${r}) gm.advanceRound(); return gm.currentRound; })()`);
    await waitFor(() => evaluate(`!${GM}.roundUpPause && ${GM}.state === 1`), 15000);
};
const kindsOnTrack = () => evaluate(`${F}._live.map(l => l.kind)`);

try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 296, height: 640, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    check('game loaded', await waitGame());

    // Keep the game in Aiming (no auto-shot) and the new-species drops under the test's control.
    await evaluate(`(() => { const gm = ${GM}; setInterval(() => { gm.timerRemaining = 999; }, 200); gm._checkNewSpecies = () => false; return true; })()`);
    await toRound(2);
    await hook();
    await setCrowd(5);

    // ---- first token of the game: 12 s
    await resetField();
    await evaluate(`${F}._spawnedAny = false`);
    check('first token of the game spawns', await evaluate(`${F}.spawn('brotherhood')`));
    check('first token lifetime 12 s', (await evaluate(`${F}._live[0].lifetime`)) === 12, await evaluate(`${F}._live[0].lifetime`));
    await waitFor(async () => (await tk()).some(e => e.e === 'expire'), 16000);
    let log = await tk();
    const firstLife = log.find(e => e.e === 'expire')?.t - log.find(e => e.e === 'spawn')?.t;
    check('first token vanishes after ~12 s', near(firstLife, 12), +firstLife?.toFixed(2));
    const miss = events('token_missed').at(-1);
    check('token_missed carries on_track', typeof miss?.on_track === 'number', miss);

    // ---- later tokens: 8 s
    await resetField();
    await evaluate(`${F}.spawn('brotherhood')`);
    check('later token lifetime 8 s', (await evaluate(`${F}._live[0].lifetime`)) === 8);
    await waitFor(async () => (await tk()).some(e => e.e === 'expire'), 12000);
    log = await tk();
    const life = log.find(e => e.e === 'expire')?.t - log.find(e => e.e === 'spawn')?.t;
    check('later token vanishes after ~8 s', near(life, 8), +life?.toFixed(2));

    // ---- interval by crowd, appearance to appearance
    for (const [crowd, want] of [[5, 20], [20, 12], [30, 8]]) {
        await setCrowd(crowd);
        await resetField();
        await waitFor(async () => (await tk()).filter(e => e.e === 'spawn').length >= 2, (want * 2 + 6) * 1000);
        const sp = (await tk()).filter(e => e.e === 'spawn');
        const gap = sp[1]?.t - sp[0]?.t;
        check(`${crowd} on track: a token every ~${want} s`, near(gap, want), +gap?.toFixed(2));
        if (crowd === 20) {
            const exp = (await tk()).find(e => e.e === 'expire');
            // Expired at 8 s, next at 12 s from the appearance (not 8 + 12).
            check('interval counted from the appearance, not from the expiry', exp && near(sp[1].t - exp.t, 4), exp && +(sp[1].t - exp.t).toFixed(2));
        }
        if (crowd === 30) check('crowded: a token almost always on the track', near(gap, 8));
    }

    // ---- the crowd grows mid-wait: the shorter interval applies at once
    await setCrowd(5);
    await resetField();
    await waitFor(async () => (await tk()).some(e => e.e === 'spawn'), 25000);
    const t0 = (await tk())[0].t;
    await sleep(9500);   // > 8 s, < 20 s since the appearance
    check('no new token at 9.5 s with an empty track', (await tk()).filter(e => e.e === 'spawn').length === 1);
    await setCrowd(30);
    await waitFor(async () => (await tk()).filter(e => e.e === 'spawn').length >= 2, 3000);
    const sp2 = (await tk()).filter(e => e.e === 'spawn');
    check('track fills up past 8 s: next token right away', sp2.length >= 2 && sp2[1].t - t0 < 11, sp2[1] && +(sp2[1].t - t0).toFixed(2));
    await setCrowd(5);

    // ---- new species drops (stub removed only for the direct call)
    const drop = async (type, label, want) => {
        await resetField();
        await evaluate(`(${GM})._newSpeciesTokens(${type}), true`);
        await sleep(1800);
        const kinds = await kindsOnTrack();
        check(`${label}: ${want.length} × ${[...new Set(want)].join('/') || 'random'}`, kinds.length === want.length && (want[0] === '*' || kinds.every(k => k === want[0])), kinds);
    };
    await drop(1, 'Cat (round 2)', ['brotherhood', 'brotherhood', 'brotherhood']);
    await toRound(3);
    await drop(2, 'Chicken (round 3)', ['*']);
    await toRound(4);
    await drop(3, 'Wolf (round 4)', ['thunderRain', 'thunderRain', 'thunderRain']);
    await toRound(5);
    await drop(4, 'Eagle (round 5)', ['wildRiver', 'wildRiver', 'wildRiver']);

    // ---- round 6: still no PsychoForce in the random pool (Brotherhood, Thunder Rain, Wild River)
    await toRound(6);
    const pool6 = new Set();
    for (let i = 0; i < 20; i++) { await evaluate(`(() => { ${F}.clear(); return ${F}.spawn(); })()`); (await kindsOnTrack()).forEach(k => pool6.add(k)); }
    check('round 6: random tokens never PsychoForce', !pool6.has('psychoForce') && pool6.size === 3, [...pool6]);

    // ---- round 7: PsychoForce unlocked, Lion drops 3, needs 4
    await toRound(7);
    await drop(5, 'Lion (round 7)', ['psychoForce', 'psychoForce', 'psychoForce']);
    await evaluate(`${F}.clear()`);
    const before = events('token_collected').length;
    await evaluate(`(() => {
        const gm = ${GM}; const f = gm._tokenField; const launcher = gm.inputCtrl.warrior;
        f.spawn('psychoForce');
        const t = f.current.token; t.x = 0; t.y = launcher.node.position.y + 700;
        gm.inputCtrl.autoLaunch();
        return true;
    })()`);
    check('PsychoForce token collected', await waitFor(() => events('token_collected').length > before, 6000));
    const pc = events('token_collected').at(-1);
    check('PsychoForce needs 4 tokens', pc?.power === 'psychoForce' && pc?.needed === 4 && pc?.round === 7, pc);
    check('token_collected carries on_track and age_sec', typeof pc?.on_track === 'number' && typeof pc?.age_sec === 'number' && pc.age_sec >= 0 && pc.age_sec <= 8, pc);
    await sleep(3200);   // the collected coin hovers ~2 s as a star before it lands on its counter
    check('PsychoForce counter 1/4', (await counterText('psychoForce')) === '1/4', await counterText('psychoForce'));

    // ---- a drop not yet fallen survives a reload (snapshot tokens.pending)
    await resetField();
    await evaluate(`(() => { const gm = ${GM}; gm._tokenField.burst(3, 0.35, 'wildRiver'); gm._saveSnapshot(); return gm._tokenField.pending; })()`);
    await send('Page.reload', { ignoreCache: true });
    await sleep(1500);
    check('reloaded into the game', await waitGame());
    await waitFor(async () => (await kindsOnTrack()).length >= 3, 6000);
    const restored = await kindsOnTrack();
    check('pending drop restored after reload: 3 × wildRiver', restored.length === 3 && restored.every(k => k === 'wildRiver'), restored);

    const exceptions = logs.filter(l => /EXCEPTION/.test(l));
    check('no exceptions', exceptions.length === 0, exceptions);
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    ws.close(); chrome.kill(); server.close();
}
process.exit(failures ? 1 : 0);
