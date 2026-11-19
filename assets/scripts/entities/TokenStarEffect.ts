import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Color, Vec3, tween, gfx } from 'cc';

const { ccclass } = _decorator;

const STAR_SIZE    = 46;    // world px of the star at full size
const BIRTH_SEC    = 0.18;  // fade + zoom in where the coin was
const RISE_PX      = 46;    // it floats up this much first…
const RISE_SEC     = 0.5;
const HOVER_SEC    = 2.0;   // …and hangs in the air (bobbing, flickering) this long in all before leaving
const BOB_PX       = 6;
const FLY_SEC      = 0.6;   // flight to the counter: accelerates (eased-in) and slams home
const CURVE_BOW    = 120;   // px the path bows sideways off the straight line
const FLICKER      = 0.13;  // ± scale jitter per frame
const TRAIL_EVERY  = 0.03;

/**
 * Collected power token → white star (FunKoolkan "raising star" look): born where the coin was, it floats
 * up, hangs in the air for a couple of seconds flickering, then accelerates along a curved path onto its
 * HUD counter icon, where it flashes. `onArrive` fires on impact. Lives under `layer` (the UI layer), WORLD
 * coordinates; plain sprites (additive), no Graphics.
 */
@ccclass('TokenStarEffect')
export class TokenStarEffect extends Component {
    private _frame: SpriteFrame | null = null;
    private _from = new Vec3();
    private _target = new Vec3();
    private _onArrive: (() => void) | null = null;
    private _age = 0;
    private _side = 1;
    private _trailClock = 0;
    private _star: Node | null = null;
    private _op: UIOpacity | null = null;
    private _base = 1;      // local scale giving STAR_SIZE world px
    private _done = false;

    static launch(layer: Node, frame: SpriteFrame, fromWorld: Readonly<Vec3>, targetWorld: Readonly<Vec3>, onArrive: () => void): TokenStarEffect {
        const node = new Node('TokenStar');
        node.layer = layer.layer;
        node.setParent(layer);
        node.setWorldPosition(fromWorld.x, fromWorld.y, 0);
        const fx = node.addComponent(TokenStarEffect);
        fx._frame = frame;
        fx._from.set(fromWorld.x, fromWorld.y, 0);
        fx._target.set(targetWorld.x, targetWorld.y, 0);
        fx._onArrive = onArrive;
        fx._side = Math.random() < 0.5 ? -1 : 1;
        fx._base = 1 / (layer.worldScale.x || 1);
        const star = TokenStarEffect._sprite(node, 'Star', frame, STAR_SIZE, new Color(255, 255, 255, 255));
        fx._star = star;
        fx._op = star.addComponent(UIOpacity);
        fx._op.opacity = 0;
        star.setScale(0.2, 0.2, 1);
        node.setScale(fx._base, fx._base, 1);
        return fx;
    }

    update(dt: number): void {
        if (this._done || !this._star) return;
        this._age += dt;
        const t = this._age;

        if (t < BIRTH_SEC) {
            const u = t / BIRTH_SEC;
            const z = 0.2 + 0.8 * TokenStarEffect._easeOutBack(u);
            this._star.setScale(z, z, 1);
            if (this._op) this._op.opacity = Math.round(255 * Math.min(1, u * 1.4));
            return;
        }
        if (this._op) this._op.opacity = 255;
        const flick = 1 + (Math.random() * 2 - 1) * FLICKER;
        this._star.setScale(flick, flick, 1);
        this._star.angle += dt * 90;

        // Hover point: floats up, then bobs gently.
        const hoverT = t - BIRTH_SEC;
        const rise = RISE_PX * Math.min(1, Math.sin(Math.min(1, hoverT / RISE_SEC) * Math.PI / 2));
        const bob = hoverT > RISE_SEC ? Math.sin((hoverT - RISE_SEC) * 4) * BOB_PX : 0;
        const hx = this._from.x, hy = this._from.y + rise + bob;

        if (hoverT < HOVER_SEC) {
            this.node.setWorldPosition(hx, hy, 0);
            this._trail(dt, 0.35);
            return;
        }

        // Flight: bowed quadratic bezier from the hover point, eased-in (accelerates onto the icon).
        const ft = Math.min(1, (hoverT - HOVER_SEC) / FLY_SEC);
        const u = ft * ft;
        const p0x = hx, p0y = hy, p1x = this._target.x, p1y = this._target.y;
        const dx = p1x - p0x, dy = p1y - p0y, len = Math.hypot(dx, dy) || 1;
        const cx = (p0x + p1x) / 2 + (-dy / len) * CURVE_BOW * this._side;
        const cy = (p0y + p1y) / 2 + (dx / len) * CURVE_BOW * this._side;
        const om = 1 - u;
        this.node.setWorldPosition(om * om * p0x + 2 * om * u * cx + u * u * p1x, om * om * p0y + 2 * om * u * cy + u * u * p1y, 0);
        this._trail(dt, 1);
        if (ft >= 1) this._impact();
    }

    private _impact(): void {
        this._done = true;
        const node = this.node;
        // Flash on the icon, then the star is gone.
        if (this._star) {
            tween(this._star).to(0.08, { scale: new Vec3(2.4, 2.4, 1) }, { easing: 'quadOut' }).start();
            if (this._op) tween(this._op).to(0.14, { opacity: 0 }).call(() => { if (node.isValid) node.destroy(); }).start();
        }
        const cb = this._onArrive;
        this._onArrive = null;
        try { cb?.(); } catch (e) { console.warn('[TokenStar] onArrive failed:', e); }
    }

    /** Small fading sparks left behind (fewer while hovering). */
    private _trail(dt: number, rate: number): void {
        this._trailClock += dt * rate;
        if (this._trailClock < TRAIL_EVERY || !this._frame) return;
        this._trailClock = 0;
        const parent = this.node.parent;
        if (!parent?.isValid) return;
        const dot = new Node('TokenStarTrail');
        dot.layer = parent.layer;
        dot.setParent(parent);
        const p = this.node.worldPosition;
        dot.setWorldPosition(p.x + (Math.random() - 0.5) * 10, p.y + (Math.random() - 0.5) * 10, 0);
        dot.setScale(this._base, this._base, 1);
        const s = TokenStarEffect._sprite(dot, 'Spark', this._frame, STAR_SIZE * (0.3 + Math.random() * 0.25), new Color(255, 250, 225, 255));
        const op = s.addComponent(UIOpacity);
        op.opacity = 200;
        tween(s).to(0.35, { scale: new Vec3(0.2, 0.2, 1), position: new Vec3(0, -14, 0) }).start();
        tween(op).to(0.35, { opacity: 0 }).call(() => { if (dot.isValid) dot.destroy(); }).start();
    }

    private static _sprite(parent: Node, name: string, frame: SpriteFrame | null, size: number, color: Color): Node {
        const n = new Node(name);
        n.layer = parent.layer;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(size, size);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        sp.color = color;
        // Additive: in 2D the blend comes from the renderer's factors (public at runtime, missing from the 3.8.8 typings).
        const blend = sp as unknown as { srcBlendFactor: gfx.BlendFactor; dstBlendFactor: gfx.BlendFactor };
        blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend.dstBlendFactor = gfx.BlendFactor.ONE;
        return n;
    }

    private static _easeOutBack(u: number): number {
        const c1 = 1.70158, c3 = c1 + 1, p = u - 1;
        return 1 + c3 * p * p * p + c1 * p * p;
    }
}
