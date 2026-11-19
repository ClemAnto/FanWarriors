import { Color, Vec3, tween } from 'cc';
import { HazardContext, additive, makeSprite } from './HazardKit';

const SHARD_TINTS = [new Color(255, 255, 255, 255), new Color(225, 245, 255, 255), new Color(200, 232, 255, 255)];
const FLAKE_TINT = new Color(240, 252, 255, 255);

/**
 * FROZEN LAKE (2026-11-19): a warrior comes out of its ice block. Small chunks of ice burst out of
 * the block a little way (up and out, then they drop and spin away, fading) with a few glinting
 * flakes. `strong` (a hard hit) throws more, bigger and further; a thaw by a power or by the arena
 * change is the smaller version. Pieces live in the warriors layer, on top of the board.
 */
export class IceShatterEffect {
    /** `at`: world position of the block's centre; `r`: the warrior's radius (≈ view units). */
    static play(ctx: HazardContext, at: Vec3, r: number, strong: boolean): void {
        const shard = ctx.frame('ice-shard'), flake = ctx.frame('ice-flake');
        const ws = Math.abs(ctx.warriorsLayer.worldScale.x) || 1;
        const n = strong ? 11 : 7;
        const reach = r * (strong ? 2.2 : 1.4) * ws;
        if (shard) for (let i = 0; i < n; i++) {
            const size = r * (strong ? 0.42 : 0.32) * (0.6 + Math.random() * 0.7);
            const s = makeSprite(ctx.warriorsLayer, 'IceChunk', shard, size, size * 1.04);
            s.sprite.color = SHARD_TINTS[i % SHARD_TINTS.length];
            const start = new Vec3(at.x + (Math.random() - 0.5) * r * 0.6 * ws, at.y + (Math.random() - 0.3) * r * 0.8 * ws, 0);
            s.node.setWorldPosition(start);
            s.node.angle = Math.random() * 360;
            s.node.setScale(0.4, 0.4, 1);
            // a fan, mostly sideways and up: the block bursts open
            const ang = Math.PI * (0.05 + 0.9 * (i + Math.random() * 0.8) / n);
            const d = reach * (0.55 + Math.random() * 0.6);
            const peak = new Vec3(start.x + Math.cos(ang) * d * 0.7, start.y + Math.sin(ang) * d * 0.55 + r * 0.5 * ws, 0);
            const land = new Vec3(start.x + Math.cos(ang) * d, start.y + Math.sin(ang) * d * 0.2 - r * 0.6 * ws, 0);
            const up = 0.16 + Math.random() * 0.06, down = 0.26 + Math.random() * 0.12;
            const spin = (Math.random() - 0.5) * 540;
            tween(s.node)
                .to(up, { worldPosition: peak, scale: new Vec3(1, 1, 1), angle: s.node.angle + spin * 0.4 }, { easing: 'quadOut' })
                .to(down, { worldPosition: land, angle: s.node.angle + spin }, { easing: 'quadIn' })
                .start();
            tween(s.opacity).delay(up + down * 0.4).to(down * 0.6, { opacity: 0 })
                .call(() => { if (s.node.isValid) s.node.destroy(); }).start();
        }
        if (flake) for (let i = 0; i < (strong ? 6 : 4); i++) {
            const size = r * 0.3 * (0.7 + Math.random() * 0.6);
            const s = makeSprite(ctx.warriorsLayer, 'IceGlint', flake, size, size);
            s.sprite.color = FLAKE_TINT;
            additive(s.sprite);
            s.node.setWorldPosition(at);
            const ang = Math.random() * Math.PI * 2, d = reach * (0.3 + Math.random() * 0.5);
            const to = new Vec3(at.x + Math.cos(ang) * d, at.y + Math.abs(Math.sin(ang)) * d * 0.7 + r * 0.3 * ws, 0);
            s.node.setScale(0.2, 0.2, 1);
            const life = 0.4 + Math.random() * 0.25;
            tween(s.node).to(life, { worldPosition: to, scale: new Vec3(1, 1, 1), angle: (Math.random() - 0.5) * 180 }, { easing: 'quadOut' }).start();
            tween(s.opacity).delay(life * 0.45).to(life * 0.55, { opacity: 0 })
                .call(() => { if (s.node.isValid) s.node.destroy(); }).start();
        }
    }
}
