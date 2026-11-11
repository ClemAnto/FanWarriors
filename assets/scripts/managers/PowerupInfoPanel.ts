import { _decorator, Component, Node, Label, Sprite, SpriteFrame, Button, UIOpacity, UITransform, Vec3, view, tween, Tween, resources } from 'cc';
import { POWERUP_INFO, POWERUP_CATALOG, PowerupId, PowerupTutorialStore } from '../data/PowerupInfo';

const { ccclass, property } = _decorator;

const ICON_ORDER: PowerupId[] = ['aura', 'wildRiver', 'brotherhood', 'psychoForce'];
const LOCKED_LORE = 'Keep playing to discover this power.';
const ZOOM_MARGIN = 40;   // design px kept free around the zoomed illustration

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

    private _ids: PowerupId[] = [];
    private _index = 0;
    private _catalog = false;
    private _checked = false;
    private _onClosed: (() => void) | null = null;
    private _closing = false;
    private _wired = false;

    get isOpen(): boolean { return this.node.active && !this._closing; }

    /** Medallion of a powerup (also used by the in-game badge above the warrior). */
    iconFor(id: PowerupId): SpriteFrame | null { return this.iconFrames[ICON_ORDER.indexOf(id)] ?? null; }

    /** In-game: one powerup, no arrows. Checked box on close = don't show it in the next games. */
    showSingle(id: PowerupId, onClosed: () => void): void {
        this._ids = [id];
        this._catalog = false;
        this._onClosed = onClosed;
        this._open(0);
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

    private _open(index: number): void {
        this._wire();
        this._closing = false;
        this.node.active = true;
        const op = this._opacity();
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op).to(0.2, { opacity: 255 }).start();
        const many = this._catalog && this._ids.length > 1;
        if (this.prevButton) this.prevButton.active = many;
        if (this.nextButton) this.nextButton.active = many;
        if (this.pageLabel) this.pageLabel.node.active = many;
        this._show(index);
    }

    private _wire(): void {
        if (this._wired) return;
        this._wired = true;
        const on = (n: Node | null, fn: () => void): void => {
            if (!n) return;
            (n.getComponent(Button) ?? n.addComponent(Button));
            n.on(Button.EventType.CLICK, fn, this);
        };
        on(this.closeButton, () => this._close());
        on(this.prevButton, () => this._show(this._index - 1));
        on(this.nextButton, () => this._show(this._index + 1));
        on(this.checkRow, () => this._setChecked(!this._checked));
        on(this.artSprite?.node ?? null, () => this._openZoom());
        on(this.zoomNode, () => this._closeZoom());
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

    /** Tap on the illustration: as big as the screen allows. On a portrait screen it is turned 90°
     *  so the 2:1 art runs along the screen's height (about 2.5× bigger than in the card). */
    private _openZoom(): void {
        const art = this.artSprite, zoom = this.zoomNode, big = this.zoomSprite;
        if (!art?.spriteFrame || !art.node.active || !zoom || !big) return;
        big.sizeMode = Sprite.SizeMode.CUSTOM;
        big.spriteFrame = art.spriteFrame;
        const vs = view.getVisibleSize();
        const portrait = vs.height > vs.width;
        const long = (portrait ? vs.height : vs.width) - ZOOM_MARGIN;
        const short = (portrait ? vs.width : vs.height) - ZOOM_MARGIN;
        const w = Math.min(long, short * 2);
        big.node.getComponent(UITransform)?.setContentSize(w, w / 2);
        big.node.angle = portrait ? -90 : 0;
        zoom.active = true;
        const op = zoom.getComponent(UIOpacity) ?? zoom.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        Tween.stopAllByTarget(big.node);
        op.opacity = 0;
        big.node.setScale(0.85, 0.85, 1);
        tween(op).to(0.18, { opacity: 255 }).start();
        tween(big.node).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
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
