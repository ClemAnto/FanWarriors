import { Color, tween, Tween } from 'cc';
import { ArenaHazard, FloorDecal, HazardContext, Obstacle, burst, decalHalf, freeSpot, rand } from './HazardKit';
import { SFX } from '../../managers/AudioManager';

const FIRST_SEC = 4, EVERY_MIN = 7, EVERY_MAX = 11, UP_MIN = 4, UP_MAX = 5.5, MAX_AT_ONCE = 2;
const RISE_SEC = 0.35, SINK_SEC = 0.4;
const DUST = new Color(150, 130, 110, 255);

interface Skull { obstacle: Obstacle; hole: FloorDecal; left: number; sinking: boolean }

/**
 * CASTLE DUNGEONS: now and then the skull of an old warrior pops out of the floor and bounces the
 * launched warriors off course; after a few seconds it sinks back into the ground.
 */
export class SkullHazard extends ArenaHazard {
    private _skulls: Skull[] = [];
    private _next = FIRST_SEC;

    constructor(ctx: HazardContext) { super(ctx); }

    get count(): number { return this._skulls.length; }

    tick(dt: number): void {
        for (const s of this._skulls) {
            s.left -= dt;
            if (s.left <= 0 && !s.sinking) this._sink(s);
        }
        this._skulls = this._skulls.filter(s => s.obstacle.alive);
        this._next -= dt;
        if (this._next <= 0) {
            this._next = rand(EVERY_MIN, EVERY_MAX);
            if (this._skulls.filter(s => !s.sinking).length < MAX_AT_ONCE) this.spawnNow();
        }
    }

    spawnNow(): boolean {
        const r = this.ctx.obstacleRadius();
        const sx = this.ctx.box2dLayer.worldScale.x;
        // the hole around it stays on the track too
        const spot = freeSpot(this.ctx, r, this._skulls.map(s => ({ x: s.obstacle.body.position.x, y: s.obstacle.body.position.y, r })), 0.12, 0.62, decalHalf(this.ctx, r * 3.2 * sx, r * 1.6 * sx));
        if (!spot) return false;
        const hole = new FloorDecal(this.ctx, 'SkullHole', this.ctx.frame('floor-hole'), spot.x, spot.y, r * 3.2 * sx, r * 1.6 * sx);
        hole.fadeIn(0.15);
        const view = r * 4;
        const obstacle = new Obstacle(this.ctx, 'Skull', this.ctx.frame('skull-head'), spot.x, spot.y, r, view, view);
        obstacle.mapper.animScale = 0.01;
        obstacle.mapper.bounceY = -r * 0.6;
        tween(obstacle.mapper).to(RISE_SEC, { animScale: 1, bounceY: 0 }, { easing: 'backOut' }).start();
        obstacle.solidify(0.7);
        this.ctx.sfx(SFX.LAND, 0.6);
        setTimeout(() => { if (obstacle.view.isValid) burst(this.ctx, this.ctx.frame('floor-hole'), obstacle.view.worldPosition, 6, 14, DUST, r * 1.6); }, 60);
        this._skulls.push({ obstacle, hole, left: rand(UP_MIN, UP_MAX), sinking: false });
        return true;
    }

    private _sink(s: Skull): void {
        s.sinking = true;
        s.obstacle.unsolidify();
        Tween.stopAllByTarget(s.obstacle.mapper);
        tween(s.obstacle.mapper).to(SINK_SEC, { animScale: 0.01, bounceY: -s.obstacle.radius * 0.6 }, { easing: 'backIn' })
            .call(() => { s.obstacle.destroy(); s.hole.fadeOut(0.3); }).start();
    }

    clear(): void {
        for (const s of this._skulls) { if (!s.sinking) this._sink(s); }
        this._next = FIRST_SEC;
    }
}
