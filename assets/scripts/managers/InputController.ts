import { _decorator, Component, Input, input, EventTouch, EventMouse, Vec2, Node, Graphics, Color, sys, view, Sprite, SpriteFrame, assetManager, UITransform } from 'cc';
import { Warrior } from '../entities/Warrior';
import { LAYOUT_SCALE, GAME_OVER_LINE_Y, TRACK_W, TRACK_BOTTOM_Y, TRACK_TOP_Y, FUNNEL_OFFSET } from '../entities/Track';
import { LEVEL_CONFIG } from '../data/WarriorConfig';
const { ccclass } = _decorator;

// Base values at design width 720 — multiplied by LAYOUT_SCALE at runtime
const MIN_DRAG_BASE    = 20;
const MAX_DRAG_BASE    = 96;   // 3 × lv-1 diameter
const MAX_IMPULSE_BASE = 300;
const CROSSBOW_ARM_W   = 72;   // design-px half-width of bow arms (= lv1r*4 = bowW/2)
const TRAJ_DOT_STEP    = 16;   // design-px between trajectory dots
const TRAJ_DOT_R       = 3.5;  // design-px dot radius

const BOW_SPRITE_UUID  = '95f7e789-2146-4182-922c-90e59f693737@f9941';
const BASE_SPRITE_UUID = '424a10f8-b99d-4b8f-b108-73ace9586a53@f9941';

@ccclass('InputController')
export class InputController extends Component {
    onLaunch: ((warrior: Warrior, force: number) => void) | null = null;
    onTap:    ((warrior: Warrior) => void) | null = null;
    ropeParent: Node | null = null;
    launchEnabled = true;

    aimAngleDeg = 0;
    aimForcePct = 0;

    private warrior: Warrior | null = null;
    private dragging: boolean = false;
    private rope: Graphics | null = null;
    private crossbowNode: Node | null = null;    // container — moves with warrior, never rotates
    private launcherNode: Node | null = null;    // rotating child — rope attaches here
    private crossbowGfx: Graphics | null = null; // non-null only when sprite failed to load
    private baseNode: Node | null = null;
    private lastTouchPos: Vec2 | null = null;
    private tapStartPos: Vec2 | null = null;
    private trajPhase = 0;
    private snapAnim: {
        elapsed: number; duration: number;
        la: Vec2; ra: Vec2; ctrl: Vec2; startAngle: number;
    } | null = null;

    setWarrior(w: Warrior): void {
        this.snapAnim = null;
        this.warrior = w;
        this.dragging = false;
        this.lastTouchPos = null;
        this.aimAngleDeg = 0;
        this.aimForcePct = 0;
        this.ropeToTop();
        this.clearRope();
        if (this.launchEnabled) this.showCrossbowDefault();
        console.log(`[InputController] warrior set — type=${w.type} level=${w.level}`);
    }

    clearWarrior(): void {
        this.warrior = null;
        this.dragging = false;
        this.clearRope();
        const spawnY   = (GAME_OVER_LINE_Y + TRACK_BOTTOM_Y) / 2;
        const lv1r     = (LEVEL_CONFIG[1]?.radius ?? 18) * LAYOUT_SCALE;
        const displayY = spawnY + lv1r * Warrior.viewYOffset;
        if (this.launcherNode) { this.launcherNode.setPosition(0, displayY, 0); this.launcherNode.angle = 0; }
        if (this.baseNode)     { this.baseNode.setPosition(0, displayY, 0); }
    }

    autoLaunch(): void {
        if (!this.warrior) return;
        this.dragging = false;
        this.clearRope();

        const wPos    = this.warriorPos();
        const minDrag = MIN_DRAG_BASE * LAYOUT_SCALE;
        let dir: Vec2;

        if (this.lastTouchPos) {
            const drag = new Vec2(this.lastTouchPos.x - wPos.x, this.lastTouchPos.y - wPos.y);
            dir = drag.length() >= minDrag
                ? new Vec2(-drag.x, -drag.y).normalize()
                : new Vec2(0, 1);
        } else {
            dir = new Vec2(0, 1);
        }

        dir = this.clampLaunchDir(dir);
        const launched    = this.warrior;
        const halfImpulse = this.maxImpulse() * 0.5;
        this.warrior = null;
        this.lastTouchPos = null;
        launched.applyImpulse(dir.multiplyScalar(halfImpulse));
        this.onLaunch?.(launched, halfImpulse);
        console.log('[InputController] auto-launch');
    }

    start() {
        const parent = this.ropeParent ?? this.node.parent!;

        // Crossbow is the container node — never rotates, just follows warrior position
        const cbNode = parent.getChildByName('Crossbow') ?? (() => {
            const n = new Node('Crossbow');
            n.setParent(parent);
            return n;
        })();
        this.crossbowNode = cbNode;
        cbNode.setPosition(0, 0, 0); // anchor at world origin so child local coords === world coords

        // CrossbowBase: static child of Crossbow (no rotation, moves with container)
        this.baseNode = cbNode.getChildByName('CrossbowBase');

        // CrossbowLauncher: rotating child — rope and bowstring attach here
        const lv1r = LEVEL_CONFIG[1]?.radius ?? 18;
        const launcherNode = cbNode.getChildByName('CrossbowLauncher') ?? (() => {
            const n = new Node('CrossbowLauncher');
            n.setParent(cbNode);
            assetManager.loadAny({ uuid: BOW_SPRITE_UUID }, (err: Error | null, sf: SpriteFrame) => {
                if (!n.isValid || err || !sf) {
                    console.warn('[InputController] bow sprite not found — using placeholder');
                    this.crossbowGfx = n.addComponent(Graphics);
                    this.drawCrossbowPlaceholder();
                    return;
                }
                const sp = n.addComponent(Sprite); sp.spriteFrame = sf;
                const bowW = lv1r * 8 * LAYOUT_SCALE;
                n.getComponent(UITransform)!.setContentSize(bowW, bowW * (1023 / 1228));
            });
            return n;
        })();
        this.launcherNode = launcherNode;

        // Ensure both scene-loaded nodes are sized for the current LAYOUT_SCALE
        const bowW = lv1r * 8 * LAYOUT_SCALE;
        launcherNode.getComponent(UITransform)?.setContentSize(bowW, bowW * (1023 / 1228));
        if (this.baseNode) {
            const lv1d = lv1r * 2 * LAYOUT_SCALE;
            this.baseNode.getComponent(UITransform)?.setContentSize(lv1d, lv1d * (659 / 960));
        }

        // Rope is a child of Crossbow (cbNode stays at origin → Graphics draws in world coords)
        // Last child → renders after CrossbowLauncher inside the container
        const ropeNode = new Node('Rope');
        ropeNode.setParent(cbNode);
        this.rope = ropeNode.addComponent(Graphics);

        input.on(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
        input.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
        input.on(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
        input.on(Input.EventType.MOUSE_DOWN,   this.onMouseDown,   this);
        input.on(Input.EventType.MOUSE_MOVE,   this.onMouseMove,   this);
        input.on(Input.EventType.MOUSE_UP,     this.onMouseUp,     this);

        console.log(`[InputController] ready — platform=${sys.platform} mobile=${sys.isMobile}`);
    }

    update(dt: number): void {
        // Keep Crossbow container always at sibling 0 — zSortWarriors() pushes it to last every frame
        this.crossbowNode?.setSiblingIndex(0);

        if (this.snapAnim) {
            this.snapAnim.elapsed += dt;
            const progress = Math.min(this.snapAnim.elapsed / this.snapAnim.duration, 1);
            this.drawRopeSnap(progress);
            if (progress >= 1) { this.snapAnim = null; this.clearRope(); }
            return;
        }

        if (this.dragging && this.lastTouchPos) {
            const step = TRAJ_DOT_STEP * LAYOUT_SCALE;
            this.trajPhase = (this.trajPhase + 90 * LAYOUT_SCALE * dt) % step;
            this.drawRope(this.lastTouchPos);
        } else {
            this.drawRopeDefault();
        }
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

    private onTouchStart(e: EventTouch): void { this.handleDragStart(this.toWorld(e.getUILocation())); }
    private onTouchMove(e: EventTouch):  void { this.handleDragMove(this.toWorld(e.getUILocation())); }
    private onTouchEnd(e: EventTouch):   void { this.handleDragEnd(this.toWorld(e.getUILocation())); }

    private onMouseDown(e: EventMouse):  void { this.handleDragStart(this.toWorld(e.getUILocation())); }
    private onMouseMove(e: EventMouse):  void { this.handleDragMove(this.toWorld(e.getUILocation())); }
    private onMouseUp(e: EventMouse):    void { this.handleDragEnd(this.toWorld(e.getUILocation())); }

    private handleDragStart(touch: Vec2): void {
        if (!this.warrior || this.dragging) return;
        if (!this.launchEnabled) {
            const wPos = this.warriorPos();
            const dx   = touch.x - wPos.x;
            const dy   = touch.y - wPos.y;
            const hitR = (this.warrior.radius + 20) * 2;
            if (Math.sqrt(dx * dx + dy * dy) <= hitR) this.tapStartPos = new Vec2(touch.x, touch.y);
            return;
        }
        if (touch.y < 0) {
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
        if (!this.launchEnabled && this.warrior && this.tapStartPos) {
            const dx = touch.x - this.tapStartPos.x;
            const dy = touch.y - this.tapStartPos.y;
            this.tapStartPos = null;
            if (Math.sqrt(dx * dx + dy * dy) < MIN_DRAG_BASE * LAYOUT_SCALE) {
                this.onTap?.(this.warrior);
            }
            return;
        }
        this.tapStartPos = null;
        if (!this.dragging || !this.warrior) return;
        this.dragging = false;

        const wPos    = this.warriorPos();
        const drag    = new Vec2(touch.x - wPos.x, touch.y - wPos.y);
        const len     = drag.length();
        const minDrag = MIN_DRAG_BASE * LAYOUT_SCALE;
        const maxDrag = MAX_DRAG_BASE * LAYOUT_SCALE;

        if (len < minDrag) {
            console.log(`[InputController] drag too short (${len.toFixed(0)}px), cancelled`);
            this.showCrossbowDefault();
            return;
        }

        const t       = Math.min(len, maxDrag) / maxDrag;
        const dir     = this.clampLaunchDir(new Vec2(-drag.x, -drag.y).normalize());
        const impulse = dir.multiplyScalar(t * this.maxImpulse());

        // Capture snap animation: string releases from bent position back to straight
        const s      = LAYOUT_SCALE;
        const uit    = this.launcherNode?.getComponent(UITransform);
        const armHW  = uit ? uit.contentSize.width * 0.5 : CROSSBOW_ARM_W * s;
        const perp   = new Vec2(-dir.y, dir.x);
        const la     = new Vec2(wPos.x + perp.x * armHW, wPos.y + perp.y * armHW);
        const ra     = new Vec2(wPos.x - perp.x * armHW, wPos.y - perp.y * armHW);
        const rawNx  = len > 0 ? drag.x / len : 0;
        const rawNy  = len > 0 ? drag.y / len : -1;
        const ctrl   = new Vec2(wPos.x + rawNx * Math.min(len, maxDrag), wPos.y + rawNy * Math.min(len, maxDrag));
        this.snapAnim = { elapsed: 0, duration: 0.12, la, ra, ctrl, startAngle: this.launcherNode?.angle ?? 0 };

        console.log(`[InputController] launch — drag=${len.toFixed(0)}px t=${t.toFixed(2)} impulse=(${impulse.x.toFixed(0)},${impulse.y.toFixed(0)})`);
        const launched = this.warrior;
        this.warrior = null;
        launched.applyImpulse(impulse);
        this.onLaunch?.(launched, impulse.length());
    }

    private drawRope(touch: Vec2): void {
        if (!this.rope || !this.warrior) return;
        const wPos    = this.warriorPos();
        const dx      = touch.x - wPos.x;
        const dy      = touch.y - wPos.y;
        const rawLen  = Math.sqrt(dx * dx + dy * dy);
        const maxDrag = MAX_DRAG_BASE * LAYOUT_SCALE;
        const len     = Math.min(rawLen, maxDrag);
        const t       = len / maxDrag;
        const nx      = rawLen > 0 ? dx / rawLen : 0;
        const ny      = rawLen > 0 ? dy / rawLen : -1;
        const launchDir = this.clampLaunchDir(new Vec2(-nx, -ny));

        this.aimAngleDeg = Math.round(Math.atan2(launchDir.x, launchDir.y) * 180 / Math.PI);
        this.aimForcePct = Math.round(t * 100);

        // Crossbow container stays at world origin; position children individually
        if (this.launcherNode) {
            this.launcherNode.setPosition(wPos.x, wPos.y, 0);
            this.launcherNode.angle = -Math.atan2(launchDir.x, launchDir.y) * 180 / Math.PI;
        }
        if (this.baseNode) {
            this.baseNode.setPosition(wPos.x, wPos.y, 0);
        }

        // Bowstring — bezier U-curve: la → (dragPt as control) → ra
        const s      = LAYOUT_SCALE;
        const uit    = this.launcherNode?.getComponent(UITransform);
        const armHW  = uit ? uit.contentSize.width * 0.5 : CROSSBOW_ARM_W * s;
        const perp   = new Vec2(-launchDir.y, launchDir.x);
        const la     = new Vec2(wPos.x + perp.x * armHW, wPos.y + perp.y * armHW);
        const ra     = new Vec2(wPos.x - perp.x * armHW, wPos.y - perp.y * armHW);
        const dragPt = new Vec2(wPos.x + nx * len,        wPos.y + ny * len);

        this.rope.clear();
        this.rope.lineJoin = Graphics.LineJoin.ROUND;
        this.rope.lineCap  = Graphics.LineCap.ROUND;

        const drawString = (width: number, color: Color) => {
            this.rope!.lineWidth   = width;
            this.rope!.strokeColor = color;
            this.rope!.moveTo(la.x, la.y);
            this.rope!.quadraticCurveTo(dragPt.x, dragPt.y, ra.x, ra.y);
            this.rope!.stroke();
        };

        const w = Math.max(4, 4 * s);
        drawString(w,        new Color( 55,  28,   8, 245));  // base scura
        drawString(w * 0.4,  new Color(185, 135,  65, 210));  // highlight centrale

        // Knots at bowstring endpoints
        const knobR = Math.max(3, 3.5 * s);
        this.rope!.fillColor = new Color(55, 28, 8, 245);
        this.rope!.circle(la.x, la.y, knobR); this.rope!.fill();
        this.rope!.circle(ra.x, ra.y, knobR); this.rope!.fill();

        if (rawLen >= MIN_DRAG_BASE * LAYOUT_SCALE) {
            this.drawTrajectory(wPos, launchDir);
        }
    }

    private drawTrajectory(start: Vec2, dir: Vec2): void {
        const g     = this.rope!;
        const hw    = TRACK_W / 2;
        const bot   = TRACK_BOTTOM_Y;
        const top   = TRACK_TOP_Y;
        const fo    = FUNNEL_OFFSET;
        const stopY = GAME_OVER_LINE_Y;
        const step  = TRAJ_DOT_STEP * LAYOUT_SCALE;
        const dotR  = TRAJ_DOT_R    * LAYOUT_SCALE;

        const lwA = new Vec2(-hw, bot); const lwB = new Vec2(-hw + fo, top);
        const rwA = new Vec2( hw, bot); const rwB = new Vec2( hw - fo, top);

        const trackH = top - bot;
        const lwNx = trackH; const lwNy = -fo; const lwMag = Math.sqrt(lwNx * lwNx + lwNy * lwNy);
        const rwNx = trackH; const rwNy =  fo; const rwMag = Math.sqrt(rwNx * rwNx + rwNy * rwNy);

        const segments: Array<[Vec2, Vec2]> = [];
        let p = new Vec2(start.x, start.y);
        let d = new Vec2(dir.x, dir.y);

        for (let bounce = 0; bounce <= 1; bounce++) {
            let minT = Infinity; let hitNx = 0; let hitNy = 0; let isStop = false;

            const tl = raySegT(p, d, lwA, lwB);
            if (tl < minT) { minT = tl; hitNx = lwNx / lwMag; hitNy = lwNy / lwMag; isStop = false; }

            const tr = raySegT(p, d, rwA, rwB);
            if (tr < minT) { minT = tr; hitNx = rwNx / rwMag; hitNy = rwNy / rwMag; isStop = false; }

            if (d.y > 0.001) {
                const ts = (stopY - p.y) / d.y;
                if (ts > 0.001 && ts < minT) { minT = ts; isStop = true; }
            }

            if (minT === Infinity || minT > 9999) break;

            const hitPt = new Vec2(p.x + d.x * minT, p.y + d.y * minT);
            segments.push([new Vec2(p.x, p.y), hitPt]);
            if (isStop || bounce >= 1) break;

            const dot2 = 2 * (d.x * hitNx + d.y * hitNy);
            d = new Vec2(d.x - dot2 * hitNx, d.y - dot2 * hitNy);
            p = hitPt;
        }

        let totalLen = 0;
        for (const [from, to] of segments) {
            const ex = to.x - from.x; const ey = to.y - from.y;
            totalLen += Math.sqrt(ex * ex + ey * ey);
        }
        if (totalLen < 0.001) return;

        let cumDist = 0;
        let phase   = this.trajPhase;
        for (const [from, to] of segments) {
            const ex = to.x - from.x; const ey = to.y - from.y;
            const segLen = Math.sqrt(ex * ex + ey * ey);
            if (segLen < 0.001) continue;
            const ux = ex / segLen; const uy = ey / segLen;

            let dist = phase;
            while (dist < segLen) {
                const progress = (cumDist + dist) / totalLen;
                const alpha    = Math.max(30, Math.round(200 * (1 - progress)));
                g.fillColor = new Color(255, 240, 160, alpha);
                g.circle(from.x + ux * dist, from.y + uy * dist, dotR);
                g.fill();
                dist += step;
            }
            phase    = Math.max(0, dist - segLen);
            cumDist += segLen;
        }
    }

    // Placeholder drawn only when sprite loading fails.
    private drawCrossbowPlaceholder(): void {
        if (!this.crossbowGfx) return;
        const g    = this.crossbowGfx;
        const s    = LAYOUT_SCALE;
        const armW = CROSSBOW_ARM_W * s;
        g.clear();
        g.lineWidth   = Math.max(2, 3 * s);
        g.strokeColor = new Color(139, 90, 43, 230);
        g.moveTo(0, -12 * s); g.lineTo(0, 20 * s); g.stroke();
        g.moveTo(-armW, 4 * s); g.lineTo(armW, 4 * s); g.stroke();
        g.strokeColor = new Color(180, 130, 60, 200);
        g.moveTo(-armW, 4 * s); g.lineTo(-armW - 4 * s,  8 * s); g.stroke();
        g.moveTo( armW, 4 * s); g.lineTo( armW + 4 * s,  8 * s); g.stroke();
    }

    private showCrossbowDefault(): void {
        if (!this.warrior) return;
        const pos = this.warriorPos();
        if (this.launcherNode) { this.launcherNode.setPosition(pos.x, pos.y, 0); this.launcherNode.angle = 0; }
        if (this.baseNode)     { this.baseNode.setPosition(pos.x, pos.y, 0); }
    }

    private drawRopeDefault(): void {
        if (!this.rope || !this.launcherNode) return;
        const s     = LAYOUT_SCALE;
        const uit   = this.launcherNode.getComponent(UITransform);
        const armHW = uit ? uit.contentSize.width * 0.5 : CROSSBOW_ARM_W * s;
        const lp    = this.launcherNode.position;
        const a     = (this.launcherNode.angle * Math.PI) / 180;
        // perp = (-launchDir.y, launchDir.x) where launchDir = (-sin a, cos a)
        const px    = -Math.cos(a);
        const py    = -Math.sin(a);
        const la    = new Vec2(lp.x + px * armHW, lp.y + py * armHW);
        const ra    = new Vec2(lp.x - px * armHW, lp.y - py * armHW);
        this.drawStringLine(la, ra);
    }

    private drawRopeSnap(progress: number): void {
        if (!this.rope || !this.snapAnim) return;
        const { la, ra, ctrl, startAngle } = this.snapAnim;
        const eased = 1 - (1 - progress) * (1 - progress);  // ease-out quad
        const mid   = new Vec2((la.x + ra.x) * 0.5, (la.y + ra.y) * 0.5);
        const cx    = ctrl.x + (mid.x - ctrl.x) * eased;
        const cy    = ctrl.y + (mid.y - ctrl.y) * eased;

        if (this.launcherNode) this.launcherNode.angle = startAngle * (1 - eased);

        const s = LAYOUT_SCALE;
        const w = Math.max(4, 4 * s);
        this.rope.clear();
        this.rope.lineJoin = Graphics.LineJoin.ROUND;
        this.rope.lineCap  = Graphics.LineCap.ROUND;
        this.rope.lineWidth   = w;       this.rope.strokeColor = new Color(55, 28, 8, 245);
        this.rope.moveTo(la.x, la.y);    this.rope.quadraticCurveTo(cx, cy, ra.x, ra.y);    this.rope.stroke();
        this.rope.lineWidth   = w * 0.4; this.rope.strokeColor = new Color(185, 135, 65, 210);
        this.rope.moveTo(la.x, la.y);    this.rope.quadraticCurveTo(cx, cy, ra.x, ra.y);    this.rope.stroke();
        const knobR = Math.max(3, 3.5 * s);
        this.rope.fillColor = new Color(55, 28, 8, 245);
        this.rope.circle(la.x, la.y, knobR); this.rope.fill();
        this.rope.circle(ra.x, ra.y, knobR); this.rope.fill();
    }

    private drawStringLine(la: Vec2, ra: Vec2): void {
        if (!this.rope) return;
        const s = LAYOUT_SCALE;
        const w = Math.max(4, 4 * s);
        this.rope.clear();
        this.rope.lineJoin = Graphics.LineJoin.ROUND;
        this.rope.lineCap  = Graphics.LineCap.ROUND;
        this.rope.lineWidth   = w;       this.rope.strokeColor = new Color(55, 28, 8, 245);
        this.rope.moveTo(la.x, la.y);    this.rope.lineTo(ra.x, ra.y);    this.rope.stroke();
        this.rope.lineWidth   = w * 0.4; this.rope.strokeColor = new Color(185, 135, 65, 210);
        this.rope.moveTo(la.x, la.y);    this.rope.lineTo(ra.x, ra.y);    this.rope.stroke();
        const knobR = Math.max(3, 3.5 * s);
        this.rope.fillColor = new Color(55, 28, 8, 245);
        this.rope.circle(la.x, la.y, knobR); this.rope.fill();
        this.rope.circle(ra.x, ra.y, knobR); this.rope.fill();
    }

    private ropeToTop(): void {
        if (this.rope?.node.parent)
            this.rope.node.setSiblingIndex(this.rope.node.parent.children.length - 1);
    }

    private clearRope(): void {
        this.rope?.clear();
    }

    private maxImpulse(): number {
        const lvl = this.warrior?.level ?? 1;
        const r1  = LEVEL_CONFIG[1]?.radius ?? 18;
        const r   = LEVEL_CONFIG[lvl]?.radius ?? r1;
        return MAX_IMPULSE_BASE * LAYOUT_SCALE * Math.pow(r / r1, 1.5);
    }

    private clampLaunchDir(dir: Vec2): Vec2 {
        const MAX_ANGLE = 60 * Math.PI / 180;
        const angle   = Math.atan2(dir.x, dir.y);
        const clamped = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
        return new Vec2(Math.sin(clamped), Math.cos(clamped));
    }

    private toWorld(ui: Vec2): Vec2 {
        const vs = view.getVisibleSize();
        return new Vec2(ui.x - vs.width / 2, ui.y - vs.height / 2);
    }

    private warriorPos(): Vec2 {
        const p = this.warrior!.node.position;
        return new Vec2(p.x, p.y + this.warrior!.radius * Warrior.viewYOffset);
    }
}

/** Ray–segment intersection. Returns t >= 0 where ray (origin + t*dir) hits segment [a,b], or Infinity. */
function raySegT(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number {
    const sx = b.x - a.x; const sy = b.y - a.y;
    const nx = sy; const ny = -sx;
    const nDotD = nx * dir.x + ny * dir.y;
    if (Math.abs(nDotD) < 1e-6) return Infinity;
    const t = -(nx * (origin.x - a.x) + ny * (origin.y - a.y)) / nDotD;
    if (t <= 0.001) return Infinity;
    const hx = origin.x + t * dir.x - a.x;
    const hy = origin.y + t * dir.y - a.y;
    const s  = (sx * sx + sy * sy) > 0 ? (hx * sx + hy * sy) / (sx * sx + sy * sy) : 0;
    if (s < -0.01 || s > 1.01) return Infinity;
    return t;
}
