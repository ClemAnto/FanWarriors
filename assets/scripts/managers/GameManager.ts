import { _decorator, Component, PhysicsSystem2D, Vec2, Vec3, tween, Node, Label, Graphics, Color, UITransform, UIOpacity, director, sys } from 'cc';
import { Warrior, WARRIOR_RADII, COLORS } from '../entities/Warrior';
import { InputController } from './InputController';
import { SpawnManager } from './SpawnManager';
import { GameState } from './GameState';
import { GAME_OVER_LINE_Y, TRACK_W } from '../entities/Track';
import { DebugPanel, IGameManagerDebug } from './DebugPanel';
const { ccclass } = _decorator;

const MAX_ROUND          = 7;
const SPAWN_TYPES        = 3;
const MAGNET_GAP         = 30;  // surface-to-surface px at which attraction starts
const MAGNET_FORCE       = 20;  // base force for a level-1 warrior
const SETTLE_VELOCITY    = 0.4;    // Box2D velocity units — warrior is "stopped" below this
const LAUNCH_CHECK_DELAY = 0.8;    // seconds before checking if launched warrior failed to cross
const LAUNCH_TIMER       = 15;     // seconds per turn, round 1

// Cumulative totalMerges to reach each round (index = round - 1, so [1] = 10 means 10 merges → round 2)
const ROUND_THRESHOLDS = [0, 10, 25, 45, 70, 100, 135] as const;

// Max evolution level per species (index = type 0-6: Rana, Gatto, Gallina, Lupo, Aquila, Leone, Drago)
const SPECIES_MAX_LEVEL = [4, 4, 4, 5, 5, 6, 7] as const;

function launchTimerForRound(round: number): number {
    return Math.max(3, 15 - (round - 1) * 2);
}

function spawnTypesForRound(round: number): number {
    if (round <= 2) return 3;
    if (round <= 4) return 4;
    if (round <= 6) return 5;
    return 7;
}

function spawnMaxLevelForRound(round: number): number {
    if (round <= 2) return 1;
    if (round <= 6) return 2;
    return 3;
}

// HUD positions (world space, canvas 1280×720 centered at origin)
const HUD_LEFT_X  = -490;
const HUD_RIGHT_X =  490;
const HUD_TOP_Y   =  290;

@ccclass('GameManager')
export class GameManager extends Component implements IGameManagerDebug {
    private inputCtrl!: InputController;
    private spawnMgr!: SpawnManager;
    private warriors: Warrior[] = [];
    private prevY = new Map<Warrior, number>();
    private state = GameState.Idle;
    private pendingWarrior: Warrior | null = null;
    private debugLabel: Label | null = null;

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

    // hud refs
    private scoreLabel: Label | null = null;
    private roundLabel: Label | null = null;
    private mergesLabel: Label | null = null;
    private nextPreviewNode: Node | null = null;
    private timerLabel: Label | null = null;

    start() {
        this.sceneName = director.getScene()?.name || 'GameScene';
        console.log('[GameManager] start');
        PhysicsSystem2D.instance.enable = true;
        PhysicsSystem2D.instance.gravity = new Vec2(0, 0);
        console.log('[GameManager] physics initialized, gravity=0');

        this.inputCtrl = this.node.addComponent(InputController);
        this.inputCtrl.onLaunch = (w) => this.onWarriorLaunched(w);

        this.spawnMgr = new SpawnManager(this.node.parent!, SPAWN_TYPES);
        this.spawnMgr.onMergeReady    = (a, b) => this.mergeWarriors(a, b);
        this.spawnMgr.onNextGenerated = ()      => this.updateNextPreview();

        this.warriors.push(...this.spawnMgr.prefill());
        const firstWarrior = this.createWarrior();
        this.createHud();
        this.debugLabel = this.createDebugLabel();
        this.bestScore = parseInt(sys.localStorage.getItem('fw_best_score') ?? '0', 10) || 0;
        this.showTutorial(() => this.activateWarrior(firstWarrior));

        const debugNode = new Node('DebugPanel');
        debugNode.setParent(this.node.parent!);
        debugNode.addComponent(DebugPanel).init(this);
    }

    // ── IGameManagerDebug ──

    isTimerPaused(): boolean { return this.timerPaused; }
    setTimerPaused(v: boolean): void { this.timerPaused = v; }

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
        this.updateMergesLabel();
        console.log(`[GameManager] debug: totalMerges → ${this.totalMerges}`);
    }

    getWarriors(): readonly Warrior[] { return this.warriors; }

    addDebugWarrior(type: number, level: number, x: number, y: number): void {
        const w = Warrior.spawn(this.node.parent!, type, level, x, y);
        w.crossedLine = true;
        w.onMergeReady = (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(w);
        console.log(`[GameManager] debug: placed type=${type} lv=${level} at (${x.toFixed(0)},${y.toFixed(0)})`);
    }

    cycleDebugWarriorLevel(w: Warrior): void {
        if (!w.node?.isValid) return;
        const pos      = w.node.position.clone();
        const type     = w.type;
        const newLevel = w.level < 7 ? w.level + 1 : 1;
        this.warriors  = this.warriors.filter(x => x !== w);
        this.prevY.delete(w);
        w.node.destroy();
        const nw = Warrior.spawn(this.node.parent!, type, newLevel, pos.x, pos.y);
        nw.crossedLine  = true;
        nw.onMergeReady = (a, b) => this.mergeWarriors(a, b);
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
        this.updateMergesLabel();
        console.log(`[GameManager] debug: state loaded (${state.warriors.length} warriors, round ${this.currentRound})`);
    }

    resetDebugState(): void {
        [...this.warriors].filter(w => w.crossedLine).forEach(w => {
            this.warriors = this.warriors.filter(x => x !== w);
            this.prevY.delete(w);
            if (w.node?.isValid) w.node.destroy();
        });
        this.warriors.push(...this.spawnMgr.prefill());

        this.currentRound     = 1;
        this.totalMerges      = 0;
        this.mergesThisLaunch = 0;
        this.score            = 0;
        this.spawnMgr.setSpawnTypes(spawnTypesForRound(1));
        this.spawnMgr.setMaxLevel(spawnMaxLevelForRound(1));
        this.timerRemaining = launchTimerForRound(1);
        this.updateRoundLabel();
        this.updateMergesLabel();
        this.updateScoreLabel();
        console.log('[GameManager] debug: state reset');
    }

    update(dt: number) {
        if (this.state === GameState.GameOver) return;
        try {
            this.warriors = this.warriors.filter(w => w != null && w.node != null && w.node.isValid);
            this.applyMagnetism();
            this.checkLineLogic();
            if (this.state === GameState.Settling) this.checkSettled();
            if (this.state === GameState.Aiming)   this.tickTimer(dt);
            this.updateDebugLabel();
        } catch (e) {
            console.error('[GameManager] fatal error — update loop stopped:', e);
            this.enabled = false;
        }
    }

    // --- spawn flow ---

    private createWarrior(): Warrior {
        const w = this.spawnMgr.spawnNext();
        this.warriors.push(w);
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
        this.state = GameState.Inflight;
        console.log('[GameManager] warrior launched');
        this.scheduleOnce(() => this.checkLaunchResult(w), LAUNCH_CHECK_DELAY);
    }

    private checkSettled(): void {
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        inPlay.forEach(w => { if (w.velocity.length() < SETTLE_VELOCITY) w.forceStop(); });
        if (!inPlay.every(w => w.velocity.length() < SETTLE_VELOCITY)) return;

        console.log('[GameManager] all warriors settled');
        if (this.roundUpPause) return;
        if (this.pendingWarrior?.node?.isValid) {
            const next = this.pendingWarrior;
            this.pendingWarrior = null;
            this.activateWarrior(next);
        }
    }

    // --- line / game over logic ---

    private checkLaunchResult(w: Warrior): void {
        if (!w.node?.isValid || w.crossedLine || this.state === GameState.GameOver) return;
        if (w.node.position.y >= GAME_OVER_LINE_Y) return; // above line — checkLineLogic handles crossing
        if (w.velocity.length() < SETTLE_VELOCITY) {
            console.log('[GameManager] launched warrior settled below line — game over');
            this.triggerGameOver();
        } else {
            this.scheduleOnce(() => this.checkLaunchResult(w), 0.3);
        }
    }

    private checkLineLogic(): void {
        for (const w of this.warriors) {
            if (!w.node?.isValid) continue;
            const y    = w.node.position.y;
            const prev = this.prevY.get(w) ?? y;

            if (!w.crossedLine && w.launched) {
                if (y >= GAME_OVER_LINE_Y) {
                    w.crossedLine = true;
                    console.log('[GameManager] warrior crossed line — in play');
                    if (this.state === GameState.Inflight) {
                        if (this.waitForSettling) {
                            this.state = GameState.Settling;
                            if (!this.pendingWarrior)
                                this.pendingWarrior = this.createWarrior();
                        } else {
                            this.activateWarrior(this.createWarrior());
                        }
                    }
                }
            } else if (w.crossedLine) {
                if (prev + w.radius > GAME_OVER_LINE_Y && y + w.radius <= GAME_OVER_LINE_Y) {
                    console.log('[GameManager] warrior fully below game-over line — penalty');
                    this.penaltyExplode(w);
                }
            }

            this.prevY.set(w, y);
        }
    }

    private penaltyExplode(_w: Warrior): void {
        console.log(`[GameManager] warrior fell below line — game over`);
        this.showRedFlash();
        this.triggerGameOver();
    }

    private triggerGameOver(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        this.inputCtrl.clearWarrior();
        console.log('[GameManager] game over');
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            sys.localStorage.setItem('fw_best_score', String(this.bestScore));
        }
        this.showGameOverScreen();
    }

    private showGameOverScreen(): void {
        const panel = new Node('GameOverPanel');
        panel.setParent(this.node.parent!);

        const bg = panel.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 180);
        bg.rect(-TRACK_W / 2, -400, TRACK_W, 800);
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
        const midX = (a.node.position.x + b.node.position.x) / 2;
        const midY = (a.node.position.y + b.node.position.y) / 2;
        const newLevel = a.level + 1;
        const maxLevel = SPECIES_MAX_LEVEL[a.type] ?? 7;
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
        this.spawnFloatingScore(midX, midY, points);
        this.updateScoreLabel();
        this.updateMergesLabel();

        if (newLevel > maxLevel) {
            // Both at max level — consume both, free space, no new warrior spawned
            this.flashBurst(midX, midY, a.type);
            return;
        }

        const merged = Warrior.spawn(this.node.parent!, a.type, newLevel, midX, midY);
        merged.crossedLine = true;
        merged.onMergeReady = (x, y) => this.mergeWarriors(x, y);
        merged.velocity = new Vec2(vx, vy);
        this.warriors.push(merged);

        if (newLevel === maxLevel && maxLevel >= 5) {
            this.triggerSpecialExplosion(merged, newLevel);
        } else {
            this.flashMerge(merged);
        }
    }

    // --- HUD ---

    private createHud(): void {
        const hud = new Node('HUD');
        hud.setParent(this.node.parent!);

        // Merges (left panel, above score)
        this.makeLabel(hud, 'MERGES', HUD_LEFT_X, HUD_TOP_Y + 110, 20, new Color(180, 180, 180, 255));
        const mergesNode = new Node('MergesValue');
        mergesNode.setParent(hud);
        mergesNode.setPosition(HUD_LEFT_X, HUD_TOP_Y + 62);
        this.mergesLabel = mergesNode.addComponent(Label);
        this.mergesLabel.string = '0';
        this.mergesLabel.fontSize = 52;
        this.mergesLabel.isBold = true;
        this.mergesLabel.color = new Color(120, 220, 140, 255);

        // Score (left panel)
        this.makeLabel(hud, 'SCORE', HUD_LEFT_X, HUD_TOP_Y, 20, new Color(180, 180, 180, 255));
        const scoreNode = new Node('ScoreValue');
        scoreNode.setParent(hud);
        scoreNode.setPosition(HUD_LEFT_X, HUD_TOP_Y - 48);
        this.scoreLabel = scoreNode.addComponent(Label);
        this.scoreLabel.string = '0';
        this.scoreLabel.fontSize = 52;
        this.scoreLabel.isBold = true;
        this.scoreLabel.color = new Color(255, 220, 50, 255);

        // Round (right panel)
        this.makeLabel(hud, 'ROUND', HUD_RIGHT_X, HUD_TOP_Y, 20, new Color(180, 180, 180, 255));
        const roundNode = new Node('RoundValue');
        roundNode.setParent(hud);
        roundNode.setPosition(HUD_RIGHT_X, HUD_TOP_Y - 48);
        this.roundLabel = roundNode.addComponent(Label);
        this.roundLabel.string = String(this.currentRound);
        this.roundLabel.fontSize = 52;
        this.roundLabel.isBold = true;
        this.roundLabel.color = new Color(100, 200, 255, 255);

        // NEXT preview (right panel, below round)
        this.makeLabel(hud, 'NEXT', HUD_RIGHT_X, HUD_TOP_Y - 140, 20, new Color(180, 180, 180, 255));
        this.nextPreviewNode = new Node('NextPreview');
        this.nextPreviewNode.setParent(hud);
        this.nextPreviewNode.setPosition(HUD_RIGHT_X, HUD_TOP_Y - 200);
        this.updateNextPreview();

        // Timer (center-bottom, inside track near spawn)
        const timerNode = new Node('TimerValue');
        timerNode.setParent(hud);
        timerNode.setPosition(0, -285);
        this.timerLabel = timerNode.addComponent(Label);
        this.timerLabel.fontSize = 44;
        this.timerLabel.isBold = true;
        this.timerLabel.string = String(LAUNCH_TIMER);
        this.timerLabel.color = new Color(200, 200, 200, 200);
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
    }

    private updateScoreLabel(): void {
        if (this.scoreLabel) this.scoreLabel.string = String(this.score);
    }

    private updateMergesLabel(): void {
        if (this.mergesLabel) this.mergesLabel.string = String(this.totalMerges);
    }

    private updateRoundLabel(): void {
        if (this.roundLabel) this.roundLabel.string = String(this.currentRound);
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
        this.showRoundUpBanner();
        this.scheduleOnce(() => { this.roundUpPause = false; }, 1.5);
        console.log(`[GameManager] round up → round ${this.currentRound}, types=${spawnTypesForRound(this.currentRound)}, timer=${launchTimerForRound(this.currentRound)}s`);
    }

    private triggerSpecialExplosion(w: Warrior, level: number): void {
        const BONUSES  = [0, 0, 0, 0, 0, 500, 1000, 2000];
        const LABELS   = ['', '', '', '', '', 'CAMPIONE!', 'EROE!', 'LEGGENDA!'];
        const VFX_COLORS = [
            new Color(0, 0, 0), new Color(0, 0, 0), new Color(0, 0, 0),
            new Color(0, 0, 0), new Color(0, 0, 0),
            new Color(255, 200,  50, 255),  // 5 — gold
            new Color(180, 100, 255, 255),  // 6 — purple
            new Color(255,  80,  60, 255),  // 7 — red
        ];
        const bonus = BONUSES[level] ?? 0;
        const color = VFX_COLORS[level] ?? new Color(255, 255, 255, 255);
        const mx = w.node.position.x;
        const my = w.node.position.y;
        const r  = w.radius;

        this.warriors = this.warriors.filter(wr => wr !== w);
        this.prevY.delete(w);
        w.node.destroy();

        this.score += bonus;
        this.updateScoreLabel();
        if (bonus > 0) this.spawnFloatingScore(mx, my + 30, bonus);

        // Two expanding rings
        for (let i = 0; i < 2; i++) {
            const vfx = new Node('ExpVFX');
            vfx.setParent(this.node.parent!);
            vfx.setPosition(mx, my);
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
        labelNode.setParent(this.node.parent!);
        labelNode.setPosition(mx, my + 10);
        const lbl = labelNode.addComponent(Label);
        lbl.string = LABELS[level];
        lbl.fontSize = 40;
        lbl.isBold = true;
        lbl.color = color;
        const labelOp = labelNode.addComponent(UIOpacity);
        labelOp.opacity = 255;
        tween(labelNode).by(0.7, { position: new Vec3(0, 55, 0) }).start();
        tween(labelOp).delay(0.3).to(0.4, { opacity: 0 })
            .call(() => { if (labelNode.isValid) labelNode.destroy(); }).start();

        console.log(`[GameManager] ${LABELS[level]} explosion — bonus +${bonus}pts`);
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
            overlay.setParent(this.node.parent!);
            overlay.setPosition(0, 0);
            const ot = overlay.addComponent(UITransform);
            ot.setContentSize(1280, 720);

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
        node.setParent(this.node.parent!);
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

    private updateNextPreview(): void {
        if (!this.nextPreviewNode) return;
        const { type, level } = this.spawnMgr.next;

        let g = this.nextPreviewNode.getComponent(Graphics);
        if (g) {
            g.clear();
        } else {
            g = this.nextPreviewNode.addComponent(Graphics);
        }

        const r = WARRIOR_RADII[level] * 0.9;
        g.fillColor = COLORS[type];
        g.circle(0, 0, r);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 180);
        g.lineWidth = 3;
        g.circle(0, 0, r);
        g.stroke();

        let levelLabel = this.nextPreviewNode.getChildByName('Lv');
        if (!levelLabel) {
            levelLabel = new Node('Lv');
            levelLabel.setParent(this.nextPreviewNode);
        }
        let lbl = levelLabel.getComponent(Label);
        if (!lbl) lbl = levelLabel.addComponent(Label);
        lbl.string = String(level);
        lbl.fontSize = Math.round(r * 0.55);
        lbl.isBold = true;
        lbl.color = new Color(255, 255, 255, 255);
    }

    private makeLabel(parent: Node, text: string, x: number, y: number, fontSize: number, color: Color): Label {
        const node = new Node(text);
        node.setParent(parent);
        node.setPosition(x, y);
        const lbl = node.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = fontSize;
        lbl.color = color;
        return lbl;
    }

    // --- physics helpers ---

    private applyMagnetism(): void {
        const r1sq = WARRIOR_RADII[1] * WARRIOR_RADII[1]; // level-1 radius² — mass reference
        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || a.merging) continue;

            let nearestGap = Infinity;
            let nearest: Warrior | null = null;

            for (let j = 0; j < this.warriors.length; j++) {
                if (i === j) continue;
                const b = this.warriors[j];
                if (!b.node?.isValid || b.merging || b.type !== a.type || b.level !== a.level) continue;

                const dist = Vec2.distance(
                    new Vec2(a.node.position.x, a.node.position.y),
                    new Vec2(b.node.position.x, b.node.position.y)
                );
                // surface-to-surface gap: independent of warrior size
                const gap = Math.max(0, dist - a.radius - b.radius);
                if (gap < MAGNET_GAP && gap < nearestGap) {
                    nearestGap = gap;
                    nearest = b;
                }
            }

            if (nearest) {
                const dir = new Vec2(
                    nearest.node.position.x - a.node.position.x,
                    nearest.node.position.y - a.node.position.y
                ).normalize();
                const t = 1 - (nearestGap / MAGNET_GAP);
                // scale force by mass (∝ r²) so acceleration is equal for all levels
                const massScale = (a.radius * a.radius) / r1sq;
                a.applyForce(dir.multiplyScalar(MAGNET_FORCE * (1 + t * t * 8) * massScale));
            }
        }
    }

    private flashMerge(w: Warrior): void {
        tween(w.node)
            .to(0.08, { scale: new Vec3(1.4, 1.4, 1) })
            .to(0.12, { scale: new Vec3(1.0, 1.0, 1) })
            .start();
    }

    private flashBurst(x: number, y: number, type: number): void {
        const vfx = new Node('BurstVFX');
        vfx.setParent(this.node.parent!);
        vfx.setPosition(x, y);
        const g = vfx.addComponent(Graphics);
        g.lineWidth = 4;
        g.strokeColor = COLORS[type];
        g.circle(0, 0, WARRIOR_RADII[4]);
        g.stroke();
        const op = vfx.addComponent(UIOpacity);
        op.opacity = 200;
        tween(vfx).to(0.3, { scale: new Vec3(2, 2, 1) }).start();
        tween(op).to(0.3, { opacity: 0 })
            .call(() => { if (vfx.isValid) vfx.destroy(); }).start();
    }

    private spawnFloatingScore(x: number, y: number, points: number): void {
        const node = new Node('FloatingScore');
        node.setParent(this.node.parent!);
        node.setPosition(x, y);

        const lbl = node.addComponent(Label);
        lbl.string = `+${points}`;
        lbl.fontSize = this.mergesThisLaunch > 1 ? 44 : 34;
        lbl.isBold = true;
        lbl.color = new Color(255, 220, 50, 255);

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

    private showRedFlash(): void {
        const node = new Node('RedFlash');
        node.setParent(this.node.parent!);
        node.setPosition(0, 0);

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(220, 30, 30, 255);
        g.rect(-640, -360, 1280, 720);
        g.fill();

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 110;

        tween(opacity)
            .to(0.3, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
    }

    private createDebugLabel(): Label {
        const node = new Node('DebugLabel');
        node.setParent(this.node.parent!);
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
