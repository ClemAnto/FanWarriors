import { Color } from 'cc';
import { ArenaHazard, FloorDecal, HazardContext, screenScale, MOVING_SPEED } from './HazardKit';
import { Warrior } from '../Warrior';
import { SplashEffect } from './SplashEffect';

const MUD_DROPS = [new Color(96, 66, 38, 255), new Color(120, 86, 50, 255), new Color(78, 54, 32, 255)];

/** Lane width as a fraction of the inner track width at the game-over line. */
const LANE_WIDTH = 0.32;
/** Damping in the mud: ×5 → whoever lands in it stops early. */
const MUD_DAMPING = 5;
/** The mud art has wavy, transparent edges: drawn this much wider than the braking zone. */
const ART_MARGIN = 1.35;

/**
 * MISTY SWAMP: the middle of the track, from the game-over line to the back wall, is deep mud for the
 * whole arena: a warrior in it brakes hard and stops early, so shots along the sides go further.
 * Whoever runs through it kicks up mud (SplashEffect).
 */
export class MudLaneHazard extends ArenaHazard {
    private _lane: FloorDecal | null = null;
    private _halfW = 0;
    private _builtLo = 0;

    private readonly _splash: SplashEffect;

    constructor(ctx: HazardContext) {
        super(ctx);
        this._splash = new SplashEffect(ctx, () => ctx.frame('aura'), MUD_DROPS, 0.26);
    }

    get count(): number { return this._lane?.alive ? 1 : 0; }

    tick(dt: number): void {
        this._splash.advance(dt);
        for (const w of this.ctx.warriors()) {
            if (!w?.node?.isValid || w.merging) continue;
            const v = w.velocity.length(), p = w.node.position;
            if (v >= MOVING_SPEED * 2 && this.dampingFactor(p.x, p.y, w) !== 1) this._splash.splash(w, v);
        }
        // the game-over line steps down at some round-ups: follow it
        if (this._lane?.alive && Math.abs(this.ctx.lineY() - this._builtLo) > 4) { this._lane.fadeOut(0.6); this._lane = null; }
        if (!this._lane?.alive) this.spawnNow();
    }

    spawnNow(): boolean {
        if (this._lane?.alive) return false;
        const lo = this.ctx.lineY(), hi = this.ctx.topY();
        this._builtLo = lo;
        const [l, r] = this.ctx.wallX(lo);
        const s = screenScale(this.ctx);
        this._halfW = (r - l) * LANE_WIDTH / 2;
        const cx = (l + r) / 2, cy = (lo + hi) / 2;
        const screenW = this._halfW * 2 * s.x * ART_MARGIN;
        const screenH = (hi - lo) * s.y;   // from the line to the back wall, never over it
        this._lane = new FloorDecal(this.ctx, 'MudLane', this.ctx.frame('mud-pool'), cx, cy, screenW, screenH);
        this._lane.fadeIn(0.8, 245);
        return true;
    }

    dampingFactor(x: number, y: number, _w: Warrior): number {
        const lane = this._lane;
        if (!lane?.alive || lane.opacity.opacity < 80) return 1;
        return Math.abs(x - lane.x) <= this._halfW && Math.abs(y - lane.y) <= lane.ry ? MUD_DAMPING : 1;
    }

    clear(): void {
        this._lane?.fadeOut(0.5);
        this._lane = null;
    }
}
