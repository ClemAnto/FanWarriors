import { Color, SpriteFrame, Vec3, tween } from 'cc';
import { HazardContext, additive, makeSprite } from './HazardKit';
import { Warrior } from '../Warrior';

/**
 * A few drops kicked up at a warrior's feet while it runs over a wet or icy floor (2026-11-19): mud in
 * the Misty Swamp, ice spray on a Frozen Lake patch. Each drop jumps up and out, falls back and fades.
 * The hazard that owns the zone calls `tick` for each moving warrior on it: the faster the warrior,
 * the more often it splashes.
 */
export class SplashEffect {
    private _next = new Map<Warrior, number>();
    private _time = 0;

    /** `glow`: additive drops (ice glints); `sizeK`: drop size in warrior radii. */
    constructor(private readonly ctx: HazardContext, private readonly frame: () => SpriteFrame | null,
                private readonly tints: readonly Color[], private readonly sizeK = 0.2, private readonly glow = false) {}

    /** Advance the clock (once per hazard tick, before `splash`). */
    advance(dt: number): void {
        this._time += dt;
        if (this._next.size > 40) for (const [w] of this._next) if (!w.node?.isValid) this._next.delete(w);
    }

    /** `w` is running over the zone at `speed` (Box2D units): splash when its turn comes. */
    splash(w: Warrior, speed: number): void {
        if (!w.viewNode?.isValid) return;
        const due = this._next.get(w) ?? 0;
        if (this._time < due) return;
        this._next.set(w, this._time + Math.max(0.06, Math.min(0.3, 1.6 / Math.max(speed, 0.1))));
        this.play(w, Math.min(1, 0.35 + speed / 25));
    }

    /** One splash at `w`'s feet; `k` 0…1 = how strong. */
    play(w: Warrior, k: number): void {
        const frame = this.frame();
        if (!frame) return;
        const view = w.viewNode, r = w.radius;
        const sc = Math.abs(view.worldScale.y) || 1;
        const feet = new Vec3(view.worldPosition.x, view.worldPosition.y - r * Warrior.viewYOffset * sc, 0);
        const n = 2 + Math.round(3 * k);
        for (let i = 0; i < n; i++) {
            const size = r * this.sizeK * (0.6 + Math.random() * 0.8);
            const d = makeSprite(this.ctx.warriorsLayer, 'Splash', frame, size, size);
            d.sprite.color = this.tints[Math.floor(Math.random() * this.tints.length)];
            if (this.glow) additive(d.sprite);
            const from = new Vec3(feet.x + (Math.random() - 0.5) * r * 1.2 * sc, feet.y + (Math.random() - 0.5) * r * 0.3 * sc, 0);
            d.node.setWorldPosition(from);
            d.node.angle = Math.random() * 360;
            const side = Math.random() < 0.5 ? -1 : 1;
            const dx = side * r * (0.4 + Math.random() * 0.9) * sc * (0.6 + k * 0.6);
            const hop = r * (0.5 + Math.random() * 0.7) * sc * (0.6 + k * 0.6);
            const up = 0.13 + Math.random() * 0.06, down = 0.15 + Math.random() * 0.08;
            tween(d.node)
                .to(up, { worldPosition: new Vec3(from.x + dx * 0.55, from.y + hop, 0) }, { easing: 'quadOut' })
                .to(down, { worldPosition: new Vec3(from.x + dx, from.y - r * 0.1 * sc, 0), scale: new Vec3(0.5, 0.5, 1) }, { easing: 'quadIn' })
                .start();
            tween(d.opacity).delay(up).to(down, { opacity: 0 }).call(() => { if (d.node.isValid) d.node.destroy(); }).start();
        }
    }
}
