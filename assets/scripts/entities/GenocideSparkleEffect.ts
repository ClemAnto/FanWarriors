import { _decorator, Component, Node, Color, Sprite, tween, Tween } from 'cc';
import { Warrior } from './Warrior';
import { PerspectiveMapper } from './PerspectiveMapper';

const { ccclass } = _decorator;

const HOP_UP_SEC    = 0.10;
const HOP_DOWN_SEC  = 0.10;
const HOP_HEIGHT    = 14;
const TINT_COLOR    = new Color(200,  80, 255, 255);
const TINT_DARK     = new Color(160,  40, 220, 255);
const TINT_LIGHT    = new Color(225, 115, 255, 255);
const TINT_RESTORE  = new Color(255, 255, 255, 255);

@ccclass('GenocideSparkleEffect')
export class GenocideSparkleEffect extends Component {
    private _warrior!: Warrior;
    private _sprite: Sprite | null = null;
    private _vibTween: Tween<PerspectiveMapper> | null = null;
    private _detaching = false;

    onExpired: (() => void) | null = null;

    static attach(warrior: Warrior): GenocideSparkleEffect {
        const node = new Node('GNSparkle');
        node.setParent(warrior.viewNode);
        const gns = node.addComponent(GenocideSparkleEffect);
        gns._warrior = warrior;
        gns._startVFX();
        return gns;
    }

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;

        this._vibTween?.stop();
        this._vibTween = null;
        const mapper = this._warrior?.mapper;
        if (mapper?.node?.isValid) {
            Tween.stopAllByTarget(mapper);
            tween(mapper).to(0.08, { bounceY: 0 }).start();
        }

        if (this._sprite?.node?.isValid) {
            Tween.stopAllByTarget(this._sprite);
            tween(this._sprite).to(0.15, { color: TINT_RESTORE }).start();
        }

        this.onExpired?.();
        if (this.node?.isValid) this.node.destroy();
    }

    // Destroyed WITHOUT detach (warrior died): kill the repeatForever tweens on the
    // warrior's sprite/mapper — they target components, so the engine won't stop them.
    // After a normal detach() the restore tweens must keep running, hence the guard.
    onDestroy(): void {
        if (this._detaching) return;
        this._vibTween?.stop();
        this._vibTween = null;
        const mapper = this._warrior?.mapper;
        if (mapper) Tween.stopAllByTarget(mapper);
        if (this._sprite) Tween.stopAllByTarget(this._sprite);
    }

    private _startVFX(): void {
        const sp = this._warrior.viewNode?.getComponent(Sprite);
        if (sp) {
            this._sprite = sp;
            tween(sp).to(0.08, { color: TINT_COLOR }).call(() => {
                if (!this._detaching && sp.node?.isValid) {
                    tween(sp)
                        .repeatForever(
                            tween<Sprite>()
                                .to(0.25, { color: TINT_DARK  })
                                .to(0.25, { color: TINT_LIGHT })
                        )
                        .start();
                }
            }).start();
        }

        const mapper = this._warrior?.mapper;
        if (mapper) {
            this._vibTween = tween(mapper)
                .repeatForever(
                    tween<PerspectiveMapper>()
                        .to(HOP_UP_SEC,   { bounceY: HOP_HEIGHT }, { easing: 'quadOut' })
                        .to(HOP_DOWN_SEC, { bounceY: 0 },          { easing: 'quadIn'  })
                )
                .start() as unknown as Tween<PerspectiveMapper>;
        }
    }
}
