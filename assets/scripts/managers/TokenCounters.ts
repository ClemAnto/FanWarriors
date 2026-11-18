import { _decorator, Component, Node, Label, Layout, Widget, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, tween, Tween } from 'cc';
import { TokenKind } from '../data/PowerTokens';

const { ccclass, property } = _decorator;

/**
 * HUD counters of the collected power tokens ("2/3" under the power's icon). Behaviour only: the
 * nodes are authored in Game.scene (HUD/TokenCounters, tools/ui/add-token-counters.mjs) and a
 * horizontal Layout on the container closes the gap of a counter still hidden (no token of that power yet).
 * Each counter node holds an `Icon` (Sprite), a `Count` (Label) and a `Glow` (Sprite, flashed
 * when the power charges).
 */
@ccclass('TokenCounters')
export class TokenCounters extends Component {
    @property({ type: Node, tooltip: 'Brotherhood counter (Icon, Count, Glow children)' })
    brotherhood: Node | null = null;
    @property({ type: Node, tooltip: 'Wild River counter (Icon, Count, Glow children)' })
    wildRiver: Node | null = null;
    @property({ type: Node, tooltip: 'Psycho Force counter (Icon, Count, Glow children)' })
    psychoForce: Node | null = null;

    /** Editor scale of every node we animate: animations always land back on it. */
    private _base = new Map<Node, Vec3>();
    private _scaleOf(n: Node): Vec3 {
        let s = this._base.get(n);
        if (!s) { s = n.scale.clone(); this._base.set(n, s); }
        return s;
    }
    private _scaled(n: Node, k: number): Vec3 {
        const s = this._scaleOf(n);
        return new Vec3(s.x * k, s.y * k, s.z);
    }

    private _of(kind: TokenKind): Node | null {
        return kind === 'brotherhood' ? this.brotherhood : kind === 'wildRiver' ? this.wildRiver : this.psychoForce;
    }

    /** Show/hide a power's counter (shown once a token of that power was collected) and write its
     *  value. The container hides while no counter is shown. Layout and Widget are applied at once,
     *  so a token flying to a counter that has just appeared targets its final place. */
    setState(kind: TokenKind, count: number, needed: number, visible: boolean): void {
        const n = this._of(kind);
        if (!n) return;
        const label = n.getChildByName('Count')?.getComponent(Label);
        if (label) label.string = `${count}/${needed}`;
        if (n.active === visible) return;
        n.active = visible;
        if (visible) this._popIn(n);
        this.node.active = !!(this.brotherhood?.active || this.wildRiver?.active || this.psychoForce?.active);
        if (this.node.active) {
            this.getComponent(Layout)?.updateLayout();
            this.getComponent(Widget)?.updateAlignment();
        }
    }

    /** Replace the icon art (placeholder medallion → token face). */
    setIcon(kind: TokenKind, frame: SpriteFrame | null): void {
        const sp = this._of(kind)?.getChildByName('Icon')?.getComponent(Sprite);
        if (sp && frame) sp.spriteFrame = frame;
    }

    /** Where a collected token flies to, at the counter's editor scale: a counter that has just
     *  appeared is still popping in from scale 0, so its live transform would collapse the icon
     *  onto the counter's origin. */
    iconWorldPos(kind: TokenKind): Vec3 | null {
        const cell = this._of(kind);
        const icon = cell?.getChildByName('Icon');
        if (!cell || !icon?.activeInHierarchy) return null;
        const cs = this._scaleOf(cell);
        const local = new Vec3(cell.position.x + icon.position.x * cs.x, cell.position.y + icon.position.y * cs.y, 0);
        return this.getComponent(UITransform)?.convertToWorldSpaceAR(local) ?? icon.worldPosition.clone();
    }

    /** On-screen width of the icon (world px), at the editor scales of the counter and the icon
     *  (ignores a running pop-in or bump). */
    iconWorldSize(kind: TokenKind): number {
        const cell = this._of(kind);
        const icon = cell?.getChildByName('Icon');
        if (!cell || !icon) return 60;
        const w = icon.getComponent(UITransform)?.width ?? 60;
        return w * this.node.worldScale.x * this._scaleOf(cell).x * this._scaleOf(icon).x;
    }

    /** A token landed: the icon bumps. */
    bump(kind: TokenKind): void {
        const icon = this._of(kind)?.getChildByName('Icon');
        if (!icon) return;
        this._scaleOf(icon);
        Tween.stopAllByTarget(icon);
        icon.setScale(this._scaled(icon, 1));
        tween(icon)
            .to(0.08, { scale: this._scaled(icon, 1.3) }, { easing: 'quadOut' })
            .to(0.16, { scale: this._scaled(icon, 1) }, { easing: 'backOut' })
            .start();
    }

    /** The power charged: glow flash and a bigger bounce. */
    flashReady(kind: TokenKind): void {
        const n = this._of(kind);
        const glow = n?.getChildByName('Glow');
        const op = glow ? (glow.getComponent(UIOpacity) ?? glow.addComponent(UIOpacity)) : null;
        if (glow && op) {
            Tween.stopAllByTarget(op);
            Tween.stopAllByTarget(glow);
            glow.active = true;
            op.opacity = 0;
            this._scaleOf(glow);
            glow.setScale(this._scaled(glow, 0.6));
            tween(glow).to(0.5, { scale: this._scaled(glow, 1.6) }, { easing: 'quadOut' }).start();
            tween(op)
                .to(0.12, { opacity: 255 })
                .to(0.6, { opacity: 0 }, { easing: 'quadIn' })
                .call(() => { glow.active = false; })
                .start();
        }
        const icon = n?.getChildByName('Icon');
        if (icon) {
            this._scaleOf(icon);
            Tween.stopAllByTarget(icon);
            tween(icon)
                .to(0.12, { scale: this._scaled(icon, 1.55) }, { easing: 'quadOut' })
                .to(0.12, { scale: this._scaled(icon, 0.9) })
                .to(0.12, { scale: this._scaled(icon, 1.2) })
                .to(0.2, { scale: this._scaled(icon, 1) }, { easing: 'backOut' })
                .start();
        }
    }

    private _popIn(n: Node): void {
        this._scaleOf(n);
        Tween.stopAllByTarget(n);
        n.setScale(this._scaled(n, 0));
        tween(n)
            .to(0.25, { scale: this._scaled(n, 1.2) }, { easing: 'backOut' })
            .to(0.12, { scale: this._scaled(n, 1) })
            .start();
    }
}
