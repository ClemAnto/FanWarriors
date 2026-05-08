import { _decorator, Component, PhysicsSystem2D, Vec2, Vec3, tween, Node, Label, Graphics, Color, UITransform, director } from 'cc';
import { Warrior } from '../entities/Warrior';
import { InputController } from './InputController';
import { GAME_OVER_LINE_Y, TRACK_W } from '../entities/Track';
const { ccclass } = _decorator;

const SPAWN_X = 0;
const SPAWN_Y = -220;
const SPAWN_TYPES = 3;
const MAGNET_RADIUS = 75;
const MAGNET_FORCE  = 8;
const SETTLE_VELOCITY    = 0.1;   // px/s — warrior is "stopped" below this
const LAUNCH_CHECK_DELAY = 0.8; // seconds before checking if launched warrior failed to cross

@ccclass('GameManager')
export class GameManager extends Component {
    private inputCtrl: InputController | null = null;
    private warriors: Warrior[] = [];
    private prevY = new Map<Warrior, number>();
    private gameOver  = false;
    private settling  = false;
    private pendingWarrior: Warrior | null = null;
    private debugLabel: Label | null = null;

    start() {
        console.log('[GameManager] start');
        PhysicsSystem2D.instance.enable = true;
        PhysicsSystem2D.instance.gravity = new Vec2(0, 0);
        console.log('[GameManager] physics initialized, gravity=0');

        this.inputCtrl = this.node.addComponent(InputController);
        this.inputCtrl.onLaunch = (w) => this.onWarriorLaunched(w);

        this.prefillTrack();
        this.activateWarrior(this.createWarrior());
        this.debugLabel = this.createDebugLabel();
    }

    update() {
        if (this.gameOver) return;
        try {
            this.warriors = this.warriors.filter(w => w != null && w.node != null && w.node.isValid);
            this.applyMagnetism();
            this.checkLineLogic();
            if (this.settling) this.checkSettled();
            this.updateDebugLabel();
        } catch (e) {
            console.error('[GameManager] fatal error — update loop stopped:', e);
            this.enabled = false;
        }
    }

    // --- spawn flow ---

    private createWarrior(): Warrior {
        const type = Math.floor(Math.random() * SPAWN_TYPES);
        const w = Warrior.spawn(this.node.parent!, type, 1, SPAWN_X, SPAWN_Y);
        w.onMergeReady = (a, b) => this.mergeWarriors(a, b);
        this.warriors.push(w);
        console.log(`[GameManager] warrior created — type=${type}`);
        return w;
    }

    private prefillTrack(): void {
        const positions = [{ x: -180, y: 240 }, { x: 0, y: 270 }, { x: 180, y: 240 }];
        positions.forEach(({ x, y }, i) => {
            const w = Warrior.spawn(this.node.parent!, i, 1, x, y);
            w.crossedLine = true;
            w.onMergeReady = (a, b) => this.mergeWarriors(a, b);
            this.warriors.push(w);
        });
        console.log('[GameManager] track prefilled with 3 warriors');
    }

    private activateWarrior(w: Warrior): void {
        this.inputCtrl!.setWarrior(w);
        console.log('[GameManager] warrior activated — ready to launch');
    }

    private onWarriorLaunched(w: Warrior): void {
        this.settling = true;
        console.log('[GameManager] settling started');
        this.scheduleOnce(() => this.checkLaunchResult(w), LAUNCH_CHECK_DELAY);
    }

    private checkSettled(): void {
        const inPlay = this.warriors.filter(w => w.launched && w.node?.isValid);
        // Force-stop warriors that are slow enough — kills Box2D micro-oscillations
        inPlay.forEach(w => { if (w.velocity.length() < SETTLE_VELOCITY) w.forceStop(); });
        const allSettled = inPlay.every(w => w.velocity.length() < SETTLE_VELOCITY);
        if (!allSettled) return;

        this.settling = false;
        console.log('[GameManager] all warriors settled');

        if (this.pendingWarrior?.node?.isValid) {
            this.activateWarrior(this.pendingWarrior);
            this.pendingWarrior = null;
        }
    }

    // --- game over logic ---

    private checkLaunchResult(w: Warrior): void {
        if (!w.node?.isValid || w.crossedLine || this.gameOver) return;
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
            const y = w.node.position.y;
            const prev = this.prevY.get(w) ?? y;

            if (!w.crossedLine && w.launched) {
                if (prev < GAME_OVER_LINE_Y && y >= GAME_OVER_LINE_Y) {
                    w.crossedLine = true;
                    console.log('[GameManager] warrior crossed line — in play');
                    if (!this.pendingWarrior && !this.gameOver)
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
        if (this.gameOver) return;
        this.gameOver = true;
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

        const retryNode = new Node('Retry');
        retryNode.setParent(panel);
        retryNode.setPosition(0, -40);
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
        this.debugLabel.string = `moving: ${moving}/${inPlay.length}  settling: ${this.settling}`;
    }
}
