import { _decorator, Component, Node, Color, Vec3, SpriteFrame, UIOpacity, Sprite, UITransform, tween, Tween, gfx } from 'cc';
import { Warrior } from './Warrior';

const { ccclass } = _decorator;

const FIXED_SCALE = 1.2;

@ccclass('BloodhoodEffect')
export class BloodhoodEffect extends Component {
    private _radius = 30;
    private _sparkleFrame: SpriteFrame | null = null;
    private _detaching = false;

    private _outerOp: UIOpacity | null = null;
    private _innerOp: UIOpacity | null = null;
    private _pulseTween:      Tween<Node>      | null = null;
    private _fadeInTweenOuter: Tween<UIOpacity> | null = null;
    private _fadeInTweenInner: Tween<UIOpacity> | null = null;

    static attach(warrior: Warrior, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): BloodhoodEffect {
        const node = new Node('BloodhoodEffect');
        node.setParent(warrior.viewNode);
        const bh = node.addComponent(BloodhoodEffect);
        bh._radius       = warrior.radius;
        bh._sparkleFrame = sparkleFrame;
        bh._startVFX(glowFrame);
        return bh;
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

    // Tweens targeting UIOpacity/child nodes are NOT auto-stopped by the engine when
    // this node dies with its warrior (destroy without detach) — stop them here.
    onDestroy(): void {
        this._fadeInTweenOuter?.stop();
        this._fadeInTweenInner?.stop();
        this._pulseTween?.stop();
        this._fadeInTweenOuter = null;
        this._fadeInTweenInner = null;
        this._pulseTween = null;
        for (const op of [this._outerOp, this._innerOp]) {
            if (!op) continue;
            Tween.stopAllByTarget(op);
            if (op.node) Tween.stopAllByTarget(op.node);
        }
    }

    private _startVFX(glowFrame: SpriteFrame | null): void {
        const r = this._radius;

        // Outer ring — deep violet
        const outerNode = new Node('BhOuter');
        outerNode.setParent(this.node);
        const outerUIT = outerNode.addComponent(UITransform);
        outerUIT.setContentSize(r * 3.4 * FIXED_SCALE, r * 3.4 * FIXED_SCALE);
        const outerOp = outerNode.addComponent(UIOpacity);
        outerOp.opacity = 0;
        if (glowFrame) {
            const sp = outerNode.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = glowFrame;
            sp.color       = new Color(140, 40, 200, 255);
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
        }
        this._outerOp = outerOp;

        // Inner ring — bright lavender
        const innerNode = new Node('BhInner');
        innerNode.setParent(this.node);
        const innerUIT = innerNode.addComponent(UITransform);
        innerUIT.setContentSize(r * 2.2 * FIXED_SCALE, r * 2.2 * FIXED_SCALE);
        const innerOp = innerNode.addComponent(UIOpacity);
        innerOp.opacity = 0;
        if (glowFrame) {
            const sp = innerNode.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = glowFrame;
            sp.color       = new Color(200, 100, 255, 255);
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE }] }
            });
        }
        this._innerOp = innerOp;

        // Fade-in outer → then pulse
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

        const finish = () => { if (node?.isValid) node.destroy(); };

        if (outerOp?.node?.isValid) tween(outerOp).to(0.6, { opacity: 0 }).start();
        if (innerOp?.node?.isValid) tween(innerOp).to(0.6, { opacity: 0 }).call(finish).start();
        else finish();
    }

    private _spawnSparkle(): void {
        const parent = this.node?.parent;
        if (!parent?.isValid) { this.unschedule(this._spawnSparkle); return; }

        const r     = this._radius;
        const angle = Math.random() * Math.PI * 2;
        const dist  = r * (0.55 + Math.random() * 0.75) * FIXED_SCALE;

        const spark = new Node('BhSpark');
        spark.setParent(parent);
        spark.setPosition(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
        spark.angle = Math.random() * 360;
        const sc = 0.8 + Math.random() * 1.0;
        spark.setScale(sc, sc, 1);

        const palette = [
            new Color(180,  60, 240, 220),
            new Color(220, 140, 255, 200),
            new Color(160,  80, 220, 180),
        ];
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
        }

        const op = spark.addComponent(UIOpacity);
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
