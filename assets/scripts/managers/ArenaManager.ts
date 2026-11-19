import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, Label, resources, tween, Tween, Vec3, Color, gfx } from 'cc';
import { ARENAS, ArenaConf, arenaIndexForRound, ARENA_ROUNDS, scoreMultiplierForRound, formatMultiplier } from '../data/Arenas';
import { BgFill } from '../entities/BgFill';

const { ccclass, property } = _decorator;

// Arena change timeline, seconds from the start of the round-up banner (see GameManager.advanceRound).
const BANNER_IN_AT   = 0.35;   // "NEW ARENA..." pops in
const NAME_IN_AT     = 0.75;   // arena name rises below it
const BG_FADE_AT     = 0.60;   // background cross-fade
const BG_FADE_SEC    = 1.20;
const TRACK_WIPE_AT  = 0.90;   // new track skin sweeps from the back wall to the front
const TRACK_WIPE_SEC = 1.35;
const BANNER_OUT_AT  = 2.55;
const BANNER_OUT_SEC = 0.35;
/** Total length of an arena change: the round-up pause is stretched to fit it. */
export const ARENA_CHANGE_SEC = BANNER_OUT_AT + BANNER_OUT_SEC;

const SPARKLE_FRAME = 'particles/sparkle/spriteFrame';
const GLOW_FRAME    = 'particles/aura/spriteFrame';
/** Stars of the trail behind the sweeping edge of the new track (per second of sweep). */
const SPARKLES_PER_SEC = 80;
const STAR_TINTS = [new Color(255, 245, 200, 255), new Color(255, 225, 120, 255), new Color(255, 255, 255, 255), new Color(200, 235, 255, 255)];

/**
 * Arena look: background and track skin of the arena of the current round (data/Arenas.ts).
 * Behaviour only — every node it drives is in Game.scene:
 *  - `background` (Canvas/Background) and `backgroundNext` (same size, BgFill, UIOpacity 0) for the cross-fade;
 *  - `trackSprite` (Track/TrackSprite: its size drives the walls, it is never resized here) and
 *    `trackWipe` (Mask child of TrackSprite, inactive) holding `trackNext`, the new skin revealed by the wipe;
 *  - `banner` (UILayer/ArenaBanner, inactive) with the `bannerTitle` / `bannerName` labels.
 * The wipe edge sparkles are VFX (spawned and destroyed here), not UI.
 */
@ccclass('ArenaManager')
export class ArenaManager extends Component {
    @property({ type: Sprite, tooltip: 'Canvas/Background — the arena background.' })
    background: Sprite | null = null;
    @property({ type: Sprite, tooltip: 'Canvas/BackgroundNext — fades in over Background during an arena change.' })
    backgroundNext: Sprite | null = null;
    @property({ type: Sprite, tooltip: 'Track/TrackSprite — the track skin (its size drives the walls: never resized).' })
    trackSprite: Sprite | null = null;
    @property({ type: Node, tooltip: 'TrackSprite/ArenaWipe — Mask (inactive) revealing the new skin from the back wall down.' })
    trackWipe: Node | null = null;
    @property({ type: Sprite, tooltip: 'ArenaWipe/TrackNext — the new track skin, full track size, anchored at the top.' })
    trackNext: Sprite | null = null;
    @property({ type: Node, tooltip: 'UILayer/ArenaBanner (inactive) — "NEW ARENA..." + arena name.' })
    banner: Node | null = null;
    @property({ type: Label, tooltip: 'ArenaBanner/Title — "NEW ARENA..."' })
    bannerTitle: Label | null = null;
    @property({ type: Label, tooltip: 'ArenaBanner/Name — the arena name.' })
    bannerName: Label | null = null;
    @property({ type: Label, tooltip: 'ArenaBanner/Bonus — the new score multiplier ("ALL POINTS ×1.5").' })
    bannerBonus: Label | null = null;

    private _shown = 0;                        // arena index on screen
    private _baseBg: SpriteFrame | null = null;
    private _baseTrack: SpriteFrame | null = null;
    private _frames = new Map<string, SpriteFrame>();
    private _loading = new Map<string, Promise<SpriteFrame | null>>();
    private _sparkle: SpriteFrame | null = null;
    private _glow: SpriteFrame | null = null;
    private _busy = false;

    onLoad(): void {
        this._baseBg = this.background?.spriteFrame ?? null;
        this._baseTrack = this.trackSprite?.spriteFrame ?? null;
        if (this.trackWipe) this.trackWipe.active = false;
        if (this.banner) this.banner.active = false;
        const nextOp = this.backgroundNext?.getComponent(UIOpacity);
        if (nextOp) nextOp.opacity = 0;
    }

    /** Arena index currently on screen. */
    get shownIndex(): number { return this._shown; }

    /** True while an arena change is animating. */
    get busy(): boolean { return this._busy; }

    /** Load (in the background) the frames of the arena of `round` and of the next one. */
    preloadAround(round: number): void {
        const cur = arenaIndexForRound(round);
        this._loadFx();
        this._loadArena(ARENAS[cur]);
        // From the 3rd round of an arena, fetch the next one too: it is needed at the next arena change.
        if (round % ARENA_ROUNDS >= 2) this._loadArena(ARENAS[(cur + 1) % ARENAS.length]);
    }

    /** Wait (at most `maxSec`) for the frames of the arena of `round`, so that its change plays in full. */
    prepare(round: number, maxSec = 4): Promise<void> {
        const conf = ARENAS[arenaIndexForRound(round)];
        this._loadFx();
        return Promise.race([
            this._framesOf(conf).then(() => undefined),
            new Promise<void>(ok => setTimeout(ok, maxSec * 1000)),
        ]);
    }

    /** Show the arena of `round` at once (game start / restored game): quick fade, no banner. */
    applyImmediate(round: number): void {
        const idx = arenaIndexForRound(round);
        if (idx === this._shown) { this.preloadAround(round); return; }
        void this._framesOf(ARENAS[idx]).then(([bg, track]) => {
            if (!this.isValid || arenaIndexForRound(round) !== idx) return;
            this._shown = idx;
            this._setBackground(bg);
            if (this.trackSprite && track) this.trackSprite.spriteFrame = track;
            this.preloadAround(round);
        });
    }

    /**
     * Arena change for `round` (called at the start of the round-up banner): "NEW ARENA..." banner,
     * background cross-fade, track skin wipe. Lasts ARENA_CHANGE_SEC. If the frames are not loaded
     * yet the banner still runs and the look switches as soon as they arrive.
     */
    playChange(round: number): void {
        const idx = arenaIndexForRound(round);
        const conf = ARENAS[idx];
        this._busy = true;
        this._showBanner(conf.name, scoreMultiplierForRound(round));
        this.scheduleOnce(() => { this._busy = false; }, ARENA_CHANGE_SEC);
        if (idx === this._shown) return;
        void this._framesOf(conf).then(([bg, track]) => {
            if (!this.isValid) return;
            this._shown = idx;
            this.scheduleOnce(() => this._crossFadeBackground(bg), BG_FADE_AT);
            this.scheduleOnce(() => this._wipeTrack(track), TRACK_WIPE_AT);
            this.preloadAround(round);
        });
    }

    // --- banner -------------------------------------------------------------

    private _showBanner(name: string, multiplier: number): void {
        const root = this.banner;
        if (!root) return;
        Tween.stopAllByTarget(root);
        root.active = true;
        const rootOp = root.getComponent(UIOpacity);
        if (rootOp) { Tween.stopAllByTarget(rootOp); rootOp.opacity = 255; }
        if (this.bannerName) this.bannerName.string = name;
        if (this.bannerBonus) {
            this.bannerBonus.node.active = multiplier > 1;
            this.bannerBonus.string = `ALL POINTS ${formatMultiplier(multiplier)}`;
        }

        const title = this.bannerTitle?.node;
        if (title) {
            const s = title.scale.clone();      // editor scale, restored by the pop
            const op = title.getComponent(UIOpacity);
            Tween.stopAllByTarget(title);
            title.setScale(0, 0, 1);
            if (op) op.opacity = 0;
            this.scheduleOnce(() => {
                if (op) tween(op).to(0.15, { opacity: 255 }).start();
                tween(title).to(0.32, { scale: s }, { easing: 'backOut' }).start();
            }, BANNER_IN_AT);
        }
        const nameNode = this.bannerName?.node;
        if (nameNode) {
            const p = nameNode.position.clone();  // editor position, restored by the rise
            const op = nameNode.getComponent(UIOpacity);
            Tween.stopAllByTarget(nameNode);
            nameNode.setPosition(p.x, p.y - 24, p.z);
            if (op) op.opacity = 0;
            this.scheduleOnce(() => {
                if (op) tween(op).to(0.3, { opacity: 255 }).start();
                tween(nameNode).to(0.4, { position: p }, { easing: 'quadOut' }).start();
            }, NAME_IN_AT);
        }
        this.scheduleOnce(() => {
            if (!root.isValid) return;
            if (rootOp) tween(rootOp).to(BANNER_OUT_SEC, { opacity: 0 }).call(() => { root.active = false; }).start();
            else root.active = false;
        }, BANNER_OUT_AT);
    }

    // --- background ---------------------------------------------------------

    private _setBackground(sf: SpriteFrame | null): void {
        if (!this.background || !sf) return;
        this.background.spriteFrame = sf;
        this.background.getComponent(BgFill)?.refit();
    }

    private _crossFadeBackground(sf: SpriteFrame | null): void {
        const next = this.backgroundNext;
        const op = next?.getComponent(UIOpacity);
        if (!next || !op || !sf) { this._setBackground(sf); return; }
        next.spriteFrame = sf;
        next.getComponent(BgFill)?.refit();
        Tween.stopAllByTarget(op);
        op.opacity = 0;
        tween(op).to(BG_FADE_SEC, { opacity: 255 }, { easing: 'sineInOut' })
            .call(() => { this._setBackground(sf); op.opacity = 0; })
            .start();
    }

    // --- track wipe ---------------------------------------------------------

    /**
     * The new skin sweeps down the track from the back wall to the front: the ArenaWipe mask grows
     * from the top of TrackSprite while TrackNext (full size, anchored at the top) stays still under it,
     * with a glowing, sparkling edge. At the end the skin moves to TrackSprite itself and the mask hides.
     */
    private _wipeTrack(sf: SpriteFrame | null): void {
        const track = this.trackSprite;
        const wipe = this.trackWipe;
        const next = this.trackNext;
        if (!track || !sf) return;
        const tUit = track.getComponent(UITransform);
        const wUit = wipe?.getComponent(UITransform);
        const nUit = next?.getComponent(UITransform);
        if (!wipe || !next || !tUit || !wUit || !nUit) { track.spriteFrame = sf; return; }

        const w = tUit.width, h = tUit.height;
        const topY = (1 - tUit.anchorY) * h;
        const cx = (0.5 - tUit.anchorX) * w;
        wipe.setSiblingIndex(0);                 // under TrackSprite's other children (GameOverLine)
        wipe.setPosition(cx, topY, 0);
        wUit.setAnchorPoint(0.5, 1);
        wUit.setContentSize(w, 0);
        nUit.setAnchorPoint(0.5, 1);
        nUit.setContentSize(w, h);
        next.node.setPosition(0, 0, 0);
        next.spriteFrame = sf;
        wipe.active = true;

        const edge = this._makeEdgeGlow(track.node, w);
        const state = { k: 0 };
        let sparkAcc = 0;
        let last = 0;
        tween(state)
            .to(TRACK_WIPE_SEC, { k: 1 }, {
                easing: 'sineInOut',
                onUpdate: () => {
                    const y = h * state.k;
                    wUit.setContentSize(w, y);
                    if (edge?.isValid) edge.setPosition(cx, topY - y, 0);
                    const dt = Math.max(0, state.k - last) * TRACK_WIPE_SEC;
                    last = state.k;
                    sparkAcc += dt * SPARKLES_PER_SEC;
                    while (sparkAcc >= 1) { sparkAcc -= 1; this._spawnSparkle(track.node, cx + (Math.random() - 0.5) * w * 0.86, topY - y); }
                },
            })
            .call(() => {
                track.spriteFrame = sf;
                wipe.active = false;
                if (edge?.isValid) {
                    const op = edge.getComponent(UIOpacity);
                    if (op) tween(op).to(0.25, { opacity: 0 }).call(() => edge.destroy()).start();
                    else edge.destroy();
                }
            })
            .start();
    }

    private _makeEdgeGlow(parent: Node, width: number): Node | null {
        if (!this._glow) return null;
        const n = new Node('ArenaWipeEdge');
        n.layer = parent.layer;
        n.setParent(parent);
        const uit = n.addComponent(UITransform);
        uit.setContentSize(width * 1.05, 120);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = this._glow;
        sp.color = new Color(255, 250, 225, 255);
        this._additive(sp);
        n.addComponent(UIOpacity).opacity = 230;
        return n;
    }

    /**
     * One star of the trail the sweeping edge leaves behind: it twinkles in where the edge passes,
     * lingers a moment (so the stars draw a trail above the edge as it goes down) and fades out.
     */
    private _spawnSparkle(parent: Node, x: number, y: number): void {
        if (!this._sparkle) return;
        const n = new Node('ArenaSparkle');
        n.layer = parent.layer;
        n.setParent(parent);
        n.setPosition(x, y + (Math.random() - 0.3) * 40, 0);
        const big = Math.random() < 0.22;
        const size = big ? 60 + Math.random() * 30 : 22 + Math.random() * 28;
        n.addComponent(UITransform).setContentSize(size, size * 2);  // TrackSprite is squashed ×0.5 in Y
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = this._sparkle;
        sp.color = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
        this._additive(sp);
        const op = n.addComponent(UIOpacity);
        op.opacity = 255;
        n.setScale(0, 0, 1);
        n.angle = Math.random() * 90;
        const life = 0.8 + Math.random() * 0.6;
        const s = big ? 1.15 : 1;
        tween(n)
            .to(0.14, { scale: new Vec3(s, s, 1) }, { easing: 'backOut' })
            .to(life - 0.14, { scale: new Vec3(0.25, 0.25, 1) }, { easing: 'sineIn' })
            .start();
        tween(n).by(life, { position: new Vec3((Math.random() - 0.5) * 24, 18 + Math.random() * 30, 0), angle: (Math.random() - 0.5) * 120 }).start();
        tween(op).delay(life * 0.45).to(life * 0.55, { opacity: 0 }).call(() => { if (n.isValid) n.destroy(); }).start();
    }

    private _additive(sp: Sprite): void {
        const s = sp as unknown as { srcBlendFactor: number; dstBlendFactor: number };
        s.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        s.dstBlendFactor = gfx.BlendFactor.ONE;
    }

    // --- loading ------------------------------------------------------------

    private _framesOf(conf: ArenaConf): Promise<[SpriteFrame | null, SpriteFrame | null]> {
        this._loadFx();
        return Promise.all([
            conf.bg ? this._load(conf.bg) : Promise.resolve(this._baseBg),
            conf.track ? this._load(conf.track) : Promise.resolve(this._baseTrack),
        ]);
    }

    private _loadArena(conf: ArenaConf): void {
        if (conf.bg) void this._load(conf.bg);
        if (conf.track) void this._load(conf.track);
    }

    private _load(path: string): Promise<SpriteFrame | null> {
        const cached = this._frames.get(path);
        if (cached) return Promise.resolve(cached);
        let p = this._loading.get(path);
        if (!p) {
            p = new Promise(res => {
                resources.load(path, SpriteFrame, (err, sf) => {
                    if (err || !sf) { console.warn(`[ArenaManager] cannot load ${path}`, err); this._loading.delete(path); res(null); return; }
                    this._frames.set(path, sf);
                    res(sf);
                });
            });
            this._loading.set(path, p);
        }
        return p;
    }

    private _loadFx(): void {
        if (!this._sparkle) void this._load(SPARKLE_FRAME).then(sf => { this._sparkle = sf; });
        if (!this._glow) void this._load(GLOW_FRAME).then(sf => { this._glow = sf; });
    }
}
