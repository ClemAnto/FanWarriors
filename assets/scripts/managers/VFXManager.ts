import { Node, Graphics, Color, Label, UIOpacity, Vec2, Vec3, tween, Tween, UITransform, SpriteFrame, Sprite, resources, Texture2D, Rect, gfx, Font, assetManager } from 'cc';

export class VFXManager {
    private readonly vfxLayer:      Node;
    private readonly uiLayer:       Node;
    private readonly worldNode:     Node;
    private readonly warriorsLayer: Node;

    private _shakeTimer    = 0;
    private _shakeDur      = 0;
    private _shakeAmp      = 0;
    private _sparkleFrame:  SpriteFrame | null = null;
    private _stardustFrame: SpriteFrame | null = null;
    private _auraFrame:     SpriteFrame | null = null;
    private _medievalFont:  Font | null = null;
    private _useGoldenText  = true;

    constructor(vfxLayer: Node, uiLayer: Node, worldNode: Node, warriorsLayer: Node) {
        this.vfxLayer      = vfxLayer;
        this.uiLayer       = uiLayer;
        this.worldNode     = worldNode;
        this.warriorsLayer = warriorsLayer;
    }

    get sparkleFrame(): SpriteFrame | null { return this._sparkleFrame; }
    get stardustFrame(): SpriteFrame | null { return this._stardustFrame; }
    get auraFrame():    SpriteFrame | null { return this._auraFrame; }

    preloadSparkle(): void {
        resources.load('particles/sparkle/spriteFrame', SpriteFrame, (err, frame) => {
            if (!err && frame) { this._sparkleFrame = frame; return; }
            resources.load('particles/sparkle', Texture2D, (err2, tex) => {
                if (err2 || !tex) { console.warn('[VFXManager] sparkle unavailable'); return; }
                const sf = new SpriteFrame(); sf.texture = tex;
                sf.rect = new Rect(0, 0, tex.width, tex.height);
                this._sparkleFrame = sf;
            });
        });
        resources.load('particles/stardust/spriteFrame', SpriteFrame, (err, frame) => {
            if (!err && frame) { this._stardustFrame = frame; return; }
            resources.load('particles/stardust', Texture2D, (err2, tex) => {
                if (err2 || !tex) { console.warn('[VFXManager] stardust unavailable'); return; }
                const sf = new SpriteFrame(); sf.texture = tex;
                sf.rect = new Rect(0, 0, tex.width, tex.height);
                this._stardustFrame = sf;
            });
        });
        resources.load('particles/aura/spriteFrame', SpriteFrame, (err, frame) => {
            if (!err && frame) { this._auraFrame = frame; return; }
            resources.load('particles/aura', Texture2D, (err2, tex) => {
                if (err2 || !tex) { console.warn('[VFXManager] aura unavailable'); return; }
                const sf = new SpriteFrame(); sf.texture = tex;
                sf.rect = new Rect(0, 0, tex.width, tex.height);
                this._auraFrame = sf;
            });
        });
        // Font already bundled via Game.scene — load by UUID, no copy to resources needed
        assetManager.loadAny({ uuid: '993e10ce-345b-464f-9b7d-bd534dcd6e0b' }, (err, font) => {
            if (!err && font) { this._medievalFont = font as Font; return; }
            console.warn('[VFXManager] MedievalSharp font unavailable');
        });
    }

    private _applyFont(lbl: Label): void {
        if (this._medievalFont) lbl.font = this._medievalFont;
    }

    private _applyGoldenShine(lbl: Label): void {
        const gold = new Color(255, 210, 50, 255);
        lbl.color = gold;
        lbl.enableOutline = true;
        lbl.outlineColor  = new Color(120, 55, 0, 220);
        lbl.outlineWidth  = 3;
        // Sweep: gold → bright-gold → gold, triggered when bubble peaks (~0.25s)
        const proxy = { t: 0 };
        tween(proxy)
            .delay(0.25)
            .to(0.18, { t: 1 }, { onUpdate: (o) => {
                const t = o!.t;
                lbl.color = new Color(255, Math.round(210 + 45 * t), Math.round(50 + 170 * t), 255);
            }})
            .to(0.22, { t: 0 }, { onUpdate: (o) => {
                const t = o!.t;
                lbl.color = new Color(255, Math.round(210 + 45 * t), Math.round(50 + 170 * t), 255);
            }})
            .call(() => { if (lbl.isValid) lbl.color = gold; })
            .start();
    }

    private _applyPurpleShine(lbl: Label): void {
        const purple = new Color(200, 60, 255, 255);
        lbl.color = purple;
        lbl.enableOutline = true;
        lbl.outlineColor  = new Color(60, 0, 110, 220);
        lbl.outlineWidth  = 3;
        // Color pulse: purple ↔ bright pink-white, repeating
        const cp = { t: 0 };
        const colorPulse = () => {
            if (!lbl.isValid) return;
            tween(cp)
                .to(0.38, { t: 1 }, { onUpdate: (o) => {
                    if (!lbl.isValid) return;
                    const t = o!.t;
                    lbl.color = new Color(Math.round(200 + 55 * t), Math.round(60 + 160 * t), 255, 255);
                }})
                .to(0.38, { t: 0 }, { onUpdate: (o) => {
                    if (!lbl.isValid) return;
                    const t = o!.t;
                    lbl.color = new Color(Math.round(200 + 55 * t), Math.round(60 + 160 * t), 255, 255);
                }})
                .call(colorPulse)
                .start();
        };
        // Scale pulse: 1.0 ↔ 1.07, offset slightly from color pulse for organic feel
        const scalePulse = () => {
            if (!lbl.isValid) return;
            tween(lbl.node)
                .to(0.45, { scale: new Vec3(1.07, 1.07, 1) }, { easing: 'sineInOut' })
                .to(0.45, { scale: new Vec3(1.0,  1.0,  1) }, { easing: 'sineInOut' })
                .call(scalePulse)
                .start();
        };
        tween(cp).delay(0.42).call(colorPulse).start();
        tween(lbl.node).delay(0.50).call(scalePulse).start();
    }

    // ── screen shake ──────────────────────────────────────────────────────

    screenShake(amplitude: number, duration: number): void {
        if (amplitude >= this._shakeAmp || this._shakeTimer <= 0) {
            this._shakeAmp   = amplitude;
            this._shakeDur   = duration;
            this._shakeTimer = duration;
        }
    }

    tick(dt: number): void {
        if (this._shakeTimer <= 0) return;
        const uit = this.worldNode.getComponent(UITransform);
        if (!uit) return;
        this._shakeTimer -= dt;
        if (this._shakeTimer <= 0) {
            this._shakeTimer = 0;
            this._shakeAmp   = 0;
            uit.anchorPoint = new Vec2(0.5, 0.5);
            return;
        }
        const amp = this._shakeAmp * (this._shakeTimer / this._shakeDur);
        const dx  = (Math.random() * 2 - 1) * amp;
        const dy  = (Math.random() * 2 - 1) * amp;
        const w   = uit.contentSize.width  || 720;
        const h   = uit.contentSize.height || 1280;
        uit.anchorPoint = new Vec2(0.5 + dx / w, 0.5 + dy / h);
    }

    // ── merge VFX ─────────────────────────────────────────────────────────

    // count scales with creature level: lv1=10, lv2=13, lv3=16, lv4=19, lv5+=22
    spawnMergeSparks(x: number, yCanvas: number, level: number): void {
        if (!this._sparkleFrame) return;
        const count   = Math.min(35, 10 + level * 4);
        const lvScale = 1.0 + level * 0.2;            // lv1=1.2 … lv5=2.0 … lv7=2.4
        const originY = yCanvas + 35 * lvScale;
        for (let i = 0; i < count; i++) {
            // launch mostly upward with horizontal spread ±60°
            const angle    = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (2 / 3);
            const launchD  = (60 + Math.random() * 90) * lvScale;
            const peakX    = x       + Math.cos(angle) * launchD;
            const peakY    = originY + Math.sin(angle) * launchD;
            const fallDrop = (50 + Math.random() * 70) * lvScale;
            const endX     = peakX + (Math.random() - 0.5) * 30 * lvScale;
            const endY     = peakY - fallDrop;

            const node = new Node('MergeSpark');
            node.setParent(this.vfxLayer);
            node.setPosition(x, originY);
            node.angle = Math.random() * 360;
            const s = 0.9 + Math.random() * 1.1;
            node.setScale(s, s, 1);

            const size = (38 + Math.random() * 36) * lvScale;
            const uit = node.addComponent(UITransform);
            uit.setContentSize(size, size);
            const sp = node.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._sparkleFrame;
            sp.color       = new Color(255, 255, 255, 255);
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] }
            });

            const op = node.addComponent(UIOpacity);
            op.opacity = 0;

            const stagger = (i / count) * 0.18;
            const t1 = 0.12 + Math.random() * 0.06;
            const t2 = 0.20 + Math.random() * 0.15;
            tween(node)
                .delay(stagger)
                .to(t1, { position: new Vec3(peakX, peakY, 0) }, { easing: 'quadOut' })
                .to(t2, { position: new Vec3(endX,  endY,  0) }, { easing: 'quadIn'  })
                .call(() => { if (node.isValid) node.destroy(); })
                .start();
            tween(op)
                .delay(stagger)
                .to(0.5, { opacity: 220 })
                .to(t2, { opacity: 0 })
                .start();
        }
    }

    flashMergeGhost(wx: number, wy: number, frame: SpriteFrame, size: number): void {
        const node = new Node('MergeGhost');
        node.setParent(this.warriorsLayer);
        node.setWorldPosition(wx, wy, 0);
        node.layer = this.warriorsLayer.layer;
        node.setScale(1, 1, 1);

        node.addComponent(UITransform).setContentSize(size, size);
        const sp = node.addComponent(Sprite);
        sp.sizeMode    = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        sp.color       = new Color(0, 0, 0, 255);

        const op = node.addComponent(UIOpacity);
        op.opacity = 255;

        tween(node)
            .to(2.0, { scale: new Vec3(0.05, 0.05, 1) }, { easing: 'quadIn' })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
        tween(op)
            .to(2.0, { opacity: 0 })
            .start();
    }

    flashMerge(mapper: { animScale: number } | null): void {
        if (!mapper) return;
        tween(mapper)
            .to(0.18, { animScale: 1.3 }, { easing: 'quadOut' })
            .to(0.08, { animScale: 0.9 })
            .to(0.06, { animScale: 1.0 })
            .start();
    }

    playLevelUpBounce(mapper: { animScale: number } | null, viewNode: Node | null): void {
        if (mapper) {
            Tween.stopAllByTarget(mapper);
            tween(mapper)
                .to(0.09, { animScale: 1.5  }, { easing: 'quadOut' })
                .to(0.07, { animScale: 0.85 })
                .to(0.06, { animScale: 1.0  })
                .start();
        }
        if (viewNode?.isValid) {
            const sp = viewNode.getComponent(Sprite);
            if (sp) {
                const golden = new Color(255, 230, 80, 255);
                const white  = new Color(255, 255, 255, 255);
                tween(sp)
                    .to(0.05, { color: golden })
                    .to(0.18, { color: white  })
                    .start();
            }
        }
    }

    // ── score / banners ───────────────────────────────────────────────────

    spawnFloatingScore(x: number, y: number, points: number, large = false): void {
        // Outer node drives the float-up position only
        const node = new Node('FloatingScore');
        node.setParent(this.uiLayer);
        node.setSiblingIndex(this.uiLayer.children.length - 1);
        node.setPosition(x, y + 75);

        // Inner node drives the bubble scale pop-in independently
        const inner = new Node('Inner');
        inner.setParent(node);
        inner.setScale(0, 0, 1);

        const isPurple = points > 2000;
        const isGolden = !isPurple && this._useGoldenText && points > 1000;
        const lbl = inner.addComponent(Label);
        lbl.string   = points >= 0 ? `+${points}` : `${points}`;
        lbl.fontSize = isPurple ? (large ? 64 : 52) : isGolden ? (large ? 58 : 46) : (large ? 44 : 34);
        lbl.isBold   = true;
        lbl.overflow      = Label.Overflow.NONE;
        lbl.color         = points < 0 ? new Color(255, 80, 80, 255) : points <= 500 ? new Color(210, 210, 210, 255) : new Color(255, 255, 255, 255);
        if (isPurple)      this._applyPurpleShine(lbl);
        else if (isGolden) this._applyGoldenShine(lbl);
        lbl.enableShadow  = true;
        lbl.shadowColor   = new Color(0, 0, 0, 180);
        lbl.shadowOffset  = new Vec2(2, -2);
        lbl.shadowBlur    = 3;
        this._applyFont(lbl);

        const opacity = inner.addComponent(UIOpacity);
        opacity.opacity = 0;

        // Bubble pop-in: scale 0 → 1 with backOut (automatic overshoot ~1.3 → settle 1.0)
        tween(inner)
            .to(0.38, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();

        // Float up — small delay so the pop-in is visible before it starts moving
        tween(node)
            .delay(0.18)
            .by(1.10, { position: new Vec3(0, 220, 0) }, { easing: 'quadOut' })
            .start();

        // Fade in fast, hold, then fade out
        tween(opacity)
            .to(0.12, { opacity: 255 })
            .delay(1.0)
            .to(0.65, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();

    }


    showRoundUpBanner(newRound: number, silhouetteFrame: SpriteFrame | null): void {
        const prevRound = newRound - 1;

        // Timing constants (game-seconds; at 0.2x slowmo these are ×5 in real time)
        const T_OV_IN    = 0.24;
        const T_WORD     = 0.18;
        const T_CUR      = 0.30;
        const T_EXIT     = 0.84;  // old number starts flying up
        const T_ENTER    = 0.96;  // new number starts rising from below
        const T_SPECIES  = 1.50;
        const T_FADEOUT  = 1.74;
        const T_DESTROY  = 2.10;
        const T_FO_DUR   = T_DESTROY - T_FADEOUT;  // 0.36

        const root = new Node('RoundUpBanner');
        root.setParent(this.uiLayer);
        root.setPosition(0, 0);

        // ── overlay (Graphics: UIOpacity not compatible, animate via onUpdate) ──
        const ovNode = new Node('Overlay');
        ovNode.setParent(root);
        ovNode.addComponent(UITransform).setContentSize(4000, 6000);
        const ovG = ovNode.addComponent(Graphics);
        const drawOv = (a: number) => {
            ovG.clear();
            ovG.fillColor = new Color(0, 0, 0, Math.round(a));
            ovG.rect(-2000, -3000, 4000, 6000);
            ovG.fill();
        };
        drawOv(0);
        const ovS = { alpha: 0 };
        tween(ovS)
            .to(T_OV_IN, { alpha: 51 }, { onUpdate: s => drawOv(s!.alpha) })
            .delay(T_FADEOUT - T_OV_IN)
            .to(T_FO_DUR, { alpha: 0 }, { onUpdate: s => drawOv(s!.alpha) })
            .call(() => { if (root.isValid) root.destroy(); })
            .start();

        // ── "ROUND" word ─────────────────────────────────────────────────────
        const wordNode = new Node('RoundWord');
        wordNode.setParent(root);
        wordNode.setPosition(0, 50);
        const wordLbl = wordNode.addComponent(Label);
        wordLbl.string   = 'ROUND';
        wordLbl.fontSize = 44;
        wordLbl.isBold   = true;
        wordLbl.overflow = Label.Overflow.NONE;
        wordLbl.color    = new Color(255, 255, 255, 255);
        this._applyFont(wordLbl);
        const wordOp = wordNode.addComponent(UIOpacity);
        wordOp.opacity = 0;
        tween(wordOp)
            .delay(T_WORD).to(0.18, { opacity: 255 })
            .delay(T_FADEOUT - T_WORD - 0.18)
            .to(T_FO_DUR, { opacity: 0 })
            .start();

        // ── old round number (exits upward + fade) ────────────────────────────
        const curNode = new Node('CurNum');
        curNode.setParent(root);
        curNode.setPosition(0, -22);
        const curLbl = curNode.addComponent(Label);
        curLbl.string   = String(prevRound);
        curLbl.fontSize = 88;
        curLbl.isBold   = true;
        curLbl.overflow = Label.Overflow.NONE;
        curLbl.color    = new Color(255, 220, 50, 255);
        this._applyFont(curLbl);
        const curOp = curNode.addComponent(UIOpacity);
        curOp.opacity = 0;
        tween(curOp)
            .delay(T_CUR).to(0.18, { opacity: 255 })
            .delay(T_EXIT - T_CUR - 0.18)
            .to(0.48, { opacity: 0 })
            .start();
        tween(curNode)
            .delay(T_EXIT)
            .to(0.48, { position: new Vec3(0, 40, 0) }, { easing: 'quadIn' })
            .start();

        // ── new round number (rises from below + fade in) ─────────────────────
        const newNode = new Node('NewNum');
        newNode.setParent(root);
        newNode.setPosition(0, -65);
        const newLbl = newNode.addComponent(Label);
        newLbl.string   = String(newRound);
        newLbl.fontSize = 88;
        newLbl.isBold   = true;
        newLbl.overflow = Label.Overflow.NONE;
        newLbl.color    = new Color(255, 220, 50, 255);
        this._applyFont(newLbl);
        const newOp = newNode.addComponent(UIOpacity);
        newOp.opacity = 0;
        tween(newOp)
            .delay(T_ENTER).to(0.48, { opacity: 255 })
            .delay(T_FADEOUT - T_ENTER - 0.48)
            .to(T_FO_DUR, { opacity: 0 })
            .start();
        tween(newNode)
            .delay(T_ENTER)
            .to(0.48, { position: new Vec3(0, -22, 0) }, { easing: 'quadOut' })
            .start();

        // ── new species reveal (optional) ─────────────────────────────────────
        if (silhouetteFrame) {
            const rowNode = new Node('NewSpeciesRow');
            rowNode.setParent(root);
            rowNode.setPosition(0, -148);
            const rowOp = rowNode.addComponent(UIOpacity);
            rowOp.opacity = 0;
            tween(rowOp)
                .delay(T_SPECIES).to(0.24, { opacity: 210 })
                .delay(T_FADEOUT - T_SPECIES - 0.24)
                .to(T_FO_DUR, { opacity: 0 })
                .start();

            const silNode = new Node('Silhouette');
            silNode.setParent(rowNode);
            silNode.setPosition(0, 30);
            silNode.addComponent(UITransform).setContentSize(76, 76);
            const silSp = silNode.addComponent(Sprite);
            silSp.sizeMode    = Sprite.SizeMode.CUSTOM;
            silSp.spriteFrame = silhouetteFrame;
            silSp.color       = new Color(0, 0, 0, 255);

            const textNode = new Node('SpeciesText');
            textNode.setParent(rowNode);
            textNode.setPosition(0, -30);
            const textLbl = textNode.addComponent(Label);
            textLbl.string   = 'a new warrior is coming...';
            textLbl.fontSize = 18;
            textLbl.isBold   = false;
            textLbl.color    = new Color(230, 230, 230, 255);
        }
    }

    // ── explosion VFX ─────────────────────────────────────────────────────

    // tier: 1=Campione(lv5), 2=Eroe(lv6), 3=Leggenda(lv7)
    // Concept: creature explodes like a star → black hole forms at the center
    // Sparkles appear at ~50-70px from centre, fade in, then pull toward centre
    // with a slightly curved trajectory; stretched in the direction of travel.
    spawnBlackhole(x: number, yCanvas: number, radius: number, _color: Color, tier = 1, level = 3): void {
        if (!this._sparkleFrame) return;

        // ── stardust overlay: flat disc parent shrinks, child rotates ──────
        if (this._stardustFrame) {
            const spawnStardust = (delay: number, size: number, rotDir: number) => {
                const dur = 0.6 + tier * 0.15;
                const parent = new Node('StardustDisc');
                parent.setParent(this.vfxLayer);
                parent.setPosition(x, yCanvas + size * 0.12);
                parent.setScale(1, 0.5, 1);
                const pUit = parent.addComponent(UITransform);
                pUit.setContentSize(size, size);
                pUit.anchorX = 0.5; pUit.anchorY = 0.5;
                const op = parent.addComponent(UIOpacity);
                op.opacity = 0;

                const child = new Node('Stardust');
                child.setParent(parent);
                child.setPosition(0, 0);
                child.setScale(1, 1, 1);
                const cUit = child.addComponent(UITransform);
                cUit.setContentSize(size, size);
                cUit.anchorX = 0.5; cUit.anchorY = 0.5;
                const sp = child.addComponent(Sprite);
                sp.sizeMode    = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = this._stardustFrame!;
                sp.color       = new Color(255, 255, 255, 255);
                sp.getMaterialInstance(0)?.overridePipelineStates({
                    blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] }
                });

                const fadeInEnd = 0.2 / dur;
                const state = { p: 0 };
                tween(state)
                    .delay(delay)
                    .to(dur, { p: 1 }, {
                        onUpdate: (target?: { p: number }) => {
                            if (!target || !parent.isValid) return;
                            const env = target.p < fadeInEnd
                                ? (target.p / fadeInEnd) * 220
                                : 220 * (1 - (target.p - fadeInEnd) / (1 - fadeInEnd));
                            op.opacity = Math.round(env * (0.5 + Math.random() * 0.5));
                            const s = Math.max(0.01, 1 - target.p * target.p);
                            parent.setScale(s, s * 0.5, 1);
                        }
                    })
                    .call(() => { if (parent.isValid) parent.destroy(); })
                    .start();

                tween(child)
                    .delay(delay)
                    .by(dur, { angle: rotDir * 360 * 1.5 })
                    .start();
            };

            const baseSize = (520 + tier * 120);
            spawnStardust(0.2, baseSize,       -1);
            spawnStardust(0.4, baseSize * 0.8, +1);
        }

        const count   = 8 + level * 5;           // lv3=23, lv4=28, lv5=33, lv6=38, lv7=43
        const lvScale = 0.6 + level * 0.15;     // lv3=1.05, lv5=1.35, lv7=1.65
        const spawnR  = (80 + level * 20) + radius * 0.70;


        for (let i = 0; i < count; i++) {
            const angle      = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * Math.PI * 1.4;
            const r          = spawnR * (0.6 + Math.random() * 1.2);
            const startX     = x       + Math.cos(angle) * r;
            const startY     = yCanvas + Math.sin(angle) * r * 0.5;  // perspective flatten
            const startAngle = Math.atan2(startY - yCanvas, startX - x);
            const twist      = -(Math.PI * 1.5 + Math.random() * Math.PI); // 1.5–2.5 clockwise turns

            const node = new Node('ExpSpark');
            node.setParent(this.vfxLayer);
            node.setPosition(startX, startY);
            node.angle = Math.random() * 360;
            const s = 0.7 + Math.random() * 0.6;
            node.setScale(0.05, 0.05, 1);

            const size = (66 + Math.random() * 200) * lvScale;
            const uit  = node.addComponent(UITransform);
            uit.setContentSize(size, size);
            const sp = node.addComponent(Sprite);
            sp.sizeMode    = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._sparkleFrame;
            sp.color       = new Color(255, 255, 255, 255);
            sp.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] }
            });

            const delay      = Math.sqrt(i / count) * 1.0 + Math.random() * 0.04;
            const spiralDur  = 0.7 + Math.random() * 0.6;   // 0.7 – 1.3 s per particle
            const decayExp   = 1.4 + Math.random() * 1.4;   // 1.4 – 2.8: tight vs loose spiral
            const rWobble    = 1 + (Math.random() - 0.5) * 0.3;  // slight radial stretch per particle

            // Spiral function: t 0→1, radius decays with varied exponent, angle winds inward
            const state = { t: 0 };
            tween(state)
                .delay(delay)
                .to(spiralDur, { t: 1 }, {
                    onUpdate: (target?: { t: number }) => {
                        if (!target) return;
                        const t  = target.t;
                        const wr = r * rWobble * (1 - Math.pow(t, decayExp));
                        const wa = startAngle + t * twist;
                        const sc = s * Math.sin(t * Math.PI);
                        if (!node.isValid) return;
                        node.setPosition(x + Math.cos(wa) * wr, yCanvas + Math.sin(wa) * wr * 0.5);
                        node.setScale(sc, sc, 1);
                    }
                })
                .call(() => { if (node.isValid) node.destroy(); })
                .start();
        }
    }

    spawnTrackClearedBanner(x: number, yCanvas: number, points: number): void {
        const root = new Node('TrackClearedBanner');
        root.setParent(this.uiLayer);
        root.setSiblingIndex(this.uiLayer.children.length - 1);
        root.setPosition(x, yCanvas);
        root.setScale(0.1, 0.1, 1);

        const scoreNode = new Node('BonusScore');
        scoreNode.setParent(root);
        scoreNode.setPosition(0, 24);
        const scoreLbl = scoreNode.addComponent(Label);
        scoreLbl.string        = `+${points}`;
        scoreLbl.fontSize      = 68;
        scoreLbl.isBold        = true;
        scoreLbl.color         = new Color(255, 230, 50, 255);
        scoreLbl.enableOutline = true;
        scoreLbl.outlineColor  = new Color(0, 0, 0, 220);
        scoreLbl.outlineWidth  = 4;

        const subNode = new Node('SubText');
        subNode.setParent(root);
        subNode.setPosition(0, -28);
        const subLbl = subNode.addComponent(Label);
        subLbl.string        = 'Track Cleared!';
        subLbl.fontSize      = 30;
        subLbl.isBold        = true;
        subLbl.color         = new Color(255, 255, 255, 255);
        subLbl.enableOutline = true;
        subLbl.outlineColor  = new Color(0, 0, 0, 200);
        subLbl.outlineWidth  = 2;

        const op = root.addComponent(UIOpacity);
        op.opacity = 255;

        tween(root)
            .to(0.22, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1.0, 1.0, 1) })
            .start();
        tween(root).by(1.8, { position: new Vec3(0, 140, 0) }).start();
        tween(op)
            .delay(1.0)
            .to(0.8, { opacity: 0 })
            .call(() => { if (root.isValid) root.destroy(); })
            .start();
    }

    spawnExplosionLabel(x: number, yCanvas: number, text: string, color: Color): void {
        if (!text) return;
        const node = new Node('ExpLabel');
        node.setParent(this.uiLayer);
        node.setSiblingIndex(this.uiLayer.children.length - 1);
        node.setPosition(x, yCanvas);
        const lbl = node.addComponent(Label);
        lbl.string   = text;
        lbl.fontSize = 40;
        lbl.isBold   = true;
        lbl.color    = color;
        const op = node.addComponent(UIOpacity);
        op.opacity = 255;
        tween(node).by(0.7, { position: new Vec3(0, 55, 0) }).start();
        tween(op).delay(0.3).to(0.4, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); }).start();
    }

    spawnBurstRing(x: number, yCanvas: number, radius: number, color: Color): void {
        const vfx = new Node('BurstVFX');
        vfx.setParent(this.vfxLayer);
        vfx.setPosition(x, yCanvas);
        const g = vfx.addComponent(Graphics);
        g.lineWidth   = 4;
        g.strokeColor = color;
        g.circle(0, 0, radius);
        g.stroke();
        const op = vfx.addComponent(UIOpacity);
        op.opacity = 200;
        tween(vfx).to(0.3, { scale: new Vec3(2, 2, 1) }).start();
        tween(op).to(0.3, { opacity: 0 })
            .call(() => { if (vfx.isValid) vfx.destroy(); }).start();
    }

    // ── implosion VFX (rings + particles; physics state stays in GameManager) ──

    spawnImplosionVFX(cx: number, cyCanvas: number, ringColor: Color, strength: number, duration: number): void {
        const vs = Math.max(strength, 0.35);

        for (let i = 0; i < 2; i++) {
            const ring = new Node('ImplosionRing');
            ring.setParent(this.vfxLayer);
            ring.setPosition(cx, cyCanvas);
            const sg = ring.addComponent(Graphics);
            sg.lineWidth   = 4 - i;
            sg.strokeColor = new Color(ringColor.r, ringColor.g, ringColor.b, Math.round((200 - i * 40) * vs));
            sg.circle(0, 0, (180 + i * 60) * vs);
            sg.stroke();
            const sop = ring.addComponent(UIOpacity);
            sop.opacity = Math.round((180 - i * 40) * vs);
            const delay = i * 0.15;
            tween(ring).delay(delay).to(duration - delay, { scale: new Vec3(0.01, 0.01, 1) }).start();
            tween(sop).delay(delay).to(duration - delay, { opacity: 0 })
                .call(() => { if (ring.isValid) ring.destroy(); }).start();
        }

        const count = Math.round(5 + 7 * vs);
        for (let i = 0; i < count; i++) {
            const angle  = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const r      = (80 + Math.random() * 80) * vs;
            const startX = cx       + Math.cos(angle) * r;
            const startY = cyCanvas + Math.sin(angle) * r;
            const midA   = angle + Math.PI / 3;
            const midX   = cx       + Math.cos(midA) * r * 0.4;
            const midY   = cyCanvas + Math.sin(midA) * r * 0.4;

            const p = new Node('ImplosionParticle');
            p.setParent(this.vfxLayer);
            p.setPosition(startX, startY);
            const g = p.addComponent(Graphics);
            g.fillColor = new Color(ringColor.r, ringColor.g, ringColor.b, 220);
            g.circle(0, 0, Math.max(2.5, (3 + Math.random() * 3) * vs));
            g.fill();
            const op = p.addComponent(UIOpacity);
            op.opacity = 220;

            const delay = Math.random() * 0.35;
            const dur   = (0.35 + Math.random() * 0.25) * (0.5 + vs * 0.5);
            tween(p)
                .delay(delay)
                .to(dur * 0.55, { position: new Vec3(midX, midY,     0) }, { easing: 'quadIn' })
                .to(dur * 0.45, { position: new Vec3(cx,   cyCanvas, 0) }, { easing: 'quadIn' })
                .call(() => { if (p.isValid) p.destroy(); })
                .start();
            tween(op)
                .delay(delay)
                .to(dur * 0.3, { opacity: 220 })
                .to(dur * 0.7, { opacity: 0 })
                .start();
        }
    }
}
