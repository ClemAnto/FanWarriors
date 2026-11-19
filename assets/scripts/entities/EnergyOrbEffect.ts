import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Color, Vec3, tween, gfx } from 'cc';

const { ccclass } = _decorator;

const RISE_PX       = 140;   // the orb first floats up this far above the imploded warrior
const RISE_SEC      = 0.55;
const HOVER_SEC     = 0.12;  // brief hang at the top before it homes in
const HOME_SPEED    = 900;   // px/s at full speed while homing
const HOME_ACCEL    = 2600;  // px/s² — starts slow, accelerates onto the target
const HOME_MAX_SEC  = 2.2;   // safety: never home forever (target teleported / unreachable)
const ARRIVE_PX     = 18;
const TRAIL_EVERY   = 0.035;

/**
 * Brotherhood energy sphere: released by an imploded warrior, it floats up, hangs a moment, then homes
 * onto a (moving) target — the launched warrior — leaving a short glowing trail. `onArrive(true)` when it
 * reaches the target, `onArrive(false)` when the target vanished (the orb then just fades out).
 * Coordinates are WORLD positions; the orb lives in `layer` (warriorsLayer, layer mask copied).
 */
@ccclass('EnergyOrbEffect')
export class EnergyOrbEffect extends Component {
    private _frame: SpriteFrame | null = null;
    private _color = new Color(255, 255, 255, 255);
    private _size = 60;
    private _target: (() => Vec3 | null) | null = null;
    private _onArrive: ((arrived: boolean) => void) | null = null;
    private _phase: 'rise' | 'home' | 'done' = 'rise';
    private _speed = 0;
    private _homeTime = 0;
    private _trailClock = 0;
    private _wobble = Math.random() * Math.PI * 2;

    static launch(layer: Node, frame: SpriteFrame, fromWorld: Readonly<Vec3>, color: Color, size: number,
                  target: () => Vec3 | null, onArrive: (arrived: boolean) => void): EnergyOrbEffect {
        const node = new Node('EnergyOrb');
        node.layer = layer.layer;
        node.setParent(layer);
        node.setWorldPosition(fromWorld.x, fromWorld.y, 0);
        node.addComponent(UITransform).setContentSize(size, size);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        sp.color = color;
        EnergyOrbEffect._additive(sp);
        const op = node.addComponent(UIOpacity);
        op.opacity = 0;
        const orb = node.addComponent(EnergyOrbEffect);
        orb._frame = frame;
        orb._color = color.clone();
        orb._size = size;
        orb._target = target;
        orb._onArrive = onArrive;

        // Pop in, float up, pulse while hanging, then home (update drives the homing).
        node.setScale(0.2, 0.2, 1);
        tween(op).to(0.12, { opacity: 255 }).start();
        tween(node)
            .to(0.18, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(node)
            .by(RISE_SEC, { position: new Vec3(0, RISE_PX, 0) }, { easing: 'quadOut' })
            .delay(HOVER_SEC)
            .call(() => { if (orb._phase === 'rise') orb._phase = 'home'; })
            .start();
        return orb;
    }

    update(dt: number): void {
        if (this._phase === 'done') return;
        this._wobble += dt * 14;
        const pulse = 1 + 0.08 * Math.sin(this._wobble);
        if (this._phase === 'rise') { this._trail(dt); return; }

        const target = this._target?.() ?? null;
        if (!target) { this._finish(false); return; }
        this._homeTime += dt;
        this._speed = Math.min(HOME_SPEED, this._speed + HOME_ACCEL * dt);
        const p = this.node.worldPosition;
        const dx = target.x - p.x, dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        const step = this._speed * dt;
        if (dist <= Math.max(ARRIVE_PX, step) || this._homeTime > HOME_MAX_SEC) {
            this.node.setWorldPosition(target.x, target.y, 0);
            this._finish(true);
            return;
        }
        this.node.setWorldPosition(p.x + dx / dist * step, p.y + dy / dist * step, 0);
        this.node.setScale(pulse, pulse, 1);
        this._trail(dt);
    }

    private _trail(dt: number): void {
        this._trailClock += dt;
        if (this._trailClock < TRAIL_EVERY || !this._frame) return;
        this._trailClock = 0;
        const parent = this.node.parent;
        if (!parent?.isValid) return;
        const dot = new Node('EnergyOrbTrail');
        dot.layer = parent.layer;
        dot.setParent(parent);
        dot.setWorldPosition(this.node.worldPosition);
        const s = this._size * 0.6;
        dot.addComponent(UITransform).setContentSize(s, s);
        const sp = dot.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = this._frame;
        sp.color = new Color(this._color.r, this._color.g, this._color.b, 170);
        EnergyOrbEffect._additive(sp);
        const op = dot.addComponent(UIOpacity);
        op.opacity = 150;
        tween(dot).to(0.25, { scale: new Vec3(0.3, 0.3, 1) }).start();
        tween(op).to(0.25, { opacity: 0 }).call(() => { if (dot.isValid) dot.destroy(); }).start();
    }

    private _finish(arrived: boolean): void {
        this._phase = 'done';
        const cb = this._onArrive;
        this._onArrive = null;
        const node = this.node;
        const op = node.getComponent(UIOpacity);
        if (arrived) {
            // Absorbed: a quick bright pop on the target.
            tween(node).to(0.1, { scale: new Vec3(1.8, 1.8, 1) }, { easing: 'quadOut' }).start();
            if (op) tween(op).to(0.12, { opacity: 0 }).call(() => { if (node.isValid) node.destroy(); }).start();
            else node.destroy();
        } else if (op) {
            tween(op).to(0.3, { opacity: 0 }).call(() => { if (node.isValid) node.destroy(); }).start();
        } else {
            node.destroy();
        }
        try { cb?.(arrived); } catch (e) { console.warn('[EnergyOrb] onArrive failed:', e); }
    }

    private static _additive(sp: Sprite): void {
        // Additive: in 2D the blend comes from the renderer's factors (public at runtime, missing from the 3.8.8 typings).
        const blend = sp as unknown as { srcBlendFactor: gfx.BlendFactor; dstBlendFactor: gfx.BlendFactor };
        blend.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        blend.dstBlendFactor = gfx.BlendFactor.ONE;
    }
}
