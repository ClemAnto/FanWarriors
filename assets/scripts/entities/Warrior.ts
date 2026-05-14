import { _decorator, Component, Node, Label, RigidBody2D, ERigidBody2DType, CircleCollider2D, Collider2D, Contact2DType, Color, Graphics, Vec2, Sprite, SpriteFrame, UITransform } from 'cc';
import { WARRIORS, LEVEL_CONFIG } from '../data/WarriorConfig';
import { LAYOUT_SCALE } from './Track';
import { PerspectiveMapper } from './PerspectiveMapper';
import { WarriorSpriteCache } from '../utils/WarriorSpriteCache';
const { ccclass } = _decorator;

const MERGE_DELAY = 0.3;

@ccclass('Warrior')
export class Warrior extends Component {
    static friction        = 0.05;
    static settledDamping  = 16;
    static viewYOffset     = 0.8;
    type: number = 0;
    level: number = 1;
    merging: boolean = false;
    launched: boolean = false;
    crossedLine: boolean = false;
    settled: boolean = false;
    hitOtherWarrior: boolean = false;
    viewNode!: Node;
    mapper: PerspectiveMapper | null = null;

    get radius(): number { return (LEVEL_CONFIG[this.level]?.radius ?? 30) * LAYOUT_SCALE; }
    get velocity(): Vec2 { return this.getComponent(RigidBody2D)?.linearVelocity ?? new Vec2(0, 0); }
    set velocity(v: Vec2) { const rb = this.getComponent(RigidBody2D); if (rb) rb.linearVelocity = v; }

    onMergeReady: ((self: Warrior, other: Warrior) => void) | null = null;

    private mergeCallbacks = new Map<Warrior, () => void>();

    static spawn(parent: Node, visualParent: Node, type: number, level: number, x: number, y: number): Warrior {
        const node = new Node('Warrior');
        node.setParent(parent);
        node.setPosition(x, y);
        const w = node.addComponent(Warrior);
        w.init(type, level, visualParent);
        return w;
    }

    init(type: number, level: number, visualParent: Node): void {
        this.type = type;
        this.level = level;

        this.viewNode = new Node('View');
        this.viewNode.setParent(visualParent);

        this.buildPhysics();
        this.buildGraphics();

        const m = this.node.addComponent(PerspectiveMapper);
        m.viewNode = this.viewNode;
        m.yOffset  = this.radius * Warrior.viewYOffset;
        this.mapper = m;
    }

    onDestroy(): void {
        if (this.viewNode?.isValid) this.viewNode.destroy();
    }

    start() {
        const col = this.getComponent(CircleCollider2D)!;
        col.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        col.on(Contact2DType.END_CONTACT,   this.onEndContact,   this);
    }

    applyImpulse(impulse: Vec2): void {
        this.launched = true;
        this.hitOtherWarrior = false;
        this.getComponent(RigidBody2D)?.applyLinearImpulseToCenter(impulse, true);
    }

    applyForce(force: Vec2): void {
        this.getComponent(RigidBody2D)?.applyForceToCenter(force, true);
    }

    settle(): void {
        const rb = this.getComponent(RigidBody2D);
        if (!rb) return;
        rb.linearDamping  = Warrior.settledDamping;
        rb.angularDamping = 5;
        this.settled = true;
    }

    resetPhysics(): void {
        const rb = this.getComponent(RigidBody2D);
        if (rb) {
            rb.linearDamping  = 0.5;
            rb.angularDamping = 1.5;
        }
        const col = this.getComponent(CircleCollider2D);
        if (col) {
            col.density     = 8.0;
            col.friction    = Warrior.friction;
            col.restitution = 0.04;
        }
    }

    forceStop(): void {
        const rb = this.getComponent(RigidBody2D);
        if (!rb) return;
        rb.linearVelocity  = new Vec2(0, 0);
        rb.angularVelocity = 0;
        this.settle();
    }

    setDragMode(on: boolean): void {
        const rb = this.getComponent(RigidBody2D);
        if (!rb) return;
        rb.type            = on ? ERigidBody2DType.Static : ERigidBody2DType.Dynamic;
        rb.linearVelocity  = new Vec2(0, 0);
        rb.angularVelocity = 0;
    }

    private onBeginContact(_self: Collider2D, other: Collider2D): void {
        const otherW = other.node.getComponent(Warrior);
        if (!otherW) return;

        if (this.launched && !this.crossedLine && otherW.crossedLine) this.hitOtherWarrior = true;

        if (otherW.type !== this.type || otherW.level !== this.level) return;
        if (this.merging || otherW.merging || this.mergeCallbacks.has(otherW)) return;

        // Snap: equalize velocities so they don't bounce apart
        const rbA = this.getComponent(RigidBody2D)!;
        const rbB = otherW.getComponent(RigidBody2D)!;
        const avgX = (rbA.linearVelocity.x + rbB.linearVelocity.x) / 2;
        const avgY = (rbA.linearVelocity.y + rbB.linearVelocity.y) / 2;
        rbA.linearVelocity = new Vec2(avgX, avgY);
        rbB.linearVelocity = new Vec2(avgX, avgY);

        console.log(`[Warrior] contact begin — type=${this.type} lv=${this.level}, scheduling merge in ${MERGE_DELAY}s`);

        const cb = () => {
            if (!this.node.isValid || !otherW.node.isValid) return;
            if (this.merging || otherW.merging) return;
            if (!this.onMergeReady) return;
            this.merging = true;
            otherW.merging = true;
            console.log(`[Warrior] merge triggered — type=${this.type} lv${this.level}`);
            this.onMergeReady(this, otherW);
        };
        this.mergeCallbacks.set(otherW, cb);
        this.scheduleOnce(cb, MERGE_DELAY);
    }

    private onEndContact(_self: Collider2D, other: Collider2D): void {
        const otherW = other.node.getComponent(Warrior);
        if (!otherW) return;
        const cb = this.mergeCallbacks.get(otherW);
        if (cb) {
            this.unschedule(cb);
            this.mergeCallbacks.delete(otherW);
            console.log(`[Warrior] contact end — merge cancelled`);
        }
    }

    private buildGraphics(): void {
        const frame = WarriorSpriteCache.get(WARRIORS[this.type]?.type ?? '', this.level);
        if (frame) {
            this.buildSprite(frame);
        } else {
            this.buildPlaceholderGraphics();
            this.buildLabels();
        }
    }

    private buildSprite(frame: SpriteFrame): void {
        const r = this.radius;
        this.viewNode.addComponent(UITransform).setContentSize(r * 4, r * 4);
        const sp = this.viewNode.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
    }

    private buildPlaceholderGraphics(): void {
        const r     = this.radius;
        const color = WARRIORS[this.type]?.color ?? new Color(200, 200, 200);
        const g     = this.viewNode.addComponent(Graphics);
        const outlineW = Math.max(2, r * 0.12);
        const black    = new Color(0, 0, 0, 255);

        const baseRx = r * 0.85;
        const baseRy = r * 0.22;
        const baseY  = -r * 0.88;
        g.fillColor = new Color(90, 58, 28, 255);
        g.ellipse(0, baseY, baseRx, baseRy);
        g.fill();
        g.strokeColor = black;
        g.lineWidth   = outlineW * 0.8;
        g.ellipse(0, baseY, baseRx, baseRy);
        g.stroke();

        const bodyY = -r * 0.08;
        const bodyR = r * 0.72;
        g.fillColor   = color;
        g.circle(0, bodyY, bodyR);
        g.fill();
        g.strokeColor = black;
        g.lineWidth   = outlineW;
        g.circle(0, bodyY, bodyR);
        g.stroke();

        // Head — lighter tint of species color
        const headY = r * 0.52;
        const headR = r * 0.50;
        g.fillColor = new Color(
            Math.min(255, color.r + 50),
            Math.min(255, color.g + 50),
            Math.min(255, color.b + 50),
            255
        );
        g.circle(0, headY, headR);
        g.fill();
        g.strokeColor = black;
        g.lineWidth   = outlineW * 0.85;
        g.circle(0, headY, headR);
        g.stroke();
    }

    private buildLabels(): void {
        const r = this.radius;

        const levelNode = new Node('Level');
        levelNode.setParent(this.viewNode);
        levelNode.setPosition(0, -r * 0.08);
        const levelLbl = levelNode.addComponent(Label);
        levelLbl.string   = String(this.level);
        levelLbl.fontSize = Math.round(r * 0.75);
        levelLbl.isBold   = true;
        levelLbl.color    = new Color(255, 255, 255, 255);
        levelLbl.enableOutline = true;
        levelLbl.outlineColor  = new Color(0, 0, 0, 255);
        levelLbl.outlineWidth  = 2;

        const typeNode = new Node('Type');
        typeNode.setParent(this.viewNode);
        typeNode.setPosition(0, r * 0.52);
        const typeLbl = typeNode.addComponent(Label);
        typeLbl.string   = (WARRIORS[this.type]?.type ?? '?').substring(0, 2).toUpperCase();
        typeLbl.fontSize = Math.round(r * 0.42);
        typeLbl.isBold   = true;
        typeLbl.color    = new Color(255, 255, 255, 230);
        typeLbl.enableOutline = true;
        typeLbl.outlineColor  = new Color(0, 0, 0, 200);
        typeLbl.outlineWidth  = 1;
    }

    private buildPhysics(): void {
        const rb = this.node.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Dynamic;
        rb.linearDamping  = 0.5;
        rb.angularDamping = 1.5;
        rb.fixedRotation  = false;
        rb.enabledContactListener = true;

        const col = this.node.addComponent(CircleCollider2D);
        col.radius      = this.radius;
        col.density     = 8.0;
        col.friction    = Warrior.friction;
        col.restitution = 0.04;
    }
}
