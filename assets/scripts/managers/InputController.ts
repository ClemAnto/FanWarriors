import { _decorator, Component, Input, input, EventTouch, EventMouse, Vec2, Node, Graphics, Color, sys, view } from 'cc';
import { Warrior } from '../entities/Warrior';
const { ccclass } = _decorator;

const MIN_DRAG = 20;   // px — below this threshold the launch is cancelled
const MAX_DRAG = 80;   // px — force cap, rope stops stretching visually
const MAX_IMPULSE = 300;

@ccclass('InputController')
export class InputController extends Component {
    onLaunch: ((warrior: Warrior, force: number) => void) | null = null;
    ropeParent: Node | null = null;

    aimAngleDeg = 0;   // live angle from vertical, clamped to ±75°
    aimForcePct = 0;   // live force percentage 0–100

    private warrior: Warrior | null = null;
    private dragging: boolean = false;
    private rope: Graphics | null = null;
    private lastTouchPos: Vec2 | null = null;

    setWarrior(w: Warrior): void {
        this.warrior = w;
        this.dragging = false;
        this.lastTouchPos = null;
        this.aimAngleDeg = 0;
        this.aimForcePct = 0;
        console.log(`[InputController] warrior set — type=${w.type} level=${w.level}`);
    }

    clearWarrior(): void {
        this.warrior = null;
        this.dragging = false;
        this.clearRope();
    }

    autoLaunch(): void {
        if (!this.warrior) return;
        this.dragging = false;
        this.clearRope();

        const wPos = this.warriorPos();
        let dir: Vec2;

        if (this.lastTouchPos) {
            const drag = new Vec2(this.lastTouchPos.x - wPos.x, this.lastTouchPos.y - wPos.y);
            dir = drag.length() >= MIN_DRAG
                ? new Vec2(-drag.x, -drag.y).normalize()
                : new Vec2(0, 1);
        } else {
            dir = new Vec2(0, 1);
        }

        dir = this.clampLaunchDir(dir);
        const launched = this.warrior;
        this.warrior = null;
        this.lastTouchPos = null;
        launched.applyImpulse(dir.multiplyScalar(MAX_IMPULSE * 0.5));
        this.onLaunch?.(launched, MAX_IMPULSE * 0.5);
        console.log('[InputController] auto-launch');
    }

    start() {
        const ropeNode = new Node('Rope');
        ropeNode.setParent(this.ropeParent ?? this.node.parent!);
        this.rope = ropeNode.addComponent(Graphics);

        // Global input: touch (mobile) + mouse (desktop). Guards in the handlers
        // prevent double-firing on hybrid devices.
        input.on(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
        input.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
        input.on(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
        input.on(Input.EventType.MOUSE_DOWN,   this.onMouseDown,   this);
        input.on(Input.EventType.MOUSE_MOVE,   this.onMouseMove,   this);
        input.on(Input.EventType.MOUSE_UP,     this.onMouseUp,     this);

        console.log(`[InputController] ready — platform=${sys.platform} mobile=${sys.isMobile}`);
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
        input.off(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
        input.off(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
        input.off(Input.EventType.MOUSE_DOWN,   this.onMouseDown,   this);
        input.off(Input.EventType.MOUSE_MOVE,   this.onMouseMove,   this);
        input.off(Input.EventType.MOUSE_UP,     this.onMouseUp,     this);
    }

    // ── touch → shared logic ──
    private onTouchStart(e: EventTouch): void { this.handleDragStart(this.toWorld(e.getUILocation())); }
    private onTouchMove(e: EventTouch):  void { this.handleDragMove(this.toWorld(e.getUILocation())); }
    private onTouchEnd(e: EventTouch):   void { this.handleDragEnd(this.toWorld(e.getUILocation())); }

    // ── mouse → shared logic ──
    private onMouseDown(e: EventMouse):  void { this.handleDragStart(this.toWorld(e.getUILocation())); }
    private onMouseMove(e: EventMouse):  void { this.handleDragMove(this.toWorld(e.getUILocation())); }
    private onMouseUp(e: EventMouse):    void { this.handleDragEnd(this.toWorld(e.getUILocation())); }

    // ── shared drag logic ──

    private handleDragStart(touch: Vec2): void {
        if (!this.warrior || this.dragging) return;
        const wPos = this.warriorPos();
        const hitRadius = Math.max(this.warrior.radius, 44);
        if (Vec2.distance(touch, wPos) <= hitRadius) {
            this.dragging = true;
            console.log('[InputController] drag started');
        }
    }

    private handleDragMove(touch: Vec2): void {
        if (!this.dragging || !this.warrior) return;
        this.lastTouchPos = touch;
        this.drawRope(touch);
    }

    private handleDragEnd(touch: Vec2): void {
        if (!this.dragging || !this.warrior) return;
        this.dragging = false;
        this.clearRope();

        const wPos = this.warriorPos();
        const drag = new Vec2(touch.x - wPos.x, touch.y - wPos.y);
        const len  = drag.length();

        if (len < MIN_DRAG) {
            console.log(`[InputController] drag too short (${len.toFixed(0)}px), cancelled`);
            return;
        }

        const t       = Math.min(len, MAX_DRAG) / MAX_DRAG;
        const dir     = this.clampLaunchDir(new Vec2(-drag.x, -drag.y).normalize());
        const impulse = dir.multiplyScalar(t * MAX_IMPULSE);

        console.log(`[InputController] launch — drag=${len.toFixed(0)}px t=${t.toFixed(2)} impulse=(${impulse.x.toFixed(0)},${impulse.y.toFixed(0)})`);
        const launched = this.warrior;
        this.warrior = null;
        launched.applyImpulse(impulse);
        this.onLaunch?.(launched, impulse.length());
    }

    private drawRope(touch: Vec2): void {
        if (!this.rope || !this.warrior) return;
        const wPos   = this.warriorPos();
        const dx     = touch.x - wPos.x;
        const dy     = touch.y - wPos.y;
        const rawLen = Math.sqrt(dx * dx + dy * dy);
        const len    = Math.min(rawLen, MAX_DRAG);
        const t      = len / MAX_DRAG;

        const nx = rawLen > 0 ? dx / rawLen : 0;
        const ny = rawLen > 0 ? dy / rawLen : -1;

        this.rope.clear();
        const color = new Color(Math.floor(t * 255), Math.floor((1 - t) * 200), 50, 220);

        this.rope.lineWidth = 4;
        this.rope.strokeColor = color;
        this.rope.moveTo(wPos.x, wPos.y);
        this.rope.lineTo(wPos.x + nx * len, wPos.y + ny * len);
        this.rope.stroke();

        if (rawLen >= MIN_DRAG) {
            const launchDir = this.clampLaunchDir(new Vec2(-nx, -ny));
            this.aimAngleDeg = Math.round(Math.atan2(launchDir.x, launchDir.y) * 180 / Math.PI);
            this.aimForcePct = Math.round(t * 100);
            this.drawDirectionArrow(wPos, launchDir, t, color);
        }
    }

    private drawDirectionArrow(wPos: Vec2, launchDir: Vec2, t: number, color: Color): void {
        if (!this.rope || !this.warrior) return;
        const g = this.rope;
        const SHAFT_MAX  = 60;
        const ARROW_SIZE = 11;

        const offset   = this.warrior.radius + 6;
        const shaftLen = t * SHAFT_MAX;

        const ox = wPos.x + launchDir.x * offset;
        const oy = wPos.y + launchDir.y * offset;
        const bx = ox + launchDir.x * shaftLen;
        const by = oy + launchDir.y * shaftLen;
        const tx = bx + launchDir.x * ARROW_SIZE;
        const ty = by + launchDir.y * ARROW_SIZE;
        const px = -launchDir.y;
        const py =  launchDir.x;
        const half = ARROW_SIZE * 0.5;

        g.lineWidth = 2.5;
        g.strokeColor = new Color(color.r, color.g, color.b, 180);
        g.moveTo(ox, oy);
        g.lineTo(bx, by);
        g.stroke();

        g.fillColor = new Color(color.r, color.g, color.b, 210);
        g.moveTo(tx, ty);
        g.lineTo(bx + px * half, by + py * half);
        g.lineTo(bx - px * half, by - py * half);
        g.close();
        g.fill();
    }

    private clearRope(): void {
        this.rope?.clear();
    }

    private clampLaunchDir(dir: Vec2): Vec2 {
        const MAX_ANGLE = 75 * Math.PI / 180;
        const angle = Math.atan2(dir.x, dir.y);
        const clamped = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
        return new Vec2(Math.sin(clamped), Math.cos(clamped));
    }

    // view.getVisibleSize() keeps X correct under FIXED_HEIGHT on wide screens
    // (visible width > DESIGN_W on desktop, so hardcoding DESIGN_W/2 gives wrong offset)
    private toWorld(ui: Vec2): Vec2 {
        const vs = view.getVisibleSize();
        return new Vec2(ui.x - vs.width / 2, ui.y - vs.height / 2);
    }

    private warriorPos(): Vec2 {
        const p = this.warrior!.node.position;
        return new Vec2(p.x, p.y);
    }
}
