import { _decorator, Component, PhysicsSystem2D, EPhysics2DDrawFlags, Vec2, Vec3, tween, Node, Label, Graphics, Color, UITransform, UIOpacity, Widget, director, sys, view, ResolutionPolicy, Sprite } from 'cc';
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
const { ccclass } = _decorator;

const VERSION            = '0.5.5';
const DEBUG              = false;  // set true to show debug panel and overlay
const DEBUG_ENGINE       = false;  // set true to overlay Box2D collider shapes (circles + track walls) on top of visuals
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
const LAUNCH_TIMER       = 15;     // seconds per turn, round 1

// Cumulative totalMerges to reach each round (index = round - 1, so [1] = 10 means 10 merges → round 2)
const ROUND_THRESHOLDS = [0, 10, 25, 45, 70, 100, 135] as const;

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
    private prevY = new Map<Warrior, number>();
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
    private suctionCenter: Vec2 | null = null;
    private suctionTimeLeft: number = 0;
    private suctionDuration: number = 0;
    private suctionPeakForce: number = 0;
    private cohesionTimeLeft: number = 0;
    private resizeRafId = 0;
    private _lastTickSec = -1;
    private _dangerCooldown = 0;
    private _stateBeforePause: GameState | null = null;
    private _pauseOverlay: Node | null = null;
    private get gameOverLineLocal(): number {
        const sy = this.box2dLayer?.scale.y ?? 1;
        return sy > 0 ? GAME_OVER_LINE_Y / sy : GAME_OVER_LINE_Y;
    }

    private syncInputBounds(): void {
        this.inputCtrl.setTrackBounds(WALL_LB, WALL_LT, WALL_RB, WALL_RT);
    }

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
    private roundProgressGfx: Graphics | null = null;
    private roundProgressLabel: Label | null = null;
    private nextPreviewNode: Node | null = null;
    private nextNextWarriorNode: Node | null = null;
    private nextLaunchWarrior: Warrior | null = null;
    private timerLabel: Label | null = null;
    private timerSectionNode: Node | null = null;

    start() {
        AudioManager.instance; // trigger singleton init + asset preload as early as possible
        this.scheduleOnce(() => AudioManager.instance.playMusic(), 0.5);
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);
        initLayout();
        this.sceneName = director.getScene()?.name || 'GameScene';
        console.log('[GameManager] start');
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

        // Track.start() ran before this (higher in hierarchy) with wrong viewport — rebuild walls now
        this.track = this.worldNode.getChildByName('Track')?.getComponent(Track) ?? null;
        this.track?.relayout();
        this.nextPreviewNode = this.track?.node.getChildByName('NextPreview') ?? null;

        this.inputCtrl = this.node.addComponent(InputController);
        this.inputCtrl.ropeParent = this.worldNode;
        this.inputCtrl.onLaunch     = (w) => this.onWarriorLaunched(w);
        this.inputCtrl.onTap        = (w) => this.cycleLauncherLevel(w);
        this.inputCtrl.getWarriors  = () => this.warriors;
        this.inputCtrl.showBounds   = DEBUG_ENGINE;
        this.inputCtrl.initialScale = LAYOUT_SCALE;
        this.syncInputBounds();

        this.spawnMgr = new SpawnManager(this.box2dLayer, this.warriorsLayer, spawnTypesForRound(1), this.box2dLayer.scale.y);
        this.spawnMgr.onMergeReady    = (a, b) => this.mergeWarriors(a, b);
        this.spawnMgr.onNextGenerated = ()      => this.animateNextTransition();

        WarriorSpriteCache.preload(() => {
            this.warriors.push(...this.spawnMgr.prefill());
            const firstWarrior = this.createWarrior();
            this.createHud();
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
        });
    }

    onDestroy() {
        if (LIVE_RESIZE && sys.isBrowser) window.removeEventListener('resize', this.onBrowserResize);
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
        console.log(`[GameManager] debug: pause=${v}`);
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
        console.log(`[GameManager] debug: round → ${this.currentRound}`);
    }

    getTotalMerges(): number { return this.totalMerges; }

    setTotalMerges(n: number): void {
        this.totalMerges = Math.max(0, n);
        this.updateRoundProgress();
        console.log(`[GameManager] debug: totalMerges → ${this.totalMerges}`);
    }

    getWarriors(): readonly Warrior[] { return this.warriors; }

    addDebugWarrior(type: number, level: number, x: number, y: number): void {
        const w = Warrior.spawn(this.box2dLayer, this.warriorsLayer, type, level, x, y);
        w.crossedLine = true;
        w.onMergeReady = this.timerPaused ? null : (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(w);
        console.log(`[GameManager] debug: placed type=${type} lv=${level} at (${x.toFixed(0)},${y.toFixed(0)})`);
    }

    cycleDebugWarriorLevel(w: Warrior): void {
        if (!w.node?.isValid) return;
        const pos      = w.node.position.clone();
        const type     = w.type;
        const maxLevel = WARRIORS[type]?.maxLevel ?? 7;
        const newLevel = w.level < maxLevel ? w.level + 1 : 1;
        this.warriors  = this.warriors.filter(x => x !== w);
        this.prevY.delete(w);
        w.node.destroy();
        const nw = Warrior.spawn(this.box2dLayer, this.warriorsLayer, type, newLevel, pos.x, pos.y);
        nw.crossedLine  = true;
        nw.onMergeReady = this.timerPaused ? null : (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(nw);
        console.log(`[GameManager] debug: cycled type=${type} → lv${newLevel}`);
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
        console.log(`[GameManager] debug: state saved (${state.warriors.length} warriors, round ${state.round})`);
    }

    loadDebugState(): void {
        const raw = sys.localStorage.getItem('fw_debug_state');
        if (!raw) { console.warn('[GameManager] debug: no saved state'); return; }
        const state = JSON.parse(raw) as { warriors: { type: number; level: number; x: number; y: number }[]; round: number; totalMerges: number };

        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.prevY.delete(w);
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
        console.log(`[GameManager] debug: state loaded (${state.warriors.length} warriors, round ${this.currentRound})`);
    }

    resetDebugState(): void {
        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.prevY.delete(w);
            if (w.node?.isValid) w.node.destroy();
        });
        // this.warriors.push(...this.spawnMgr.prefill());

        this.currentRound     = 1;
        this.totalMerges      = 0;
        this.mergesThisLaunch = 0;
        this.score            = 0;
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(1));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(1));
        this.timerRemaining = launchTimerForRound(1);
        this.updateRoundLabel();
        this.updateRoundProgress();
        this.updateScoreLabel();
        console.log('[GameManager] debug: state reset');
    }

    update(dt: number) {
        if (this.state === GameState.GameOver || this.state === GameState.Paused) return;
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
            this.warriors = this.warriors.filter(w => w != null && w.node != null && w.node.isValid);
            this.zSortWarriors();
            if (!this.timerPaused) {
                this.applyMagnetism();
                this.applyUpwardDrift();
            }
            if (this.cohesionTimeLeft > 0) { this.applyCohesion(); this.cohesionTimeLeft -= dt; }
            if (this.suctionCenter) this.applyVortexSuction(dt);
            this.checkLineLogic(dt);
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
        if (w.mapper) w.mapper.animScale = 0;
        // PerspectiveMapper.lateUpdate hasn't run yet for this brand-new component — hide viewNode
        // immediately so it doesn't flash at (0,0) for the first rendered frame.
        if (w.viewNode?.isValid) w.viewNode.setScale(0, 0, 1);
        this.warriors.push(w);
        this.nextLaunchWarrior = w;
        return w;
    }

    private activateWarrior(w: Warrior): void {
        this.inputCtrl.setWarrior(w);
        this.timerRemaining = launchTimerForRound(this.currentRound);
        this.mergesThisLaunch = 0;
        this.state = GameState.Aiming;
        this.updateTimerLabel();
        console.log('[GameManager] warrior activated — ready to launch');
    }

    private onWarriorLaunched(w: Warrior): void {
        const launchY = w.node.position.y;
        if (launchY >= this.gameOverLineLocal) {
            console.error(`[GameManager] LAUNCH ERROR: warrior localY=${launchY.toFixed(1)} >= gameOverLineLocal=${this.gameOverLineLocal.toFixed(1)} — aborting launch`);
            return;
        }
        this.state = GameState.Inflight;
        this.inflightWarrior = w;
        this._lastTickSec = -1;
        AudioManager.instance.play(SFX.LAUNCH);
        console.log('[GameManager] warrior launched');
        this.scheduleOnce(() => this.checkLaunchResult(w), LAUNCH_CHECK_DELAY);
    }

    private checkSettled(): void {
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        inPlay.forEach(w => { if (w.velocity.length() < SETTLE_VELOCITY) w.forceStop(); });
        if (!inPlay.every(w => w.velocity.length() < SETTLE_VELOCITY)) return;

        console.log('[GameManager] all warriors settled');
        AudioManager.instance.play(SFX.LAND, 0.5);
        if (this.roundUpPause) return;
        this.activateWarrior(this.createWarrior());
    }

    // --- line / game over logic ---

    private checkLaunchResult(w: Warrior): void {
        if (!w.node?.isValid || w.crossedLine || this.state === GameState.GameOver) return;
        if (w.node.position.y >= this.gameOverLineLocal) return;
        if (w.velocity.length() < SETTLE_VELOCITY) {
            if (w.hitOtherWarrior) {
                console.log('[GameManager] launched warrior hit established warriors and fell back — game over');
                this.triggerGameOver();
            } else {
                console.log('[GameManager] launched warrior settled below line — returning with malus');
                this.penaliseAndReturn(w);
            }
        } else {
            this.scheduleOnce(() => this.checkLaunchResult(w), 0.3);
        }
    }

    private penaliseAndReturn(w: Warrior): void {
        this.score = Math.max(0, this.score - FAILED_LAUNCH_MALUS);
        AudioManager.instance.play(SFX.MALUS);
        this.spawnFloatingScore(w.node.position.x, this.coords.physToVisual(w.node.position.y), -FAILED_LAUNCH_MALUS);
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
            if (!w.node?.isValid) continue;
            const y    = w.node.position.y;
            const prev = this.prevY.get(w) ?? y;

            if (!w.crossedLine && w.launched) {
                if (y >= gol) {
                    w.crossedLine = true;
                    w.settled = true;
                    console.log('[GameManager] warrior crossed line — in play');
                    if (this.state === GameState.Inflight) {
                        if (this.waitForSettling) {
                            this.state = GameState.Settling;
                        } else {
                            this.activateWarrior(this.createWarrior());
                        }
                    }
                }
            } else if (w.crossedLine && w.settled) {
                const bottom = y - w.radius;
                if (w !== this.inflightWarrior && bottom <= gol) anyDanger = true;
                if (prev >= gol && y < gol) {
                    console.log('[GameManager] warrior fully below game-over line — penalty');
                    this.penaltyExplode(w);
                }
            }

            this.prevY.set(w, y);
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

    private penaltyExplode(_w: Warrior): void {
        if (this.timerPaused) return;
        console.log(`[GameManager] warrior fell below line — game over`);
        this.triggerGameOver();
    }

    private cycleLauncherLevel(w: Warrior): void {
        const maxLevel = Object.keys(LEVEL_CONFIG).length;
        const newLevel = (w.level % maxLevel) + 1;
        const pos = w.node.position;
        this.warriors = this.warriors.filter(x => x !== w);
        this.prevY.delete(w);
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
        console.log(`[GameManager] debug: launcher lv${w.level} → lv${newLevel}`);
    }

    private triggerGameOver(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        this.inputCtrl.clearWarrior();
        AudioManager.instance.play(SFX.GAME_OVER);
        console.log('[GameManager] game over');
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            sys.localStorage.setItem('fw_best_score', String(this.bestScore));
        }
        this.scheduleOnce(() => this.showGameOverScreen(), 0);
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
        retryNode.addComponent(UITransform);
        retryNode.on(Node.EventType.TOUCH_START, () => director.loadScene(this.sceneName), this);
    }

    // --- merge ---

    private mergeWarriors(a: Warrior, b: Warrior): void {
        if (this.timerPaused) { a.merging = false; b.merging = false; return; }

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
        console.log(`[GameManager] merge! type=${a.type} lv${a.level}+lv${b.level} → lv${newLevel} (max=${maxLevel}) v=(${vx.toFixed(1)},${vy.toFixed(1)})`);

        this.prevY.delete(a);
        this.prevY.delete(b);
        a.node.destroy();
        b.node.destroy();

        this.totalMerges++;
        this.mergesThisLaunch++;
        this.checkRoundAdvance();
        const points = 10 * (1 << (newLevel - 1)) * this.currentRound * (1 << (this.mergesThisLaunch - 1));
        this.score += points;
        this.spawnFloatingScore(midX, midYC, points);
        this.updateScoreLabel();
        this.updateRoundProgress();

        if (newLevel > maxLevel) {
            // Both at max level — consume both, free space, no new warrior spawned
            AudioManager.instance.play(SFX.EXPLOSION_LEGEND);
            this.flashBurst(midX, midYC, a.type);
            if (inflightMerged) this.activateAfterInflightMerge();
            return;
        }

        const merged = Warrior.spawn(this.box2dLayer, this.warriorsLayer, a.type, newLevel, midX, midY);
        merged.crossedLine = true;
        merged.settle();
        merged.onMergeReady = (x, y) => this.mergeWarriors(x, y);
        merged.velocity = new Vec2(vx, vy);
        this.warriors.push(merged);

        if (newLevel === maxLevel && maxLevel >= 5) {
            this.triggerSpecialExplosion(merged, newLevel);
        } else {
            const mergeSfxs = [SFX.MERGE_1, SFX.MERGE_2, SFX.MERGE_3, SFX.MERGE_4];
            const mergeSfx = mergeSfxs[Math.min(newLevel - 2, mergeSfxs.length - 1)];
            AudioManager.instance.play(mergeSfx);
            this.flashMerge(merged);
        }

        if (inflightMerged) this.activateAfterInflightMerge();
    }

    private activateAfterInflightMerge(): void {
        console.log('[GameManager] inflight warrior merged before crossing line — activating next');
        if (this.waitForSettling) {
            this.state = GameState.Settling;
        } else {
            this.activateWarrior(this.createWarrior());
        }
    }

    // --- HUD ---

    private createHud(): void {
        const existingHud = this.uiLayer.getChildByName('HUD');
        if (existingHud) {
            this.scoreLabel      = existingHud.getChildByName('ScoreSec')  ?.getChildByName('ScoreValue')  ?.getComponent(Label) ?? null;
            this.roundLabel      = existingHud.getChildByName('RoundSec')  ?.getChildByName('RoundValue')  ?.getComponent(Label) ?? null;
            this.timerLabel      = existingHud.getChildByName('TimerSec')  ?.getChildByName('TimerValue')  ?.getComponent(Label) ?? null;
            this.timerSectionNode = existingHud.getChildByName('TimerSec') ?? null;
            const versionLabel = existingHud.getChildByName('VersionSec')?.getChildByName('VersionValue')?.getComponent(Label);
            if (versionLabel) versionLabel.string = `v${VERSION}`;
            const existingBtn = existingHud.getChildByName('FullscreenBtn');
            if (existingBtn) this.drawFullscreenIcon(existingBtn);
            this.wireAudioButton(existingHud, 'MusicBtn', 'MusicLabel',
                () => AudioManager.instance.toggleMusic(), () => AudioManager.instance.musicMuted);
            this.wireAudioButton(existingHud, 'SfxBtn', 'SfxLabel',
                () => AudioManager.instance.toggleSfx(),  () => AudioManager.instance.sfxMuted);
            const pauseLabelNode = existingHud.getChildByName('PauseBtn')?.getChildByName('PauseLabel') ?? null;
            existingHud.getChildByName('PauseBtn')?.on(Node.EventType.TOUCH_START, () => this.togglePause(pauseLabelNode), this);
            this.updateNextPreview();
            // Create ring nodes programmatically on existing HUD
            const roundSec = existingHud.getChildByName('RoundSec');
            if (roundSec) {
                const ringNode = roundSec.getChildByName('RoundRing') ?? new Node('RoundRing');
                if (!ringNode.parent) {
                    ringNode.setParent(roundSec);
                    ringNode.setPosition(0, -56);
                    ringNode.addComponent(UITransform).setContentSize(80, 80);
                }
                this.roundProgressGfx = ringNode.getComponent(Graphics) ?? ringNode.addComponent(Graphics);
                const plNode = roundSec.getChildByName('RoundProgress') ?? new Node('RoundProgress');
                if (!plNode.parent) {
                    plNode.setParent(roundSec);
                    plNode.setPosition(0, -105);
                    const lbl = plNode.addComponent(Label);
                    lbl.fontSize = 13;
                    lbl.color = new Color(160, 220, 255, 200);
                    this.roundProgressLabel = lbl;
                } else {
                    this.roundProgressLabel = plNode.getComponent(Label);
                }
            }
            return;
        }
        const hud = new Node('HUD');
        hud.setParent(this.uiLayer);
        const vs = view.getVisibleSize();
        hud.addComponent(UITransform).setContentSize(vs.width, vs.height);
        const MH = 80;   // horizontal margin (left/right)
        const MV = 40;   // vertical margin   (top/bottom)

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

        // Ring progress around round number
        const ringNode = new Node('RoundRing');
        ringNode.setParent(roundSec);
        ringNode.setPosition(0, -56);
        ringNode.addComponent(UITransform).setContentSize(80, 80);
        this.roundProgressGfx = ringNode.addComponent(Graphics);

        // Merges done / needed label below round number
        const progressLabelNode = new Node('RoundProgress');
        progressLabelNode.setParent(roundSec);
        progressLabelNode.setPosition(0, -105);
        this.roundProgressLabel = progressLabelNode.addComponent(Label);
        this.roundProgressLabel.fontSize = 13;
        this.roundProgressLabel.color = new Color(160, 220, 255, 200);

        this.updateNextPreview();

        // ── Fullscreen button (top-right, inside margin) ──────────────────
        this.createFullscreenButton(hud);

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

    private togglePause(labelNode: Node | null): void {
        if (this.state === GameState.GameOver) return;
        const isPaused = this.state === GameState.Paused;
        if (isPaused) {
            this.state = this._stateBeforePause ?? GameState.Aiming;
            this._stateBeforePause = null;
            PhysicsSystem2D.instance.enable = true;
            if (labelNode) labelNode.getComponent(Label)!.string = '||';
            if (this._pauseOverlay?.isValid) this._pauseOverlay.destroy();
            this._pauseOverlay = null;
        } else {
            this._stateBeforePause = this.state;
            this.state = GameState.Paused;
            PhysicsSystem2D.instance.enable = false;
            if (labelNode) labelNode.getComponent(Label)!.string = '▶';
            const overlay = new Node('PauseOverlay');
            overlay.setParent(this.uiLayer);
            const g = overlay.addComponent(Graphics);
            const vs = view.getVisibleSize();
            g.fillColor = new Color(0, 0, 0, 140);
            g.rect(-vs.width / 2, -vs.height / 2, vs.width, vs.height);
            g.fill();
            this.makeLabel(overlay, 'PAUSA', 0, 60, 64, new Color(255, 255, 255, 230));
            this._pauseOverlay = overlay;
        }
    }

    private wireAudioButton(hud: Node, btnName: string, labelName: string, toggle: () => boolean, isMuted: () => boolean): void {
        const btn = hud.getChildByName(btnName);
        if (!btn) return;
        const lbl = btn.getChildByName(labelName)?.getComponent(Label) ?? null;
        const updateColor = (muted: boolean) => {
            if (lbl) lbl.color = muted ? new Color(100, 100, 100, 150) : new Color(255, 255, 255, 220);
        };
        updateColor(isMuted());
        btn.on(Node.EventType.TOUCH_START, () => updateColor(toggle()), this);
    }

    private createFullscreenButton(parent: Node): void {
        const btn = new Node('FullscreenBtn');
        btn.setParent(parent);
        btn.addComponent(UITransform).setContentSize(44, 44);
        const bw = btn.addComponent(Widget);
        bw.isAlignRight  = true; bw.right  = 80;
        bw.isAlignBottom = true; bw.bottom = 40;
        bw.updateAlignment();
        this.drawFullscreenIcon(btn);
    }

    private drawFullscreenIcon(btn: Node): void {
        const g = btn.getComponent(Graphics) ?? btn.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 100);
        g.rect(-22, -22, 44, 44);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 180);
        g.lineWidth = 2.5;
        g.moveTo(-11, -3); g.lineTo(-11, -11); g.lineTo(-3, -11);
        g.moveTo(3, -11);  g.lineTo(11, -11);  g.lineTo(11, -3);
        g.moveTo(-11, 3);  g.lineTo(-11, 11);  g.lineTo(-3, 11);
        g.moveTo(3, 11);   g.lineTo(11, 11);   g.lineTo(11, 3);
        g.stroke();
        btn.on(Node.EventType.TOUCH_START, () => this.toggleFullscreen(), this);
    }

    private toggleFullscreen(): void {
        if (!sys.isBrowser) return;
        if (!(document as any).fullscreenElement) {
            (document.documentElement as any).requestFullscreen?.().catch?.(() => {});
        } else {
            (document as any).exitFullscreen?.().catch?.(() => {});
        }
    }

    private tickTimer(dt: number): void {
        if (this.timerPaused) return;
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

    private updateScoreLabel(): void {
        if (this.scoreLabel) this.scoreLabel.string = String(this.score);
    }

    private updateRoundLabel(): void {
        if (this.roundLabel) this.roundLabel.string = String(this.currentRound);
        this.updateRoundProgress();
    }

    private updateRoundProgress(): void {
        const R  = 35;
        const LW = 10;
        const cur = this.currentRound;

        // Progress label text
        if (this.roundProgressLabel) {
            if (cur >= MAX_ROUND) {
                this.roundProgressLabel.string = 'MAX';
            } else {
                const prev  = ROUND_THRESHOLDS[cur - 1] as number;
                const next  = ROUND_THRESHOLDS[cur]     as number;
                const done  = Math.min(this.totalMerges - prev, next - prev);
                const total = next - prev;
                this.roundProgressLabel.string = `${done}/${total}`;
            }
        }

        // Arc
        if (!this.roundProgressGfx) return;
        const g = this.roundProgressGfx;
        g.clear();

        // Background track
        g.lineWidth   = LW;
        g.strokeColor = new Color(60, 60, 70, 220);
        g.arc(0, 0, R, 0, Math.PI * 2, false);
        g.stroke();

        // Filled arc
        let factor = 0;
        if (cur >= MAX_ROUND) {
            factor = 1;
        } else {
            const prev  = ROUND_THRESHOLDS[cur - 1] as number;
            const next  = ROUND_THRESHOLDS[cur]     as number;
            factor = Math.max(0, Math.min(1, (this.totalMerges - prev) / (next - prev)));
        }

        if (factor > 0) {
            const startAngle = -Math.PI / 2;
            const endAngle   = startAngle + factor * Math.PI * 2;
            g.lineWidth   = LW;
            g.strokeColor = new Color(120, 220, 255, 255);
            g.arc(0, 0, R, startAngle, endAngle, false);
            g.stroke();
        }
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
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(this.currentRound));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(this.currentRound));
        this.updateRoundLabel();
        this.roundUpPause = true;
        AudioManager.instance.play(SFX.ROUND_UP);
        this.showRoundUpBanner();
        this.scheduleOnce(() => { this.roundUpPause = false; }, 1.5);
        console.log(`[GameManager] round up → round ${this.currentRound}, types=${spawnTypesForRound(this.currentRound)}, timer=${launchTimerForRound(this.currentRound)}s`);
    }

    private triggerSpecialExplosion(w: Warrior, level: number): void {
        const lvConf = LEVEL_CONFIG[level];
        const bonus = lvConf?.bonus ?? 0;
        const color = lvConf?.vfxColor ?? new Color(255, 255, 255, 255);
        const expSfx = level >= 7 ? SFX.EXPLOSION_LEGEND : level >= 6 ? SFX.EXPLOSION_HERO : SFX.EXPLOSION_CHAMPION;
        AudioManager.instance.play(expSfx);
        const mx  = w.node.position.x;                   // local (scaleX=1 → canvas)
        const my  = w.node.position.y;                   // local Y
        const myC = this.coords.physToVisual(my);         // canvas Y for UI/VFX
        const r   = w.radius;

        this.warriors = this.warriors.filter(wr => wr !== w);
        this.prevY.delete(w);
        w.node.destroy();

        this.score += bonus;
        this.updateScoreLabel();
        if (bonus > 0) this.spawnFloatingScore(mx, myC + 30, bonus);

        // Two expanding rings
        for (let i = 0; i < 2; i++) {
            const vfx = new Node('ExpVFX');
            vfx.setParent(this.vfxLayer);
            vfx.setPosition(mx, myC);
            const g = vfx.addComponent(Graphics);
            g.lineWidth = 6 - i * 2;
            g.strokeColor = color;
            g.circle(0, 0, r);
            g.stroke();
            const op = vfx.addComponent(UIOpacity);
            op.opacity = 255;
            const dur = 0.45 + i * 0.12;
            tween(vfx).to(dur, { scale: new Vec3(3 + i, 3 + i, 1) }).start();
            tween(op).to(dur, { opacity: 0 })
                .call(() => { if (vfx.isValid) vfx.destroy(); }).start();
        }

        // Label
        const labelNode = new Node('ExpLabel');
        labelNode.setParent(this.uiLayer);
        labelNode.setSiblingIndex(this.uiLayer.children.length - 1);
        labelNode.setPosition(mx, myC + 10);
        const lbl = labelNode.addComponent(Label);
        lbl.string = lvConf?.label ?? '';
        lbl.fontSize = 40;
        lbl.isBold = true;
        lbl.color = color;
        const labelOp = labelNode.addComponent(UIOpacity);
        labelOp.opacity = 255;
        tween(labelNode).by(0.7, { position: new Vec3(0, 55, 0) }).start();
        tween(labelOp).delay(0.3).to(0.4, { opacity: 0 })
            .call(() => { if (labelNode.isValid) labelNode.destroy(); }).start();

        console.log(`[GameManager] ${lvConf?.label ?? ''} explosion — bonus +${bonus}pts`);
    }

    // --- vortex suction ---

    private activateSuction(cx: number, cy: number, ringColor: Color, strength = 1): void {
        const BASE_DURATION = 3;
        const BASE_FORCE    = 240;
        this.suctionCenter    = new Vec2(cx, cy);
        this.suctionDuration  = BASE_DURATION * strength;
        this.suctionTimeLeft  = this.suctionDuration;
        this.suctionPeakForce = BASE_FORCE * strength;
        this.cohesionTimeLeft = this.suctionDuration + 2;

        // C — pulse di scala sui warrior vicini al punto di merge
        const pulseRadius = 300 * strength;
        for (const w of this.warriors) {
            if (!w.node?.isValid || !w.mapper || !w.crossedLine) continue;
            const dx = w.node.position.x - cx;
            const dy = w.node.position.y - cy;
            if (Math.sqrt(dx * dx + dy * dy) > pulseRadius) continue;
            const squeeze = 1 - 0.18 * strength;
            tween(w.mapper)
                .to(0.10, { animScale: squeeze }, { easing: 'quadIn' })
                .to(0.20, { animScale: 1.0 },    { easing: 'quadOut' })
                .start();
        }

        // vs = floor visivo: garantisce effetti leggibili anche al livello minimo
        const vs  = Math.max(strength, 0.35);
        const cyV = this.coords.physToVisual(cy);

        // anelli contraenti
        for (let i = 0; i < 2; i++) {
            const sring = new Node('SuctionRing');
            sring.setParent(this.vfxLayer);
            sring.setPosition(cx, cyV);
            const sg = sring.addComponent(Graphics);
            sg.lineWidth   = 4 - i;
            sg.strokeColor = new Color(ringColor.r, ringColor.g, ringColor.b, Math.round((200 - i * 40) * vs));
            sg.circle(0, 0, (180 + i * 60) * vs);
            sg.stroke();
            const sop = sring.addComponent(UIOpacity);
            sop.opacity = Math.round((180 - i * 40) * vs);
            const delay = i * 0.15;
            tween(sring).delay(delay).to(this.suctionDuration - delay, { scale: new Vec3(0.01, 0.01, 1) }).start();
            tween(sop).delay(delay).to(this.suctionDuration - delay, { opacity: 0 })
                .call(() => { if (sring.isValid) sring.destroy(); }).start();
        }

        // A — particelle vorticose che spiralano verso il centro
        const count = Math.round(5 + 7 * vs);
        for (let i = 0; i < count; i++) {
            const angle  = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const radius = (80 + Math.random() * 80) * vs;
            const startX = cx  + Math.cos(angle) * radius;
            const startY = cyV + Math.sin(angle) * radius;
            const midAngle = angle + Math.PI / 3;
            const midR     = radius * 0.4;
            const midX     = cx  + Math.cos(midAngle) * midR;
            const midY     = cyV + Math.sin(midAngle) * midR;

            const p = new Node('SuctionParticle');
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
                .to(dur * 0.55, { position: new Vec3(midX, midY, 0) }, { easing: 'quadIn' })
                .to(dur * 0.45, { position: new Vec3(cx,   cyV,  0) }, { easing: 'quadIn' })
                .call(() => { if (p.isValid) p.destroy(); })
                .start();
            tween(op)
                .delay(delay)
                .to(dur * 0.3,  { opacity: 220 })
                .to(dur * 0.7,  { opacity: 0 })
                .start();
        }
    }

    private applyVortexSuction(dt: number): void {
        this.suctionTimeLeft -= dt;
        if (this.suctionTimeLeft <= 0) {
            this.suctionCenter = null;
            return;
        }

        // Curva a campana: 0 → picco a metà → 0, sempre inward
        const elapsed  = this.suctionDuration - this.suctionTimeLeft;
        const progress = Math.sin(Math.PI * elapsed / this.suctionDuration);
        const force    = this.suctionPeakForce * progress;

        const cx = this.suctionCenter!.x;
        const cy = this.suctionCenter!.y;
        for (const w of this.warriors) {
            if (!w.node?.isValid || w.merging || !w.crossedLine) continue;
            // Only pull warriors that are below the suction center — they all get pulled upward
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
        const node = new Node('RoundUpBanner');
        node.setParent(this.uiLayer);
        node.setPosition(0, 0);
        node.setScale(0.4, 0.4, 1);

        const lbl = node.addComponent(Label);
        lbl.string = `ROUND ${this.currentRound}`;
        lbl.fontSize = 45;
        lbl.isBold = true;
        lbl.color = new Color(255, 220, 50, 255);

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        tween(node)
            .to(0.25, { scale: new Vec3(1.1, 1.1, 1) })
            .to(0.08, { scale: new Vec3(1.0, 1.0, 1) })
            .start();
        tween(opacity)
            .delay(1.05)
            .to(0.4, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
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
        }
        const sp = this.nextNextWarriorNode.getComponent(Sprite) ?? this.nextNextWarriorNode.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame ?? null!;

        if (animate) {
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

    private flashMerge(w: Warrior): void {
        if (!w.mapper) return;
        tween(w.mapper)
            .to(0.08, { animScale: 1.4 })
            .to(0.12, { animScale: 1.0 })
            .start();
    }

    private flashBurst(x: number, yCanvas: number, type: number): void {
        const burstColor = WARRIORS[type]?.color ?? new Color(200, 200, 200);
        const vfx = new Node('BurstVFX');
        vfx.setParent(this.vfxLayer);
        vfx.setPosition(x, yCanvas);
        const g = vfx.addComponent(Graphics);
        g.lineWidth = 4;
        g.strokeColor = burstColor;
        g.circle(0, 0, (LEVEL_CONFIG[4]?.radius ?? 42) * LAYOUT_SCALE);
        g.stroke();
        const op = vfx.addComponent(UIOpacity);
        op.opacity = 200;
        tween(vfx).to(0.3, { scale: new Vec3(2, 2, 1) }).start();
        tween(op).to(0.3, { opacity: 0 })
            .call(() => { if (vfx.isValid) vfx.destroy(); }).start();
        this.activateSuction(x, this.coords.visualToPhys(yCanvas), burstColor);
    }

    private spawnFloatingScore(x: number, y: number, points: number): void {
        const node = new Node('FloatingScore');
        node.setParent(this.uiLayer);
        node.setSiblingIndex(this.uiLayer.children.length - 1);
        node.setPosition(x, y);

        const lbl = node.addComponent(Label);
        lbl.string   = points >= 0 ? `+${points}` : `${points}`;
        lbl.fontSize  = points >= 0 && this.mergesThisLaunch > 1 ? 44 : 34;
        lbl.isBold    = true;
        lbl.color     = points >= 0 ? new Color(255, 220, 50, 255) : new Color(255, 80, 80, 255);

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        tween(node)
            .by(0.9, { position: new Vec3(0, 90, 0) })
            .start();
        tween(opacity)
            .delay(0.35)
            .to(0.55, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
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
