import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Vec3, Color, tween, Tween, gfx } from 'cc';
import { perspectiveDepthScale } from './PerspectiveMapper';

const { ccclass } = _decorator;

/** Token width on the track (view px, before the depth scale): small coin, ~⅔ of a level-1 base. */
export const TOKEN_SIZE = 50;
/** The art is already a coin lying on the track (top face foreshortened + its side band below):
 *  its height follows the frame's aspect. The face ellipse is a bit taller than the warriors' bases:
 *  TILT_Y flattens it to the same tilt. */
const TILT_Y        = 0.85;
/** Height of the face ellipse over the coin width, after TILT_Y (for the glints). */
const FACE_RATIO    = 0.53;
/** The physics point is the centre of the face, slightly above the sprite centre (the side band). */
const FACE_LIFT     = 3;
/** Occasional glint on the coin face. */
const GLINT_MIN_SEC = 0.9;
const GLINT_MAX_SEC = 2.0;
const GLINT_SIZE    = 26;

export interface PowerTokenArt {
    face: SpriteFrame | null;      // coin in the track perspective, thickness included
    sparkle: SpriteFrame | null;   // star sparkle (VFX particle) for the glints
}

/**
 * A power token lying on the track (visual only: GameManager owns position, lifetime and pickup).
 * Lives in World/TokenLayer, below WarriorsLayer: always drawn under every warrior (it lies on the
 * floor, warriors run over it). Physics-local position → view world position
 * with the same mapping as PerspectiveMapper. One sprite: the art is already the coin seen at the
 * track's tilt, with its thickness. Animations: rubbery zoom-in, a glint now
 * and then, blink before vanishing, shrink-out, and the pickup flight to its HUD counter.
 */
@ccclass('PowerToken')
export class PowerToken extends Component {
    /** Physics-local position (Box2DLayer space), set at spawn. */
    x = 0;
    y = 0;
    animScale = 0;                           // pop-in scale factor (tweened)
    jellyX = 1;                              // rubbery squash & stretch on the pop-in (tweened)
    jellyY = 1;

    private _box2d: Node | null = null;
    private _faceOp: UIOpacity | null = null;
    private _sparkle: SpriteFrame | null = null;
    private _t = 0;
    private _nextGlint = 0.5;
    private _blinking = false;
    private _leaving = false;

    static create(layer: Node, box2dLayer: Node, x: number, y: number, art: PowerTokenArt): PowerToken {
        const root = new Node('PowerToken');
        root.layer = layer.layer;
        root.setParent(layer);
        const r = art.face?.rect;
        const h = Math.round(TOKEN_SIZE * (r && r.width > 0 ? r.height / r.width : 0.74) * TILT_Y);
        root.addComponent(UITransform).setContentSize(TOKEN_SIZE, h);

        const t = root.addComponent(PowerToken);
        t._box2d = box2dLayer;
        t._sparkle = art.sparkle;
        const face = PowerToken._sprite(root, 'Face', art.face, TOKEN_SIZE, h, new Color(255, 255, 255, 255));
        face.setPosition(0, -FACE_LIFT, 0);
        t._faceOp = face.addComponent(UIOpacity);
        t.x = x;
        t.y = y;
        t._place();
        return t;
    }

    private static _sprite(parent: Node, name: string, frame: SpriteFrame | null, w: number, h: number, tint: Color): Node {
        const n = new Node(name);
        n.layer = parent.layer;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(w, h);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        sp.color = tint;
        return n;
    }

    /** Rubbery zoom-in on the spot: grows past its size and wobbles (squash & stretch out of
     *  phase on the two axes) before settling, with a glint at the end. */
    appear(): void {
        this.animScale = 0;
        this.jellyX = 1;
        this.jellyY = 1;
        tween(this as PowerToken)
            .to(0.20, { animScale: 1.25 }, { easing: 'quadOut' })
            .to(0.12, { animScale: 0.88 }, { easing: 'sineInOut' })
            .to(0.10, { animScale: 1.08 }, { easing: 'sineInOut' })
            .to(0.08, { animScale: 0.97 }, { easing: 'sineInOut' })
            .to(0.08, { animScale: 1.0 }, { easing: 'sineOut' })
            .call(() => this._glint())
            .start();
        const jelly = { t: 0 };
        tween(jelly)
            .to(0.6, { t: 1 }, {
                onUpdate: () => {
                    const k = Math.sin(jelly.t * Math.PI * 4) * 0.22 * (1 - jelly.t);   // decaying wobble
                    this.jellyX = 1 + k;
                    this.jellyY = 1 - k;
                },
            })
            .call(() => { this.jellyX = 1; this.jellyY = 1; })
            .start();
    }

    /** Per-frame idle animation; `blink` true in the last seconds of its life. */
    tickIdle(dt: number, blink: boolean): void {
        if (this._leaving) return;
        this._t += dt;
        if (blink && this._faceOp) {
            this._blinking = true;
            this._faceOp.opacity = Math.floor(this._t * 8) % 2 === 0 ? 255 : 90;
        } else if (this._blinking && this._faceOp) {
            this._blinking = false;
            this._faceOp.opacity = 255;
        }
        this._nextGlint -= dt;
        if (this._nextGlint <= 0) {
            this._nextGlint = GLINT_MIN_SEC + Math.random() * (GLINT_MAX_SEC - GLINT_MIN_SEC);
            this._glint();
        }
    }

    lateUpdate(): void { this._place(); }

    /** Unclaimed: shrink and fade away, then destroy. */
    vanish(): void {
        if (this._leaving) return;
        this._leaving = true;
        Tween.stopAllByTarget(this);
        const n = this.node;
        const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
        tween(this as PowerToken).to(0.3, { animScale: 0.2 }, { easing: 'quadIn' }).start();
        tween(op).to(0.3, { opacity: 0 }).call(() => { if (n.isValid) n.destroy(); }).start();
    }

    /** Picked up: one continuous motion, no jumps. The coin lifts off the track and glides on a
     *  smooth curve into its HUD counter (whose icon is the same coin art) (`targetWorld`, under `uiLayer`), ending exactly the size of the counter's icon
     *  (`targetWorldSize`, world px). `onArrive` fires on landing, then the token is destroyed. */
    collect(uiLayer: Node, targetWorld: Vec3, targetWorldSize: number, onArrive: () => void): void {
        if (this._leaving) return;
        this._leaving = true;
        Tween.stopAllByTarget(this);
        const n = this.node;
        const from = n.worldPosition.clone();
        // Same world transform under the UI layer (the parents' scales differ: read the local scale
        // only after the reparent, or the flight would start with a size jump).
        n.setParent(uiLayer, true);
        const setLayer = (k: Node): void => { k.layer = uiLayer.layer; k.children.forEach(setLayer); };
        setLayer(n);
        n.setWorldPosition(from);
        const s0 = n.scale.x;
        const parentScale = uiLayer.worldScale.x || 1;
        const sEnd = targetWorldSize / TOKEN_SIZE / parentScale;
        if (this._faceOp) { Tween.stopAllByTarget(this._faceOp); this._faceOp.opacity = 255; }
        this._glint();

        // Path: quadratic Bézier, control point straight above the pickup → it rises first, then
        // curves into the counter. Size: swells a little while lifting, then shrinks onto the icon.
        const ctrl = new Vec3(from.x + (targetWorld.x - from.x) * 0.15, Math.max(from.y, targetWorld.y) + 160, 0);
        const p = new Vec3();
        const fly = { t: 0 };
        tween(fly)
            .to(0.7, { t: 1 }, {
                easing: 'sineInOut',
                onUpdate: () => {
                    if (!n.isValid) return;
                    const t = fly.t, u = 1 - t;
                    p.set(u * u * from.x + 2 * u * t * ctrl.x + t * t * targetWorld.x,
                          u * u * from.y + 2 * u * t * ctrl.y + t * t * targetWorld.y, 0);
                    n.setWorldPosition(p);
                    const swell = 1 + 0.25 * Math.sin(Math.PI * t);   // 1 at both ends
                    const s = (s0 + (sEnd - s0) * t * t) * swell;
                    n.setScale(s, s, 1);
                },
            })
            .call(() => { onArrive(); if (n.isValid) n.destroy(); })
            .start();
    }

    /** A small star pops and twists somewhere on the coin face, then fades. */
    private _glint(): void {
        if (!this._sparkle || !this.node?.isValid) return;
        const s = PowerToken._sprite(this.node, 'Glint', this._sparkle, GLINT_SIZE, GLINT_SIZE, new Color(255, 250, 215, 255));
        const sp = s.getComponent(Sprite);
        sp?.getMaterialInstance(0)?.overridePipelineStates({
            blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] },
        });
        const a = Math.random() * Math.PI * 2, r = Math.random() * TOKEN_SIZE * 0.32;
        s.setPosition(Math.cos(a) * r, Math.sin(a) * r * FACE_RATIO, 0);
        s.setScale(0, 0, 1);
        s.angle = Math.random() * 90;
        const op = s.addComponent(UIOpacity);
        tween(s)
            .to(0.16, { scale: new Vec3(1, 1, 1), angle: s.angle + 45 }, { easing: 'quadOut' })
            .to(0.24, { scale: new Vec3(0, 0, 1), angle: s.angle + 90 }, { easing: 'quadIn' })
            .call(() => { if (s.isValid) s.destroy(); })
            .start();
        tween(op).delay(0.2).to(0.2, { opacity: 0 }).start();
    }

    private _place(): void {
        if (this._leaving || !this._box2d?.isValid) return;
        const ut = this._box2d.getComponent(UITransform);
        if (!ut) return;
        const wp = ut.convertToWorldSpaceAR(new Vec3(this.x, this.y, 0));
        const sy = this._box2d.scale.y;
        // Lies flat on the floor (no hover); same depth scaling as the warriors.
        this.node.setWorldPosition(wp.x, wp.y * sy + FACE_LIFT, wp.z);
        const s = perspectiveDepthScale(wp.y) * this.animScale;
        this.node.setScale(s * this.jellyX, s * this.jellyY, 1);
    }

    onDestroy(): void {
        Tween.stopAllByTarget(this);
        if (this.node) Tween.stopAllByTarget(this.node);
    }
}
