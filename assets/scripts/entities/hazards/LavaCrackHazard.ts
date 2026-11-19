import { Color, tween } from 'cc';
import { ArenaHazard, FloorDecal, HazardContext, burst, fitDecalSpot, rand, MOVING_SPEED } from './HazardKit';
import { Warrior } from '../Warrior';
import { SFX } from '../../managers/AudioManager';

const FIRST_SEC = 3, EVERY_MIN = 7, EVERY_MAX = 10, LIFE_MIN = 6, LIFE_MAX = 8, MAX_AT_ONCE = 2;
/** Damping on a glowing crack, for moving warriors: ×4 → a shot that crosses it slows down. */
const CRACK_DAMPING = 4;
const EMBER = new Color(255, 170, 60, 255);

/**
 * VOLCANO FORGE (1/2): cracks open in the floor now and then and glow; a launched warrior that runs
 * over one slows down. They cool off and close after a few seconds.
 */
export class LavaCrackHazard extends ArenaHazard {
    private _cracks: { decal: FloorDecal; left: number }[] = [];
    private _next = FIRST_SEC;

    constructor(ctx: HazardContext) { super(ctx); }

    get count(): number { return this._cracks.length; }

    tick(dt: number): void {
        for (const c of this._cracks) {
            c.left -= dt;
            if (c.left <= 0) c.decal.fadeOut(1.0);
        }
        this._cracks = this._cracks.filter(c => c.left > 0 && c.decal.alive);
        this._next -= dt;
        if (this._next <= 0) {
            this._next = rand(EVERY_MIN, EVERY_MAX);
            if (this._cracks.length < MAX_AT_ONCE) this.spawnNow();
        }
    }

    spawnNow(): boolean {
        const [l, r] = this.ctx.wallX(this.ctx.lineY());
        const taken = this._cracks.map(c => ({ x: c.decal.x, y: c.decal.y, r: c.decal.rx }));
        // the whole crack on the track: a shorter one if a long one does not fit
        const spot = fitDecalSpot(this.ctx, (r - l) * this.ctx.box2dLayer.worldScale.x * rand(0.38, 0.5), 0.5, taken, 0.08, 0.7);
        if (!spot) return false;
        const decal = new FloorDecal(this.ctx, 'LavaCrack', this.ctx.frame('lava-crack'), spot.x, spot.y, spot.w, spot.h);
        decal.mapper.animScale = 0.4;
        tween(decal.mapper).to(0.45, { animScale: 1 }, { easing: 'quadOut' }).start();
        decal.fadeIn(0.35);
        // glow pulse
        tween(decal.sprite).repeatForever(tween(decal.sprite).to(0.6, { color: new Color(255, 200, 150, 255) }).to(0.6, { color: new Color(255, 255, 255, 255) })).start();
        this.ctx.shake(3, 0.2);
        this.ctx.sfx(SFX.IMPLODE, 0.3);
        setTimeout(() => { if (decal.alive) burst(this.ctx, this.ctx.frame('lava-shard'), decal.view.worldPosition, 6, 12, EMBER, 50, true); }, 100);
        this._cracks.push({ decal, left: rand(LIFE_MIN, LIFE_MAX) });
        return true;
    }

    dampingFactor(x: number, y: number, w: Warrior): number {
        if (w.velocity.length() < MOVING_SPEED) return 1;
        for (const c of this._cracks) if (c.decal.alive && c.decal.opacity.opacity > 80 && c.decal.contains(x, y, w.radius * 0.3)) return CRACK_DAMPING;
        return 1;
    }

    clear(): void {
        for (const c of this._cracks) c.decal.fadeOut(0.4);
        this._cracks = [];
        this._next = FIRST_SEC;
    }
}
