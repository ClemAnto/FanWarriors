import { _decorator, Component, Node, Label, Sprite, SpriteFrame, Button, UIOpacity, UITransform, Vec3, view, tween, Tween, resources, EventTouch, EventMouse, Vec2, Camera, director, gfx } from 'cc';
import { POWERUP_INFO, POWERUP_CATALOG, PowerupId, PowerupTutorialStore } from '../data/PowerupInfo';

const { ccclass, property } = _decorator;

const ICON_ORDER: PowerupId[] = ['aura', 'wildRiver', 'brotherhood', 'psychoForce'];
const LOCKED_LORE = 'Keep playing to discover this power.';
const ZOOM_MARGIN = 40;   // design px kept free around the zoomed illustration
const ZOOM_MAX = 4;       // pinch / wheel zoom cap (× the fitted size)
const INTRO_DIM_SEC = 0.35;     // the frozen scene darkens before the medallion pops
const INTRO_DIM_ALPHA = 235;    // backdrop alpha during the intro (the card's own backdrop is lighter)
const INTRO_MEDAL_SCALE = 1.7; // medallion size over the warrior (× its size in the card)
const INTRO_FLY_SEC = 0.45;     // flight into the card's medallion slot
const ZOOM_TAP_SLOP = 12; // UI px a finger may travel and still count as a tap (closes the zoom)

/**
 * Powerup tutorial modal (Game + MainMenu). Behavior only: the layout is authored in the scene
 * (tools/ui/add-powerup-panel.mjs) and this node stays INACTIVE in the editor.
 *
 *  - showSingle(id, onClosed): in game, the first time a powerup appears in a game. The host pauses
 *    the game before and resumes it in onClosed. "Don't show again" mutes it for next games.
 *  - showCatalog(): from the main menu, every catalog powerup with left/right arrows; the ones
 *    never met show the locked medallion, "???" and how to find them (no illustration).
 */
@ccclass('PowerupInfoPanel')
export class PowerupInfoPanel extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Sprite) iconSprite: Sprite | null = null;
    @property({ type: Sprite, tooltip: 'Illustration (loaded from resources/powerups on demand).' })
    artSprite: Sprite | null = null;
    @property({ type: Node, tooltip: 'Shown instead of the illustration for an undiscovered powerup.' })
    lockedNode: Node | null = null;
    @property(Label) loreLabel: Label | null = null;
    @property(Label) howLabel: Label | null = null;
    @property({ type: Node, tooltip: '"Don\'t show again" row (Button).' })
    checkRow: Node | null = null;
    @property({ type: Node, tooltip: 'Check mark inside the box (active = checked).' })
    checkMark: Node | null = null;
    @property(Node) closeButton: Node | null = null;
    @property(Node) prevButton: Node | null = null;
    @property(Node) nextButton: Node | null = null;
    @property({ type: Label, tooltip: 'Catalog page, e.g. "1 / 2" (hidden in game).' })
    pageLabel: Label | null = null;
    @property({ type: [SpriteFrame], tooltip: 'Medallions in order: Aura, Wild River, Brotherhood, Psycho Force.' })
    iconFrames: SpriteFrame[] = [];
    @property(SpriteFrame) lockedFrame: SpriteFrame | null = null;
    @property({ type: Node, tooltip: 'Fullscreen zoomed illustration (inactive); tap anywhere closes it.' })
    zoomNode: Node | null = null;
    @property(Sprite) zoomSprite: Sprite | null = null;
    @property({ type: Node, tooltip: 'Dark backdrop (faded in first by the in-game intro).' })
    dimNode: Node | null = null;
    @property({ type: Node, tooltip: 'The card (faded in after the spotlight intro).' })
    cardNode: Node | null = null;
    @property({ type: Node, tooltip: 'In-game intro (inactive): glow + burst + medallion over the warrior.' })
    spotlightNode: Node | null = null;
    @property(Node) spotlightGlow: Node | null = null;
    @property(Node) spotlightBurst: Node | null = null;
    @property(Sprite) spotlightMedal: Sprite | null = null;

    private _ids: PowerupId[] = [];
    private _index = 0;
    private _catalog = false;
    private _checked = false;
    private _onClosed: (() => void) | null = null;
    private _closing = false;
    private _wired = false;
    private _intro = false;   // spotlight intro running: the card is not interactive yet
    private _dimAlpha = -1;   // the backdrop's editor alpha (restored after the darker intro)
    private _cardScale = -1;  // the card's editor scale (the intro scales it in from 0.9× of it)

    get isOpen(): boolean { return this.node.active && !this._closing; }

    /** Medallion of a powerup (also used by the in-game badge above the warrior). */
    iconFor(id: PowerupId): SpriteFrame | null { return this.iconFrames[ICON_ORDER.indexOf(id)] ?? null; }

    /** In-game: one powerup, no arrows. Checked box on close = don't show it in the next games.
     *  `from` (the medallion above the warrior, or the warrior): the scene dims first and the
     *  medallion pops big right there, then flies into the card while the card fades in. */
    showSingle(id: PowerupId, onClosed: () => void, from: Node | null = null): void {
        this._ids = [id];
        this._catalog = false;
        this._onClosed = onClosed;
        this._open(0, from);
    }

    /** Main menu: all catalog powerups, starting from the first one already discovered. */
    showCatalog(): void {
        this._ids = POWERUP_CATALOG.slice();
        if (!this._ids.length) return;
        this._catalog = true;
        this._onClosed = null;
        const first = this._ids.findIndex(id => PowerupTutorialStore.isSeen(id));
        this._open(Math.max(0, first));
    }

    private _open(index: number, from: Node | null = null): void {
        this._wire();
        this._closing = false;
        this._stopIntro();
        this.node.active = true;
        const op = this._opacity();
        Tween.stopAllByTarget(op);
        const intro = !!from?.isValid && !!this.spotlightNode && !!this.spotlightMedal && !!this.cardNode && !!this.dimNode;
        if (intro) op.opacity = 255;
        else { op.opacity = 0; tween(op).to(0.2, { opacity: 255 }).start(); }
        const many = this._catalog && this._ids.length > 1;
        if (this.prevButton) this.prevButton.active = many;
        if (this.nextButton) this.nextButton.active = many;
        if (this.pageLabel) this.pageLabel.node.active = many;
        this._show(index);
        if (intro) this._playIntro(from!);
    }

    // ------------------------------------------------------------------ spotlight intro

    private _fade(n: Node | null): UIOpacity | null {
        return n ? (n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity)) : null;
    }

    /** Position of `n` (any layer / camera) in this panel's local space. */
    private _toPanel(n: Node): Vec3 {
        const scene = director.getScene();
        const cams = scene ? scene.getComponentsInChildren(Camera).filter(c => c.node.activeInHierarchy) : [];
        const src = cams.find(c => (c.visibility & n.layer) !== 0);
        const dst = cams.find(c => (c.visibility & this.node.layer) !== 0);
        let world = n.worldPosition.clone();
        if (src && dst && src !== dst) world = dst.screenToWorld(src.worldToScreen(world));
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(world);
    }

    private _additive(n: Node | null): void {
        n?.getComponent(Sprite)?.getMaterialInstance(0)?.overridePipelineStates({
            blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] },
        });
    }

    /** Dim the frozen scene, pop the medallion big over `from` on a glow + rotating burst, hold a
     *  beat, then fly it into the card's medallion slot while the card fades and scales in. */
    private _playIntro(from: Node): void {
        const spot = this.spotlightNode!, medal = this.spotlightMedal!, card = this.cardNode!;
        const glow = this.spotlightGlow, burst = this.spotlightBurst;
        this._intro = true;

        const dimOp = this._fade(this.dimNode)!;
        dimOp.opacity = 0;
        tween(dimOp).to(INTRO_DIM_SEC, { opacity: 255 }, { easing: 'quadOut' }).start();
        // Darker than the card's backdrop while the medallion is alone on screen.
        const dimSp = this.dimNode!.getComponent(Sprite);
        if (dimSp) {
            if (this._dimAlpha < 0) this._dimAlpha = dimSp.color.a;
            const c = dimSp.color.clone(); c.a = INTRO_DIM_ALPHA; dimSp.color = c;
        }
        const cardOp = this._fade(card)!;
        cardOp.opacity = 0;
        if (this._cardScale < 0) this._cardScale = card.scale.x;   // editor value: the card grows back to it
        card.setScale(this._cardScale * 0.9, this._cardScale * 0.9, 1);
        if (this.iconSprite) this.iconSprite.enabled = false;   // the flying medallion takes its place

        medal.spriteFrame = this.iconFor(this._ids[0]);
        spot.active = true;
        spot.setPosition(this._toPanel(from));
        medal.node.setScale(0, 0, 1);
        medal.node.setPosition(0, 0, 0);
        const S = INTRO_MEDAL_SCALE, popAt = INTRO_DIM_SEC * 0.5;
        tween(medal.node)
            .delay(popAt)
            .to(0.32, { scale: new Vec3(S, S, 1) }, { easing: 'backOut' })
            .to(0.28, { scale: new Vec3(S * 1.08, S * 1.08, 1) }, { easing: 'sineInOut' })
            .to(0.28, { scale: new Vec3(S, S, 1) }, { easing: 'sineInOut' })
            .to(0.28, { scale: new Vec3(S * 1.08, S * 1.08, 1) }, { easing: 'sineInOut' })
            .to(0.28, { scale: new Vec3(S, S, 1) }, { easing: 'sineInOut' })
            .call(() => this._flyIntoCard())
            .start();
        for (const n of [glow, burst]) {
            if (!n) continue;
            this._additive(n);
            const op = this._fade(n)!;
            op.opacity = 0;
            n.setScale(0, 0, 1);
            n.setPosition(0, 0, 0);
            n.angle = 0;
            tween(op).delay(popAt).to(0.25, { opacity: 255 }).start();
            tween(n).delay(popAt).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).call(() => {
                if (n === burst) tween(n).by(4, { angle: -180 }).repeatForever().start();
                else tween(n).repeatForever(tween<Node>()
                    .to(0.35, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineInOut' })
                    .to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
            }).start();
        }
    }

    private _flyIntoCard(): void {
        const spot = this.spotlightNode!, medal = this.spotlightMedal!, card = this.cardNode!;
        // Final slot = card position + icon offset at the card's final scale (the card is still at 0.9×).
        const cs = this._cardScale;
        const icon = this.iconSprite?.node;
        const target = card.position.clone();
        if (icon && icon.parent === card) target.add3f(icon.position.x * cs, icon.position.y * cs, 0);
        target.subtract(spot.position);
        const ms = cs * (icon?.scale.x ?? 1);
        tween(medal.node)
            .to(INTRO_FLY_SEC, { position: target, scale: new Vec3(ms, ms, 1) }, { easing: 'quadInOut' })
            .call(() => this._stopIntro())
            .start();
        for (const n of [this.spotlightGlow, this.spotlightBurst]) {
            if (!n) continue;   // the halo travels with the medallion and fades on the way
            tween(n.getComponent(UIOpacity) ?? this._fade(n)!).to(INTRO_FLY_SEC, { opacity: 0 }, { easing: 'quadIn' }).start();
            tween(n).to(INTRO_FLY_SEC, { position: target.clone() }, { easing: 'quadInOut' }).start();
        }
        tween(this._fade(card)!).delay(INTRO_FLY_SEC * 0.3).to(0.3, { opacity: 255 }).start();
        const dimSp = this.dimNode?.getComponent(Sprite);
        if (dimSp && this._dimAlpha >= 0) {
            const c = dimSp.color.clone(); c.a = this._dimAlpha;
            tween(dimSp).to(INTRO_FLY_SEC, { color: c }).start();
        }
        tween(card).delay(INTRO_FLY_SEC * 0.3).to(0.34, { scale: new Vec3(cs, cs, 1) }, { easing: 'backOut' }).start();
    }

    /** End (or abort) the intro: spotlight hidden, card and backdrop fully visible and interactive. */
    private _stopIntro(): void {
        const spot = this.spotlightNode;
        for (const n of [spot, this.spotlightGlow, this.spotlightBurst, this.spotlightMedal?.node ?? null]) {
            if (!n) continue;
            Tween.stopAllByTarget(n);
            const op = n.getComponent(UIOpacity);
            if (op) Tween.stopAllByTarget(op);
        }
        if (spot) spot.active = false;
        if (this._intro) {
            for (const n of [this.dimNode, this.cardNode]) {
                const op = n?.getComponent(UIOpacity);
                if (op) { Tween.stopAllByTarget(op); op.opacity = 255; }
            }
            if (this.cardNode && this._cardScale > 0) { Tween.stopAllByTarget(this.cardNode); this.cardNode.setScale(this._cardScale, this._cardScale, 1); }
            const dimSp = this.dimNode?.getComponent(Sprite);
            if (dimSp && this._dimAlpha >= 0) {
                Tween.stopAllByTarget(dimSp);
                const c = dimSp.color.clone(); c.a = this._dimAlpha; dimSp.color = c;
            }
            if (this.iconSprite) this.iconSprite.enabled = true;
        }
        this._intro = false;
    }

    private _wire(): void {
        if (this._wired) return;
        this._wired = true;
        const on = (n: Node | null, fn: () => void): void => {
            if (!n) return;
            (n.getComponent(Button) ?? n.addComponent(Button));
            n.on(Button.EventType.CLICK, () => { if (!this._intro) fn(); }, this);
        };
        on(this.closeButton, () => this._close());
        on(this.prevButton, () => this._show(this._index - 1));
        on(this.nextButton, () => this._show(this._index + 1));
        on(this.checkRow, () => this._setChecked(!this._checked));
        on(this.artSprite?.node ?? null, () => this._openZoom());
    }

    private _show(index: number): void {
        this._closeZoom(true);
        const n = this._ids.length;
        this._index = ((index % n) + n) % n;
        const id = this._ids[this._index];
        const info = POWERUP_INFO[id];
        const known = !this._catalog || PowerupTutorialStore.isSeen(id);
        if (this.titleLabel) this.titleLabel.string = known ? info.name : '???';
        if (this.iconSprite) this.iconSprite.spriteFrame = known ? this.iconFor(id) : this.lockedFrame;
        if (this.loreLabel) this.loreLabel.string = known ? info.lore : LOCKED_LORE;
        if (this.howLabel) this.howLabel.string = info.how;
        if (this.pageLabel) this.pageLabel.string = `${this._index + 1} / ${n}`;
        if (this.lockedNode) this.lockedNode.active = !known;
        if (this.checkRow) this.checkRow.active = known;
        this._setChecked(known && PowerupTutorialStore.isMuted(id), false);
        this._loadArt(known ? info.art : null);
    }

    private _loadArt(path: string | null): void {
        const sp = this.artSprite;
        if (!sp) return;
        sp.node.active = false;
        if (!path) return;
        const want = path;
        resources.load(`${path}/spriteFrame`, SpriteFrame, (err, sf) => {
            if (err || !sf || !sp.isValid) { if (err) console.warn(`[PowerupInfo] art not loaded: ${path}`, err); return; }
            // Still the page on screen (the player may have flipped meanwhile)?
            if (POWERUP_INFO[this._ids[this._index]]?.art !== want || !this.node.active) return;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = sf;
            sp.node.active = true;
        });
    }

    /** `persist`: catalog changes are saved at once (no "close" semantics there). */
    private _setChecked(on: boolean, persist = true): void {
        this._checked = on;
        if (this.checkMark) this.checkMark.active = on;
        if (persist && this._catalog) PowerupTutorialStore.setMuted(this._ids[this._index], on);
    }

    /** Tap on the illustration: as big as the screen allows, always upright for the way the device is
     *  held right now (no 90° turn on portrait: the player must not rotate the phone to read it). */
    private _openZoom(): void {
        const art = this.artSprite, zoom = this.zoomNode, big = this.zoomSprite;
        if (!art?.spriteFrame || !art.node.active || !zoom || !big) return;
        big.sizeMode = Sprite.SizeMode.CUSTOM;
        big.spriteFrame = art.spriteFrame;
        Tween.stopAllByTarget(big.node);
        this._zoomScale = 1;
        this._fingers.clear();
        big.node.setPosition(0, 0, 0);
        this._fitZoom();
        this._wireZoomGestures();
        zoom.active = true;
        const op = zoom.getComponent(UIOpacity) ?? zoom.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        big.node.setScale(0.85, 0.85, 1);
        this._zoomAnimating = true;
        tween(op).to(0.18, { opacity: 255 }).start();
        tween(big.node).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => { this._zoomAnimating = false; }).start();
    }

    private _zoomW = 0;
    private _zoomH = 0;
    private _zoomScale = 1;          // pinch / wheel zoom on top of the fitted size (1 = fitted)
    private _zoomAnimating = false;  // open tween owns the scale
    private _gesturesWired = false;
    private _tapMoved = 0;           // UI px travelled since the first finger went down
    private _tapMulti = false;       // a second finger joined: never a tap
    private _pinchDist = 0;          // distance between the two fingers at the last pinch step
    private _fingers = new Map<number, Vec2>();

    /** Fit the zoomed art (2:1) inside the visible area, upright. */
    private _fitZoom(): void {
        const big = this.zoomSprite;
        if (!big) return;
        const vs = view.getVisibleSize();
        this._zoomW = vs.width;
        this._zoomH = vs.height;
        const w = Math.max(1, Math.min(vs.width - ZOOM_MARGIN, (vs.height - ZOOM_MARGIN) * 2));
        big.node.getComponent(UITransform)?.setContentSize(w, w / 2);
        big.node.angle = 0;
        this._applyZoom(this._zoomScale);
    }

    /** The device turned (or the window resized) while zoomed: re-fit to the new orientation. */
    update(): void {
        if (!this.zoomNode?.active) return;
        const vs = view.getVisibleSize();
        if (vs.width !== this._zoomW || vs.height !== this._zoomH) this._fitZoom();
    }

    /** Pinch (two fingers) or mouse wheel = zoom around the fingers / pointer; drag = scroll the
     *  zoomed art; a tap without moving closes. The scene's Button on Zoom is switched off: its
     *  press-scale would fight the pinch and its click would close at the end of every drag. */
    private _wireZoomGestures(): void {
        const zoom = this.zoomNode;
        if (this._gesturesWired || !zoom) return;
        this._gesturesWired = true;
        const btn = zoom.getComponent(Button);
        if (btn) btn.enabled = false;
        // EventTouch.getAllTouches() only lists the touches that changed in that event: keep the
        // fingers currently down on Zoom ourselves (id → UI location).
        const fingers = this._fingers;
        zoom.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            if (!e.touch) return;
            if (fingers.size === 0) { this._tapMoved = 0; this._tapMulti = false; }
            fingers.set(e.touch.getID(), e.touch.getUILocation());
            if (fingers.size >= 2) { this._tapMulti = true; this._pinchDist = 0; }
        }, this);
        zoom.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            if (!e.touch) return;
            fingers.set(e.touch.getID(), e.touch.getUILocation());
            if (this._zoomAnimating) return;
            if (fingers.size >= 2) {
                const [a, b] = Array.from(fingers.values());
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (this._pinchDist > 0 && d > 0) this._zoomAt(this._zoomScale * d / this._pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
                this._pinchDist = d;
                return;
            }
            const dl = e.getUIDelta();
            this._tapMoved += Math.abs(dl.x) + Math.abs(dl.y);
            const n = this.zoomSprite?.node;
            if (!n || this._zoomScale <= 1) return;
            n.setPosition(n.position.x + dl.x, n.position.y + dl.y, 0);
            this._clampPan();
        }, this);
        const lift = (e: EventTouch, ended: boolean): void => {
            if (e.touch) fingers.delete(e.touch.getID());
            this._pinchDist = 0;
            if (fingers.size > 0) return;
            if (ended && !this._tapMulti && this._tapMoved < ZOOM_TAP_SLOP) this._closeZoom();
        };
        zoom.on(Node.EventType.TOUCH_END, (e: EventTouch) => lift(e, true), this);
        zoom.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => lift(e, false), this);
        zoom.on(Node.EventType.MOUSE_WHEEL, (e: EventMouse) => {
            if (this._zoomAnimating) return;
            const p = e.getUILocation();
            // Proportional to the wheel delta (Cocos gives -deltaY × 5): a mouse notch ≈ ×1.16,
            // a trackpad's stream of small deltas zooms smoothly instead of 1.15× per event.
            const dy = Math.max(-600, Math.min(600, e.getScrollY()));
            this._zoomAt(this._zoomScale * Math.exp(dy * 0.00025), p.x, p.y);
        }, this);
    }

    /** Zoom to `s`, keeping the art point under (uiX, uiY) still. */
    private _zoomAt(s: number, uiX: number, uiY: number): void {
        const n = this.zoomSprite?.node, zt = this.zoomNode?.getComponent(UITransform);
        if (!n || !zt) return;
        const ns = Math.min(ZOOM_MAX, Math.max(1, s));
        const f = zt.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        const k = ns / this._zoomScale;
        n.setPosition(f.x - (f.x - n.position.x) * k, f.y - (f.y - n.position.y) * k, 0);
        this._applyZoom(ns);
    }

    private _applyZoom(s: number): void {
        const n = this.zoomSprite?.node;
        if (!n) return;
        this._zoomScale = s;
        if (!this._zoomAnimating) n.setScale(s, s, 1);
        this._clampPan();
    }

    /** Keep the zoomed art covering the screen: no scrolling past its edges (centred when it fits). */
    private _clampPan(): void {
        const n = this.zoomSprite?.node, t = n?.getComponent(UITransform);
        if (!n || !t) return;
        const vs = view.getVisibleSize();
        const mx = Math.max(0, (t.width * this._zoomScale - vs.width) / 2);
        const my = Math.max(0, (t.height * this._zoomScale - vs.height) / 2);
        n.setPosition(Math.min(mx, Math.max(-mx, n.position.x)), Math.min(my, Math.max(-my, n.position.y)), 0);
    }

    private _closeZoom(instant = false): void {
        const zoom = this.zoomNode;
        if (!zoom?.active) return;
        const op = zoom.getComponent(UIOpacity) ?? zoom.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        if (instant) { zoom.active = false; return; }
        tween(op).to(0.15, { opacity: 0 }).call(() => { zoom.active = false; }).start();
    }

    private _close(): void {
        if (this._closing || !this.node.active) return;
        this._closing = true;
        this._stopIntro();
        this._closeZoom(true);
        if (!this._catalog) PowerupTutorialStore.setMuted(this._ids[0], this._checked);
        const cb = this._onClosed;
        this._onClosed = null;
        const op = this._opacity();
        Tween.stopAllByTarget(op);
        tween(op).to(0.15, { opacity: 0 }).call(() => {
            this.node.active = false;
            this._closing = false;
            cb?.();
        }).start();
    }

    private _opacity(): UIOpacity {
        return this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    }
}
