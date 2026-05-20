import { _decorator, Component, Node, Color, Vec3, SpriteFrame, UIOpacity, Sprite, UITransform, tween, Tween, gfx } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

@ccclass('LevelBoostPowerup')
export class LevelBoostPowerup extends Component {
    private _energy = 0;
    private _activationMs = 0;
    private _sparkleFrame: SpriteFrame | null = null;
    private _radius = 30;
    private _detaching = false;

    private _outerNode: Node | null = null;
    private _innerNode: Node | null = null;
    private _outerOp:   UIOpacity | null = null;
    private _innerOp:   UIOpacity | null = null;
    private _pulseTween: Tween<Node> | null = null;
    private _fadeInTweenOuter: Tween<UIOpacity> | null = null;
    private _fadeInTweenInner: Tween<UIOpacity> | null = null;

    onExpired: (() => void) | null = null;

    get energy(): number { return this._energy; }
    get activationMs(): number { return this._activationMs; }
    resetActivation(): void { this._activationMs = Date.now(); }

    static attach(warrior: Warrior, energy: number, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): LevelBoostPowerup {
        const node = new Node('LevelBoost');
        node.setParent(warrior.viewNode);
        const lb = node.addComponent(LevelBoostPowerup);
        lb._energy = energy;
        lb._sparkleFrame = sparkleFrame;
        lb._radius = warrior.radius;
        lb._activationMs = Date.now();
        lb._startVFX(glowFrame);
        return lb;
    }

    detach(): void {
        if (this._detaching) return;
        this._detaching = true;
        this._fadeInTweenOuter?.stop();
        this._fadeInTweenInner?.stop();
        this._pulseTween?.stop();
        this._fadeInTweenOuter = null;
        this._fadeInTweenInner = null;
        this._pulseTween = null;
        this.unschedule(this._spawnSparkle);
        if (!this.node?.isValid) return;
        this._fadeOut();
    }


    private _startVFX(glowFrame: SpriteFrame | null): void {
        const scale = this._energy * 1.2;
        if (scale <= 0) return;
        const r = this._radius;

        // Outer glow ring
        const outerNode = new Node('AuraOuter');
        outerNode.setParent(this.node);
        const outerUIT = outerNode.addComponent(UITransform);
        outerUIT.setContentSize(r * 3.4 * scale, r * 3.4 * scale);
        const outerOp = outerNode.addComponent(UIOpacity);
        outerOp.opacity = 0;
        if (glowFrame) {
            const sp = outerNode.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = glowFrame;
            sp.color       = new Color(255, 195, 40, 255);
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
        }
        this._outerNode = outerNode;
        this._outerOp   = outerOp;

        // Inner glow (slightly smaller, brighter tint)
        const innerNode = new Node('AuraInner');
        innerNode.setParent(this.node);
        const innerUIT = innerNode.addComponent(UITransform);
        innerUIT.setContentSize(r * 2.2 * scale, r * 2.2 * scale);
        const innerOp = innerNode.addComponent(UIOpacity);
        innerOp.opacity = 0;
        if (glowFrame) {
            const sp = innerNode.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = glowFrame;
            sp.color       = new Color(255, 235, 120, 255);
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
        }
        this._innerNode = innerNode;
        this._innerOp   = innerOp;

        // Fade-in outer → then start pulse
        this._fadeInTweenOuter = tween(outerOp)
            .to(1.2, { opacity: 75 })
            .call(() => {
                this._fadeInTweenOuter = null;
                if (!this._detaching && outerNode.isValid) {
                    this._pulseTween = tween(outerNode)
                        .repeatForever(tween<Node>()
                            .to(0.65, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineInOut' })
                            .to(0.65, { scale: new Vec3(1.0,  1.0,  1) }, { easing: 'sineInOut' }))
                        .start() as unknown as Tween<Node>;
                }
            })
            .start();

        this._fadeInTweenInner = tween(innerOp)
            .to(0.9, { opacity: 120 })
            .call(() => { this._fadeInTweenInner = null; })
            .start();

        this.schedule(this._spawnSparkle, 0.13);
    }

    private _fadeOut(): void {
        const outerOp = this._outerOp;
        const innerOp = this._innerOp;
        const node    = this.node;

        const finish = () => {
            this.onExpired?.();
            if (node?.isValid) node.destroy();
        };

        if (outerOp && outerOp.node?.isValid) {
            tween(outerOp).to(0.8, { opacity: 0 }).start();
        }
        if (innerOp && innerOp.node?.isValid) {
            tween(innerOp).to(0.8, { opacity: 0 }).call(finish).start();
        } else {
            finish();
        }
    }

    private _spawnSparkle(): void {
        const parent = this.node?.parent;
        if (!parent?.isValid) { this.unschedule(this._spawnSparkle); return; }

        const r     = this._radius;
        const scale = this._energy * 1.2;
        const angle = Math.random() * Math.PI * 2;
        const dist  = r * (0.55 + Math.random() * 0.75) * scale;

        const spark = new Node('PwrSpark');
        spark.setParent(parent);
        spark.setPosition(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        spark.angle = Math.random() * 360;
        const sc = 0.8 + Math.random() * 1.0;
        spark.setScale(sc, sc, 1);

        const palette = [new Color(255, 230, 80, 220), new Color(255, 255, 200, 200), new Color(160, 235, 255, 180)];
        const col = palette[Math.floor(Math.random() * palette.length)];

        if (this._sparkleFrame) {
            const size = 32 + Math.random() * 28;
            spark.addComponent(UITransform).setContentSize(size, size);
            const sp = spark.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._sparkleFrame;
            sp.color       = col;
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
        } else {
            const g = spark.addComponent(UIOpacity);
            g.opacity = col.a;
        }

        const op  = spark.addComponent(UIOpacity);
        op.opacity = 0;

        const rise  = 14 + Math.random() * 22;
        const drift = (Math.random() - 0.5) * 10;
        const dur   = 0.38 + Math.random() * 0.22;
        tween(spark)
            .by(dur, { position: new Vec3(drift, rise, 0) }, { easing: 'quadOut' })
            .call(() => { if (spark.isValid) spark.destroy(); })
            .start();
        tween(op)
            .to(dur * 0.3, { opacity: 210 })
            .to(dur * 0.7, { opacity: 0   })
            .call(() => { if (spark.isValid) spark.destroy(); })
            .start();
    }
}
