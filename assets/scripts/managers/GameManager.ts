import { _decorator, Component, PhysicsSystem2D, EPhysics2DDrawFlags, Vec2, Vec3, tween, Tween, Node, Label, Graphics, Color, UITransform, UIOpacity, Widget, Button, Toggle, director, sys, view, ResolutionPolicy, Sprite, ProgressBar } from 'cc';
import { Warrior } from '../entities/Warrior';
import { WARRIORS, LEVEL_CONFIG, spawnTypesForRound } from '../data/WarriorConfig';
import { WarriorSpriteCache } from '../utils/WarriorSpriteCache';
import { InputController } from './InputController';
import { SpawnManager } from './SpawnManager';
import { GameState } from './GameState';
import { GAME_OVER_LINE_Y, TRACK_W, TRACK_BOTTOM_Y, LAYOUT_SCALE, WALL_LB, WALL_LT, WALL_RB, WALL_RT, initLayout, Track } from '../entities/Track';
import { DebugPanel, IGameManagerDebug } from './DebugPanel';
import { CoordConverter } from '../utils/CoordConverter';
import { AudioManager, SFX } from './AudioManager';
import { VFXManager } from './VFXManager';
import { LevelBoostPowerup } from '../entities/LevelBoostPowerup';
import { BloodhoodEffect } from '../entities/BloodhoodEffect';
import { BloodhoodSparkleEffect } from '../entities/BloodhoodSparkleEffect';
const { ccclass } = _decorator;

const VERSION            = '0.8.8';
const DEBUG              = false;
const DEBUG_ENGINE       = false;
const LIVE_RESIZE        = true;   // set false in production — enables real-time relayout on browser resize
const MAX_ROUND          = 7;
const MAGNET_GAP_BASE    = 30;  // surface-to-surface px at design width — scaled by LAYOUT_SCALE
const MAGNET_FORCE_BASE  = 40;  // base force at design width — scaled by LAYOUT_SCALE
const UPWARD_DRIFT_BASE  = 0;   // slight upward push on settled warriors — keeps pile away from game over line
const WARRIOR_LINEAR_DAMPING   = 1.5; // linearDamping on active warriors — controls sliding speed decay
const WARRIOR_SETTLED_DAMPING  = 12;  // linearDamping applied when warrior stops — lower = easier to displace
const WARRIOR_VIEW_Y_OFFSET = 1.5; // viewNode lift above physics center, in units of radius
const SETTLE_VELOCITY      = 0.4;   // Box2D velocity units — warrior is "stopped" below this
const LAUNCH_CHECK_DELAY   = 0.8;   // seconds before checking if launched warrior failed to cross
const FAILED_LAUNCH_MALUS  = 50;    // score penalty when launched warrior fails to cross the line
const CROSS_LINE_FRAMES    = 3;     // consecutive frames above gol before crossedLine is committed (prevents grazing false-positive)
const GAME_OVER_FRAMES     = 3;     // consecutive frames below gol before game over triggers (prevents physics-jitter false-positive)
const AURA_SETTLE_CD         = 1.0;  // seconds after warrior settles before AURA expires
const BHS_PROX_INTERVAL      = 0.08; // seconds between BHS proximity spread checks
const BHS_PROX_MARGIN        = 60;   // extra design-px beyond touching radius to count as "near"
const BHS_CONTACT_DELAY      = 0.15; // seconds of sustained proximity before BHS spreads
const LAUNCH_TIMER       = 15;     // seconds per turn, round 1

// Cumulative totalMerges to reach each round (index = round - 1, so [1] = 10 means 10 merges → round 2)
const ROUND_THRESHOLDS = [0, 20, 40, 60, 80, 100, 120] as const;

function launchTimerForRound(round: number): number {
    return Math.max(3, 15 - (round - 1) * 2);
}

function spawnMaxLevelForRound(round: number): number {
    if (round <= 2) return 1;
    if (round <= 5) return 2;
    return 3;
}


@ccclass('GameManager')
export class GameManager extends Component implements IGameManagerDebug {
    private inputCtrl!: InputController;
    private spawnMgr!: SpawnManager;
    private warriors: Warrior[] = [];
    private framesAboveLine = new Map<Warrior, number>();
    private framesBelowLine = new Map<Warrior, number>();
    private state = GameState.Idle;
    private inflightWarrior: Warrior | null = null;
    private debugLabel: Label | null = null;
    private debugOverlay: Graphics | null = null;

    private worldNode!: Node;
    private vfxLayer!: Node;
    private box2dLayer!: Node;
    private warriorsLayer!: Node;
    private uiLayer!: Node;
    private coords!: CoordConverter;

    // game state
    private score = 0;
    private bestScore = 0;
    private currentRound = 1;
    private totalMerges = 0;
    private mergesThisLaunch = 0;
    private roundUpPause = false;
    private timerRemaining = LAUNCH_TIMER;
    private timerPaused = false;
    private waitForSettling = false;
    private sceneName = '';
    private track: Track | null = null;
    private implosionCenter: Vec2 | null = null;
    private implosionTimeLeft: number = 0;
    private implosionDuration: number = 0;
    private implosionPeakForce: number = 0;
    private cohesionTimeLeft: number = 0;
    private resizeRafId = 0;
    private _lastTickSec = -1;
    private _dangerCooldown = 0;
    private _slowmoTimer    = 0;
    private _slowmoScale    = 1.0;
    private _boostedThisTurn: Set<Warrior> = new Set();
    private _powerupSettleCds = new Map<Warrior, number>();
    private _proximityTimers = new Map<string, number>();
    private _nextSlotBoostEnergy  = -1;   // powerup energy stored in the "next" slot (-1 = none)
    private _launcherBloodhoodEffect: BloodhoodEffect | null = null;
    private _bhsActive = new Map<Warrior, BloodhoodSparkleEffect>();
    private _bhsProxTimer = 0;
    private _bhsProxTimers = new Map<Warrior, number>(); // candidate → accumulated proximity time
    private _bhLaunchWarrior: Warrior | null = null;
    private _bhLaunchEffect: BloodhoodSparkleEffect | null = null;
    private _bhsOrder: Warrior[] = [];
    private _bhsImploding = false;
    private _bhsImplodeK = 1;
    private _bhCooldownLaunches = 0;
    bloodhoodEnabled = false;
    private _firstLaunchSpecies   = new Set<number>(); // species launched for the first time this game
    private _trackClearedBonusUsed = false;
    private _bestSingleScore = 0;
    private _bestSingleScoreDesc = '';
    private _spawnLog: Map<number, Map<number, number>> = new Map();

    get bestSingleScore(): number { return this._bestSingleScore; }
    get bestSingleScoreDesc(): string { return this._bestSingleScoreDesc; }
    private vfx!: VFXManager;
    private _stateBeforePause: GameState | null = null;
    private _autoPaused = false;
    private _pauseOverlay: Node | null = null;
    private _pauseLabelNode: Node | null = null;
    private _dialogNode: Node | null = null;
    private _vibrToggle:  Toggle | null = null;
    private _sfxToggle:   Toggle | null = null;
    private _musicToggle: Toggle | null = null;
    private _fsToggle:    Toggle | null = null;
    private _syncingToggles = false;
    private _musicLabel: Label | null = null;
    private _sfxLabel:   Label | null = null;
    private _vibraLabel: Label | null = null;
    private _vibrationEnabled = true;
    private get gameOverLineLocal(): number {
        const sy = this.box2dLayer?.scale.y ?? 1;
        return sy > 0 ? GAME_OVER_LINE_Y / sy : GAME_OVER_LINE_Y;
    }

    private syncInputBounds(): void {
        this.inputCtrl.setTrackBounds(WALL_LB, WALL_LT, WALL_RB, WALL_RT);
    }

    private readonly _onVisibilityChange = (): void => {
        if (document.hidden) this._autoPause();
        else this._autoResume();
    };

    private readonly _onWindowBlur  = (): void => this._autoPause();
    private readonly _onWindowFocus = (): void => this._autoResume();

    private readonly onBrowserResize = (): void => {
        cancelAnimationFrame(this.resizeRafId);
        this.resizeRafId = requestAnimationFrame(() => {
            this.track?.relayout();
            this.inputCtrl?.relayout(LAYOUT_SCALE);
            this.syncInputBounds();
            if (this.timerSectionNode) {
                this.timerSectionNode.setPosition(0, TRACK_BOTTOM_Y + (GAME_OVER_LINE_Y - TRACK_BOTTOM_Y) * 0.2);
            }
        });
    };

    // hud refs
    private scoreLabel: Label | null = null;
    private roundLabel: Label | null = null;
    private roundProgressBar: ProgressBar | null = null;
    private nextPreviewNode: Node | null = null;
    private nextNextWarriorNode: Node | null = null;
    private _nextPreviewAuraNode: Node | null = null;
    private nextLaunchWarrior: Warrior | null = null;
    private _activeLauncherWarrior: Warrior | null = null;
    private timerLabel: Label | null = null;
    private timerSectionNode: Node | null = null;
    private _scoreProxy = { val: 0 };
    private _scoreTween: Tween<{ val: number }> | null = null;

    start() {
        this._spawnLog.clear();
        AudioManager.instance; // trigger singleton init + asset preload as early as possible
        this.scheduleOnce(() => AudioManager.instance.playMusic(), 0.5);
        AudioManager.instance.ensureMusic(); // fallback: play on first gesture if browser blocked autoplay
        this._vibrationEnabled = sys.localStorage.getItem('fw_vibration') !== '0';
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);
        initLayout();
        this.sceneName = director.getScene()?.name || 'GameScene';
        Warrior.linearDamping   = WARRIOR_LINEAR_DAMPING;
        Warrior.settledDamping  = WARRIOR_SETTLED_DAMPING;
        Warrior.viewYOffset = WARRIOR_VIEW_Y_OFFSET;
        PhysicsSystem2D.instance.enable = true;
        PhysicsSystem2D.instance.gravity = new Vec2(0, 0);
        PhysicsSystem2D.instance.debugDrawFlags = DEBUG_ENGINE
            ? EPhysics2DDrawFlags.Shape
            : EPhysics2DDrawFlags.None;

        const canvas = this.node.parent!;

        // World — single parent for all in-game nodes; apply transforms here to affect everything
        this.worldNode = canvas.getChildByName('World')
            ?? (() => { const n = new Node('World'); n.setParent(canvas); return n; })();
        this.vfxLayer = this.worldNode.getChildByName('VFXLayer')
            ?? (() => { const n = new Node('VFXLayer'); n.setParent(this.worldNode); return n; })();

        this.box2dLayer = this.worldNode.getChildByName('Box2DLayer')
            ?? (() => { console.warn('[GameManager] Box2DLayer not found in scene — created fresh (scaleY will be 1, not 0.5!)'); const n = new Node('Box2DLayer'); n.setParent(this.worldNode); return n; })();
        // Canvas repositions to designHeight/2 in world space after Widget layout, which runs after
        // start() — cannot read box2dLayer.worldPosition.y here; derive from design resolution instead.
        this.coords = new CoordConverter(this.box2dLayer.scale.y, view.getDesignResolutionSize().height / 2);

        if (DEBUG_ENGINE) {
            const overlayNode = new Node('DebugOverlay');
            overlayNode.setParent(this.box2dLayer);
            this.debugOverlay = overlayNode.addComponent(Graphics);
        }

        this.warriorsLayer = this.worldNode.getChildByName('WarriorsLayer')
            ?? (() => { console.warn('[GameManager] WarriorsLayer not found in scene — created fresh'); const n = new Node('WarriorsLayer'); n.setParent(this.worldNode); return n; })();

        this.uiLayer = canvas.getChildByName('UILayer')
            ?? (() => {
                const n = new Node('UILayer');
                n.setParent(canvas);
                n.addComponent(UITransform);
                const uiw = n.addComponent(Widget);
                uiw.isAlignLeft = uiw.isAlignRight = uiw.isAlignTop = uiw.isAlignBottom = true;
                uiw.left = uiw.right = uiw.top = uiw.bottom = 0;
                return n;
            })();
        // Ensure uiLayer renders on top of all game-world nodes
        this.uiLayer.setSiblingIndex(canvas.children.length - 1);
        this.vfx = new VFXManager(this.vfxLayer, this.uiLayer, this.worldNode, this.warriorsLayer);
        this.vfx.preloadSparkle();

        // Track.start() ran before this (higher in hierarchy) with wrong viewport — rebuild walls now
        this.track = this.worldNode.getChildByName('Track')?.getComponent(Track) ?? null;
        if (this.track) this.track.showDebugLine = DEBUG_ENGINE;
        this.track?.relayout();
        this.nextPreviewNode = this.track?.node.getChildByName('NextPreview') ?? null;

        this.inputCtrl = this.node.addComponent(InputController);
        this.inputCtrl.ropeParent = this.worldNode;
        this.inputCtrl.onLaunch     = (w, forcePct) => this.onWarriorLaunched(w, forcePct);
        this.inputCtrl.onTap        = (w) => this.cycleLauncherLevel(w);
        this.inputCtrl.getWarriors  = () => this.warriors;
        this.inputCtrl.showBounds   = DEBUG_ENGINE;
        this.nextPreviewNode?.on(Node.EventType.TOUCH_END, () => this.swapNextWithLauncher(), this);
        this.inputCtrl.initialScale = LAYOUT_SCALE;
        this.syncInputBounds();

        this.spawnMgr = this.node.addComponent(SpawnManager);
        this.spawnMgr.init(this.box2dLayer, this.warriorsLayer, spawnTypesForRound(1), this.box2dLayer.scale.y);
        this.spawnMgr.onMergeReady    = (a, b) => this.mergeWarriors(a, b);
        this.spawnMgr.onNextGenerated = ()      => this.animateNextTransition();
        this.spawnMgr.getWarriors     = ()      => this.warriors;

        const loadingSpinner = this._showLoadingSpinner();

        WarriorSpriteCache.preload(() => {
            if (loadingSpinner.isValid) loadingSpinner.destroy();
            const prefilled = this.spawnMgr.prefill();
            prefilled.forEach(w => this._recordSpawn(w.type, this.currentRound));
            this.warriors.push(...prefilled);
            const firstWarrior = this.createWarrior();
            this.initHud();
            this.debugLabel = DEBUG ? this.createDebugLabel() : null;
            this.bestScore = parseInt(sys.localStorage.getItem('fw_best_score') ?? '0', 10) || 0;
            this.showTutorial(() => this.activateWarrior(firstWarrior));

            if (DEBUG) {
                const debugNode = new Node('DebugPanel');
                debugNode.setParent(this.uiLayer);
                const panel = debugNode.addComponent(DebugPanel);
                panel.layerScaleY = this.box2dLayer.scale.y;
                panel.init(this);
            }
            if (LIVE_RESIZE && sys.isBrowser) window.addEventListener('resize', this.onBrowserResize);
            if (sys.isBrowser) {
                document.addEventListener('visibilitychange', this._onVisibilityChange);
                window.addEventListener('blur',  this._onWindowBlur);
                window.addEventListener('focus', this._onWindowFocus);
            }
        });
    }

    onDestroy() {
        director.getScheduler().setTimeScale(1.0);
        if (LIVE_RESIZE && sys.isBrowser) window.removeEventListener('resize', this.onBrowserResize);
        if (sys.isBrowser) {
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            window.removeEventListener('blur',  this._onWindowBlur);
            window.removeEventListener('focus', this._onWindowFocus);
        }
    }

    private _autoPause(): void {
        if (this.state === GameState.GameOver || this.state === GameState.Paused || this.state === GameState.Idle) return;
        this._autoPaused = true;
        this._togglePause(this._pauseLabelNode);
    }

    private _autoResume(): void {
        if (!this._autoPaused) return;
        this._autoPaused = false;
        if (this.state === GameState.Paused) this._togglePause(this._pauseLabelNode);
    }

    // ── IGameManagerDebug ──

    isTimerPaused(): boolean { return this.timerPaused; }

    setTimerPaused(v: boolean): void {
        this.timerPaused = v;
        this.inputCtrl.launchEnabled = !v;
        // Sospendi/ripristina merge logic su tutti i warrior in pista
        for (const w of this.warriors) {
            if (!w.crossedLine || !w.node?.isValid) continue;
            w.onMergeReady = v ? null : (a, b) => this.mergeWarriors(a, b);
        }
    }

    pauseGrabWarrior(w: Warrior): void { w.setDragMode(true); }
    pauseDropWarrior(w: Warrior): void { w.setDragMode(false); }

    getCurrentRound(): number { return this.currentRound; }

    setDebugRound(r: number): void {
        this.currentRound = Math.max(1, Math.min(MAX_ROUND, r));
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this.updateRoundLabel();
    }

    getTotalMerges(): number { return this.totalMerges; }

    setTotalMerges(n: number): void {
        this.totalMerges = Math.max(0, n);
        this.updateRoundProgress();
    }

    getWarriors(): readonly Warrior[] { return this.warriors; }

    addDebugWarrior(type: number, level: number, x: number, y: number): void {
        const w = Warrior.spawn(this.box2dLayer, this.warriorsLayer, type, level, x, y);
        w.crossedLine = true;
        w.fired = true;
        w.settle();
        w.onMergeReady = this.timerPaused ? null : (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(w);
    }

    cycleDebugWarriorLevel(w: Warrior): void {
        if (!w.node?.isValid) return;
        const pos      = w.node.position.clone();
        const type     = w.type;
        const maxLevel = WARRIORS[type]?.maxLevel ?? 7;
        const newLevel = w.level < maxLevel ? w.level + 1 : 1;
        this.warriors  = this.warriors.filter(x => x !== w);
        this.framesAboveLine.delete(w);
        this.framesBelowLine.delete(w);
        w.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, type, newLevel, pos.x, pos.y);
        nw.crossedLine  = true;
        nw.fired        = true;
        nw.settle();
        nw.onMergeReady = this.timerPaused ? null : (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(nw);
    }

    saveDebugState(): void {
        const state = {
            warriors: this.warriors
                .filter(w => w.crossedLine && w.node?.isValid)
                .map(w => ({ type: w.type, level: w.level, x: w.node.position.x, y: w.node.position.y })),
            round: this.currentRound,
            totalMerges: this.totalMerges,
        };
        sys.localStorage.setItem('fw_debug_state', JSON.stringify(state));
    }

    loadDebugState(): void {
        const raw = sys.localStorage.getItem('fw_debug_state');
        if (!raw) { console.warn('[GameManager] debug: no saved state'); return; }
        const state = JSON.parse(raw) as { warriors: { type: number; level: number; x: number; y: number }[]; round: number; totalMerges: number };

        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
        });

        for (const s of state.warriors) this.addDebugWarrior(s.type, s.level, s.x, s.y);

        this.currentRound = Math.max(1, Math.min(MAX_ROUND, state.round));
        this.totalMerges  = Math.max(0, state.totalMerges);
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this.updateRoundLabel();
        this.updateRoundProgress();
    }

    resetDebugState(): void {
        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
        });
        // this.warriors.push(...this.spawnMgr.prefill());

        this.currentRound     = 1;
        this.totalMerges      = 0;
        this.mergesThisLaunch = 0;
        this.score            = 0;
        this._bestSingleScore = 0;
        this._bestSingleScoreDesc = '';
        this._spawnLog.clear();
        this._trackClearedBonusUsed = false;
        this._scoreTween?.stop();
        this._scoreTween = null;
        this._scoreProxy.val  = 0;
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(1));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(1));
        this.timerRemaining = launchTimerForRound(1);
        this.updateRoundLabel();
        this.updateRoundProgress();
        this.updateScoreLabel();
    }

    setLauncherBlocked(v: boolean): void {
        this.inputCtrl.blocked = v;
    }

    debugWin(): void { this.triggerVictory(); }

    toggleBloodhood(): void {
        this.bloodhoodEnabled = !this.bloodhoodEnabled;
        if (this._activeLauncherWarrior) {
            this._launcherBloodhoodEffect?.detach();
            this._launcherBloodhoodEffect = null;
            if (this.bloodhoodEnabled) {
                this._launcherBloodhoodEffect = BloodhoodEffect.attach(
                    this._activeLauncherWarrior, this.vfx.sparkleFrame, this.vfx.auraFrame);
            }
        }
    }

    isBloodhoodAvailable(): boolean {
        if (this._bhCooldownLaunches > 0) return false;
        if (this._activeLauncherWarrior?.levelBoost) return false;
        return this.warriors.filter(w => w.crossedLine && w.node?.isValid).length > 30;
    }
    isBloodhoodEnabled(): boolean { return this.bloodhoodEnabled; }

    private _logOnTrack(event: string): void {
        const n = this.warriors.filter(w => w.crossedLine && w.node?.isValid).length;
        console.log(`[track] ${event} → ${n} warrior${n !== 1 ? 's' : ''} on track`);
    }

    private _logSpeciesCounts(): void {
        const typeCounts = new Map<number, number>();
        for (const w of this.warriors) typeCounts.set(w.type, (typeCounts.get(w.type) ?? 0) + 1);
        const log = [...typeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${WARRIORS[t]?.name ?? t}=${n}`)
            .join(' ');
        console.log(`[species] ${log} | cd=${this._bhCooldownLaunches}`);
    }

    update(dt: number) {
        this.vfx.tick(dt);
        this.tickSlowmo(dt);
        this._sortWarriorLayerByY();
        if (this.state === GameState.GameOver || this.state === GameState.Paused) return;
        if (!this.roundUpPause) this._checkProximityMerge(dt);
        if (this.debugOverlay) {
            const g = this.debugOverlay;
            g.clear();
            g.strokeColor = new Color(0, 255, 0, 180);
            g.lineWidth = 6;
            for (const w of this.warriors) {
                if (!w.node?.isValid) continue;
                const p   = w.node.position;
                const r   = w.radius;
                const rad = w.node.angle * Math.PI / 180;
                g.circle(p.x, p.y, r);
                g.stroke();
                g.moveTo(p.x, p.y);
                g.lineTo(p.x + Math.cos(rad) * r, p.y + Math.sin(rad) * r);
                g.stroke();
            }
        }
        try {
            if (this.warriors.some(w => !w?.node?.isValid)) {
                this.warriors = this.warriors.filter(w => {
                    if (!w?.node?.isValid) {
                        if (w) { this.framesAboveLine.delete(w); this.framesBelowLine.delete(w); }
                        return false;
                    }
                    return true;
                });
            }
            this.zSortWarriors();
            if (!this.roundUpPause) {
                if (!this.timerPaused) {
                    this.applyMagnetism();
                    this.applyUpwardDrift();
                }
                if (this.cohesionTimeLeft > 0) { this.applyCohesion(); this.cohesionTimeLeft -= dt; }
                if (this.implosionCenter) this.applyVortexImplosion(dt);
                this.checkLineLogic(dt);
            }
            this._tickPowerupExpiry(dt);
            if (this._bhLaunchWarrior?.node?.isValid) {
                if (this._bhLaunchWarrior.velocity.length() < SETTLE_VELOCITY) {
                    this._bhLaunchWarrior.onBloodhoodContact = null;
                    this._bhLaunchWarrior = null;
                    this._bhLaunchEffect?.detach();
                    this._bhLaunchEffect = null;
                    this.bloodhoodEnabled = false;
                    this.scheduleOnce(() => this._startBHSCascade(), 0.3);
                }
            } else if (this._bhLaunchWarrior) {
                this._bhLaunchWarrior = null;
                this._bhLaunchEffect?.detach();
                this._bhLaunchEffect = null;
                this.bloodhoodEnabled = false;
                this.scheduleOnce(() => this._startBHSCascade(), 0.3);
            }
            if (this._bhsActive.size > 0) {
                this._bhsProxTimer += dt;
                if (this._bhsProxTimer >= BHS_PROX_INTERVAL) {
                    this._bhsProxTimer = 0;
                    this._tickBHSProximity();
                }
            }
            if (this.state === GameState.Settling) this.checkSettled();
            if (this.state === GameState.Aiming)   this.tickTimer(dt);
            this.updateDebugLabel();
        } catch (e) {
            console.error('[GameManager] update error (skipping frame):', e);
        }
    }

    // --- spawn flow ---

    private createWarrior(): Warrior {
        const w = this.spawnMgr.spawnNext();
        this._recordSpawn(w.type, this.currentRound);
        if (w.mapper) w.mapper.animScale = 0;
        // PerspectiveMapper.lateUpdate hasn't run yet for this brand-new component — hide viewNode
        // immediately so it doesn't flash at (0,0) for the first rendered frame.
        if (w.viewNode?.isValid) w.viewNode.setScale(0, 0, 1);
        this.warriors.push(w);
        this.nextLaunchWarrior = w;
        return w;
    }

    private activateWarrior(w: Warrior): void {
        this._activeLauncherWarrior = w;
        this.inputCtrl.setWarrior(w);
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this.mergesThisLaunch = 0;
        this.state = GameState.Aiming;
        this.updateTimerLabel();

        this._boostedThisTurn.clear();

        this._nextSlotBoostEnergy = -1;

        if (!this._firstLaunchSpecies.has(w.type)) {
            this._firstLaunchSpecies.add(w.type);
            const energy = w.type - 2;
            if (energy > 0) {
                const lb = LevelBoostPowerup.attach(w, energy, this.vfx.sparkleFrame, this.vfx.auraFrame);
                w.levelBoost = lb;
                w.onAuraContact = (s, t) => this._onAuraContact(s, t);
            }
        }

        this._launcherBloodhoodEffect?.detach();
        this._launcherBloodhoodEffect = null;
        if (!w.levelBoost && this._bhCooldownLaunches === 0) {
            this.bloodhoodEnabled = this.warriors.filter(ww => ww.crossedLine && ww.node?.isValid).length > 30;
        } else {
            this.bloodhoodEnabled = false;
        }
        if (this.bloodhoodEnabled) {
            this._launcherBloodhoodEffect = BloodhoodEffect.attach(w, this.vfx.sparkleFrame, this.vfx.auraFrame);
        }
    }

    private onWarriorLaunched(w: Warrior, forcePct = 1): void {
        const launchY = w.node.position.y;
        if (launchY >= this.gameOverLineLocal) {
            console.error(`[GameManager] LAUNCH ERROR: warrior localY=${launchY.toFixed(1)} >= gameOverLineLocal=${this.gameOverLineLocal.toFixed(1)} — aborting launch`);
            return;
        }
        this._launcherBloodhoodEffect?.detach();
        this._launcherBloodhoodEffect = null;
        if (this.bloodhoodEnabled) {
            this._bhCooldownLaunches = 10;
            this._bhsOrder = [];
            this._bhsImploding = false;
            this._bhsImplodeK = 1;
            w.isBHLauncher = true;
            w.onBloodhoodContact = (s, t) => this._onBloodhoodContact(s, t);
            this._bhLaunchWarrior = w;
            this._bhLaunchEffect = BloodhoodSparkleEffect.attach(w);
        } else if (this._bhCooldownLaunches > 0) {
            this._bhCooldownLaunches--;
        }
        this.state = GameState.Inflight;
        this.inflightWarrior = w;
        this._lastTickSec = -1;

        AudioManager.instance.play(SFX.LAUNCH, Math.max(0.3, forcePct));
        this.scheduleOnce(() => this.checkLaunchResult(w), LAUNCH_CHECK_DELAY);
        this._logSpeciesCounts();
    }

    private checkSettled(): void {
        if (this.roundUpPause) return;
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        inPlay.forEach(w => { if (w.velocity.length() < SETTLE_VELOCITY) w.forceStop(); });
        if (!inPlay.every(w => w.velocity.length() < SETTLE_VELOCITY)) return;
        if (this._bhsActive.size > 0 || this._bhLaunchWarrior !== null) return;

        AudioManager.instance.play(SFX.LAND, 0.5);
        this.activateWarrior(this.createWarrior());
    }

    // --- line / game over logic ---

    private checkLaunchResult(w: Warrior): void {
        if (!w.node?.isValid || w.crossedLine || this.state === GameState.GameOver) return;
        if (this.inflightWarrior !== w) return;
        if (this.roundUpPause) { this.scheduleOnce(() => this.checkLaunchResult(w), 0.3); return; }
        if (w.node.position.y >= this.gameOverLineLocal) return;
        if (w.velocity.length() < SETTLE_VELOCITY) {
            if (w.hitOtherWarrior) {
                w.playGameOverEffect();
                this.triggerGameOver();
            } else {
                this.penaliseAndReturn(w);
            }
        } else {
            this.scheduleOnce(() => this.checkLaunchResult(w), 0.3);
        }
    }

    private penaliseAndReturn(w: Warrior): void {
        this.score = Math.max(0, this.score - FAILED_LAUNCH_MALUS);
        this.vfx.screenShake(5, 0.18);
        AudioManager.instance.play(SFX.MALUS);
        this.vfx.spawnFloatingScore(w.node.position.x, this.coords.physToVisual(w.node.position.y), -FAILED_LAUNCH_MALUS);
        this.updateScoreLabel();

        w.launched = false;
        w.forceStop();
        w.setDragMode(true);

        const spawnY = (GAME_OVER_LINE_Y + TRACK_BOTTOM_Y) / 2;
        tween(w.node)
            .to(0.55, { position: new Vec3(0, spawnY, 0) }, { easing: 'quadOut' })
            .call(() => {
                if (!w.node?.isValid) return;
                w.setDragMode(false);
                w.resetPhysics();
                this.activateWarrior(w);
            })
            .start();
    }

    private checkLineLogic(dt: number): void {
        let anyDanger = false;
        const gol = this.gameOverLineLocal;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging) continue;
            const y = w.node.position.y;

            if (!w.crossedLine && w.launched) {
                if (y >= gol) {
                    // Require sustained above-line to prevent a brief graze from committing crossedLine
                    const n = (this.framesAboveLine.get(w) ?? 0) + 1;
                    this.framesAboveLine.set(w, n);
                    if (n >= CROSS_LINE_FRAMES) {
                        this.framesAboveLine.delete(w);
                        this.framesBelowLine.delete(w);
                        w.crossedLine = true;
                        w.settled = true;
                        w.levelBoost?.resetActivation();
                        if (this.state === GameState.Inflight) {
                            if (this.waitForSettling || this._bhLaunchWarrior !== null || this._bhsActive.size > 0) {
                                this.state = GameState.Settling;
                            } else {
                                this.activateWarrior(this.createWarrior());
                            }
                        }
                    }
                } else {
                    this.framesAboveLine.delete(w);
                }
            } else if (w.crossedLine && w.settled && w.fired) {
                const bottom = y - w.radius;
                if (w !== this.inflightWarrior && bottom <= gol) anyDanger = true;
                if (y < gol) {
                    // Require sustained below-line to avoid single-frame physics-jitter game over
                    const n = (this.framesBelowLine.get(w) ?? 0) + 1;
                    this.framesBelowLine.set(w, n);
                    if (n >= GAME_OVER_FRAMES) {
                        this.framesBelowLine.delete(w);
                        this.penaltyExplode(w);
                        return;
                    }
                } else {
                    this.framesBelowLine.delete(w);
                }
            }
        }
        this.track?.setLinePulse(anyDanger);
        if (anyDanger) {
            this._dangerCooldown -= dt;
            if (this._dangerCooldown <= 0) {
                this._dangerCooldown = 0.9;
                AudioManager.instance.play(SFX.DANGER, 0.6);
            }
        } else {
            this._dangerCooldown = 0;
        }
    }

    private penaltyExplode(w: Warrior): void {
        if (this.timerPaused) return;
        w.playGameOverEffect();
        this.triggerGameOver();
    }

    private cycleLauncherLevel(w: Warrior): void {
        const maxLevel = Object.keys(LEVEL_CONFIG).length;
        const newLevel = (w.level % maxLevel) + 1;
        const pos = w.node.position;
        this.warriors = this.warriors.filter(x => x !== w);
        this.framesAboveLine.delete(w);
        this.framesBelowLine.delete(w);
        w.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, w.type, newLevel, pos.x, pos.y);
        this.warriors.push(nw);
        this.inputCtrl.setWarrior(nw);
        if (nw.mapper) nw.mapper.animScale = 0;
        if (nw.viewNode?.isValid) nw.viewNode.setScale(0, 0, 1);
        this.nextLaunchWarrior = nw;
        if (nw.mapper) {
            tween(nw.mapper)
                .to(0.18, { animScale: 1.2 }, { easing: 'quadOut' })
                .to(0.08, { animScale: 0.9 })
                .to(0.06, { animScale: 1.0 })
                .call(() => { if (this.nextLaunchWarrior === nw) this.nextLaunchWarrior = null; })
                .start();
        }
    }

    private swapNextWithLauncher(): void {
        if (this.state !== GameState.Aiming || !this.inputCtrl.launchEnabled) return;
        const cur = this._activeLauncherWarrior;
        if (!cur?.node?.isValid) return;

        const curType  = cur.type;
        const curLevel = cur.level;
        const { type: nextType, level: nextLevel } = this.spawnMgr.next;

        const spawnX = cur.node.position.x;
        const spawnY = cur.node.position.y;

        // Bidirectional swap: launcher energy → next slot, next slot energy → new launcher
        const curEnergy  = cur.levelBoost?.energy ?? -1;
        const nextEnergy = this._nextSlotBoostEnergy;
        cur.levelBoost = null;
        this._nextSlotBoostEnergy = curEnergy;

        this.warriors = this.warriors.filter(w => w !== cur);
        this.framesAboveLine.delete(cur);
        this.framesBelowLine.delete(cur);
        cur.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, nextType, nextLevel, spawnX, spawnY);
        nw.onMergeReady = (a, b) => this.mergeWarriors(a, b);
        if (nw.mapper) nw.mapper.animScale = 0;
        if (nw.viewNode?.isValid) nw.viewNode.setScale(0, 0, 1);
        this.warriors.push(nw);
        this._activeLauncherWarrior = nw;
        this.nextLaunchWarrior = nw;

        let effectiveEnergy = nextEnergy;
        if (!this._firstLaunchSpecies.has(nw.type)) {
            this._firstLaunchSpecies.add(nw.type);
            const firstEnergy = nw.type - 2;
            if (firstEnergy > effectiveEnergy) effectiveEnergy = firstEnergy;
        }
        if (effectiveEnergy >= 0) {
            const lb = LevelBoostPowerup.attach(nw, effectiveEnergy, this.vfx.sparkleFrame, this.vfx.auraFrame);
            nw.levelBoost = lb;
            nw.onAuraContact = (s, t) => this._onAuraContact(s, t);
        }

        this._launcherBloodhoodEffect?.detach();
        this._launcherBloodhoodEffect = null;
        if (this.bloodhoodEnabled) {
            this._launcherBloodhoodEffect = BloodhoodEffect.attach(nw, this.vfx.sparkleFrame, this.vfx.auraFrame);
        }

        this.inputCtrl.setWarrior(nw);

        if (nw.mapper) {
            tween(nw.mapper)
                .to(0.15, { animScale: 1.15 }, { easing: 'quadOut' })
                .to(0.07, { animScale: 0.9 })
                .to(0.06, { animScale: 1.0 })
                .call(() => { if (this.nextLaunchWarrior === nw) this.nextLaunchWarrior = null; })
                .start();
        }

        this.spawnMgr.setNext(curType, curLevel);
        this.updateNextPreview(true);
        AudioManager.instance.play(SFX.SPAWN, 0.6);
    }

    private triggerGameOver(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        this._slowmoTimer = 0;
        this._slowmoScale = 1.0;
        director.getScheduler().setTimeScale(1.0);
        this.vfx.screenShake(12, 0.35);
        this._activeLauncherWarrior = null;
        this.inputCtrl.clearWarrior();
        AudioManager.instance.stopMusic();
        AudioManager.instance.play(SFX.GAME_OVER);
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            sys.localStorage.setItem('fw_best_score', String(this.bestScore));
        }
        this._logSpawnReport();
        this.scheduleOnce(() => this.showGameOverScreen(), 0);
    }

    private triggerVictory(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        this._slowmoTimer = 0;
        this._slowmoScale = 1.0;
        director.getScheduler().setTimeScale(1.0);
        this.inputCtrl.clearWarrior();
        this.vfx.screenShake(18, 0.6);
        this._activeLauncherWarrior = null;
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            sys.localStorage.setItem('fw_best_score', String(this.bestScore));
        }

        // Cascade-explode all warriors in play, scoring 50×level each
        const toExplode = this.warriors.filter(w => w.node?.isValid && w.crossedLine);
        let bonus = 0;
        toExplode.forEach((w, i) => {
            bonus += 50 * w.level;
            this.scheduleOnce(() => {
                if (!w.node?.isValid) return;
                const wx  = w.node.position.x;
                const wyC = this.coords.physToVisual(w.node.position.y);
                this.vfx.spawnBlackhole(wx, wyC, w.radius, LEVEL_CONFIG[w.level]?.vfxColor ?? new Color(255, 200, 50, 255));
                this.vfx.spawnFloatingScore(wx, wyC, 50 * w.level);
                this.framesAboveLine.delete(w);
                this.framesBelowLine.delete(w);
                w.node.destroy();
            }, i * 0.08);
        });
        const explodeSet = new Set(toExplode);
        this.warriors = this.warriors.filter(w => !explodeSet.has(w));
        this.score += bonus;
        this.updateScoreLabel();

        AudioManager.instance.duckMusicTo(0.15);
        AudioManager.instance.play(SFX.WIN);

        this._logSpawnReport();
        const delay = Math.max(1.0, toExplode.length * 0.08 + 0.6);
        this.scheduleOnce(() => {
            AudioManager.instance.unduckMusic();
            this.showVictoryScreen();
        }, delay);
    }

    private showVictoryScreen(): void {
        const panel = new Node('VictoryPanel');
        panel.setParent(this.uiLayer);

        const bg = panel.addComponent(Graphics);
        bg.fillColor = new Color(10, 30, 10, 190);
        const vs = view.getVisibleSize();
        bg.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
        bg.fill();

        const titleNode = new Node('Title');
        titleNode.setParent(panel);
        titleNode.setPosition(0, 80);
        const title = titleNode.addComponent(Label);
        title.string = 'HAI VINTO!';
        title.fontSize = 72;
        title.isBold = true;
        title.color = new Color(255, 220, 50, 255);

        const scoreNode = new Node('FinalScore');
        scoreNode.setParent(panel);
        scoreNode.setPosition(0, 10);
        const scoreLbl = scoreNode.addComponent(Label);
        scoreLbl.string = `Score: ${this.score}`;
        scoreLbl.fontSize = 32;
        scoreLbl.color = new Color(255, 220, 50, 255);

        const bestNode = new Node('BestScore');
        bestNode.setParent(panel);
        bestNode.setPosition(0, -30);
        const bestLbl = bestNode.addComponent(Label);
        bestLbl.string = `Best: ${this.bestScore}`;
        bestLbl.fontSize = 22;
        bestLbl.color = new Color(160, 210, 255, 255);

        const retryNode = new Node('NewGame');
        retryNode.setParent(panel);
        retryNode.setPosition(0, -90);
        const retry = retryNode.addComponent(Label);
        retry.string = 'Nuova partita';
        retry.fontSize = 36;
        retry.color = new Color(255, 255, 255, 255);
        retryNode.getComponent(UITransform)?.setContentSize(340, 60);
        const doNew = () => director.loadScene(this.sceneName);
        retryNode.on(Node.EventType.TOUCH_START, doNew, this);
        retryNode.on(Node.EventType.MOUSE_DOWN,  doNew, this);
    }

    private showGameOverScreen(): void {
        const panel = new Node('GameOverPanel');
        panel.setParent(this.uiLayer);

        const bg = panel.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 180);
        const vs = view.getVisibleSize();
        bg.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
        bg.fill();

        const titleNode = new Node('Title');
        titleNode.setParent(panel);
        titleNode.setPosition(0, 60);
        const title = titleNode.addComponent(Label);
        title.string = 'GAME OVER';
        title.fontSize = 64;
        title.isBold = true;
        title.color = new Color(220, 40, 40, 255);

        const scoreNode = new Node('FinalScore');
        scoreNode.setParent(panel);
        scoreNode.setPosition(0, -10);
        const scoreLbl = scoreNode.addComponent(Label);
        scoreLbl.string = `Score: ${this.score}`;
        scoreLbl.fontSize = 32;
        scoreLbl.color = new Color(255, 220, 50, 255);

        const bestNode = new Node('BestScore');
        bestNode.setParent(panel);
        bestNode.setPosition(0, -50);
        const bestLbl = bestNode.addComponent(Label);
        bestLbl.string = `Best: ${this.bestScore}`;
        bestLbl.fontSize = 22;
        bestLbl.color = new Color(160, 210, 255, 255);

        const retryNode = new Node('Retry');
        retryNode.setParent(panel);
        retryNode.setPosition(0, -95);
        const retry = retryNode.addComponent(Label);
        retry.string = 'Riprova';
        retry.fontSize = 36;
        retry.color = new Color(255, 255, 255, 255);
        retryNode.getComponent(UITransform)?.setContentSize(300, 60);
        const doRetry = () => director.loadScene(this.sceneName);
        retryNode.on(Node.EventType.TOUCH_START, doRetry, this);
        retryNode.on(Node.EventType.MOUSE_DOWN,  doRetry, this);
    }

    // --- merge ---

    private mergeWarriors(a: Warrior, b: Warrior): void {
        if (this.timerPaused) { a.merging = false; b.merging = false; return; }
        if (this.roundUpPause) {
            // Physics may be disabled during round-up — defer until it's stable again.
            // Creating/destroying Box2D bodies while PhysicsSystem2D is off leaves stale
            // broadphase proxies that cause explosive behaviour on re-enable.
            this.scheduleOnce(() => {
                if (a.node?.isValid && b.node?.isValid) this.mergeWarriors(a, b);
                else { a.merging = false; b.merging = false; }
            }, 0.1);
            return;
        }

        // If the currently-inflight warrior (launched, not yet crossed) merges before reaching the
        // game-over line, checkLineLogic will never fire for it — we must activate the next warrior here.
        const inflightMerged = this.state === GameState.Inflight &&
            ((a.launched && !a.crossedLine) || (b.launched && !b.crossedLine));

        const midX  = (a.node.position.x + b.node.position.x) / 2;  // local (scaleX=1 → canvas)
        const midY  = (a.node.position.y + b.node.position.y) / 2;  // local
        const midYC = this.coords.physToVisual(midY);                 // canvas Y for UI/VFX
        const newLevel = a.level + 1;
        const maxLevel = WARRIORS[a.type]?.maxLevel ?? 7;
        const vx = (a.velocity.x + b.velocity.x) * 0.5 * 0.75;
        const vy = (a.velocity.y + b.velocity.y) * 0.5 * 0.75;

        this.framesAboveLine.delete(a); this.framesBelowLine.delete(a);
        this.framesAboveLine.delete(b); this.framesBelowLine.delete(b);

        this.totalMerges++;
        this.mergesThisLaunch++;
        this.checkRoundAdvance();
        const points = 10 * (1 << (newLevel - 1)) * this.currentRound * (1 << (this.mergesThisLaunch - 1));
        this.score += points;
        this._trackBestSingle(points, this.mergesThisLaunch > 1
            ? `×${this.mergesThisLaunch} combo`
            : `${WARRIORS[a.type]?.name ?? '?'} lv.${newLevel}`);
        this.vfx.spawnFloatingScore(midX, midYC, points, this.mergesThisLaunch > 1);
        this.updateScoreLabel();
        this.updateRoundProgress();

        const MERGE_OUT_DUR = 0.12;
        a.playMergeOutEffect(midX, midY, MERGE_OUT_DUR);
        b.playMergeOutEffect(midX, midY, MERGE_OUT_DUR);
        const aType       = a.type;
        const ghostFrame  = a.viewNode?.isValid ? a.viewNode.getComponent(Sprite)?.spriteFrame ?? null : null;
        const ghostSize   = a.viewNode?.isValid ? (a.viewNode.getComponent(UITransform)?.contentSize.width ?? 0) : 0;
        const ghostX      = a.viewNode?.isValid && b.viewNode?.isValid
            ? (a.viewNode.worldPosition.x + b.viewNode.worldPosition.x) / 2 : midX;
        const ghostY      = a.viewNode?.isValid && b.viewNode?.isValid
            ? (a.viewNode.worldPosition.y + b.viewNode.worldPosition.y) / 2 : midYC;

        this.scheduleOnce(() => {
            this._cleanupBHS(a);
            this._cleanupBHS(b);
            if (a.node.isValid) a.node.destroy();
            if (b.node.isValid) b.node.destroy();
            this.warriors = this.warriors.filter(x => x !== a && x !== b);
            this.framesAboveLine.delete(a); this.framesBelowLine.delete(a);
            this.framesAboveLine.delete(b); this.framesBelowLine.delete(b);

            if (newLevel > maxLevel) {
                // Both at max level — blackhole, no new warrior spawned
                const lvConf  = LEVEL_CONFIG[maxLevel];
                const color   = lvConf?.vfxColor ?? new Color(255, 200, 50, 255);
                const bonus   = lvConf?.bonus ?? 0;
                const tier    = Math.max(1, Math.min(3, maxLevel - 2)) as 1 | 2 | 3;

                const bhSfxs = [SFX.MERGE_1, SFX.MERGE_2, SFX.MERGE_3, SFX.MERGE_4, SFX.MERGE_5, SFX.MERGE_6];
                AudioManager.instance.play(bhSfxs[Math.min(maxLevel, bhSfxs.length - 1)]);
                const expSfx = newLevel >= 7 ? SFX.EXPLOSION_3 : newLevel >= 6 ? SFX.EXPLOSION_2 : SFX.EXPLOSION_1;
                this.scheduleOnce(() => AudioManager.instance.play(expSfx), 0.25);

                this.vfx.screenShake(tier >= 3 ? 20 : tier >= 2 ? 14 : 8, tier >= 3 ? 0.50 : tier >= 2 ? 0.40 : 0.28);
                this.activateSlowmo(tier >= 3 ? 0.15 : tier >= 2 ? 0.25 : 0.40, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);

                this.score += bonus;
                this.updateScoreLabel();
                if (bonus > 0) {
                    this._trackBestSingle(bonus, `${WARRIORS[aType]?.name ?? '?'} ${LEVEL_CONFIG[maxLevel]?.label ?? 'explosion'}`);
                    this.vfx.spawnFloatingScore(midX, midYC + 30, bonus);
                }
                if (ghostFrame && ghostSize > 0) this.vfx.flashMergeGhost(ghostX, ghostY, ghostFrame, ghostSize);
                this.vfx.spawnBlackhole(midX, midYC + a.radius * 0.9, a.radius, color, tier, maxLevel);
                this.vfx.spawnImplosionVFX(midX, midYC, color, tier / 3, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);
                const impDur   = tier >= 3 ? 2.5 : tier >= 2 ? 2.0 : 1.5;
                const impForce = (200 + tier * 60) * LAYOUT_SCALE;
                this.implosionCenter    = new Vec2(midX, midY);
                this.implosionDuration  = impDur;
                this.implosionTimeLeft  = impDur;
                this.implosionPeakForce = impForce;
                this.vfx.spawnExplosionLabel(midX, midYC + 10, lvConf?.label ?? '', color);
                this._vibrate(120);

                if (WARRIORS[aType]?.type === 'dragon') {
                    this.scheduleOnce(() => this.triggerVictory(), 0.5);
                    return;
                }
                this.checkTrackClearedBonus(midX, midYC);
                this._logOnTrack('explosion');
                if (inflightMerged) this.activateAfterInflightMerge();
                return;
            }

            const merged = Warrior.spawn(this.box2dLayer, this.warriorsLayer, aType, newLevel, midX, midY);
            merged.crossedLine = true;
            merged.fired = true;
            merged.settle();
            merged.onMergeReady = (x, y) => this.mergeWarriors(x, y);
            merged.velocity = new Vec2(vx, vy);
            this.warriors.push(merged);
            if (merged.mapper) merged.mapper.animScale = 0;
            merged.playMergeInEffect(0.35);

            const mergeSfxs = [SFX.MERGE_1, SFX.MERGE_2, SFX.MERGE_3, SFX.MERGE_4];
            AudioManager.instance.play(mergeSfxs[Math.min(newLevel - 2, mergeSfxs.length - 1)]);
            this.vfx.flashMerge(merged.mapper);
            this._vibrate(40);
            this._logOnTrack('merge');

            if (inflightMerged) this.activateAfterInflightMerge();
        }, MERGE_OUT_DUR);
    }

    // --- bloodhood sparkle ---

    private _cleanupBHS(w: Warrior): void {
        const bhs = this._bhsActive.get(w);
        if (bhs) { bhs.detach(); this._bhsActive.delete(w); }
        w.bloodhoodSparkle = null;
        w.onBloodhoodContact = null;
    }

    private _applyBHS(target: Warrior, source?: Warrior): void {
        if (this._bhsActive.has(target)) return;
        if (this._bhsImploding) return;
        if (target.isBHLauncher) return;
        if (!target.node?.isValid) return;
        console.log(`[BHS] contagio: src type=${source?.type ?? 'BH'} lv=${source?.level ?? '-'} → tgt type=${target.type} lv=${target.level}`);
        const spreadFn = (s: Warrior, t: Warrior) => this._onBHSSpread(s, t);
        target.onBloodhoodContact = spreadFn;
        const bhs = BloodhoodSparkleEffect.attach(target);
        target.bloodhoodSparkle = bhs;
        this._bhsActive.set(target, bhs);
        this._bhsOrder.push(target);
        bhs.onExpired = () => {
            target.bloodhoodSparkle = null;
            if (target.onBloodhoodContact === spreadFn) target.onBloodhoodContact = null;
            this._bhsActive.delete(target);
        };
    }

    private _onBloodhoodContact(source: Warrior, target: Warrior): void {
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (source === target) return;
        this._applyBHS(target, source);
    }

    private _onBHSSpread(source: Warrior, target: Warrior): void {
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (source === target || source.type !== target.type) return;
        this._applyBHS(target, source);
    }

    private _tickBHSProximity(): void {
        const inRange = new Map<Warrior, Warrior>(); // candidate → source BHS warrior

        for (const [bhsW] of this._bhsActive) {
            if (!bhsW.node?.isValid) continue;
            const pos = bhsW.node.position;
            for (const w of this.warriors) {
                if (w === bhsW || w.type !== bhsW.type || !w.node?.isValid) continue;
                if (this._bhsActive.has(w)) continue;
                const wp = w.node.position;
                const dx = pos.x - wp.x, dy = pos.y - wp.y;
                const threshold = bhsW.radius + w.radius + BHS_PROX_MARGIN * LAYOUT_SCALE;
                if (dx * dx + dy * dy <= threshold * threshold) {
                    if (!inRange.has(w)) inRange.set(w, bhsW);
                }
            }
        }

        for (const w of this._bhsProxTimers.keys()) {
            if (!inRange.has(w) || this._bhsActive.has(w)) this._bhsProxTimers.delete(w);
        }
        for (const [w, bhsW] of inRange) {
            if (this._bhsActive.has(w) || this._bhsImploding) continue;
            const t = (this._bhsProxTimers.get(w) ?? 0) + BHS_PROX_INTERVAL;
            if (t >= BHS_CONTACT_DELAY) {
                this._bhsProxTimers.delete(w);
                this._applyBHS(w, bhsW);
            } else {
                this._bhsProxTimers.set(w, t);
            }
        }
    }

    private _startBHSCascade(): void {
        if (this._bhsImploding) return;
        if (this.state === GameState.GameOver) return;
        this._bhsImploding = true;
        const toImplode = [...this._bhsOrder].reverse();
        let delay = 0;
        for (const w of toImplode) {
            this.scheduleOnce(() => this._implodeWarrior(w), delay);
            delay += 0.15;
        }
    }

    private _implodeWarrior(w: Warrior): void {
        if (!w.node?.isValid || !this._bhsActive.has(w)) return;
        this._cleanupBHS(w);
        this._bhsOrder = this._bhsOrder.filter(x => x !== w);
        this._bhsProxTimers.delete(w);
        const pts = Math.round(10 * this.currentRound * this._bhsImplodeK);
        this.score += pts;
        this.updateScoreLabel();
        const wx  = w.node.position.x;
        const wyC = this.coords.physToVisual(w.node.position.y);
        this.vfx.spawnFloatingScore(wx, wyC, pts);
        this._bhsImplodeK += 1.5;
        const mapper = w.mapper;
        const finish = () => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.framesAboveLine.delete(w);
            this.framesBelowLine.delete(w);
            if (w.node?.isValid) w.node.destroy();
            this._logOnTrack('bhs-implode');
            this.checkTrackClearedBonus(wx, wyC);
        };
        if (mapper?.node?.isValid) {
            Tween.stopAllByTarget(mapper);
            tween(mapper)
                .to(0.10, { animScale: 1.5 }, { easing: 'quadOut' })
                .to(0.20, { animScale: 0.0 }, { easing: 'quadIn' })
                .call(finish)
                .start();
        } else {
            finish();
        }
    }

    // --- level-boost powerup ---

    private _onAuraContact(source: Warrior, target: Warrior): void {
        if (!source.levelBoost || source.levelBoost.energy <= 0 || !source.crossedLine) return;
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (this._boostedThisTurn.has(target)) return;
        this.applyLevelBoost(source, target);
    }

    private _checkAuraImmediateContacts(source: Warrior): void {
        if (!source.levelBoost || source.levelBoost.energy <= 0 || !source.node?.isValid) return;
        const sp = source.node.position;
        for (const w of this.warriors) {
            if (w === source || !w.node?.isValid) continue;
            if (this._boostedThisTurn.has(w)) continue;
            const wp = w.node.position;
            const dx = sp.x - wp.x;
            const dy = sp.y - wp.y;
            const touchDist = (source.radius + w.radius) * 2.0;
            if (dx * dx + dy * dy <= touchDist * touchDist) {
                this._onAuraContact(source, w);
            }
        }
    }

    private _tickPowerupExpiry(dt: number): void {
        for (const w of this.warriors) {
            if (!w.levelBoost || !w.crossedLine || !w.node?.isValid) {
                this._powerupSettleCds.delete(w);
                continue;
            }
            if (w.velocity.length() >= SETTLE_VELOCITY) {
                this._powerupSettleCds.delete(w);
                continue;
            }
            const firstSettle = !this._powerupSettleCds.has(w);
            const cd = (this._powerupSettleCds.get(w) ?? AURA_SETTLE_CD) - dt;
            if (firstSettle) this.scheduleOnce(() => this._checkAuraImmediateContacts(w), 0);
            if (cd <= 0) {
                w.levelBoost.detach();
                w.levelBoost = null;
                this._powerupSettleCds.delete(w);
            } else {
                this._powerupSettleCds.set(w, cd);
            }
        }
    }

    private applyLevelBoost(source: Warrior, target: Warrior): void {
        if (this.timerPaused) return;
        if (!source.node?.isValid || !target.node?.isValid) return;
        if (this._boostedThisTurn.has(target)) return;
        this._boostedThisTurn.add(target);
        this._boostedThisTurn.add(source);

        const chainEnergy = (source.levelBoost?.energy ?? 1) - 1;

        this._playBoostReceiveAnim(target, () => {
            if (!target.node?.isValid) return;

            const maxLevel = WARRIORS[target.type]?.maxLevel ?? 7;
            const newLevel = target.level + 1;
            const pts = 5 * newLevel * this.currentRound;
            this.score += pts;
            this._trackBestSingle(pts, `AURA ${WARRIORS[target.type]?.name ?? '?'} lv.${newLevel}`);
            this.updateScoreLabel();

            if (newLevel > maxLevel) {
                this.vfx.spawnFloatingScore(target.node.position.x,
                    this.coords.physToVisual(target.node.position.y), pts);
                this._explodeWarriorByBoost(target);
            } else {
                target.levelUpInPlace(newLevel);
                this.vfx.playLevelUpBounce(target.mapper, target.viewNode);
                this.vfx.spawnMergeSparks(target.node.position.x,
                    this.coords.physToVisual(target.node.position.y), newLevel);
                this.vfx.spawnFloatingScore(target.node.position.x,
                    this.coords.physToVisual(target.node.position.y) + 60, pts);
                AudioManager.instance.play(SFX.MERGE_1, 0.6);
                this._vibrate(30);

                if (chainEnergy >= 0) {
                    target.levelBoost?.detach();
                    const clb = LevelBoostPowerup.attach(target, chainEnergy, this.vfx.sparkleFrame, this.vfx.auraFrame);
                    target.levelBoost = clb;
                    target.onAuraContact = (s, t) => this._onAuraContact(s, t);
                    this.scheduleOnce(() => this._checkAuraImmediateContacts(target), 0);
                }
            }
        });
    }

    private _playBoostReceiveAnim(target: Warrior, onComplete: () => void): void {
        const sp = target.viewNode?.isValid ? target.viewNode.getComponent(Sprite) : null;
        if (!sp || !target.mapper) { onComplete(); return; }

        // Gold flash on sprite colour
        const origColor = sp.color.clone();
        sp.color = new Color(255, 230, 80, 255);
        tween(sp).to(0.22, { color: origColor }).start();

        // Scale bump then callback
        tween(target.mapper)
            .to(0.09, { animScale: 1.38 }, { easing: 'quadOut' })
            .to(0.11, { animScale: 0.90 }, { easing: 'quadIn'  })
            .to(0.07, { animScale: 1.00 })
            .call(onComplete)
            .start();
    }

    private _explodeWarriorByBoost(w: Warrior): void {
        const x       = w.node.position.x;
        const y       = w.node.position.y;
        const yC      = this.coords.physToVisual(y);
        const maxLevel = WARRIORS[w.type]?.maxLevel ?? 7;
        const tier    = Math.max(1, Math.min(3, maxLevel - 2)) as 1 | 2 | 3;
        const lvConf  = LEVEL_CONFIG[maxLevel];
        const color   = lvConf?.vfxColor ?? new Color(255, 200, 50, 255);
        const bonus   = lvConf?.bonus ?? 0;

        if (bonus > 0) {
            this.score += bonus;
            this._trackBestSingle(bonus, `${WARRIORS[w.type]?.name ?? '?'} ${LEVEL_CONFIG[maxLevel]?.label ?? 'explosion'}`);
            this.updateScoreLabel();
            this.vfx.spawnFloatingScore(x, yC + 30, bonus, true);
        }

        const expSfx = maxLevel >= 7 ? SFX.EXPLOSION_3 : maxLevel >= 6 ? SFX.EXPLOSION_2 : SFX.EXPLOSION_1;
        AudioManager.instance.play(expSfx, 0.85);
        this.vfx.screenShake(tier >= 3 ? 18 : tier >= 2 ? 12 : 7, 0.28);
        this.activateSlowmo(tier >= 3 ? 0.18 : tier >= 2 ? 0.28 : 0.42, tier >= 3 ? 0.9 : tier >= 2 ? 0.65 : 0.45);
        this.vfx.spawnBlackhole(x, yC + w.radius * 0.9, w.radius, color, tier, maxLevel);
        this.vfx.spawnImplosionVFX(x, yC, color, tier / 3, tier >= 3 ? 1.0 : tier >= 2 ? 0.7 : 0.5);
        this.vfx.spawnExplosionLabel(x, yC + 10, lvConf?.label ?? '', color);

        const impDur   = tier >= 3 ? 2.5 : tier >= 2 ? 2.0 : 1.5;
        const impForce = (200 + tier * 60) * LAYOUT_SCALE;
        this.implosionCenter    = new Vec2(x, y);
        this.implosionDuration  = impDur;
        this.implosionTimeLeft  = impDur;
        this.implosionPeakForce = impForce;

        const wType = w.type;
        this.warriors = this.warriors.filter(ww => ww !== w);
        this.framesAboveLine.delete(w);
        this.framesBelowLine.delete(w);
        w.node.destroy();
        this._vibrate(90);

        if (WARRIORS[wType]?.type === 'dragon') {
            this.scheduleOnce(() => this.triggerVictory(), 0.5);
        } else {
            this.checkTrackClearedBonus(x, yC);
        }
    }

    private checkTrackClearedBonus(x: number, yC: number): void {
        if (this._trackClearedBonusUsed) return;
        const onTrack = this.warriors.filter(w => w.crossedLine && w.node?.isValid);
        if (onTrack.length > 0) return;
        this._trackClearedBonusUsed = true;
        const bonus = 1000 * this.currentRound;
        this.score += bonus;
        this._trackBestSingle(bonus, `Track Cleared! ×${this.currentRound}`);
        this.updateScoreLabel();
        this.vfx.spawnTrackClearedBanner(x, yC, bonus);
    }

    private activateAfterInflightMerge(): void {
        if (this.state === GameState.GameOver || this.state === GameState.Paused) return;
        if (this.waitForSettling) {
            this.state = GameState.Settling;
        } else {
            this.activateWarrior(this.createWarrior());
        }
    }

    // --- HUD ---

    private initHud(): void {
        const existingHud = this.uiLayer.getChildByName('HUD');
        if (existingHud) {
            this.scoreLabel      = existingHud.getChildByName('ScoreSec')  ?.getChildByName('ScoreValue')  ?.getComponent(Label) ?? null;
            this.roundLabel      = existingHud.getChildByName('RoundSec')  ?.getChildByName('RoundValue')  ?.getComponent(Label) ?? null;
            this.timerLabel      = existingHud.getChildByName('TimerSec')  ?.getChildByName('TimerValue')  ?.getComponent(Label) ?? null;
            this.timerSectionNode = existingHud.getChildByName('TimerSec') ?? null;

            const versionLabel = existingHud.getChildByName('VersionSec')?.getChildByName('VersionValue')?.getComponent(Label);
            if (versionLabel) versionLabel.string = `v${VERSION}`;
            const menuNode = existingHud.getChildByName('menu');
            if (menuNode) {
                this._musicLabel     = menuNode.getChildByName('MusicBtn') ?.getChildByName('Label')?.getComponent(Label) ?? null;
                this._sfxLabel       = menuNode.getChildByName('SfxBtn')   ?.getChildByName('Label')?.getComponent(Label) ?? null;
                this._pauseLabelNode = menuNode.getChildByName('PauseBtn') ?.getChildByName('Label') ?? null;
                this._vibraLabel     = menuNode.getChildByName('VibraBtn') ?.getChildByName('Label')?.getComponent(Label) ?? null;
                if (this._musicLabel) this._musicLabel.color = AudioManager.instance.musicMuted
                    ? new Color(100, 100, 100, 150) : new Color(255, 255, 255, 220);
                if (this._sfxLabel) this._sfxLabel.color = AudioManager.instance.sfxMuted
                    ? new Color(100, 100, 100, 150) : new Color(255, 255, 255, 220);
                if (this._vibraLabel) this._vibraLabel.color = this._vibrationEnabled
                    ? new Color(255, 255, 255, 220) : new Color(100, 100, 100, 150);
                if (sys.isBrowser && !(document.documentElement as any).requestFullscreen) {
                    const fsBtn = menuNode.getChildByName('FullscreenBtn');
                    if (fsBtn) fsBtn.active = false;
                }
            }
            this.updateNextPreview();
            // Create ring nodes programmatically on existing HUD
            const roundSec = existingHud.getChildByName('RoundSec');
            if (roundSec) {
                this.roundProgressBar = roundSec.getChildByName('ProgressBar')
                    ?.getComponent(ProgressBar) ?? null;
            }
            this._dialogNode = existingHud.getChildByName('Dialog') ?? null;
            if (this._dialogNode) {
                const op = this._dialogNode.getComponent(UIOpacity) ?? this._dialogNode.addComponent(UIOpacity);
                op.opacity = 0;
                this._dialogNode.active = false;
                const closeBtn = this._dialogNode.getChildByName('wood')?.getChildByName('CloseButton');
                closeBtn?.on(Button.EventType.CLICK, this.closeMenu, this);
                const layout = this._dialogNode.getChildByName('Layout');
                if (layout) {
                    this._vibrToggle  = layout.getChildByName('Vibrations')?.getComponent(Toggle) ?? null;
                    this._sfxToggle   = layout.getChildByName('Sfx')?.getComponent(Toggle)        ?? null;
                    this._musicToggle = layout.getChildByName('Music')?.getComponent(Toggle)      ?? null;
                    this._fsToggle    = layout.getChildByName('Fullscreen')?.getComponent(Toggle) ?? null;
                    this._vibrToggle?.node.on('toggle', () => {
                        if (!this._syncingToggles) this.toggleVibration();
                    }, this);
                    this._sfxToggle?.node.on('toggle', () => {
                        if (!this._syncingToggles) this.toggleSFX();
                    }, this);
                    this._musicToggle?.node.on('toggle', () => {
                        if (!this._syncingToggles) this.toggleMusic();
                    }, this);
                    this._fsToggle?.node.on('toggle', () => {
                        if (!this._syncingToggles) this.toggleFullscreen();
                    }, this);
                    if (!sys.isBrowser || !(document.documentElement as any).requestFullscreen) {
                        const fsNode = layout.getChildByName('Fullscreen');
                        if (fsNode) fsNode.active = false;
                    }
                }
            }
            const menuButtonNode = existingHud.getChildByName('MenuButton');
            if (menuButtonNode) {
                const btn = menuButtonNode.getComponent(Button) ?? menuButtonNode.addComponent(Button);
                btn.node.on(Button.EventType.CLICK, this.openMenu, this);
            }
            return;
        }
        const hud = new Node('HUD');
        hud.setParent(this.uiLayer);
        const vs = view.getVisibleSize();
        hud.addComponent(UITransform).setContentSize(vs.width, vs.height);
        const MH = 80;
        const MV = 40;

        // ── Top-left: SCORE ───────────────────────────────────────────────
        const scoreSec = this.makeCornerGroup(hud, 'ScoreSec', true, true, MH, MV);
        this.makeLabel(scoreSec, 'SCORE', 0, -12, 28, new Color(180, 180, 180, 255));
        this.scoreLabel = this.makeLabel(scoreSec, '0', 0, -56, 46, new Color(255, 220, 50, 255));
        this.scoreLabel.isBold = true;

        // ── Top-right: ROUND ──────────────────────────────────────────────
        const roundSec = this.makeCornerGroup(hud, 'RoundSec', false, true, MH, MV);
        this.makeLabel(roundSec, 'ROUND', 0, -12, 28, new Color(180, 180, 180, 255));
        this.roundLabel = this.makeLabel(roundSec, String(this.currentRound), 0, -56, 46, new Color(100, 200, 255, 255));
        this.roundLabel.isBold = true;

        this.updateNextPreview();

        // ── Timer — world position, centre of launch zone ─────────────────
        const timerNode = new Node('TimerValue');
        timerNode.setParent(hud);
        timerNode.setPosition(0, TRACK_BOTTOM_Y + (GAME_OVER_LINE_Y - TRACK_BOTTOM_Y) * 0.2);
        this.timerLabel = timerNode.addComponent(Label);
        this.timerLabel.fontSize = 44;
        this.timerLabel.isBold = true;
        this.timerLabel.string = String(LAUNCH_TIMER);
        this.timerLabel.color = new Color(200, 200, 200, 200);
        this.timerSectionNode = timerNode;

        // ── Version (top-center) ─────────────────────────────────────────
        const verSec = new Node('VerSec');
        verSec.setParent(hud);
        verSec.addComponent(UITransform).setContentSize(1, 1);
        const vw = verSec.addComponent(Widget);
        vw.isAlignTop = true; vw.top = MV;
        vw.updateAlignment();
        this.makeLabel(verSec, `v${VERSION}`, 0, 0, 24, new Color(255, 255, 255, 210));
    }

    private makeCornerGroup(parent: Node, name: string, alignLeft: boolean, alignTop: boolean, marginH: number, marginV: number): Node {
        const node = new Node(name);
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(1, 1);
        const w = node.addComponent(Widget);
        if (alignLeft) { w.isAlignLeft   = true; w.left   = marginH; }
        else           { w.isAlignRight  = true; w.right  = marginH; }
        if (alignTop)  { w.isAlignTop    = true; w.top    = marginV; }
        else           { w.isAlignBottom = true; w.bottom = marginV; }
        w.updateAlignment();
        return node;
    }

    togglePause(): void { this._togglePause(this._pauseLabelNode); }

    openMenu(): void {
        if (this.state === GameState.GameOver || this.state === GameState.Paused || !this._dialogNode) return;
        this._stateBeforePause = this.state;
        this.state = GameState.Paused;
        PhysicsSystem2D.instance.enable = false;
        AudioManager.instance.muteForPause();
        this.inputCtrl.blocked = true;
        const op = this._dialogNode.getComponent(UIOpacity)!;
        this._dialogNode.active = true;
        this._syncingToggles = true;
        if (this._vibrToggle)  this._vibrToggle.isChecked  = this._vibrationEnabled;
        if (this._sfxToggle)   this._sfxToggle.isChecked   = !AudioManager.instance.sfxMuted;
        if (this._musicToggle) this._musicToggle.isChecked = !AudioManager.instance.musicMuted;
        if (this._fsToggle)    this._fsToggle.isChecked    = sys.isBrowser && !!document.fullscreenElement;
        this._syncingToggles = false;
        op.opacity = 0;
        tween(op).to(0.2, { opacity: 255 }).start();
    }

    closeMenu(): void {
        if (!this._dialogNode) return;
        const op = this._dialogNode.getComponent(UIOpacity)!;
        tween(op)
            .to(0.2, { opacity: 0 })
            .call(() => {
                this._dialogNode!.active = false;
                this.state = this._stateBeforePause ?? GameState.Aiming;
                this._stateBeforePause = null;
                PhysicsSystem2D.instance.enable = true;
                AudioManager.instance.unmuteForPause();
                this.inputCtrl.blocked = false;
            })
            .start();
    }

    toggleSFX(): void {
        AudioManager.instance.toggleSfx();
        if (this._sfxLabel) this._sfxLabel.color = AudioManager.instance.sfxMuted
            ? new Color(100, 100, 100, 150) : new Color(255, 255, 255, 220);
    }

    toggleMusic(): void {
        AudioManager.instance.toggleMusic();
        if (this._musicLabel) this._musicLabel.color = AudioManager.instance.musicMuted
            ? new Color(100, 100, 100, 150) : new Color(255, 255, 255, 220);
    }

    toggleFullscreen(): void {
        if (!sys.isBrowser) return;
        if (!(document as any).fullscreenElement) {
            (document.documentElement as any).requestFullscreen?.().catch?.(() => {});
        } else {
            (document as any).exitFullscreen?.().catch?.(() => {});
        }
    }

    toggleVibration(): void {
        this._vibrationEnabled = !this._vibrationEnabled;
        sys.localStorage.setItem('fw_vibration', this._vibrationEnabled ? '1' : '0');
        if (this._vibraLabel) this._vibraLabel.color = this._vibrationEnabled
            ? new Color(255, 255, 255, 220) : new Color(100, 100, 100, 150);
    }

    private _checkProximityMerge(dt: number): void {
        const activePairs = new Set<string>();

        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || !a.launched || a.merging || !a.onMergeReady) continue;
            for (let j = i + 1; j < this.warriors.length; j++) {
                const b = this.warriors[j];
                if (!b.node?.isValid || !b.launched || b.merging) continue;
                if (a.type !== b.type || a.level !== b.level) continue;
                const dx   = a.node.position.x - b.node.position.x;
                const dy   = a.node.position.y - b.node.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < (a.radius + b.radius) * 0.85) {
                    a.merging = true;
                    b.merging = true;
                    this._proximityTimers.clear();
                    a.onMergeReady(a, b);
                    return;
                }

                if (dist < (a.radius + b.radius) * 1.05) {
                    const uA = a.node.uuid, uB = b.node.uuid;
                    const key = uA < uB ? `${uA}|${uB}` : `${uB}|${uA}`;
                    activePairs.add(key);
                    const elapsed = (this._proximityTimers.get(key) ?? 0) + dt;
                    this._proximityTimers.set(key, elapsed);
                    if (elapsed >= 2.0) {
                        a.merging = true;
                        b.merging = true;
                        this._proximityTimers.delete(key);
                        a.onMergeReady(a, b);
                        return;
                    }
                }
            }
        }

        for (const key of this._proximityTimers.keys()) {
            if (!activePairs.has(key)) this._proximityTimers.delete(key);
        }
    }

    private _sortWarriorLayerByY(): void {
        const sorted = [...this.warriorsLayer.children]
            .sort((a, b) => b.worldPosition.y - a.worldPosition.y);
        sorted.forEach((child, i) => child.setSiblingIndex(i));
    }

    private _vibrate(ms: number): void {
        if (!this._vibrationEnabled || !sys.isBrowser) return;
        (navigator as any).vibrate?.(ms);
    }

    private _togglePause(labelNode: Node | null): void {
        if (this.state === GameState.GameOver) return;
        const isPaused = this.state === GameState.Paused;
        if (isPaused) {
            this.state = this._stateBeforePause ?? GameState.Aiming;
            this._stateBeforePause = null;
            PhysicsSystem2D.instance.enable = true;
            if (labelNode) labelNode.getComponent(Label)!.string = '⏸️';
            if (this._pauseOverlay?.isValid) this._pauseOverlay.destroy();
            this._pauseOverlay = null;
            AudioManager.instance.unmuteForPause();
        } else {
            this._stateBeforePause = this.state;
            this.state = GameState.Paused;
            PhysicsSystem2D.instance.enable = false;
            if (labelNode) labelNode.getComponent(Label)!.string = '▶️';
            const overlay = new Node('PauseOverlay');
            overlay.setParent(this.uiLayer);
            const g = overlay.addComponent(Graphics);
            const vs = view.getVisibleSize();
            g.fillColor = new Color(0, 0, 0, 140);
            g.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
            g.fill();
            this.makeLabel(overlay, 'PAUSA', 0, 60, 64, new Color(255, 255, 255, 230));
            this._pauseOverlay = overlay;
            AudioManager.instance.muteForPause();
        }
    }


    private tickTimer(dt: number): void {
        if (this.timerPaused) return;
        if (this.implosionCenter !== null) return; // freeze during blackhole explosion
        this.timerRemaining -= dt;
        this.updateTimerLabel();
        if (this.timerRemaining <= 0) {
            this.state = GameState.Inflight; // prevent re-entry before onWarriorLaunched fires
            this.inputCtrl.autoLaunch();
        }
    }

    private updateTimerLabel(): void {
        if (!this.timerLabel) return;
        const secs = Math.max(0, Math.ceil(this.timerRemaining));
        this.timerLabel.string = String(secs);
        this.timerLabel.color = secs <= 5
            ? new Color(255, 80, 80, 255)
            : new Color(200, 200, 200, 200);
        if (secs <= 5 && secs > 0 && secs !== this._lastTickSec) {
            this._lastTickSec = secs;
            AudioManager.instance.play(SFX.TIMER_TICK);
        }
    }

    private _trackBestSingle(points: number, desc: string): void {
        if (points > this._bestSingleScore) {
            this._bestSingleScore = points;
            this._bestSingleScoreDesc = desc;
        }
    }

    private _recordSpawn(type: number, round: number): void {
        let rm = this._spawnLog.get(round);
        if (!rm) { rm = new Map(); this._spawnLog.set(round, rm); }
        rm.set(type, (rm.get(type) ?? 0) + 1);
    }

    private _logSpawnReport(): void {
        const rounds = [...this._spawnLog.keys()].sort((a, b) => a - b);
        const totals = new Map<number, number>();
        const lines: string[] = ['[SpawnLog] ── Spawn report ──'];
        for (const r of rounds) {
            const rm = this._spawnLog.get(r)!;
            const parts: string[] = [];
            for (const [type, count] of [...rm.entries()].sort((a, b) => a[0] - b[0])) {
                const n = WARRIORS[type]?.name ?? `type${type}`;
                parts.push(`${n}×${count}`);
                totals.set(type, (totals.get(type) ?? 0) + count);
            }
            lines.push(`  Round ${r}: ${parts.join(', ')}`);
        }
        const totalParts = [...totals.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([type, count]) => `${WARRIORS[type]?.name ?? `type${type}`}×${count}`);
        lines.push(`  Total: ${totalParts.join(', ')}`);
        console.log(lines.join('\n'));
    }

    private updateScoreLabel(): void {
        if (!this.scoreLabel) return;
        const target = this.score;
        this._scoreTween?.stop();
        const delta = Math.abs(target - this._scoreProxy.val);
        const duration = Math.min(0.55, Math.max(0.15, delta / 2000));
        this._scoreTween = tween(this._scoreProxy)
            .to(duration, { val: target }, {
                easing: 'quadOut',
                onUpdate: (obj?: { val: number }) => {
                    if (this.scoreLabel && obj) this.scoreLabel.string = String(Math.round(obj.val));
                },
            })
            .call(() => {
                if (this.scoreLabel) this.scoreLabel.string = String(target);
                this._scoreTween = null;
            })
            .start();
    }

    private activateSlowmo(scale: number, duration: number): void {
        if (this._slowmoTimer <= 0 || scale < this._slowmoScale) {
            this._slowmoScale = scale;
            director.getScheduler().setTimeScale(scale);
        }
        this._slowmoTimer = Math.max(this._slowmoTimer, duration);
    }

    private tickSlowmo(dt: number): void {
        if (this._slowmoTimer <= 0) return;
        this._slowmoTimer -= dt / this._slowmoScale; // dt is already scaled — convert to real time
        if (this._slowmoTimer <= 0) {
            this._slowmoTimer = 0;
            this._slowmoScale = 1.0;
            director.getScheduler().setTimeScale(1.0);
            AudioManager.instance.unduckMusic();
        }
    }

    private updateRoundLabel(): void {
        if (this.roundLabel) this.roundLabel.string = String(this.currentRound);
        this.updateRoundProgress();
    }

    private updateRoundProgress(): void {
        if (!this.roundProgressBar) return;
        const cur = this.currentRound;
        let factor = 0;
        if (cur >= MAX_ROUND) {
            factor = 1;
        } else {
            const prev = ROUND_THRESHOLDS[cur - 1] as number;
            const next = ROUND_THRESHOLDS[cur]     as number;
            factor = Math.max(0, Math.min(1, (this.totalMerges - prev) / (next - prev)));
        }
        this.roundProgressBar.progress = factor;
    }

    // --- round progression ---

    private checkRoundAdvance(): void {
        const threshold = ROUND_THRESHOLDS[this.currentRound] as number | undefined;
        if (threshold !== undefined && this.totalMerges >= threshold) {
            this.advanceRound();
        }
    }

    private advanceRound(): void {
        this.currentRound++;
        this._trackClearedBonusUsed = false;
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.updateRoundLabel();
        this.roundUpPause = true;
        this.inputCtrl.freezeInput();
        AudioManager.instance.play(SFX.ROUND_UP);
        AudioManager.instance.duckMusicTo(0.15);
        this._slowmoTimer = 0;
        this._slowmoScale = 1.0;
        director.getScheduler().setTimeScale(1.0);
        // Defer physics freeze: the triggering merge's playMergeOutEffect (MERGE_OUT_DUR=0.12s)
        // changes rb.type=Static and queues body destruction — all must complete with physics
        // enabled, otherwise Box2D's m_moveBuffer holds stale proxies that crash UpdatePairs.
        this.scheduleOnce(() => {
            PhysicsSystem2D.instance.enable = false;
            this.showRoundUpBanner();
            this.scheduleOnce(() => {
                PhysicsSystem2D.instance.enable = true;
                this.inputCtrl.unfreezeInput();
                this.roundUpPause = false;
                AudioManager.instance.unduckMusic();
            }, 2.16);
        }, 0.17);
    }


    // --- vortex implosion ---


    private applyVortexImplosion(dt: number): void {
        this.implosionTimeLeft -= dt;
        if (this.implosionTimeLeft <= 0) {
            this.implosionCenter = null;
            return;
        }

        // Curva a campana: 0 → picco a metà → 0, sempre inward
        const elapsed  = this.implosionDuration - this.implosionTimeLeft;
        const progress = Math.sin(Math.PI * elapsed / this.implosionDuration);
        const force    = this.implosionPeakForce * progress;

        const cx = this.implosionCenter!.x;
        const cy = this.implosionCenter!.y;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging || !w.crossedLine) continue;
            // Only pull warriors that are below the implosion center — they all get pulled upward
            if (w.node.position.y >= cy) continue;
            const dx = cx - w.node.position.x;
            const dy = cy - w.node.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            w.applyForce(new Vec2(nx * force, ny * force));
        }
    }

    private applyCohesion(): void {
        const COHESION_RANGE  = 120 * LAYOUT_SCALE;
        const COHESION_FORCE  = 12  * LAYOUT_SCALE;
        const r1sq = ((LEVEL_CONFIG[1]?.radius ?? 20) * LAYOUT_SCALE) ** 2;
        const sx = this.box2dLayer.scale.x;
        const sy = this.box2dLayer.scale.y;

        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || a.merging || !a.crossedLine) continue;
            for (let j = i + 1; j < this.warriors.length; j++) {
                const b = this.warriors[j];
                if (!b.node?.isValid || b.merging || !b.crossedLine) continue;
                // Convert to canvas space for gap comparison (radius and COHESION_RANGE are in canvas pixels)
                const dxL  = b.node.position.x - a.node.position.x;
                const dyL  = b.node.position.y - a.node.position.y;
                const dist = Math.sqrt((dxL * sx) ** 2 + (dyL * sy) ** 2);
                const gap  = Math.max(0, dist - a.radius - b.radius);
                if (gap <= 0 || gap > COHESION_RANGE) continue;
                const t    = 1 - gap / COHESION_RANGE;
                const f    = COHESION_FORCE * t;
                // Direction in local space for Box2D force application
                const len  = Math.sqrt(dxL * dxL + dyL * dyL) || 1;
                const nx   = dxL / len;
                const ny   = dyL / len;
                const msA  = (a.radius * a.radius) / r1sq;
                const msB  = (b.radius * b.radius) / r1sq;
                a.applyForce(new Vec2( nx * f * msA,  ny * f * msA));
                b.applyForce(new Vec2(-nx * f * msB, -ny * f * msB));
            }
        }
    }

    // --- tutorial ---

    private showTutorial(onDone: () => void): void {
        if (sys.localStorage.getItem('fw_tutorial_done') === '1') { onDone(); return; }

        const messages = [
            'Trascina verso il basso',
            'Rilascia per lanciare',
            'Unisci due uguali!',
        ];
        let idx = 0;

        const showNext = () => {
            if (idx >= messages.length) {
                sys.localStorage.setItem('fw_tutorial_done', '1');
                onDone();
                return;
            }

            const overlay = new Node('TutOverlay');
            overlay.setParent(this.uiLayer);
            overlay.setPosition(0, 0);
            const ot = overlay.addComponent(UITransform);
            ot.setContentSize(720, 1280);

            const popup = new Node('TutPopup');
            popup.setParent(overlay);
            popup.setPosition(0, 50);

            const bg = popup.addComponent(Graphics);
            bg.fillColor = new Color(20, 20, 40, 230);
            bg.rect(-220, -40, 440, 80);
            bg.fill();
            bg.strokeColor = new Color(255, 220, 50, 200);
            bg.lineWidth = 2;
            bg.rect(-220, -40, 440, 80);
            bg.stroke();

            const textNode = new Node('TutText');
            textNode.setParent(popup);
            const msgLbl = textNode.addComponent(Label);
            msgLbl.string = messages[idx];
            msgLbl.fontSize = 30;
            msgLbl.isBold = true;
            msgLbl.color = new Color(255, 255, 255, 255);

            const hintNode = new Node('TutHint');
            hintNode.setParent(popup);
            hintNode.setPosition(0, -58);
            const hintLbl = hintNode.addComponent(Label);
            hintLbl.string = 'tocca per continuare';
            hintLbl.fontSize = 16;
            hintLbl.color = new Color(180, 180, 180, 180);

            idx++;
            overlay.on(Node.EventType.TOUCH_START, () => { overlay.destroy(); showNext(); }, this);
        };

        showNext();
    }

    private showRoundUpBanner(): void {
        const newSpeciesIdx = WARRIORS.findIndex(w => w.introRound === this.currentRound);
        const silhouetteFrame = newSpeciesIdx >= 0
            ? WarriorSpriteCache.get(WARRIORS[newSpeciesIdx].type, 1)
            : null;
        this.vfx.showRoundUpBanner(this.currentRound, silhouetteFrame);
    }

    private updateNextPreview(animate = false): void {
        if (!this.nextPreviewNode?.isValid) return;
        const { type, level } = this.spawnMgr.next;
        const frame = WarriorSpriteCache.get(WARRIORS[type]?.type ?? '', level);

        if (!this.nextNextWarriorNode?.isValid) {
            const icon = new Node('NextWarrior');
            icon.setParent(this.nextPreviewNode);
            icon.addComponent(UITransform).setContentSize(100, 100);
            this.nextNextWarriorNode = icon;
            this._nextPreviewAuraNode = null;
        }
        const sp = this.nextNextWarriorNode.getComponent(Sprite) ?? this.nextNextWarriorNode.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame ?? null!;

        // Aura glow on next preview when a pending boost is waiting
        if (this._nextSlotBoostEnergy >= 0 && this.vfx.auraFrame) {
            if (!this._nextPreviewAuraNode?.isValid) {
                const aura = new Node('PreviewAura');
                aura.setParent(this.nextNextWarriorNode);
                aura.setSiblingIndex(0);
                const _auraMin  = 148 * 0.8;
                const _auraSize = Math.min(_auraMin * Math.pow(1.2, Math.max(0, this._nextSlotBoostEnergy - 1)), _auraMin * 2);
                aura.addComponent(UITransform).setContentSize(_auraSize, _auraSize);
                const auraSp = aura.addComponent(Sprite);
                auraSp.sizeMode    = Sprite.SizeMode.CUSTOM;
                auraSp.spriteFrame = this.vfx.auraFrame;
                auraSp.color       = new Color(255, 200, 50, 255);
                const op = aura.addComponent(UIOpacity);
                op.opacity = 0;
                tween(op).to(0.6, { opacity: 90 }).start();
                tween(aura)
                    .repeatForever(tween<Node>()
                        .to(0.7, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineInOut' })
                        .to(0.7, { scale: new Vec3(1.0,  1.0,  1) }, { easing: 'sineInOut' }))
                    .start();
                this._nextPreviewAuraNode = aura;
            }
        } else {
            if (this._nextPreviewAuraNode?.isValid) {
                this._nextPreviewAuraNode.destroy();
            }
            this._nextPreviewAuraNode = null;
        }

        if (animate) {
            Tween.stopAllByTarget(this.nextNextWarriorNode);
            this.nextNextWarriorNode.setScale(0.05, 0.05, 1);
            tween(this.nextNextWarriorNode)
                .to(0.18, { scale: new Vec3(1.22, 1.22, 1) }, { easing: 'quadOut' })
                .to(0.08, { scale: new Vec3(0.93, 0.93, 1) })
                .to(0.07, { scale: new Vec3(1.0,  1.0,  1) })
                .start();
        }
    }

    private animateNextTransition(): void {
        // Zoom-in warrior at launcher (deferred one frame — nextLaunchWarrior set after spawnNext returns)
        this.scheduleOnce(() => {
            const w = this.nextLaunchWarrior;
            if (!w?.node?.isValid || !w.mapper) return;
            w.mapper.animScale = 0;
            AudioManager.instance.play(SFX.SPAWN, 0.8);
            tween(w.mapper)
                .to(0.18, { animScale: 1.2 }, { easing: 'quadOut' })
                .to(0.08, { animScale: 0.9 })
                .to(0.06, { animScale: 1.0 })
                .call(() => { if (this.nextLaunchWarrior === w) this.nextLaunchWarrior = null; })
                .start();
        }, 0);

        if (this.nextNextWarriorNode?.isValid) {
            Tween.stopAllByTarget(this.nextNextWarriorNode);
            tween(this.nextNextWarriorNode)
                .to(0.12, { scale: new Vec3(0, 0, 1) }, { easing: 'quadIn' })
                .delay(0.18)
                .call(() => this.updateNextPreview(true))
                .start();
        } else {
            this.scheduleOnce(() => this.updateNextPreview(true), 0.30);
        }
    }

    private makeLabel(parent: Node, text: string, x: number, y: number, fontSize: number, color: Color): Label {
        const node = new Node(text);
        node.setParent(parent);
        node.setPosition(x, y);
        const lbl = node.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.color = color;
        lbl.enableOutline = true;
        lbl.outlineColor  = new Color(0, 0, 0, 220);
        lbl.outlineWidth  = 2;
        return lbl;
    }

    // --- physics helpers ---

    private zSortWarriors(): void {
        [...this.warriors]
            .sort((a, b) => b.node.position.y - a.node.position.y)
            .forEach((w, i) => {
                w.node.setSiblingIndex(i);
                if (w.viewNode?.isValid) w.viewNode.setSiblingIndex(i);
            });
    }

    private applyUpwardDrift(): void {
        const force = UPWARD_DRIFT_BASE * LAYOUT_SCALE;
        const r1sq  = ((LEVEL_CONFIG[1]?.radius ?? 20) * LAYOUT_SCALE) ** 2;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging || !w.crossedLine) continue;
            const massScale = (w.radius * w.radius) / r1sq;
            w.applyForce(new Vec2(0, force * massScale));
        }
    }

    private applyMagnetism(): void {
        const magnetGap   = MAGNET_GAP_BASE   * LAYOUT_SCALE;
        const magnetForce = MAGNET_FORCE_BASE  * LAYOUT_SCALE;
        const r1    = (LEVEL_CONFIG[1]?.radius ?? 20) * LAYOUT_SCALE;
        const r1sq  = r1 * r1;
        // box2dLayer has non-uniform scale (scaleY=0.5): node.position is local, not canvas.
        // Convert to canvas space for gap comparison (radius and magnetGap are in canvas pixels).
        // Force direction stays in local space since Box2D operates there.
        const sx = this.box2dLayer.scale.x;
        const sy = this.box2dLayer.scale.y;
        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || a.merging) continue;

            let nearestGap = Infinity;
            let nearest: Warrior | null = null;

            for (let j = 0; j < this.warriors.length; j++) {
                if (i === j) continue;
                const b = this.warriors[j];
                if (!b.node?.isValid || b.merging || b.type !== a.type || b.level !== a.level) continue;

                const dx = (b.node.position.x - a.node.position.x) * sx;
                const dy = (b.node.position.y - a.node.position.y) * sy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const gap = Math.max(0, dist - a.radius - b.radius);
                if (gap < magnetGap && gap < nearestGap) {
                    nearestGap = gap;
                    nearest = b;
                }
            }

            if (nearest) {
                const dir = new Vec2(
                    nearest.node.position.x - a.node.position.x,
                    nearest.node.position.y - a.node.position.y
                ).normalize();
                const t = 1 - (nearestGap / magnetGap);
                const massScale = (a.radius * a.radius) / r1sq;
                a.applyForce(dir.multiplyScalar(magnetForce * (1 + t * t * 8) * massScale));
            }
        }
    }


    private _showLoadingSpinner(): Node {
        const spinner = new Node('LoadingSpinner');
        spinner.setParent(this.uiLayer);

        const arc = new Node('Arc');
        arc.setParent(spinner);
        const g = arc.addComponent(Graphics);
        g.lineWidth   = 8;
        g.strokeColor = new Color(255, 220, 50, 230);
        g.arc(0, 0, 36, 0, Math.PI * 1.5, false);
        g.stroke();

        const dot = new Node('Dot');
        dot.setParent(spinner);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = new Color(255, 220, 50, 230);
        dg.circle(0, -36, 5);
        dg.fill();

        const spin = () => {
            if (!arc.isValid) return;
            tween(arc).by(0.65, { angle: -360 }).call(spin).start();
            tween(dot).by(0.65, { angle: -360 }).start();
        };
        spin();
        return spinner;
    }

    private createDebugLabel(): Label {
        const node = new Node('DebugLabel');
        node.setParent(this.uiLayer);
        node.setPosition(-TRACK_W / 2 + 10, GAME_OVER_LINE_Y - 20);
        const label = node.addComponent(Label);
        label.fontSize = 18;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.color = new Color(255, 220, 0, 255);
        return label;
    }

    private updateDebugLabel(): void {
        if (!this.debugLabel) return;
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        const moving = inPlay.filter(w => w.velocity.length() >= SETTLE_VELOCITY).length;
        const angleDeg = this.inputCtrl.aimAngleDeg;
        const angleStr = (angleDeg >= 0 ? '+' : '') + angleDeg + '°';
        this.debugLabel.string = `state: ${GameState[this.state]}  moving: ${moving}/${inPlay.length}  angle: ${angleStr}  force: ${this.inputCtrl.aimForcePct}%`;
    }
}
