#!/usr/bin/env node
// Powerup effects check (2026-11-18), on the standard web-mobile build in headless Chrome:
//   - AURA: a zapped warrior dissolves into a burst (ring + core + shards) and a spark; with no warrior of
//     its species left on the track the spark flies back to the Aura carrier, which evolves;
//   - BROTHERHOOD: every imploded warrior sends an energy sphere to the launched warrior, which vibrates
//     and gains max(1, floor(Σ levels / 5)) levels; every warrior on the track gets a small push up;
//   - WILD RIVER: the contagion flows on by itself warrior to warrior of the same species (not all at
//     once, not stopping at the first contact), each hop a lightning bolt; out-of-reach kin stay clean;
//     once the river is dry the infected implode and the track gets a small push up.
//   - THUNDER RAIN: once its carrier rests on the track, golden bolts fall on the isolated warriors (no
//     same species, no similar level near), which burst and send their energy to the carrier (+levels);
//   - BROTHERHOOD acts on one species only: the warrior touched first;
//   - TOKEN: the collected coin becomes a white star, floats ~2 s, then curves onto its counter;
//   - SHRINK: the round-ups that lower the game-over line shrink every warrior to the round's scale
//     (0.75 from the Dragon's round) while they burn off embers; saved with the game.
// Screenshots of each effect in %TEMP%/fw-effects-shots.
//
//   npm run build && npm run test:effects
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const SHOTS = path.join(os.tmpdir(), 'fw-effects-shots');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8141, DEBUG_PORT = 9356;
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const file = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-effects-chrome-'));
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
const waitFor = async (pred, ms = 15000, step = 100) => { for (let t = 0; t < ms; t += step) { if (await pred()) return true; await sleep(step); } return !!(await pred()); };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const waitGame = async () => {
    for (let i = 0; i < 240; i++) { try { if (await evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0`)) return true; } catch { /* loading */ } await sleep(250); }
    return false;
};
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); };

// Page helpers (installed once): a quiet track and warriors placed by canvas offset from the track centre.
const HELPERS = `(() => {
    const gm = ${GM};
    window.__fx = {
        gm,
        quiet() {
            gm.timerRemaining = 999;
            const f = gm._tokenField; if (f) { f._clock = -1e6; f.burst = () => {}; f._burstQueue = []; f.clear(); }
            const l = gm.inputCtrl.warrior;
            for (const w of gm.warriors.slice()) if (w !== l && w.node && w.node.isValid) w.node.destroy();
            gm.warriors = gm.warriors.filter(w => w === l);
            gm._activeVortices = [];
            return true;
        },
        // dx, dy: canvas px from a point well above the game-over line.
        spawn(type, level, dx, dy) {
            const W = gm.inputCtrl.warrior.constructor;
            const sx = gm.box2dLayer.scale.x, sy = gm.box2dLayer.scale.y;
            const baseY = gm.gameOverLineLocal + 160 / sy;
            const w = W.spawn(gm.box2dLayer, gm.warriorsLayer, type, level, dx / sx, baseY + dy / sy);
            w.crossedLine = true; w.fired = true; w.settle();
            w.onMergeReady = (a, b) => gm.mergeWarriors(a, b);
            gm.warriors.push(w);
            return w;
        },
        alive(w) { return !!(w && w.node && w.node.isValid); },
        count(name) { let n = 0; const walk = x => { if (x.name === name && x.activeInHierarchy) n++; x.children.forEach(walk); }; walk(gm.warriorsLayer); return n; },
    };
    return true;
})()`;

try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 296, height: 640, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    check('game loaded', await waitGame());
    await waitFor(() => evaluate(`${GM}.state === 1 && !!${GM}.inputCtrl.warrior`), 15000);
    await evaluate(HELPERS);
    check('lightning prefabs loaded', await waitFor(() => evaluate(`(() => { const l = __fx.gm._lightning; return !!(l && l.segmentPrefab && l.flashPrefab && l.impactSparkPrefab); })()`), 8000));

    const POWER_SFX = ['thunder_strike', 'lightning_zap', 'aura_zap', 'energy_absorb', 'implode', 'psycho_force', 'shrink_embers'];
    const sfxOk = await waitFor(() => evaluate(`(() => { const n = cc.director.getScene().getChildByName('AudioManager'); const am = n && n.getComponent('AudioManager'); if (!am) return false;
        return ${JSON.stringify(POWER_SFX)}.every(id => !!am._clips.get('audio/sfx/' + id)); })()`), 10000);
    check('powerup sounds loaded (thunder, zap, aura, absorb, implode, psycho, shrink)', sfxOk);
    await waitFor(() => evaluate(`!!cc.director.getScene().getChildByName('AudioManager').getComponent('AudioManager')._clips.get('audio/sfx/round_up')`), 10000);
    const pile = await evaluate(`(() => { const am = cc.director.getScene().getChildByName('AudioManager').getComponent('AudioManager');
        const burst = [...Array(10)].map(() => am.play('audio/sfx/thunder_strike', 0)).filter(Boolean).length;
        const mixed = ['hit', 'bounce', 'merge_1', 'merge_2', 'implode', 'aura_zap', 'energy_absorb', 'lightning_zap', 'explosion_1', 'spawn', 'land']
            .map(id => am.play('audio/sfx/' + id, 0)).filter(Boolean).length;
        const always = am.play('audio/sfx/round_up', 0);
        return { burst, mixed, voices: am._voices.length, always }; })()`);
    check('sounds: a burst of the same sound plays once', pile.burst === 1, pile);
    check('sounds: at most 7 ringing at once, game-info sounds always play', pile.mixed <= 6 && pile.always === true, pile);
    await sleep(2500);
    // Count the powerup sounds actually played from here on.
    await evaluate(`(() => { const am = cc.director.getScene().getChildByName('AudioManager').getComponent('AudioManager'); window.__sfx = {}; const orig = am.play.bind(am); am.play = (s, v) => { __sfx[s] = (__sfx[s] || 0) + 1; return orig(s, v); }; return true; })()`);

    // ---------------- AURA: dissolve burst + spark back to the carrier
    await evaluate(`__fx.quiet()`);
    await evaluate(`(() => {
        window.__aura = { carrier: __fx.spawn(0, 1, -120, 0), victim: __fx.spawn(3, 2, 60, 40) };
        __fx.gm._zappWarrior(__aura.victim, __aura.carrier);
        return true;
    })()`);
    const burst = await waitFor(() => evaluate(`__fx.count('ZapShard') >= 5 && __fx.count('ZapRing') >= 1`), 2000, 30);
    check('aura: the zapped warrior bursts (ring + shards)', burst, await evaluate(`({ shards: __fx.count('ZapShard'), rings: __fx.count('ZapRing'), core: __fx.count('ZapCore') })`));
    await shot('aura-1-burst');
    check('aura: a spark is born from the burst', await waitFor(() => evaluate(`__fx.count('ZappSpark') === 1`), 1500, 50));
    await sleep(500);
    await shot('aura-2-spark');
    const auraOk = await waitFor(() => evaluate(`(() => { const gm = __fx.gm; return !__fx.alive(__aura.carrier) && gm.warriors.some(w => w.type === 0 && w.level === 2 && w.node.isValid); })()`), 5000);
    check('aura: no warrior of its species left → the spark goes to the carrier, which evolves (lv1 → lv2)', auraOk,
        await evaluate(`__fx.gm.warriors.map(w => w.type + ':' + w.level)`));
    await shot('aura-3-evolved');

    // ---------------- BROTHERHOOD: energy spheres to the launched warrior + push up
    await sleep(800);
    await evaluate(`__fx.quiet()`);
    await evaluate(`(() => {
        const gm = __fx.gm;
        const carrier = __fx.spawn(0, 1, 0, -60);
        const targets = [[2, -120, 40], [3, -40, 90], [2, 50, 50], [3, 125, 90]].map(([lv, x, y]) => __fx.spawn(1, lv, x, y));
        const bystander = __fx.spawn(4, 1, 120, -60);
        window.__br = { carrier, targets, bystander, maxVy: 0, maxShake: 0 };
        gm._brotherhoodCarrier = carrier;
        gm._brotherhoodTriggered = false;
        gm._triggerBrotherhoodCascade(1);
        // Sample the bystander's upward velocity and the carrier's shake every frame.
        window.__br.timer = setInterval(() => {
            if (__fx.alive(bystander)) __br.maxVy = Math.max(__br.maxVy, bystander.velocity.y);
            if (__fx.alive(carrier) && carrier.mapper) __br.maxShake = Math.max(__br.maxShake, Math.abs(carrier.mapper.shakeX));
        }, 16);
        return true;
    })()`);
    const orbs = await waitFor(() => evaluate(`__fx.count('EnergyOrb') >= 1`), 4000, 50);
    check('brotherhood: imploded warriors release energy spheres', orbs);
    await sleep(350);
    await shot('brotherhood-1-orbs');
    check('brotherhood: the launched warrior vibrates as the spheres land', await waitFor(() => evaluate(`__br.maxShake >= 2`), 5000), await evaluate(`__br.maxShake`));
    const brOk = await waitFor(() => evaluate(`(() => { const gm = __fx.gm; return !__fx.alive(__br.carrier) && gm.warriors.some(w => w.type === 0 && w.level === 3 && w.node.isValid); })()`), 6000);
    check('brotherhood: Σ levels 10 → the launched warrior gains 2 levels (lv1 → lv3)', brOk, await evaluate(`__fx.gm.warriors.map(w => w.type + ':' + w.level)`));
    check('brotherhood: all the targets imploded', await evaluate(`__br.targets.every(w => !__fx.alive(w))`));
    check('brotherhood: small push up on the track', await evaluate(`__br.maxVy >= 1.5`), await evaluate(`__br.maxVy`));
    await evaluate(`clearInterval(__br.timer), true`);
    await shot('brotherhood-2-evolved');

    // ---------------- WILD RIVER: the river flows with lightning, then implodes + push up
    await sleep(800);
    await evaluate(`__fx.quiet()`);
    await evaluate(`(() => {
        const gm = __fx.gm;
        // A winding chain of Chickens (type 2) ~80 px apart, levels cycling 1-2-3 (no merges between neighbours).
        const pts = [[130, -70], [50, -70], [-30, -70], [-100, -30], [-40, 40], [40, 60], [120, 40]];
        const chain = pts.map(([x, y], i) => __fx.spawn(2, 1 + (i % 3), x, y));
        const far = null;
        const other = __fx.spawn(5, 1, -125, 70);      // other species: never infected, gets the push
        const source = __fx.spawn(0, 1, 0, -130);      // stands in for the launched warrior
        window.__wr = { chain, far, other, source, timeline: [], lightning: 0, maxVy: 0 };
        gm._wrsOrder = []; gm._wrsFrontier = []; gm._wrsImploding = false; gm._wrsDryTimer = 0; gm._wrsRiverTimer = 0;
        gm._applyWRS(chain[0], source);
        gm._wrsLauncherDone = true;                   // the launcher already stopped: implode when the river is dry
        const t0 = performance.now();
        window.__wr.timer = setInterval(() => {
            const n = chain.filter(w => gm._wrsActive.has(w)).length;
            const last = __wr.timeline[__wr.timeline.length - 1];
            if (!last || last.n !== n) __wr.timeline.push({ n, ms: Math.round(performance.now() - t0) });
            const fx = gm._lightning && gm._lightning.node.getChildByName('ManaLightningFX');
            if (fx) __wr.lightning = Math.max(__wr.lightning, fx.children.filter(c => c.active).length);
            if (__fx.alive(other)) __wr.maxVy = Math.max(__wr.maxVy, other.velocity.y);
        }, 16);
        return true;
    })()`);
    await sleep(300);
    await shot('wildriver-1-flow');
    const flowed = await waitFor(() => evaluate(`__wr.timeline.some(e => e.n === __wr.chain.length) || __wr.chain.every(w => !__fx.alive(w))`), 5000, 50);
    const tl = await evaluate(`__wr.timeline`);
    check('wild river: the river reaches the whole chain (7 warriors)', flowed && tl.some(e => e.n === 7), tl);
    const t7 = tl.find(e => e.n === 7)?.ms ?? 0, t2 = tl.find(e => e.n >= 2)?.ms ?? 0;
    check('wild river: it flows step by step, not all at once (≥ 0.6 s from the 2nd to the 7th)', t7 - t2 >= 600, { t2, t7 });
    check('wild river: lightning bolts on the contagions', await evaluate(`__wr.lightning > 0`), await evaluate(`__wr.lightning`));
    check('wild river: other species stay clean', await evaluate(`!__fx.gm._wrsActive.has(__wr.other)`));
    const imploded = await waitFor(() => evaluate(`__wr.chain.every(w => !__fx.alive(w))`), 5000);
    check('wild river: river dry → the infected implode', imploded);
    check('wild river: the other species is still on the track', await evaluate(`__fx.alive(__wr.other)`));
    await sleep(500);
    check('wild river: small push up on the track', await evaluate(`__wr.maxVy >= 1.5`), await evaluate(`__wr.maxVy`));
    await evaluate(`clearInterval(__wr.timer), true`);
    await shot('wildriver-2-after');

    // ---------------- THUNDER RAIN: bolts from the sky on the ISOLATED warriors (no same species, no similar level near)
    await sleep(800);
    await evaluate(`__fx.quiet()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1 && !!__fx.gm.inputCtrl.warrior`), 10000);
    const tr0 = await evaluate(`(() => {
        const gm = __fx.gm, l = gm.inputCtrl.warrior;
        gm._applyPendingPowerup(l, 'thunderRain');
        const r = { kind: gm._powerupOf(l), badge: gm._badgeKindOf(l), icon: !!gm.powerupPanel.iconFor('thunderRain'),
            fx: !!l.viewNode.getChildByName('ThunderRain'), counter: !!(gm.tokenCounters.thunderRain && gm.tokenCounters.thunderRain.isValid),
            face: !!gm.tokenFaces[3] };
        gm._clearThunder();
        return r;
    })()`);
    check('thunder rain: carried by the launcher (glow, badge, medallion, HUD counter, token face)', tr0.kind === 'thunderRain' && tr0.badge === 'thunderRain' && tr0.icon && tr0.fx && tr0.counter && tr0.face, tr0);
    await evaluate(`(() => {
        const gm = __fx.gm;
        const carrier = __fx.spawn(0, 1, 0, -130);
        const kin   = [__fx.spawn(2, 1, -115, -40), __fx.spawn(2, 2, -115, 50)];   // same species side by side
        const close = [__fx.spawn(3, 1, 115, -40), __fx.spawn(4, 2, 115, 50)];    // other species, similar level
        const lonely = __fx.spawn(5, 4, 0, 150);                                   // nothing of its kind or level near
        window.__tr = { carrier, kin, close, lonely, bolts: 0, orbs: 0 };
        __tr.predicted = [...kin, ...close, lonely].filter(w => gm._isIsolated(w, carrier)).length;
        __tr.targets = gm._thunderTargets(carrier);
        gm._attachThunder(carrier);
        carrier.launched = true;                 // stands in for the launched warrior, at rest on the track
        __tr.timer = setInterval(() => {
            const fx = gm._thunderLightning && gm._thunderLightning.node.getChildByName('ManaLightningFX');
            if (fx) __tr.bolts = Math.max(__tr.bolts, fx.children.filter(c => c.active).length);
            __tr.orbs = Math.max(__tr.orbs, __fx.count('EnergyOrb'));
        }, 16);
        return true;
    })()`);
    check('thunder rain: only the lonely warrior counts as isolated', await evaluate(`__tr.predicted === 1`), await evaluate(`__tr.predicted`));
    check('thunder rain: fewer than 3 isolated → topped up with the most isolated others (3 bolts, the lonely one first)', await evaluate(`__tr.targets.length === 3 && __tr.targets[0] === __tr.lonely`), await evaluate(`__tr.targets.map(w => w.type + ':' + w.level)`));
    check('thunder rain: the turn waits for the storm', await evaluate(`__fx.gm._thunderPending()`));
    await waitFor(() => evaluate(`__tr.bolts > 0`), 2500, 30);
    await sleep(120);
    await shot('thunder-1-bolt');
    check('thunder rain: a golden bolt falls from the sky', await evaluate(`__tr.bolts > 0`), await evaluate(`__tr.bolts`));
    check('thunder rain: the struck warriors are destroyed', await waitFor(() => evaluate(`__tr.targets.every(w => !__fx.alive(w))`), 3000));
    check('thunder rain: energy spheres fly to the carrier', await waitFor(() => evaluate(`__tr.orbs > 0`), 2000, 30));
    check('thunder rain: the others survive', await evaluate(`[...__tr.kin, ...__tr.close].filter(w => !__tr.targets.includes(w)).every(w => __fx.alive(w))`));
    const trEvolved = await waitFor(() => evaluate(`__fx.gm.warriors.some(w => w.type === 0 && w.level >= 2 && w.node.isValid)`), 5000);
    check('thunder rain: the carrier gains levels', trEvolved, await evaluate(`__fx.gm.warriors.map(w => w.type + ':' + w.level)`));
    check('thunder rain: storm over, the turn can go on', await waitFor(() => evaluate(`!__fx.gm._thunderPending()`), 3000));
    await evaluate(`clearInterval(__tr.timer), true`);
    await shot('thunder-2-after');

    // ---------------- THUNDER RAIN, crowded track: nobody isolated, and the carrier merges on its way
    await sleep(800);
    await evaluate(`__fx.quiet()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1 && !!__fx.gm.inputCtrl.warrior`), 10000);
    await evaluate(`(() => {
        const gm = __fx.gm;
        const carrier = __fx.spawn(0, 1, 0, -130);
        const twin = __fx.spawn(0, 1, 0, -130);                     // same frog right on it: they merge
        twin.node.setPosition(carrier.node.position.x + carrier.radius * 0.5 / gm.box2dLayer.scale.x, carrier.node.position.y, 0);
        const flock = [[-70, 40, 1], [-10, 40, 2], [50, 40, 1], [110, 40, 2], [20, 110, 1]].map(([x, y, lv]) => __fx.spawn(2, lv, x, y));
        window.__tc = { carrier, flock, bolts: 0, carriers: [] };
        __tc.isolated = flock.filter(w => gm._isIsolated(w, carrier)).length;
        gm._attachThunder(carrier);
        carrier.launched = true;
        __tc.timer = setInterval(() => {
            const c = gm._thunderCarrier; if (c && !__tc.carriers.includes(c)) __tc.carriers.push(c);
            const fx = gm._thunderLightning && gm._thunderLightning.node.getChildByName('ManaLightningFX');
            if (fx) __tc.bolts = Math.max(__tc.bolts, fx.children.filter(c => c.active).length);
        }, 16);
        return true;
    })()`);
    check('thunder rain (crowded): nobody is isolated', await evaluate(`__tc.isolated === 0`), await evaluate(`__tc.isolated`));
    check('thunder rain (crowded): the carrier merges and the merged warrior keeps the storm', await waitFor(() => evaluate(`__tc.carriers.length >= 2 && __tc.carriers[1].level === 2`), 4000, 30), await evaluate(`__tc.carriers.map(w => w.type + ':' + w.level)`));
    check('thunder rain (crowded): bolts still fall', await waitFor(() => evaluate(`__tc.bolts > 0`), 4000, 30));
    check('thunder rain (crowded): 3 of the least connected warriors struck', await waitFor(() => evaluate(`__tc.flock.filter(w => !__fx.alive(w)).length === 3`), 4000), await evaluate(`__tc.flock.filter(w => !__fx.alive(w)).length`));
    check('thunder rain (crowded): storm over', await waitFor(() => evaluate(`!__fx.gm._thunderPending()`), 5000));
    await evaluate(`clearInterval(__tc.timer), true`);

    // ---------------- THUNDER RAIN, real turn: charged by tokens onto the launcher, launched, lands, strikes
    await sleep(800);
    await evaluate(`__fx.quiet()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1 && !!__fx.gm.inputCtrl.warrior`), 10000);
    await evaluate(`(() => {
        const gm = __fx.gm;
        window.__tl = { flock: [[-110, 120, 3], [110, 120, 1], [0, 200, 2]].map(([x, y, lv]) => __fx.spawn([1, 3, 4][Math.abs(x) % 3], lv, x, y)), bolts: 0, events: [] };
        const te = gm._trackEvent.bind(gm); gm._trackEvent = (n, d) => { __tl.events.push(n); return te(n, d); };
        gm._tokenReady.push('thunderRain');
        gm.activateWarrior(gm.inputCtrl.warrior);
        __tl.charged = gm._thunderCarrier === gm.inputCtrl.warrior;
        __tl.timer = setInterval(() => {
            const fx = gm._thunderLightning && gm._thunderLightning.node.getChildByName('ManaLightningFX');
            if (fx) __tl.bolts = Math.max(__tl.bolts, fx.children.filter(c => c.active).length);
        }, 16);
        gm.inputCtrl.autoLaunch();
        return true;
    })()`);
    check('thunder rain (real turn): the token charge lands on the launcher', await evaluate(`__tl.charged`));
    check('thunder rain (real turn): after the launch the storm breaks', await waitFor(() => evaluate(`__tl.bolts > 0 && __tl.events.includes('thunder_rain')`), 12000, 50), await evaluate(`({ bolts: __tl.bolts, events: __tl.events })`));
    check('thunder rain (real turn): the game goes on to the next launcher', await waitFor(() => evaluate(`__fx.gm.state === 1 && !__fx.gm._thunderPending()`), 10000));
    await evaluate(`clearInterval(__tl.timer), true`);

    const played = await evaluate(`__sfx`);
    check('sounds: aura zap, energy absorb, implosion, river zap, thunder strike played', ['aura_zap', 'energy_absorb', 'implode', 'lightning_zap', 'thunder_strike'].every(id => played['audio/sfx/' + id] > 0), played);

    // ---------------- NEW SPECIES: spotlight the first time a species shows up in the game
    await sleep(1000);
    await evaluate(`__fx.quiet()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1`), 10000);
    await evaluate(`(() => { const gm = __fx.gm; window.__sp = { cat: __fx.spawn(1, 1, 0, -40) }; gm._firstLaunchSpecies.delete(1); gm._speciesShown.delete(1); gm._puInfoHold = 0; return gm._tickNewSpecies(__sp.cat, gm.powerupPanel, 1); })()`);
    const spotOn = `(() => { const p = __fx.gm.powerupPanel; return p.node.active && p.spotlightNode.active; })()`;
    check('new species: spotlight opens, game frozen', await waitFor(() => evaluate(`${spotOn} && __fx.gm.state === 5`), 1500, 50));
    await sleep(700);
    const cap = await evaluate(`(() => { const p = __fx.gm.powerupPanel; return { text: p.spotlightCaption.string, on: p.spotlightCaption.node.activeInHierarchy, card: p.cardNode.getComponent('cc.UIOpacity').opacity, medal: p.spotlightMedal.node.scale.x }; })()`);
    check('new species: "NEW WARRIOR / CAT" caption, warrior big, no card', cap.text === ['NEW WARRIOR', 'CAT'].join(String.fromCharCode(10)) && cap.on && cap.card === 0 && cap.medal > 1.5, cap);
    await shot('new-species-spotlight');
    check('new species: closes by itself and the game resumes', await waitFor(() => evaluate(`!__fx.gm.powerupPanel.node.active && __fx.gm.state !== 5 && !__fx.gm._puInfoOpen`), 5000));
    check('new species: shown once per game', await evaluate(`__fx.gm._tickNewSpecies(__sp.cat, __fx.gm.powerupPanel, 1) === false`));

    // ---------------- BROTHERHOOD hits ONE species: the warrior touched first (closest), not a neighbour of another kind
    await sleep(800);
    await evaluate(`__fx.quiet()`);
    await evaluate(`(() => {
        const gm = __fx.gm;
        const carrier = __fx.spawn(0, 1, 0, 0);
        const r = carrier.radius;
        const touched = __fx.spawn(2, 1, 0, 0);
        const near = __fx.spawn(3, 1, 0, 0);
        const sx = gm.box2dLayer.scale.x;
        touched.node.setPosition(carrier.node.position.x + (r + touched.radius - 2) / sx, carrier.node.position.y, 0);
        near.node.setPosition(carrier.node.position.x - (r + near.radius + 4) / sx, carrier.node.position.y, 0);
        const kin = [__fx.spawn(2, 2, -120, 110), __fx.spawn(2, 2, 120, 110)];
        const others = [__fx.spawn(3, 2, -60, 160), __fx.spawn(3, 3, 60, 160), near];  // different levels: the vortices must not merge them
        window.__b1 = { carrier, touched, kin, others };
        gm._brotherhoodCarrier = carrier; gm._brotherhoodTriggered = false;
        gm._tickBrotherhoodProximity();
        return true;
    })()`);
    await sleep(3500);
    check('brotherhood: only the touched species implodes', await evaluate(`!__fx.alive(__b1.touched) && __b1.kin.every(w => !__fx.alive(w))`));
    check('brotherhood: the other species (even the one a few px away) is untouched', await evaluate(`__b1.others.every(w => __fx.alive(w))`), await evaluate(`__b1.others.map(w => __fx.alive(w))`));

    // ---------------- TOKEN: the coin becomes a white star, hangs ~2 s in the air, then curves onto its counter
    await sleep(1500);
    await evaluate(`__fx.quiet()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1 && !!__fx.gm.inputCtrl.warrior`), 10000);
    await evaluate(`(() => {
        const gm = __fx.gm;
        gm.currentRound = 2; gm._refreshTokenCounters();
        const launcher = gm.inputCtrl.warrior;
        gm._tokenField.clear();
        gm._tokenField.spawn('brotherhood');
        const t = gm._tokenField.current.token;
        t.x = 0; t.y = launcher.node.position.y + 700;
        window.__tk = {};
        gm.inputCtrl.autoLaunch();
        return true;
    })()`);
    const born = await waitFor(() => evaluate(`(() => { let n = null; const w = x => { if (x.name === 'TokenStar') n = x; x.children.forEach(w); }; w(cc.director.getScene()); if (n && !__tk.star) { __tk.star = n; __tk.p0 = n.worldPosition.clone(); __tk.t0 = performance.now(); } return !!n; })()`), 6000, 30);
    check('token: the collected coin turns into a star', born);
    await sleep(900);
    await shot('token-star-hover');
    const hover = await evaluate(`(() => { const p = __tk.star && __tk.star.isValid ? __tk.star.worldPosition : null; return p ? { dy: Math.round(p.y - __tk.p0.y), dx: Math.round(p.x - __tk.p0.x), ms: Math.round(performance.now() - __tk.t0) } : null; })()`);
    check('token: after ~1 s it still floats right above the pickup point', !!hover && Math.abs(hover.dx) < 8 && hover.dy > 15 && hover.dy < 80, hover);
    const landed = await waitFor(() => evaluate(`!__tk.star.isValid`), 4000, 50);
    const flightMs = await evaluate(`Math.round(performance.now() - __tk.t0)`);
    check('token: it leaves after the hover and lands on the counter (2.2–3.6 s after the pickup)', landed && flightMs >= 2200 && flightMs <= 3600, flightMs);

    // ---------------- MERGE TIMING: equal warriors merge right away, even after a hard hit that bounces them apart
    const mergeAfter = async setup => {
        await evaluate(`__fx.quiet()`);
        await sleep(300);
        return evaluate(`new Promise(res => { const gm = __fx.gm; ${setup}
            const t0 = performance.now(); let merge = null;
            const om = gm.mergeWarriors.bind(gm); gm.mergeWarriors = (x, y) => { if (merge === null) merge = Math.round(performance.now() - t0); return om(x, y); };
            setTimeout(() => { gm.mergeWarriors = om; res(merge); }, 3000);
        })`);
    };
    const mHard = await mergeAfter(`const a = __fx.spawn(0, 1, -45, 40), b = __fx.spawn(0, 1, 45, 40); a.velocity = new cc.Vec2(25, 0);`);
    check('merge: a hard hit merges at once (no bounce-apart cancel)', mHard !== null && mHard < 900, mHard);
    const mRest = await mergeAfter(`const a = __fx.spawn(0, 1, 0, 40), b = __fx.spawn(0, 1, 0, 40); b.node.setPosition(a.node.position.x + a.radius * 2.03 / gm.box2dLayer.scale.x, a.node.position.y, 0);`);
    check('merge: two equal warriors resting side by side merge within half a second', mRest !== null && mRest < 600, mRest);
    const mGuard = await mergeAfter(`const a = __fx.spawn(0, 1, 0, 40), b = __fx.spawn(0, 1, 0, 40); b.node.setPosition(a.node.position.x + a.radius * 2.03 / gm.box2dLayer.scale.x, a.node.position.y, 0); b.brotherhoodInfected = true;`);
    check('merge: a warrior held by a power (Brotherhood) is not merged by the proximity check', mGuard === null, mGuard);

    // ---------------- SHRINK: the round-ups that lower the game-over line shrink every warrior, burning off embers
    await sleep(1200);
    await evaluate(`__fx.quiet()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1 && !!__fx.gm.inputCtrl.warrior`), 10000);
    await evaluate(`window.__W = __fx.gm.inputCtrl.warrior.constructor, true`);
    const W = `__W`;
    check('shrink: full size before round 3', await evaluate(`${W}.sizeScale === 1`), await evaluate(`${W}.sizeScale`));
    await evaluate(`(() => { const gm = __fx.gm; gm.currentRound = 3; window.__sh = { probe: __fx.spawn(1, 2, 0, 60) }; __sh.r0 = __sh.probe.radius; gm.inputCtrl.autoLaunch(); return true; })()`);
    await waitFor(() => evaluate(`__fx.gm.state === 1 && !!__fx.gm.inputCtrl.warrior && __fx.gm.inputCtrl.warrior.launched === false`), 12000);
    await sleep(300);
    check('shrink: launches no longer shrink the warriors', await evaluate(`${W}.sizeScale === 1`), await evaluate(`${W}.sizeScale`));
    await evaluate(`(() => { const gm = __fx.gm; gm.currentRound = 3; gm.advanceRound(); return true; })()`);
    const embers = await waitFor(() => evaluate(`__fx.count('BurnSpark') >= 3`), 2500, 50);
    check('shrink: at the round-up (3 → 4, line steps down) every warrior burns off rising embers', embers, await evaluate(`__fx.count('BurnSpark')`));
    await sleep(250);
    await shot('shrink-roundup-embers');
    const step = await evaluate(`(() => { const p = __sh.probe; const col = p.getComponent('cc.CircleCollider2D'); const ut = p.viewNode.getComponent('cc.UITransform'); return { scale: ${W}.sizeScale, r0: __sh.r0, r: p.radius, col: col.radius, view: ut.width, anim: p.mapper.animScale }; })()`);
    const floor4 = 1 - 0.25 * 2 / 7;
    check('shrink: round 4 → scale of the round (0.929), collider at the new size at once', Math.abs(step.scale - floor4) < 1e-6 && Math.abs(step.col - step.r) < 1e-3 && step.r < step.r0, step);
    check('shrink: the sprite eases down from the old size', step.anim > 1.0 && step.anim < 1.08, step.anim);
    await sleep(1600);
    check('shrink: sprite settled at the new size', await evaluate(`Math.abs(__sh.probe.mapper.animScale - 1) < 1e-3`));
    check('sounds: the shrink sizzles', await evaluate(`(__sfx['audio/sfx/shrink_embers'] || 0) > 0`));
    const roundUp = async round => { await evaluate(`(() => { const gm = __fx.gm; gm.currentRound = ${round}; gm._shrinkWarriors(); return true; })()`); return evaluate(`${W}.sizeScale`); };
    const f9 = await roundUp(9), f12 = await roundUp(12);
    check('shrink: 0.75 when the Dragon arrives (round 9), never below after', Math.abs(f9 - 0.75) < 1e-9 && Math.abs(f12 - 0.75) < 1e-9, { f9, f12 });
    await waitFor(() => evaluate(`__fx.gm.state === 1`), 12000);
    await evaluate(`(__fx.gm)._saveSnapshot(), true`);
    await send('Page.reload', { ignoreCache: true });
    await sleep(1500);
    check('shrink: reloaded into the game', await waitGame());
    await evaluate(HELPERS);
    await waitFor(() => evaluate(`!!__fx.gm.inputCtrl.warrior`), 8000);
    await evaluate(`window.__W = __fx.gm.inputCtrl.warrior.constructor, true`);
    check('shrink: scale restored from the saved game', await evaluate(`Math.abs(${W}.sizeScale - 0.75) < 1e-9`), await evaluate(`${W}.sizeScale`));
    check('shrink: restored warriors at the shrunken size', await evaluate(`__fx.gm.warriors.every(w => Math.abs(w.getComponent('cc.CircleCollider2D').radius - w.radius) < 1e-3)`));

    const exceptions = logs.filter(l => /EXCEPTION|TypeError|ReferenceError/.test(l));
    check('no exceptions', exceptions.length === 0, exceptions.slice(0, 5));
    console.log(`     screenshots in ${SHOTS}`);
} catch (e) {
    console.log('ABORTED', e.message); failures++;
} finally {
    try { ws.close(); } catch { /* ignore */ }
    chrome.kill(); server.close();
}
console.log(failures === 0 ? 'ALL OK' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
