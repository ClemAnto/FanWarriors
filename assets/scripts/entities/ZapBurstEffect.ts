import { Node, Sprite, SpriteFrame, UITransform, UIOpacity, Color, Vec3, tween, gfx } from 'cc';

const SHARDS        = 10;    // sparkles thrown out radially when the warrior bursts
const SHARD_DIST    = 70;    // px they travel (scaled by the warrior size)
const SHARD_SEC     = 0.42;
const RING_SEC      = 0.32;

/**
 * Aura zap — the moment a warrior bursts into energy: an expanding shock ring, a white core flash and a
 * radial spray of species-coloured sparkles. Pure fire-and-forget VFX (no game logic), local coordinates
 * of `layer` (the same space as the zap spark that rises right after).
 */
export class ZapBurstEffect {
    static play(layer: Node, sparkle: SpriteFrame, ring: SpriteFrame | null, x: number, y: number, color: Color, size: number): void {
        if (!layer?.isValid) return;
        const k = Math.max(0.6, size / 120);

        // Shock ring (aura texture) expanding and fading.
        if (ring) {
            const r = ZapBurstEffect._sprite(layer, 'ZapRing', ring, x, y, size * 0.6, new Color(color.r, color.g, color.b, 255), 220);
            tween(r.node).to(RING_SEC, { scale: new Vec3(2.6, 2.6, 1) }, { easing: 'quadOut' }).start();
            tween(r.op).to(RING_SEC, { opacity: 0 }, { easing: 'quadIn' }).call(() => { if (r.node.isValid) r.node.destroy(); }).start();
        }

        // Bright core flash.
        const core = ZapBurstEffect._sprite(layer, 'ZapCore', sparkle, x, y, size * 1.4, new Color(255, 255, 255, 255), 255);
        core.node.setScale(0.4, 0.4, 1);
        tween(core.node).to(0.08, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' }).to(0.16, { scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadIn' }).start();
        tween(core.op).delay(0.08).to(0.16, { opacity: 0 }).call(() => { if (core.node.isValid) core.node.destroy(); }).start();

        // Radial spray of shards.
        const offset = Math.random() * Math.PI * 2;
        for (let i = 0; i < SHARDS; i++) {
            const a = offset + (i / SHARDS) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const d = SHARD_DIST * k * (0.7 + Math.random() * 0.6);
            const s = ZapBurstEffect._sprite(layer, 'ZapShard', sparkle, x, y, 34 * k * (0.7 + Math.random() * 0.5), new Color(color.r, color.g, color.b, 255), 255);
            s.node.angle = Math.random() * 360;
            // Perspective: the track is squashed vertically, so is the spray.
            tween(s.node)
                .to(SHARD_SEC, { position: new Vec3(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 0), scale: new Vec3(0.2, 0.2, 1), angle: s.node.angle + 180 }, { easing: 'quadOut' })
                .start();
            tween(s.op).delay(SHARD_SEC * 0.4).to(SHARD_SEC * 0.6, { opacity: 0 }).call(() => { if (s.node.isValid) s.node.destroy(); }).start();
        }
    }

    private static _sprite(layer: Node, name: string, frame: SpriteFrame, x: number, y: number, size: number, color: Color, opacity: number): { node: Node; op: UIOpacity } {
        const node = new Node(name);
        node.layer = layer.layer;
        node.setParent(layer);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(size, size);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        sp.color = color;
        // Additive: in 2D the blend comes from the renderer's factors (public at runtime, missing from the 3.8.8 typings).
        const blend = sp as unknown as { srcBlendFactor: gfx.BlendFactor; dstBlendFactor: gfx.BlendFactor };
        blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend.dstBlendFactor = gfx.BlendFactor.ONE;
        const op = node.addComponent(UIOpacity);
        op.opacity = opacity;
        return { node, op };
    }
}
