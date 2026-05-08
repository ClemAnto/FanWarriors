import { _decorator, Component, PhysicsSystem2D, Vec2, Vec3, tween, Node, Label, Graphics, Color, UITransform, director } from 'cc';
import { Warrior, WARRIOR_RADII, COLORS } from '../entities/Warrior';
import { InputController } from './InputController';
import { SpawnManager } from './SpawnManager';
import { GameState } from './GameState';
import { GAME_OVER_LINE_Y, TRACK_W } from '../entities/Track';
const { ccclass } = _decorator;

const SPAWN_TYPES        = 3;
const MAGNET_RADIUS      = 75;
const MAGNET_FORCE       = 8;
const SETTLE_VELOCITY    = 0.1;    // px/s — warrior is "stopped" below this
const LAUNCH_CHECK_DELAY = 0.8;    // seconds before checking if launched warrior failed to cross
const LAUNCH_TIMER       = 15;     // seconds per turn, round 1

// HUD positions (world space, canvas 1280×720 centered at origin)
const HUD_LEFT_X  = -490;
const HUD_RIGHT_X =  490;
const HUD_TOP_Y   =  290;

@ccclass('GameManager')
export class GameManager extends Component {
    private inputCtrl!: InputController;
    private spawnMgr!: SpawnManager;
    private warriors: Warrior[] = [];
    private prevY = new Map<Warrior, number>();
    private state = GameState.Idle;
    private pendingWarrior: Warrior | null = null;
    private debugLabel: Label | null = null;

    // game state
    private score = 0;
    private currentRound = 1;
    private totalMerges = 0;
    private timerRemaining = LAUNCH_TIMER;

    // hud refs
    private scoreLabel: Label | null = null;
    private roundLabel: Label | null = null;
    private mergesLabel: Label | null = null;
    private nextPreviewNode: Node | null = null;
    private timerLabel: Label | null = null;

    start() {
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
        this.activateWarrior(this.createWarrior());
        this.createHud();
        this.debugLabel = this.createDebugLabel();
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
        this.timerRemaining = LAUNCH_TIMER;
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
                    if (this.state === GameState.Inflight) this.state = GameState.Settling;
                    if (!this.pendingWarrior && this.state !== GameState.GameOver)
                        this.pendingWarrior = this.createWarrior();
                }
            } else if (w.crossedLine) {
                if (prev > GAME_OVER_LINE_Y && y <= GAME_OVER_LINE_Y) {
                    console.log('[GameManager] warrior crossed back down — penalty');
                    this.penaltyExplode(w);
                }
            }

            this.prevY.set(w, y);
        }
    }

    private penaltyExplode(w: Warrior): void {
        this.warriors = this.warriors.filter(x => x !== w);
        this.prevY.delete(w);
        tween(w.node)
            .to(0.06, { scale: new Vec3(1.3, 1.3, 1) })
            .call(() => w.node?.isValid && w.node.destroy())
            .start();
    }

    private triggerGameOver(): void {
        if (this.state === GameState.GameOver) return;
        this.state = GameState.GameOver;
        console.log('[GameManager] game over');
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

        const retryNode = new Node('Retry');
        retryNode.setParent(panel);
        retryNode.setPosition(0, -60);
        const retry = retryNode.addComponent(Label);
        retry.string = 'Riprova';
        retry.fontSize = 36;
        retry.color = new Color(255, 255, 255, 255);
        retryNode.addComponent(UITransform);
        retryNode.on(Node.EventType.TOUCH_START, () => director.loadScene('GameScene'), this);
    }

    // --- merge ---

    private mergeWarriors(a: Warrior, b: Warrior): void {
        const midX = (a.node.position.x + b.node.position.x) / 2;
        const midY = (a.node.position.y + b.node.position.y) / 2;
        const newLevel = a.level + 1;
        console.log(`[GameManager] merge! type=${a.type} lv${a.level}+lv${b.level} → lv${newLevel}`);

        this.prevY.delete(a);
        this.prevY.delete(b);
        a.node.destroy();
        b.node.destroy();

        if (newLevel > 7) return;

        const merged = Warrior.spawn(this.node.parent!, a.type, newLevel, midX, midY);
        merged.crossedLine = true;
        merged.onMergeReady = (x, y) => this.mergeWarriors(x, y);
        this.warriors.push(merged);
        this.flashMerge(merged);

        this.totalMerges++;
        this.score += 10 * (1 << (newLevel - 1)) * this.currentRound;
        this.updateScoreLabel();
        this.updateMergesLabel();
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
        for (let i = 0; i < this.warriors.length; i++) {
            const a = this.warriors[i];
            if (!a.node?.isValid || a.merging) continue;

            let nearestDist = Infinity;
            let nearest: Warrior | null = null;

            for (let j = 0; j < this.warriors.length; j++) {
                if (i === j) continue;
                const b = this.warriors[j];
                if (!b.node?.isValid || b.merging || b.type !== a.type || b.level !== a.level) continue;

                const dist = Vec2.distance(
                    new Vec2(a.node.position.x, a.node.position.y),
                    new Vec2(b.node.position.x, b.node.position.y)
                );
                if (dist < MAGNET_RADIUS && dist < nearestDist) {
                    nearestDist = dist;
                    nearest = b;
                }
            }

            if (nearest) {
                const dir = new Vec2(
                    nearest.node.position.x - a.node.position.x,
                    nearest.node.position.y - a.node.position.y
                ).normalize();
                const t = 1 - (nearestDist / MAGNET_RADIUS);
                a.applyForce(dir.multiplyScalar(MAGNET_FORCE * (1 + t * t * 8)));
            }
        }
    }

    private flashMerge(w: Warrior): void {
        tween(w.node)
            .to(0.08, { scale: new Vec3(1.4, 1.4, 1) })
            .to(0.12, { scale: new Vec3(1.0, 1.0, 1) })
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
        this.debugLabel.string = `state: ${GameState[this.state]}  moving: ${moving}/${inPlay.length}`;
    }
}
