#!/usr/bin/env node
// Arenas + round picker check (2026-11-19), on the standard web-mobile build in headless Chrome,
// at phone (~591 design px wide), tablet (960) and desktop (2276):
//   - ARENAS: reaching round 4 (and 8, 12, 16) shows "NEW ARENA..." with the arena name, cross-fades
//     the background and wipes the new track skin from the back wall to the front; the round-up pause
//     is stretched to fit it; the track size (it drives the walls) never changes; round 26 wraps to arena 1;
//   - ROUND PICKER: after a game got past round 1, the MainMenu shows ◀ ROUND N ▶ above PLAY (1 … highest
//     round reached, default the highest); PLAY starts a fresh game from that round (round label, merges
//     at the round threshold, arena of that round); hidden on a first visit;
//   - POWERUPS button uses its own icon.
// Screenshots in %TEMP%/fw-arena-shots.
//
//   npm run build && npm run test:arenas
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'build', 'web-mobile');
const SHOTS = path.join(os.tmpdir(), 'fw-arena-shots');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8147, DEBUG_PORT = 9361;
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const file = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-arena-chrome-'));
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
const waitFor = async (pred, ms = 15000, step = 100) => { for (let t = 0; t < ms; t += step) { try { if (await pred()) return true; } catch { /* reloading */ } await sleep(step); } try { return !!(await pred()); } catch { return false; } };
const GM = `cc.director.getScene().getComponentInChildren('GameManager')`;
const AM = `cc.director.getScene().getComponentInChildren('ArenaManager')`;
const MM = `cc.director.getScene().getComponentInChildren('MainMenu')`;
const sceneIs = name => evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === '${name}'`);
const waitGame = () => waitFor(() => evaluate(`typeof cc !== 'undefined' && cc.director.getScene()?.name === 'Game' && !!${GM} && ${GM}._gameStartedAt > 0 && ${GM}.state === 1`), 60000, 250);
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); };
const store = (k, v) => `(window.__fwStore ? (window.__fwStore['${k}'] = ${JSON.stringify(v)}) : localStorage.setItem('${k}', ${JSON.stringify(v)}), true)`;
const VIEWPORTS = [
    { name: 'phone', width: 390, height: 844, mobile: true },
    { name: 'tablet', width: 768, height: 1024, mobile: true },
    { name: 'desktop', width: 1600, height: 900, mobile: false },
];
const frameName = sp => `(${sp} && ${sp}.spriteFrame ? ${sp}.spriteFrame._uuid : null)`;

const RB = w => `${w}.node.getComponent('cc.RigidBody2D')`;
const IC = `cc.director.getScene().getComponentInChildren('InputController')`;
// A real launch from the launcher towards physics (tx, ty) at power t (0…1); samples the shot's top speed.
const fire = (tx, ty, t) => evaluate(`(() => { const ic = ${IC}, w = ic.warrior; if (!w) return null; const p = w.node.position;
    const d = new cc.Vec2(${tx} - p.x, ${ty} - p.y).normalize(); ic.warrior = null; w.applyImpulse(d.multiplyScalar(${t} * ic.maxImpulse())); ic.onLaunch(w, ${t});
    window.__shot = w; window.__vmax = 0; clearInterval(window.__vt);
    window.__vt = setInterval(() => { if (w.node && w.node.isValid) { window.__vmax = Math.max(window.__vmax, w.velocity.length()); if (w.frozen) window.__froze = true; if (!window.__splash) window.__splash = ${GM}.warriorsLayer.children.some(c => c.name === 'Splash'); } }, 16); window.__splash = false; window.__froze = false; return true; })()`);
// Zap the warriors on the way from the launcher to physics (tx, ty), so the shot gets there.
const clearPath = (tx, ty) => evaluate(`(() => { const gm = ${GM}, l = ${IC}.warrior; if (!l) return 0; const a = l.node.position; let n = 0;
    for (const w of [...gm.warriors]) { if (w === l || w === window.__iced || !w.node || !w.node.isValid || !w.crossedLine) continue; const q = w.node.position;
        const dx = ${tx} - a.x, dy = ${ty} - a.y, k = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
        if (Math.hypot(a.x + dx * k - q.x, a.y + dy * k - q.y) < w.radius + l.radius * 1.6) { gm._zappWarrior(w); n++; } }
    return n; })()`);
const launcherReady = () => waitFor(() => evaluate(`!!${IC}.warrior && ${GM}.state === 1`), 12000);
// FROZEN LAKE: the shot that runs over a patch is shut in ice (no merges) until a hard hit breaks it.
async function iceFreezeCheck(p, z) {
    const H = `${GM}.arenaHazards.hazards[0]`;
    check(`${p}: launcher ready`, await launcherReady(), await evaluate(`[${GM}.state, !!${IC}.warrior]`));
    await clearPath(z.x, z.y);
    await sleep(400);
    check(`${p}: launch towards the ice patch`, await fire(z.x, z.y, 0.8));
    const frozen = await waitFor(() => evaluate(`!!window.__froze`), 4000, 30);
    await sleep(200);
    const f = await evaluate(`(() => { const w = __shot; if (!w.node || !w.node.isValid) return { gone: true, froze: __froze, vmax: __vmax }; const twin = Object.assign(Object.create(Object.getPrototypeOf(w)), { type: w.type, level: w.level, merging: false });
        return { frozen: w.frozen, n: ${H}.frozenCount, shell: !!w.viewNode.getChildByName('IceShell'), merge: w.canMergeWith(twin), vmax: __vmax }; })()`);
    check(`${p}: the shot running over the ice patch freezes (ice block, no merges)`, frozen && f.n === 1 && f.shell && f.merge === false, f);
    check(`${p}: sliding over the ice kicks up a spray`, await evaluate(`window.__splash === true`));
    if (!f.frozen) return;
    await sleep(500);
    await shot(`${p}-7-hazard-ice-frozen`);
    await evaluate(`(() => { window.__iced = __shot; window.__hits = []; clearInterval(window.__ht); window.__ht = setInterval(() => { if (__iced.node && __iced.node.isValid) __hits.push(+__iced.velocity.length().toFixed(1)); if (__hits.length > 400) __hits.shift(); }, 16); return true; })()`);
    check(`${p}: still frozen once it stopped (after the patch too)`, await waitFor(() => evaluate(`__iced.velocity.length() < 0.4`), 8000) && await evaluate(`__iced.frozen === true`));
    // another warrior thrown at it: slowly, then hard (a real contact in the physics world)
    // (first parked a bit away, so that the throw starts a fresh contact)
    const place = (gap, speed) => `(() => { const t = __iced, o = __ram, q = t.node.position; o.node.setPosition(q.x, q.y - (t.radius + o.radius + ${gap}), 0); o.velocity = new cc.Vec2(0, ${speed}); return true; })()`;
    const ram = async speed => {
        const ok = await evaluate(`(() => { const gm = ${GM}, t = __iced;
            const pick = () => gm.warriors.find(w => w !== t && w.crossedLine && !w.frozen && !w.merging && w.node && w.node.isValid);
            if (!pick()) gm.warriors.push(...gm.spawnMgr.prefill());
            window.__ram = pick(); return !!__ram; })()`);
        if (!ok) return false;
        await evaluate(place(80, 0)); await sleep(150);
        return evaluate(place(speed > 10 ? 60 : 6, speed));   // hard: a few frames of run-up, like a real shot
    };
    check(`${p}: a warrior to throw at the frozen one`, await ram(3));
    await sleep(700);
    check(`${p}: a soft touch does not break the ice`, await evaluate(`__iced.frozen === true`), await evaluate(`Math.max(...__hits.slice(-50))`));
    await ram(45);
    const broke = await waitFor(() => evaluate(`!__iced.frozen`), 2000, 20);
    await sleep(100);
    await shot(`${p}-7-hazard-ice-shatter`);
    const r = await evaluate(`({ hits: __hits.slice(-12), n: ${H}.frozenCount, shell: !!(__iced.viewNode && __iced.viewNode.isValid && __iced.viewNode.getChildByName('IceShell')), valid: __iced.node.isValid })`);
    check(`${p}: a hard hit by another warrior breaks the ice`, broke && r.valid && r.n === 0 && !r.shell, r);
    check(`${p}: the ice bursts into small chunks`, await evaluate(`(() => { let n = 0; const walk = x => { if (x.name === 'IceChunk') n++; x.children.forEach(walk); }; walk(${GM}.warriorsLayer); return n >= 6; })()`));
    // two frozen warriors crashing hard: both come out of the ice
    const pair = await evaluate(`(() => { const gm = ${GM}, h = gm.arenaHazards.hazards[0];
        const ws = gm.warriors.filter(w => w.crossedLine && !w.merging && w.node && w.node.isValid).slice(0, 2); if (ws.length < 2) gm.warriors.push(...gm.spawnMgr.prefill());
        const [a, b] = gm.warriors.filter(w => w.crossedLine && !w.merging && w.node && w.node.isValid); if (!a || !b) return null;
        h.freeze(a); h.freeze(b); window.__pa = a; window.__pb = b; const q = a.node.position;
        b.node.setPosition(q.x, q.y - (a.radius + b.radius + 80), 0); return true; })()`);
    await sleep(600);
    await evaluate(`(() => { const a = __pa, b = __pb, q = a.node.position; b.node.setPosition(q.x, q.y - (a.radius + b.radius + 10), 0); b.velocity = new cc.Vec2(0, 35); return true; })()`);
    const both = await waitFor(() => evaluate(`!__pa.frozen && !__pb.frozen`), 2000, 20);
    check(`${p}: two frozen warriors crashing hard both thaw`, pair && both, await evaluate(`[__pa.frozen, __pb.frozen]`));
    // still frozen at the arena change → thawed by it (checked in the swamp)
    await evaluate(`(() => { ${GM}.arenaHazards.hazards[0].freeze(__pa); return true; })()`);
    await evaluate(`clearInterval(window.__vt), clearInterval(window.__ht), true`);
}
// Arena difficulties: each arena's hazard does its job (phone only).
async function hazardCheck(p, idx) {
    const H = `${GM}.arenaHazards`;
    const need = [0, 4, 1, 2, 4][idx];
    const ready = await waitFor(() => evaluate(`(() => { const h = ${H}; return !!h && h.arena === ${idx} && h.hazards.length > 0 && h._frames.size >= ${need}; })()`), 10000);
    check(`${p}: arena ${idx} difficulty active, art loaded`, ready, await evaluate(`(() => { const h = ${H}; return h && [h.arena, h.hazards.length, h._frames.size]; })()`));
    // a settled warrior to stand in the zones
    const pick = `((gm => { const ok = w => w.node && w.node.isValid && w.crossedLine && !w.merging && !w.frozen; if (!gm.warriors.some(ok)) gm.warriors.push(...gm.spawnMgr.prefill()); return gm.warriors.find(ok); })(${GM}))`;
    const standOn = async (x, y) => {
        await evaluate(`(() => { const o = window.__hw; const w = o && o.node && o.node.isValid && !o.frozen && !o.merging ? o : ${pick}; if (!w) return false; if (w !== o) w.settle(); w.node.setPosition(${x}, ${y}, 0); window.__hw = w; return true; })()`);
        await sleep(250);
        return evaluate(`(() => { const w = window.__hw; const rb = ${RB('w')}; return { damping: rb.linearDamping, settled: w.settled }; })()`);
    };
    const base = await evaluate(`(() => { window.__hw = null; const W = ${pick}; return W ? W.constructor.settledDamping : 0; })()`);
    if (idx === 1) {
        const n = await evaluate(`${H}.spawnNow()`);
        await sleep(700);
        const z = await evaluate(`(() => { const d = ${H}.hazards[0]._patches[0]?.decal; return d ? { x: d.x, y: d.y, op: d.opacity.opacity } : null; })()`);
        check(`${p}: ice patch appears`, n === 1 && !!z && z.op > 150, z);
        if (z) { const d = await standOn(z.x, z.y); check(`${p}: on the ice a warrior slides more (lower damping)`, d.damping < base * 0.5, { ...d, base }); }
        if (z && !process.env.NO_ICE) await iceFreezeCheck(p, z);
        await shot(`${p}-7-hazard-ice`);
    } else if (idx === 2) {
        const lane = await waitFor(() => evaluate(`${H}.hazards[0].count === 1 && ${H}.hazards[0]._lane.opacity.opacity > 150`), 4000);
        check(`${p}: mud lane down the middle`, lane);
        const z = await evaluate(`(() => { const l = ${H}.hazards[0]._lane; return { x: l.x, y: l.y, hw: ${H}.hazards[0]._halfW }; })()`);
        const d = await standOn(z.x, z.y);
        check(`${p}: in the mud a warrior brakes hard (higher damping)`, d.damping > base * 3, { ...d, base });
        await evaluate(`(() => { window.__hw.velocity = new cc.Vec2(0, 14); window.__msplash = false; clearInterval(window.__mt); window.__mt = setInterval(() => { if (${GM}.warriorsLayer.children.some(c => c.name === 'Splash')) window.__msplash = true; }, 16); return true; })()`);
        check(`${p}: running through the mud kicks up splashes`, await waitFor(() => evaluate(`window.__msplash === true`), 1500, 30));
        await evaluate(`clearInterval(window.__mt), true`);
        await sleep(500);
        const s = await standOn(z.x + z.hw * 2.2, z.y);
        check(`${p}: on the side of the track no mud`, Math.abs(s.damping - base) < 0.01, { ...s, base });
        await shot(`${p}-7-hazard-mud`);
    } else if (idx === 3) {
        await evaluate(`${H}.spawnNow()`);
        await sleep(500);
        const sk = await evaluate(`(() => { const s = ${H}.hazards[0]._skulls[0]; return s ? { solid: s.obstacle.solid, col: !!s.obstacle.body.getComponent('cc.CircleCollider2D'), scale: s.obstacle.mapper.animScale } : null; })()`);
        check(`${p}: a skull pops out of the floor, solid`, !!sk && sk.solid && sk.col && sk.scale > 0.9, sk);
        await shot(`${p}-7-hazard-skull`);
        check(`${p}: the skull sinks back after a few seconds`, await waitFor(() => evaluate(`${H}.hazards[0].count === 0`), 9000));
    } else if (idx === 4) {
        // (a rock needs a free spot: retried, the board may be crowded)
        await evaluate(`(() => { const [c, r] = ${H}.hazards; c.spawnNow(); for (let i = 0; i < 8 && !r.spawnNow(); i++); if (!r.count) { const gm = ${GM}; for (const w of [...gm.warriors]) if (w.crossedLine && w.node && w.node.isValid) gm._zappWarrior(w); } return true; })()`);
        await sleep(1000);
        await evaluate(`(() => { const r = ${H}.hazards[1]; for (let i = 0; i < 8 && !r.count && !r.spawnNow(); i++); return true; })()`);
        await sleep(1000);
        const v = await evaluate(`(() => { const [c, r] = ${H}.hazards; const k = r._rocks[0]; window.__rock = k; return { cracks: c.count, rock: !!k, landed: !!k && k.landed, solid: !!k && k.obstacle.solid, dbg: k ? null : { line: r.ctx.lineY(), top: r.ctx.topY(), wl: r.ctx.wallX(r.ctx.lineY()), wt: r.ctx.wallX(r.ctx.topY()), orad: r.ctx.obstacleRadius(), sx: r.ctx.box2dLayer.worldScale.x, sc: r.ctx.box2dLayer.scale.y, n: r.ctx.warriors().filter(w => w.node && w.node.isValid).length } }; })()`);
        check(`${p}: a glowing crack opens and a lava rock lands (solid)`, v.cracks === 1 && v.rock && v.landed && v.solid, v);
        await shot(`${p}-7-hazard-lava`);
        check(`${p}: the lava rock shatters after a few seconds`, await waitFor(() => evaluate(`!!window.__rock && window.__rock.broken`), 10000));
    }
}

try {
    await send('Runtime.enable'); await send('Page.enable');
    for (const vp of VIEWPORTS) {
        const p = vp.name;
        await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
        // fresh storage: first visit lands in the game
        await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
        await waitFor(() => evaluate(`typeof localStorage !== 'undefined'`), 10000);
        await evaluate(`localStorage.clear(), true`);
        await send('Page.reload', { ignoreCache: true });
        check(`${p}: game loaded (first visit)`, await waitGame());
        check(`${p}: starts at round 1 in the castle arena`, await evaluate(`${GM}.currentRound === 1 && ${AM}.shownIndex === 0`));
        if (p === 'phone' || p === 'desktop') {
            // NEXT preview: left wall by default, right wall for left-handed players (Settings)
            const side = () => evaluate(`(() => { const n = ${GM}.nextPreviewNode, t = ${GM}.track.node; return n.worldPosition.x - t.worldPosition.x; })()`);
            const right0 = await side();
            await evaluate(`(() => { cc.director.getScene().getComponentInChildren('Settings')._toggleLeftHanded(); return true; })()`);
            await sleep(300);
            const right1 = await side();
            await shot(`${p}-0-next-left-handed`);
            await evaluate(`(() => { cc.director.getScene().getComponentInChildren('Settings')._toggleLeftHanded(); return true; })()`);
            await sleep(200);
            check(`${p}: NEXT on the left wall, on the right wall when left-handed, back again`, right0 < -100 && Math.abs(right1 + right0) < 6 && Math.abs((await side()) - right0) < 1, { right0, right1 });
        }
        const base = await evaluate(`(() => { const am = ${AM}; const ut = am.trackSprite.node.getComponent('cc.UITransform');
            return { bg: ${frameName('am.background')}, track: ${frameName('am.trackSprite')}, w: ut.width, h: ut.height }; })()`);

        // ---- arena change at round 4: from round 3, one advance
        await evaluate(`(() => { const gm = ${GM}; gm.timerRemaining = 999; gm.setDebugRound(3); gm.setTotalMerges(gm._roundThreshold(2)); return true; })()`);
        await sleep(600);
        // two mergeable warriors touching when the round-up starts merge right away, not after the banner
        const pairOk = await evaluate(`(() => { const gm = ${GM}; const ok = w => w.node && w.node.isValid && w.crossedLine && !w.merging;
            if (gm.warriors.filter(ok).length < 2) gm.warriors.push(...gm.spawnMgr.prefill());
            const [a, b] = gm.warriors.filter(ok); if (!a || !b) return false;
            b.type = a.type; b.level = a.level; const q = a.node.position; b.node.setPosition(q.x + a.radius + b.radius, q.y, 0);
            window.__mp = [a, b]; return true; })()`);
        await sleep(30);
        await evaluate(`(() => { const am = ${AM}, gm = ${GM}; window.__ar = { fade: 0, wipe: 0, paused: 0 }; __ar.t = setInterval(() => { __ar.fade = Math.max(__ar.fade, am.backgroundNext.node.getComponent('cc.UIOpacity').opacity); if (am.trackWipe.active) __ar.wipe = Math.max(__ar.wipe, am.trackWipe.getComponent('cc.UITransform').height); if (gm.roundUpPause) __ar.paused = Date.now(); }, 16); __ar.t0 = Date.now(); gm.advanceRound(); return true; })()`);
        check(`${p}: round 4 reached`, await evaluate(`${GM}.currentRound === 4`));
        await sleep(400);
        check(`${p}: a touching pair merges as the round-up starts (not after the banner)`, pairOk && await evaluate(`__mp.every(w => !w.node || !w.node.isValid)`) && await evaluate(`${GM}.roundUpPause`));
        check(`${p}: "NEW ARENA..." banner with the arena name`, await waitFor(() => evaluate(`(() => { const am = ${AM}; return am.banner.active && am.bannerTitle.string === 'NEW ARENA...' && am.bannerName.string === 'FROZEN LAKE'; })()`), 2000, 50),
            await evaluate(`(() => { const am = ${AM}; return [am.banner.active, am.bannerName.string]; })()`));
        const mult = await evaluate(`(() => { const am = ${AM}, gm = ${GM}; return { bonus: am.bannerBonus.node.activeInHierarchy && am.bannerBonus.string, hud: gm.scoreMultiplierLabel.node.active && gm.scoreMultiplierLabel.string, pts: gm._pts(100) }; })()`);
        check(`${p}: arena score multiplier x1.125 on the banner, under the score and in the points`, mult.bonus === 'ALL POINTS ×1.125' && mult.hud === '×1.125' && mult.pts === 113, mult);
        await sleep(1000);
        await shot(`${p}-1-arena-banner`);
        check(`${p}: background cross-fading`, await waitFor(() => evaluate(`__ar.fade > 20`), 4000, 40), await evaluate(`__ar.fade`));
        check(`${p}: track wipe running (mask growing from the back wall)`, await waitFor(() => evaluate(`__ar.wipe > 10`), 4000, 40), await evaluate(`__ar.wipe`));
        await sleep(250);
        await shot(`${p}-2-arena-wipe`);
        check(`${p}: physics frozen during the change`, await evaluate(`__ar.paused > 0`));
        await sleep(2200);
        await waitFor(() => evaluate(`!${GM}.roundUpPause`), 15000); const pauseMs = await evaluate(`(clearInterval(__ar.t), __ar.paused - __ar.t0)`);
        check(`${p}: round-up pause stretched for the arena (> 2.6 s, normal 2.3 s)`, pauseMs > 2600, pauseMs);
        const after = await evaluate(`(() => { const am = ${AM}; const ut = am.trackSprite.node.getComponent('cc.UITransform');
            return { idx: am.shownIndex, bg: ${frameName('am.background')}, track: ${frameName('am.trackSprite')}, w: ut.width, h: ut.height, wipe: am.trackWipe.active, banner: am.banner.active,
                     nextOp: am.backgroundNext.node.getComponent('cc.UIOpacity').opacity }; })()`);
        check(`${p}: ice background and ice track on screen`, after.idx === 1 && !!after.bg && after.bg !== base.bg && !!after.track && after.track !== base.track, { base, after });
        check(`${p}: track size unchanged (walls untouched)`, Math.abs(after.w - base.w) < 0.01 && Math.abs(after.h - base.h) < 0.01, { base, after });
        check(`${p}: transition layers cleaned up`, !after.wipe && !after.banner && after.nextOp === 0, after);
        await shot(`${p}-3-ice-arena`);
        if (p === 'phone') await hazardCheck(p, 1);

        if (p === 'phone') {
            // the other arenas, and the wrap-around after the 5th
            for (const [round, name, idx] of [[8, 'MISTY SWAMP', 2], [12, 'CASTLE DUNGEONS', 3], [16, 'VOLCANO FORGE', 4], [20, 'CASTLE SQUARE', 0]]) {
                await evaluate(`(() => { const gm = ${GM}; gm.timerRemaining = 999; gm.setDebugRound(${round - 1}); gm.setTotalMerges(gm._roundThreshold(${round - 2})); return true; })()`);
                await waitFor(() => evaluate(`!${AM}.busy`), 4000);
                await sleep(400);
                await evaluate(`${GM}.advanceRound(), true`);
                const seen = await waitFor(() => evaluate(`${AM}.bannerName.string === '${name}'`), 2500, 50);
                await sleep(2100);
                await shot(`${p}-4-arena-${idx}-r${round}`);
                await waitFor(() => evaluate(`!${GM}.roundUpPause`), 15000);
                if (round === 8) check(`${p}: the arena change thaws every frozen warrior`, await evaluate(`!!window.__pa && !__pa.frozen && !(__pa.viewNode && __pa.viewNode.isValid && __pa.viewNode.getChildByName('IceShell'))`));
                check(`${p}: round ${round} → ${name}`, seen && await evaluate(`${AM}.shownIndex === ${idx}`), await evaluate(`[${AM}.bannerName.string, ${AM}.shownIndex]`));
                if (idx > 0) await hazardCheck(p, idx);
            }
        }
        check(`${p}: highest round recorded`, Number(await evaluate(`window.__fwStore ? window.__fwStore.fw_max_round : localStorage.getItem('fw_max_round')`)) >= 4);

        // ---- round picker in the MainMenu: max round 7, default the highest, step down to 6, PLAY
        await evaluate(`(() => { ${GM}._clearSnapshot(); return true; })()`);
        await evaluate(`${store('fw_max_round', '7')} && ${store('fw_played_once', '1')} && ${store('fw_menu_on_boot', '1')} && ${store('fw_pu_seen_aura', '1')}`);
        await evaluate(`(() => { const s = window.__fwStore; if (s) delete s.fw_start_round; else localStorage.removeItem('fw_start_round'); return true; })()`);
        await send('Page.reload', { ignoreCache: true });
        check(`${p}: menu loaded`, await waitFor(() => sceneIs('MainMenu').then(ok => ok && evaluate(`!!${MM} && !!${MM}.startRoundRoot`)), 60000, 250));
        await sleep(800);
        const picker = await evaluate(`(() => { const mm = ${MM}; return { on: mm.startRoundRoot.activeInHierarchy, label: mm.startRoundLabel.string,
            next: mm.startRoundNext.getComponent('cc.Button').interactable, prev: mm.startRoundPrev.getComponent('cc.Button').interactable }; })()`);
        check(`${p}: round picker shown at the highest round (7), ▶ disabled`, picker.on && picker.label === 'ROUND 7' && !picker.next && picker.prev, picker);
        const icon = await evaluate(`(() => { const n = cc.find('Canvas/UILayer/Center/Powerups/Icon'); return n && n.getComponent('cc.Sprite').spriteFrame ? n.getComponent('cc.Sprite').spriteFrame.name : null; })()`);
        check(`${p}: POWERUPS button has its own icon`, icon === 'icon-powerups', icon);
        await shot(`${p}-5-menu-picker`);
        await evaluate(`${MM}._stepRound(-1), true`);
        check(`${p}: ◀ steps to ROUND 6`, await evaluate(`${MM}.startRoundLabel.string === 'ROUND 6'`));
        await evaluate(`${MM}.onPlay(), true`);
        check(`${p}: game started from round 6`, await waitGame() && await evaluate(`${GM}.currentRound === 6 && ${GM}._startRound === 6`));
        const g6 = await evaluate(`(() => { const gm = ${GM}; return { label: gm.roundLabel && gm.roundLabel.string, merges: gm.totalMerges, need: gm._roundThreshold(5), warriors: gm.warriors.length }; })()`);
        check(`${p}: round label 6, merges at the round-6 threshold, board prefilled`, g6.label === '6' && g6.merges === g6.need && g6.warriors > 0, g6);
        check(`${p}: start round 6 opens with the arena change (frozen, "NEW ARENA..." FROZEN LAKE)`, await waitFor(() => evaluate(`${GM}.roundUpPause && ${AM}.banner.active && ${AM}.bannerName.string === 'FROZEN LAKE'`), 5000, 50));
        await sleep(1300);
        await shot(`${p}-6-start-arena-intro`);
        check(`${p}: then the game goes on (pause over, ice difficulty on)`, await waitFor(() => evaluate(`!${GM}.roundUpPause && ${GM}.arenaHazards.arena === 1 && ${GM}.arenaHazards.hazards.length === 1`), 8000));
        check(`${p}: start round 6 plays in the ice arena`, await waitFor(() => evaluate(`${AM}.shownIndex === 1 && ${AM}.background.spriteFrame.name === 'background'`), 6000));
        await sleep(600);
        await shot(`${p}-6-start-round-6`);
        check(`${p}: choice remembered`, (await evaluate(`window.__fwStore ? window.__fwStore.fw_start_round : localStorage.getItem('fw_start_round')`)) === '6');
    }
    const errs = logs.filter(l => /EXCEPTION|error/i.test(l) && !/favicon/i.test(l));
    check('no exceptions / errors in the console', errs.length === 0, errs.slice(0, 6));
} catch (e) {
    console.log('FAIL exception:', e.message); failures++;
} finally {
    console.log(`\nscreenshots: ${SHOTS}`);
    console.log(failures ? `${failures} FAILED` : 'ALL OK');
    try { ws.close(); } catch { /* closed */ }
    chrome.kill(); server.close();
    process.exit(failures ? 1 : 0);
}
