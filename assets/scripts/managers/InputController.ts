import { _decorator, Component, Input, input, EventTouch, Vec2, Node, Graphics, Color } from 'cc';
import { Warrior } from '../entities/Warrior';
const { ccclass } = _decorator;

const DESIGN_W = 1280;
const DESIGN_H = 720;
const MIN_DRAG = 40;   // px — below this threshold the launch is cancelled
const MAX_DRAG = 150;  // px — force cap, rope stops stretching visually
const MAX_IMPULSE = 1600;

@ccclass('InputController')
export class InputController extends Component {
    onLaunch: ((warrior: Warrior) => void) | null = null;

    private warrior: Warrior | null = null;
    private dragging: boolean = false;
    private rope: Graphics | null = null;

    setWarrior(w: Warrior): void {
        this.warrior = w;
        console.log(`[InputController] warrior set — type=${w.type} level=${w.level}`);
    }

    start() {
        const ropeNode = new Node('Rope');
        ropeNode.setParent(this.node.parent!);
        this.rope = ropeNode.addComponent(Graphics);

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE,  this.onTouchMove,  this);
        input.on(Input.EventType.TOUCH_END,   this.onTouchEnd,   this);
        input.on(Input.EventType.TOUCH_CANCEL,this.onTouchEnd,   this);
        console.log('[InputController] ready');
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE,  this.onTouchMove,  this);
        input.off(Input.EventType.TOUCH_END,   this.onTouchEnd,   this);
        input.off(Input.EventType.TOUCH_CANCEL,this.onTouchEnd,   this);
    }

    private onTouchStart(e: EventTouch): void {
        if (!this.warrior || this.dragging) return;
        const touch = this.toWorld(e.getUILocation());
        const wPos = this.warriorPos();
        if (Vec2.distance(touch, wPos) <= this.warrior.radius) {
            this.dragging = true;
            console.log('[InputController] drag started');
        }
    }

    private onTouchMove(e: EventTouch): void {
        if (!this.dragging || !this.warrior) return;
        this.drawRope(this.toWorld(e.getUILocation()));
    }

    private onTouchEnd(e: EventTouch): void {
        if (!this.dragging || !this.warrior) return;
        this.dragging = false;
        this.clearRope();

        const touch = this.toWorld(e.getUILocation());
        const wPos  = this.warriorPos();
        const drag  = new Vec2(touch.x - wPos.x, touch.y - wPos.y);
        const len   = drag.length();

        if (len < MIN_DRAG) {
            console.log(`[InputController] drag too short (${len.toFixed(0)}px), cancelled`);
            return;
        }

        const t       = Math.min(len, MAX_DRAG) / MAX_DRAG;
        const dir     = new Vec2(-drag.x, -drag.y).normalize();
        const impulse = dir.multiplyScalar(t * MAX_IMPULSE);

        console.log(`[InputController] launch — drag=${len.toFixed(0)}px t=${t.toFixed(2)} impulse=(${impulse.x.toFixed(0)},${impulse.y.toFixed(0)})`);
        const launched = this.warrior;
        this.warrior = null;
        launched.applyImpulse(impulse);
        this.onLaunch?.(launched);
    }

    private drawRope(touch: Vec2): void {
        if (!this.rope || !this.warrior) return;
        const wPos = this.warriorPos();
        const drag = new Vec2(touch.x - wPos.x, touch.y - wPos.y);
        const len  = Math.min(drag.length(), MAX_DRAG);
        const t    = len / MAX_DRAG;
        const end  = wPos.clone().add(drag.normalize().multiplyScalar(len));

        this.rope.clear();
        this.rope.lineWidth = 4;
        // Color shifts green → red as force increases
        this.rope.strokeColor = new Color(Math.floor(t * 255), Math.floor((1 - t) * 200), 50, 220);
        this.rope.moveTo(wPos.x, wPos.y);
        this.rope.lineTo(end.x, end.y);
        this.rope.stroke();
    }

    private clearRope(): void {
        this.rope?.clear();
    }

    // Convert getUILocation() (origin bottom-left, design resolution) to canvas-local world space
    private toWorld(ui: Vec2): Vec2 {
        return new Vec2(ui.x - DESIGN_W / 2, ui.y - DESIGN_H / 2);
    }

    private warriorPos(): Vec2 {
        const p = this.warrior!.node.position;
        return new Vec2(p.x, p.y);
    }
}
