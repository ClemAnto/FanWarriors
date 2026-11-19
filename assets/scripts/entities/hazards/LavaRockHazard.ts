import { Color, tween, Tween } from 'cc';
import { ArenaHazard, FloorDecal, HazardContext, Obstacle, burst, decalHalf, freeSpot, rand, MOVING_SPEED } from './HazardKit';
import { SFX } from '../../managers/AudioManager';

const FIRST_SEC = 6, EVERY_MIN = 9, EVERY_MAX = 14, LIFE_MIN = 5, LIFE_MAX = 7, MAX_AT_ONCE = 2;
const FALL_SEC = 0.6;
/** Height the rock falls from, in screen px above its landing spot. */
const FALL_FROM = 900;
const EMBER = new Color(255, 160, 60, 255);

interface Rock { obstacle: Obstacle; shadow: FloorDecal; left: number; landed: boolean; broken: boolean }

/**
 * VOLCANO FORGE (2/2): now and then a lava rock falls from the sky onto the track (it shakes) and
 * bounces the launched warriors off course like an obstacle; it shatters after a few seconds or as
 * soon as a moving warrior hits it.
 */
export class LavaRockHazard extends ArenaHazard {
    private _rocks: Rock[] = [];
    private _next = FIRST_SEC;

    constructor(ctx: HazardContext) { super(ctx); }

    get count(): number { return this._rocks.length; }

    tick(dt: number): void {
        for (const k of this._rocks) {
            if (!k.landed) continue;
            k.left -= dt;
            if (k.left <= 0) this._shatter(k);
        }
        this._rocks = this._rocks.filter(k => k.obstacle.alive);
        this._next -= dt;
        if (this._next <= 0) {
            this._next = rand(EVERY_MIN, EVERY_MAX);
            if (this._rocks.length < MAX_AT_ONCE) this.spawnNow();
        }
    }

    spawnNow(): boolean {
        const r = this.ctx.obstacleRadius();
        const sx = this.ctx.box2dLayer.worldScale.x;
        // its shadow stays on the track too
        const spot = freeSpot(this.ctx, r, this._rocks.map(k => ({ x: k.obstacle.body.position.x, y: k.obstacle.body.position.y, r })), 0.15, 0.62, decalHalf(this.ctx, r * 2.8 * sx, r * 1.3 * sx));
        if (!spot) return false;
        // the shadow grows where it will land
        const shadow = new FloorDecal(this.ctx, 'RockShadow', this.ctx.frame('aura'), spot.x, spot.y, r * 2.8 * sx, r * 1.3 * sx);
        shadow.sprite.color = new Color(20, 10, 10, 255);
        shadow.mapper.animScale = 0.3;
        shadow.fadeIn(FALL_SEC, 150);
        tween(shadow.mapper).to(FALL_SEC, { animScale: 1 }, { easing: 'quadIn' }).start();

        const view = r * 4;
        const obstacle = new Obstacle(this.ctx, 'LavaRock', this.ctx.frame('lava-rock'), spot.x, spot.y, r, view, view);
        obstacle.mapper.bounceY = FALL_FROM;
        const rock: Rock = { obstacle, shadow, left: rand(LIFE_MIN, LIFE_MAX), landed: false, broken: false };
        tween(obstacle.mapper).to(FALL_SEC, { bounceY: 0 }, { easing: 'quadIn' }).call(() => this._land(rock)).start();
        obstacle.view.angle = rand(-25, 25);
        tween(obstacle.view).to(FALL_SEC, { angle: 0 }).start();
        this._rocks.push(rock);
        return true;
    }

    private _land(k: Rock): void {
        if (k.broken || !k.obstacle.alive) return;
        k.landed = true;
        k.obstacle.solidify(0.6);
        // only a warrior that runs into it (a resting neighbour touching it does not count: launched stays true after the shot)
        k.obstacle.onHit = w => { if (w.velocity.length() >= MOVING_SPEED) setTimeout(() => this._shatter(k), 50); };
        k.shadow.fadeOut(0.2);
        this.ctx.shake(9, 0.3);
        this.ctx.sfx(SFX.EXPLOSION_1, 0.7);
        burst(this.ctx, this.ctx.frame('lava-shard'), k.obstacle.view.worldPosition, 8, 14, EMBER, k.obstacle.radius * 2, true);
        // squash on impact
        tween(k.obstacle.mapper).to(0.08, { squashX: 1.18, animScale: 0.9 }).to(0.18, { squashX: 1, animScale: 1 }, { easing: 'backOut' }).start();
    }

    private _shatter(k: Rock): void {
        if (k.broken || !k.obstacle.alive) return;
        k.broken = true;
        k.obstacle.unsolidify();
        Tween.stopAllByTarget(k.obstacle.mapper);
        this.ctx.sfx(SFX.HIT, 0.8);
        burst(this.ctx, this.ctx.frame('lava-shard'), k.obstacle.view.worldPosition, 9, k.obstacle.radius * 0.9, new Color(255, 255, 255, 255), k.obstacle.radius * 2.6);
        burst(this.ctx, this.ctx.frame('lava-shard'), k.obstacle.view.worldPosition, 6, 10, EMBER, k.obstacle.radius * 2, true);
        k.obstacle.destroy();
        k.shadow.destroy();
    }

    clear(): void {
        for (const k of this._rocks) {
            if (k.landed) this._shatter(k);
            else { Tween.stopAllByTarget(k.obstacle.mapper); k.obstacle.destroy(); k.shadow.destroy(); }
        }
        this._rocks = [];
        this._next = FIRST_SEC;
    }
}
