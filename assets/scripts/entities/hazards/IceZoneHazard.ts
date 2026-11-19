import { Color, tween, Tween } from 'cc';
import { ArenaHazard, FloorDecal, HazardContext, burst, freeSpot, rand } from './HazardKit';
import { Warrior } from '../Warrior';
import { SFX } from '../../managers/AudioManager';

const FIRST_SEC = 3, EVERY_MIN = 7, EVERY_MAX = 11, LIFE_MIN = 9, LIFE_MAX = 13, MAX_AT_ONCE = 2;
/** Damping on ice: ×0.22 → the warriors slide much further (and the pile gives way more easily). */
const ICE_DAMPING = 0.22;

/**
 * FROZEN LAKE: from time to time a patch of the track freezes for a while; on it every warrior
 * slides more. The patch frosts in (fade + ice chips), shimmers, then melts away.
 */
export class IceZoneHazard extends ArenaHazard {
    private _patches: { decal: FloorDecal; left: number }[] = [];
    private _next = FIRST_SEC;

    constructor(ctx: HazardContext) { super(ctx); }

    get count(): number { return this._patches.length; }

    tick(dt: number): void {
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
    }

    spawnNow(): boolean {
        const frame = this.ctx.frame('ice-patch');
        const [l, r] = this.ctx.wallX(this.ctx.lineY());
        const screenW = (r - l) * this.ctx.box2dLayer.worldScale.x * rand(0.55, 0.72);
        const screenH = screenW * 0.5;
        const spot = freeSpot(this.ctx, 0, this._patches.map(p => ({ x: p.decal.x, y: p.decal.y, r: p.decal.rx })), 0.1, 0.8);
        if (!spot) return false;
        const decal = new FloorDecal(this.ctx, 'IcePatch', frame, spot.x, spot.y, screenW, screenH);
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

    dampingFactor(x: number, y: number, w: Warrior): number {
        for (const p of this._patches) if (p.decal.alive && p.decal.opacity.opacity > 80 && p.decal.contains(x, y, w.radius * 0.3)) return ICE_DAMPING;
        return 1;
    }

    clear(): void {
        for (const p of this._patches) { Tween.stopAllByTarget(p.decal.sprite); p.decal.fadeOut(0.4); }
        this._patches = [];
        this._next = FIRST_SEC;
    }
}
