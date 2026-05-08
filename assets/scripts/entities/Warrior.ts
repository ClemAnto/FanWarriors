import { _decorator, Component, Node, Label, RigidBody2D, ERigidBody2DType, CircleCollider2D, Collider2D, Contact2DType, Color, Graphics, Vec2 } from 'cc';
const { ccclass } = _decorator;

// index = level (1-7), index 0 unused
export const WARRIOR_RADII = [0, 20, 28, 36, 42, 48, 54, 60];

const COLORS: Color[] = [
    new Color(231,  76,  60),  // 0 Red
    new Color(230, 126,  34),  // 1 Orange
    new Color(241, 196,  15),  // 2 Yellow
    new Color( 46, 204, 113),  // 3 Green
    new Color( 52, 152, 219),  // 4 Blue
    new Color(155,  89, 182),  // 5 Purple
    new Color( 26, 188, 156),  // 6 Teal
];

const MERGE_DELAY = 0.3;

@ccclass('Warrior')
export class Warrior extends Component {
    type: number = 0;
    level: number = 1;
    merging: boolean = false;
    launched: boolean = false;
    crossedLine: boolean = false;

    get radius(): number { return WARRIOR_RADII[this.level] ?? 30; }
    get velocity(): Vec2 { return this.getComponent(RigidBody2D)?.linearVelocity ?? new Vec2(0, 0); }

    onMergeReady: ((self: Warrior, other: Warrior) => void) | null = null;

    private mergeCallbacks = new Map<Warrior, () => void>();

    static spawn(parent: Node, type: number, level: number, x: number, y: number): Warrior {
        const node = new Node('Warrior');
        node.setParent(parent);
        node.setPosition(x, y);
        const w = node.addComponent(Warrior);
        w.init(type, level);
        return w;
    }

    init(type: number, level: number): void {
        this.type = type;
        this.level = level;
        this.buildGraphics();
        this.buildPhysics();
        this.buildLabel();
    }

    start() {
        const col = this.getComponent(CircleCollider2D)!;
        col.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        col.on(Contact2DType.END_CONTACT,   this.onEndContact,   this);
    }

    applyImpulse(impulse: Vec2): void {
        this.launched = true;
        this.getComponent(RigidBody2D)?.applyLinearImpulseToCenter(impulse, true);
    }

    applyForce(force: Vec2): void {
        this.getComponent(RigidBody2D)?.applyForceToCenter(force, true);
    }

    forceStop(): void {
        const rb = this.getComponent(RigidBody2D);
        if (!rb) return;
        rb.linearVelocity = new Vec2(0, 0);
        rb.angularVelocity = 0;
    }

    private onBeginContact(self: Collider2D, other: Collider2D): void {
        const otherW = other.node.getComponent(Warrior);
        if (!otherW || otherW.type !== this.type || otherW.level !== this.level) return;
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
            this.merging = true;
            otherW.merging = true;
            console.log(`[Warrior] merge triggered — type=${this.type} lv${this.level}`);
            this.onMergeReady?.(this, otherW);
        };
        this.mergeCallbacks.set(otherW, cb);
        this.scheduleOnce(cb, MERGE_DELAY);
    }

    private onEndContact(self: Collider2D, other: Collider2D): void {
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
        const r = this.radius;
        const g = this.node.addComponent(Graphics);
        g.fillColor = COLORS[this.type];
        g.circle(0, 0, r);
        g.fill();
        g.strokeColor = new Color(255, 255, 255, 180);
        g.lineWidth = 3;
        g.circle(0, 0, r);
        g.stroke();
    }

    private buildPhysics(): void {
        const rb = this.node.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Dynamic;
        rb.linearDamping = 2.5;
        rb.angularDamping = 2.5;
        rb.enabledContactListener = true;

        const col = this.node.addComponent(CircleCollider2D);
        col.radius = this.radius;
        col.density = 8.0;
        col.friction = 0.8;
        col.restitution = 0.2;
    }

    private buildLabel(): void {
        const labelNode = new Node('Level');
        labelNode.setParent(this.node);
        labelNode.setPosition(0, 0);
        const label = labelNode.addComponent(Label);
        label.string = String(this.level);
        label.fontSize = Math.round(this.radius * 0.55);
        label.isBold = true;
        labelNode.color = new Color(255, 255, 255, 255);
    }
}
