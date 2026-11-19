import { Node, Sprite, SpriteFrame, UITransform, UIOpacity, Color, Vec3, tween, gfx } from 'cc';

const EMBER_COLORS = [new Color(255, 250, 230, 255), new Color(255, 214, 120, 255), new Color(255, 170, 70, 255)];

/**
 * Warriors shrinking at a round-up "burn off" a little: small embers / sparkles leave the warrior over
 * `durationSec` and float upward, drifting and fading, as if it were smouldering. Fire-and-forget VFX
 * (no game logic), WORLD coordinates, nodes under `layer` with its layer mask.
 */
export class BurnSparksEffect {
    static play(layer: Node, frame: SpriteFrame, worldPos: Readonly<Vec3>, radius: number, durationSec: number, count = 5): void {
        if (!layer?.isValid) return;
        const x0 = worldPos.x, y0 = worldPos.y;
        for (let i = 0; i < count; i++) {
            const delay = (i / count) * durationSec + Math.random() * 0.08;
            const node = new Node('BurnSpark');
            node.layer = layer.layer;
            node.setParent(layer);
            node.setWorldPosition(x0 + (Math.random() * 2 - 1) * radius * 0.8, y0 + (Math.random() * 1.2 - 0.2) * radius, 0);
            const size = 14 + Math.random() * 14;
            node.addComponent(UITransform).setContentSize(size, size);
            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = frame;
            sp.color = EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)];
            // Additive: in 2D the blend comes from the renderer's factors (public at runtime, missing from the 3.8.8 typings).
            const blend = sp as unknown as { srcBlendFactor: gfx.BlendFactor; dstBlendFactor: gfx.BlendFactor };
            blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
            blend.dstBlendFactor = gfx.BlendFactor.ONE;
            const op = node.addComponent(UIOpacity);
            op.opacity = 0;
            node.setScale(0.3, 0.3, 1);
            const life = 0.7 + Math.random() * 0.5;
            const rise = 70 + Math.random() * 70;
            const drift = (Math.random() * 2 - 1) * 26;
            const p = node.position;
            tween(node)
                .delay(delay)
                .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                .to(life, { position: new Vec3(p.x + drift, p.y + rise, 0), scale: new Vec3(0.2, 0.2, 1), angle: (Math.random() < 0.5 ? -1 : 1) * 160 }, { easing: 'sineOut' })
                .call(() => { if (node.isValid) node.destroy(); })
                .start();
            tween(op).delay(delay).to(0.1, { opacity: 235 }).delay(life * 0.45).to(life * 0.55, { opacity: 0 }).start();
        }
    }
}
