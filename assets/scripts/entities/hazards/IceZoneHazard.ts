import { Color, Node, Sprite, UITransform, UIOpacity, tween, Tween, Vec3 } from 'cc';
import { ArenaHazard, FloorDecal, HazardContext, burst, fitDecalSpot, makeSprite, rand, MOVING_SPEED } from './HazardKit';
import { Warrior } from '../Warrior';
import { SFX } from '../../managers/AudioManager';
import { IceShatterEffect } from './IceShatterEffect';
import { SplashEffect } from './SplashEffect';

const FIRST_SEC = 3, EVERY_MIN = 7, EVERY_MAX = 11, LIFE_MIN = 9, LIFE_MAX = 13, MAX_AT_ONCE = 2;
/** Damping on ice: ×0.22 → the warriors slide much further (and the pile gives way more easily). */
const ICE_DAMPING = 0.22;
/** A hard hit breaks the ice (Box2D speeds). Two ways, because CC emits the contacts after the physics step,
 *  with the speeds already exchanged: a warrior that touches it was running at ≥ ICE_BREAK_SPEED on the frame
 *  before (speeds sampled every tick, before the step: works against a wall too), or the frozen warrior's own
 *  speed jumps by ≥ ICE_BREAK_KICK in a frame (knocked through a neighbour). Sliding, bouncing off a wall or a
 *  nudge never do it. */
export const ICE_BREAK_SPEED = 12;
export const ICE_BREAK_KICK = 5;
/** Right after freezing, the ice holds whatever happens (the frozen shot is still crashing into the pile). */
const FREEZE_GRACE_SEC = 0.3;
const ICE_TINT = new Color(175, 220, 255, 255);
const CHIP_TINT = new Color(235, 250, 255, 255);
const SPRAY = [new Color(255, 255, 255, 255), new Color(215, 240, 255, 255), new Color(190, 228, 255, 255)];
/** Ice block on the warrior's view (its view is a 4r square; the figure fills ~60% × 70% of it, a bit low). */
const SHELL_W = 2.9, SHELL_H = 3.4, SHELL_Y = -0.3, SHELL_ALPHA = 190;

/** `hit`: a hard hit since the last tick; `pair`: two frozen warriors crashed together hard (both thaw, no grace). */
interface Frozen { w: Warrior; shell: Node; since: number; r: number; speed: number; hit: boolean; pair: boolean }

/**
 * FROZEN LAKE: from time to time a patch of the track freezes for a while; on it every warrior
 * slides more. The patch frosts in (fade + ice chips), shimmers, then melts away.
 * The shot that runs over a patch freezes (2026-11-19): shut in a block of ice it cannot merge, and it
 * stays so (even after the patch melts) until another warrior hits it hard enough to break the ice. Two
 * frozen warriors crashing hard both thaw; a power that touches it (or its contagion) and the arena change
 * thaw it too. Every thaw bursts the block into small chunks of ice (IceShatterEffect).
 */
export class IceZoneHazard extends ArenaHazard {
    private _patches: { decal: FloorDecal; left: number }[] = [];
    private _frozen: Frozen[] = [];
    private _next = FIRST_SEC;
    private _time = 0;
    /** The shot that already came to a stop (its run is over). */
    private _spent: Warrior | null = null;
    /** The shot already frozen on this run: once out of the ice it does not freeze again while still sliding on the patch. */
    private _iced: Warrior | null = null;
    /** Speed of every warrior on the last tick (before the physics step), while someone is frozen. */
    private _speeds = new Map<Warrior, number>();

    /** Ice spray at the feet of whoever slides over a patch. */
    private readonly _spray: SplashEffect;

    constructor(ctx: HazardContext) {
        super(ctx);
        this._spray = new SplashEffect(ctx, () => ctx.frame('ice-flake'), SPRAY, 0.2, true);
    }

    get count(): number { return this._patches.length; }
    /** Warriors in the ice right now (QA / tests). */
    get frozenCount(): number { return this._frozen.length; }

    tick(dt: number): void {
        this._time += dt;
        for (const p of this._patches) {
            p.left -= dt;
            if (p.left <= 0) p.decal.fadeOut(0.9);
        }
        this._patches = this._patches.filter(p => p.left > 0 && p.decal.alive);
        this._next -= dt;
        if (this._next <= 0) {
            this._next = rand(EVERY_MIN, EVERY_MAX);
            if (this._patches.length < MAX_AT_ONCE) this.spawnNow();
        }
        // ice spray under whoever slides over a patch
        this._spray.advance(dt);
        if (this._patches.length > 0) for (const w of this.ctx.warriors()) {
            if (!w?.node?.isValid || w.merging) continue;
            const v = w.velocity.length();
            if (v >= MOVING_SPEED * 2 && this._onIce(w)) this._spray.splash(w, v);
        }
        // the shot that runs over a patch freezes
        // (only on its run: once it has stopped, a knock onto the ice does not freeze it)
        const s = this.ctx.shot();
        if (s && s === this._spent && !s.crossedLine && s.velocity.length() >= MOVING_SPEED) this._spent = this._iced = null;   // relaunched after a failed shot
        if (s && s !== this._spent) {
            if (s.velocity.length() < MOVING_SPEED) this._spent = s;
            else if (!s.frozen && s !== this._iced && this._onIce(s)) { this.freeze(s); this._iced = s; }
        }
        // gone (merged by a power, zapped): drop them; the rest follow the warrior's size; a hard hit breaks the ice
        this._frozen = this._frozen.filter(f => {
            if (!f.w.node?.isValid || !f.w.frozen || !f.shell.isValid) {
                if (f.shell.isValid) f.shell.destroy();
                else if (f.w.node?.isValid && f.w.frozen) this._release(f.w);   // block lost under a live warrior: never left unmergeable
                return false;
            }
            this._fit(f);
            return true;
        });
        for (const f of [...this._frozen]) {
            const v = f.w.velocity.length(), kick = v - f.speed;
            f.speed = v;
            if (!f.w.frozen) continue;   // thawed in this loop (pair)
            if (f.pair || ((f.hit || kick >= ICE_BREAK_KICK) && this._time - f.since >= FREEZE_GRACE_SEC)) this._thaw(f, true);
            f.hit = f.pair = false;
        }
        this._speeds.clear();
        if (this._frozen.length > 0) for (const w of this.ctx.warriors()) if (w?.node?.isValid) this._speeds.set(w, w.velocity.length());
    }

    spawnNow(): boolean {
        const frame = this.ctx.frame('ice-patch');
        const [l, r] = this.ctx.wallX(this.ctx.lineY());
        const taken = this._patches.map(p => ({ x: p.decal.x, y: p.decal.y, r: p.decal.rx }));
        // the whole patch on the track: a smaller one if a big one does not fit
        const spot = fitDecalSpot(this.ctx, (r - l) * this.ctx.box2dLayer.worldScale.x * rand(0.55, 0.72), 0.5, taken, 0.1, 0.8);
        if (!spot) return false;
        const decal = new FloorDecal(this.ctx, 'IcePatch', frame, spot.x, spot.y, spot.w, spot.h);
        decal.mapper.animScale = 0.6;
        decal.fadeIn(0.5, 235);
        tween(decal.mapper).to(0.5, { animScale: 1 }, { easing: 'backOut' }).start();
        // a soft shimmer while it lasts
        tween(decal.sprite).repeatForever(tween(decal.sprite).to(0.9, { color: new Color(215, 240, 255, 255) }).to(0.9, { color: new Color(255, 255, 255, 255) })).start();
        this.ctx.sfx(SFX.AURA_ZAP, 0.35);
        this.scheduleChips(decal);
        this._patches.push({ decal, left: rand(LIFE_MIN, LIFE_MAX) });
        return true;
    }

    private scheduleChips(decal: FloorDecal): void {
        const chip = this.ctx.frame('ice-patch');
        setTimeout(() => { if (decal.alive) burst(this.ctx, chip, decal.view.worldPosition, 7, 16, new Color(230, 248, 255, 255), 60); }, 120);
    }

    private _onIce(w: Warrior): boolean {
        const p = w.node.position;
        return this.dampingFactor(p.x, p.y, w) !== 1;
    }

    /** Shut `w` in a block of ice (public for QA). */
    freeze(w: Warrior): void {
        if (w.frozen || !w.viewNode?.isValid) return;
        const r = w.radius;
        const v = makeSprite(w.viewNode, 'IceShell', this.ctx.frame('ice-block'), r * SHELL_W, r * SHELL_H);
        v.node.setPosition(0, r * SHELL_Y, 0);
        v.opacity.opacity = 0;
        v.node.setScale(1.35, 1.35, 1);
        tween(v.opacity).to(0.18, { opacity: SHELL_ALPHA }).start();
        tween(v.node).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        const f: Frozen = { w, shell: v.node, since: this._time, r, speed: w.velocity.length(), hit: false, pair: false };
        this._frozen.push(f);
        w.frozen = true;
        // judged on the next tick (never inside the physics callback)
        w.onIceHit = by => {
            const s = this._speeds.get(by) ?? 0;
            if (by.frozen) {
                // two blocks of ice crashing: hard enough (either one fast) → both break
                if (Math.max(s, f.speed) < ICE_BREAK_SPEED) return;
                f.pair = true;
                const g = this._frozen.find(x => x.w === by);
                if (g) g.pair = true;
                return;
            }
            if (s >= ICE_BREAK_SPEED && s > f.speed) f.hit = true;
        };
        const sp = w.viewNode.getComponent(Sprite);
        if (sp) sp.color = ICE_TINT;
        this.ctx.sfx(SFX.ICE_FREEZE, 0.8);
        burst(this.ctx, this.ctx.frame('ice-flake'), w.viewNode.worldPosition, 6, 14, CHIP_TINT, 45, true);
    }

    /** Thaw `w` now if it is frozen (a power touched it). True if it was. */
    thaw(w: Warrior): boolean {
        const f = this._frozen.find(x => x.w === w);
        if (!f) return false;
        this._thaw(f, false);
        return true;
    }

    /** Free `f.w`: the block bursts into chunks of ice — bigger and louder after a hard hit (`hard`). */
    private _thaw(f: Frozen, hard: boolean): void {
        this._frozen = this._frozen.filter(x => x !== f);
        this._release(f.w);
        const shell = f.shell;
        if (!shell.isValid) return;
        Tween.stopAllByTarget(shell);
        const op = shell.getComponent(UIOpacity);
        if (op) Tween.stopAllByTarget(op);
        IceShatterEffect.play(this.ctx, shell.worldPosition.clone(), f.r, hard);
        this.ctx.sfx(SFX.ICE_SHATTER, hard ? 0.9 : 0.5);
        if (hard) this.ctx.shake(2, 0.12);
        // the block pops open and is gone
        tween(shell).to(0.09, { scale: new Vec3(1.15, 1.15, 1) }).call(() => { if (shell.isValid) shell.destroy(); }).start();
        if (op) tween(op).to(0.09, { opacity: 0 }).start();
    }

    /** `w` out of the ice: it can merge again and loses the ice tint. */
    private _release(w: Warrior): void {
        w.frozen = false;
        w.onIceHit = null;
        const sp = w.viewNode?.isValid ? w.viewNode.getComponent(Sprite) : null;
        if (sp && sp.color.equals(ICE_TINT)) sp.color = Color.WHITE.clone();
    }

    /** Keep the ice block on the warrior's current size (shrink steps, level-ups in place). */
    private _fit(f: Frozen): void {
        const r = f.w.radius;
        if (Math.abs(r - f.r) < 0.01) return;
        f.r = r;
        f.shell.getComponent(UITransform)?.setContentSize(r * SHELL_W, r * SHELL_H);
        f.shell.setPosition(0, r * SHELL_Y, 0);
    }

    dampingFactor(x: number, y: number, w: Warrior): number {
        for (const p of this._patches) if (p.decal.alive && p.decal.opacity.opacity > 80 && p.decal.contains(x, y, w.radius * 0.3)) return ICE_DAMPING;
        return 1;
    }

    clear(): void {
        for (const p of this._patches) { Tween.stopAllByTarget(p.decal.sprite); p.decal.fadeOut(0.4); }
        this._patches = [];
        for (const f of [...this._frozen]) this._thaw(f, false);
        this._spent = this._iced = null;
        this._speeds.clear();
        this._next = FIRST_SEC;
    }
}
