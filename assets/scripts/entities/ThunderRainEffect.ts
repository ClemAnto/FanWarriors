import { _decorator, Component, Node, Color, SpriteFrame, UIOpacity, Sprite, UITransform, Tween, tween, gfx } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

const FLICKER_MIN_SEC = 0.06;
const FLICKER_MAX_SEC = 0.22;

/**
 * Thunder Rain carrier look: a yellow storm glow around the launcher that flickers like a charged cloud
 * (random brightness jumps) plus a slow pulsing outer ring. Visual only; GameManager decides when the
 * storm breaks. Child of the warrior's viewNode; plain additive sprites, no Graphics.
 */
@ccclass('ThunderRainEffect')
export class ThunderRainEffect extends Component {
    private _detaching = false;
    private _coreOp: UIOpacity | null = null;
    private _ringOp: UIOpacity | null = null;
    private _ring: Node | null = null;
    private _clock = 0;
    private _next = 0;
    private _pulse = 0;

    static attach(warrior: Warrior, glowFrame: SpriteFrame | null): ThunderRainEffect {
        const n = new Node('ThunderRain');
        n.layer = warrior.viewNode.layer;
        n.setParent(warrior.viewNode);
        const fx = n.addComponent(ThunderRainEffect);
        fx._build(warrior.radius, glowFrame);
        return fx;
    }

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;
        const node = this.node;
        for (const op of [this._coreOp, this._ringOp]) if (op?.node?.isValid) tween(op).to(0.3, { opacity: 0 }).start();
        this.scheduleOnce(() => { if (node?.isValid) node.destroy(); }, 0.35);
    }

    onDestroy(): void {
        for (const op of [this._coreOp, this._ringOp]) if (op) Tween.stopAllByTarget(op);
    }

    update(dt: number): void {
        if (this._detaching) return;
        this._clock += dt;
        this._pulse += dt;
        if (this._ring?.isValid) {
            const s = 1 + 0.12 * Math.sin(this._pulse * 6);
            this._ring.setScale(s, s, 1);
        }
        if (this._clock < this._next || !this._coreOp) return;
        this._clock = 0;
        this._next = FLICKER_MIN_SEC + Math.random() * (FLICKER_MAX_SEC - FLICKER_MIN_SEC);
        // Mostly a steady glow, now and then a bright "lightning in the cloud" jump.
        this._coreOp.opacity = Math.random() < 0.25 ? 230 : 110 + Math.round(Math.random() * 50);
    }

    private _build(radius: number, frame: SpriteFrame | null): void {
        const layer = (name: string, size: number, color: Color, opacity: number): { node: Node; op: UIOpacity } => {
            const n = new Node(name);
            n.layer = this.node.layer;
            n.setParent(this.node);
            n.addComponent(UITransform).setContentSize(size, size);
            const op = n.addComponent(UIOpacity);
            op.opacity = 0;
            if (frame) {
                const sp = n.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = frame;
                sp.color = color;
                // Additive: in 2D the blend comes from the renderer's factors (public at runtime, missing from the 3.8.8 typings).
                const blend = sp as unknown as { srcBlendFactor: gfx.BlendFactor; dstBlendFactor: gfx.BlendFactor };
                blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
                blend.dstBlendFactor = gfx.BlendFactor.ONE;
            }
            tween(op).to(0.35, { opacity }).start();
            return { node: n, op };
        };
        this._ring = layer('ThunderRing', radius * 3.2, new Color(255, 200, 40, 255), 90).node;
        this._ringOp = this._ring.getComponent(UIOpacity);
        this._coreOp = layer('ThunderCore', radius * 2.2, new Color(255, 240, 140, 255), 130).op;
        this._next = 0.4;  // let the fade-in finish before flickering
    }
}
