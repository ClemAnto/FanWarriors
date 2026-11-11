import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Vec3, tween, Tween } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

const BADGE_W      = 54;          // view-local px (the launcher's view is scaled ×1.2 at the bottom)
const BADGE_H      = BADGE_W * 296 / 288;
const HEAD_GAP     = -0.15;       // × radius from the top of the warrior's frame (4r tall): slightly overlaps the head
const BOB_PX       = 5;
const BOB_HALF_SEC = 0.55;
const SHOW_SEC     = 3;           // then it fades away by itself (the warrior's glow keeps signalling the power)

/**
 * Medallion of the powerup a warrior carries, floating above its head: pops in when the power
 * lands on the warrior, bobs gently, fades away after SHOW_SEC (or earlier, when the power is spent).
 * Child of warrior.viewNode, so it follows the perspective mapper and dies with the warrior.
 */
@ccclass('PowerupBadgeEffect')
export class PowerupBadgeEffect extends Component {
    private _op: UIOpacity | null = null;
    private _detaching = false;

    static attach(warrior: Warrior, frame: SpriteFrame): PowerupBadgeEffect {
        const view = warrior.viewNode;
        const n = new Node('PowerupBadge');
        n.layer = view.layer;
        n.setParent(view);
        n.addComponent(UITransform).setContentSize(BADGE_W, BADGE_H);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        const fx = n.addComponent(PowerupBadgeEffect);
        fx._op = n.addComponent(UIOpacity);
        fx._start(warrior.radius * (2 + HEAD_GAP) + BADGE_H / 2);
        return fx;
    }

    private _start(y: number): void {
        const n = this.node;
        n.setPosition(0, y, 0);
        n.setScale(0, 0, 1);
        // Pop: overshoot then settle, then a slow bob so the eye keeps finding it.
        tween(n)
            .to(0.2, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'backOut' })
            .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .call(() => {
                if (this._detaching || !n.isValid) return;
                tween(n)
                    .repeatForever(tween<Node>()
                        .to(BOB_HALF_SEC, { position: new Vec3(0, y + BOB_PX, 0) }, { easing: 'sineInOut' })
                        .to(BOB_HALF_SEC, { position: new Vec3(0, y, 0) }, { easing: 'sineInOut' }))
                    .start();
            })
            .start();
        this.scheduleOnce(() => this.detach(), SHOW_SEC);
    }

    /** Stay on top of the warrior's other effect layers (rings added later). */
    lateUpdate(): void {
        const p = this.node.parent;
        if (p && this.node.getSiblingIndex() !== p.children.length - 1) this.node.setSiblingIndex(p.children.length - 1);
    }

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;
        const n = this.node;
        if (!n?.isValid) return;
        Tween.stopAllByTarget(n);
        const done = (): void => { if (n.isValid) n.destroy(); };
        if (!this._op) { done(); return; }
        tween(n).to(0.2, { scale: new Vec3(0.5, 0.5, 1) }, { easing: 'quadIn' }).start();
        tween(this._op).to(0.2, { opacity: 0 }).call(done).start();
    }

    onDestroy(): void {
        if (this.node) Tween.stopAllByTarget(this.node);
        if (this._op) Tween.stopAllByTarget(this._op);
    }
}
