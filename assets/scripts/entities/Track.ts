import { _decorator, Component, Node, Graphics, Color, RigidBody2D, ERigidBody2DType, BoxCollider2D, PolygonCollider2D, Size, Vec2, view } from 'cc';
const { ccclass } = _decorator;

// ── Layout — recalculated at startup from actual screen size ─────────────────
export let LAYOUT_SCALE   = 1.0;   // TRACK_W / 384 — proportional scale factor for all game elements
export let TRACK_W        = 400;   // bottom width, aspect ratio 5:12
export let TRACK_BOTTOM_Y = -640;  // bottom of visible screen
export let TRACK_TOP_Y    =  320;  // TRACK_BOTTOM_Y + TRACK_H
export let TRACK_H        =  960;  // min(75% screen height, 12/5 × 95% screen width)
export let GAME_OVER_LINE_Y = -160; // midpoint of track height
export let FUNNEL_OFFSET  =   67;  // TRACK_W / 6

const WALL_T = 20;
const ASPECT_RATIO = 6/10;

/** Call once before any game objects are created (GameManager.start). */
export function initLayout(): void {
    const vs       = view.getVisibleSize();
    TRACK_BOTTOM_Y = -Math.round(vs.height / 2);

    // Mirrors CSS: height: min(75%, calc(95vw * 12 / 5)); aspect-ratio: 5/12
    // Anchored to screen bottom, horizontally centred.
	
    TRACK_H  = Math.round(Math.min(vs.height * 0.75, (1 / ASPECT_RATIO) * 0.95 * vs.width));
    TRACK_W  = Math.round(TRACK_H * ASPECT_RATIO);

    TRACK_TOP_Y      = TRACK_BOTTOM_Y + TRACK_H;
    GAME_OVER_LINE_Y = Math.round((TRACK_BOTTOM_Y + TRACK_TOP_Y) / 2);
    LAYOUT_SCALE     = TRACK_W / 384;
    FUNNEL_OFFSET    = Math.round(TRACK_W / 6);
}

@ccclass('Track')
export class Track extends Component {
    start() {
        console.log('[Track] start');
        initLayout();   // safe to call again — idempotent given same visible size
        this.node.setPosition(0, 0, 0);
        this.drawTrack();
        this.buildWalls();
        console.log(`[Track] ready — scale=${LAYOUT_SCALE.toFixed(2)} w=${TRACK_W} h=${TRACK_H} bottom=${TRACK_BOTTOM_Y} top=${TRACK_TOP_Y} topW=${TRACK_W - 2 * FUNNEL_OFFSET}`);
    }

    relayout(): void {
        initLayout();
        this.drawTrack();
        this.buildWalls();
        console.log(`[Track] relayout — scale=${LAYOUT_SCALE.toFixed(2)} w=${TRACK_W} h=${TRACK_H}`);
    }

    private drawTrack(): void {
        const g   = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        g.clear();
        const hw  = TRACK_W / 2;
        const bot = TRACK_BOTTOM_Y;
        const top = TRACK_TOP_Y;
        const fo  = FUNNEL_OFFSET;
        const vh  = Math.round(view.getVisibleSize().height);

        // Full-screen dark background (extra-wide to cover all aspect ratios)
        g.fillColor = new Color(18, 18, 32, 255);
        g.rect(-8000, -vh / 2, 16000, vh);
        g.fill();

        // Funnel fill — trapezoid wider at bottom, narrower at top
        g.fillColor = new Color(100, 100, 110, 255);
        g.moveTo(-hw,      bot);
        g.lineTo( hw,      bot);
        g.lineTo( hw - fo, top);
        g.lineTo(-hw + fo, top);
        g.close();
        g.fill();

        // Wall inner edges
        g.lineWidth    = WALL_T;
        g.strokeColor  = new Color(50, 50, 65, 255);
        g.moveTo(-hw,      bot); g.lineTo(-hw + fo, top); g.stroke();
        g.moveTo( hw,      bot); g.lineTo( hw - fo, top); g.stroke();
        g.moveTo(-hw + fo, top); g.lineTo( hw - fo, top); g.stroke();

        // Game-over line — width interpolated at GAME_OVER_LINE_Y
        const t         = (GAME_OVER_LINE_Y - bot) / (top - bot);
        const lineHalfW = hw - fo * t;
        g.lineWidth   = 4;
        g.strokeColor = new Color(220, 40, 40, 255);
        g.moveTo(-lineHalfW, GAME_OVER_LINE_Y);
        g.lineTo( lineHalfW, GAME_OVER_LINE_Y);
        g.stroke();
    }

    private buildWalls(): void {
        for (const name of ['WallLeft', 'WallRight', 'WallTop', 'WallBottom'])
            this.node.getChildByName(name)?.destroy();
        const hw  = TRACK_W / 2;
        const bot = TRACK_BOTTOM_Y;
        const top = TRACK_TOP_Y;
        const fo  = FUNNEL_OFFSET;
        const t   = WALL_T;

        this.spawnFunnelWall('WallLeft', [
            new Vec2(-hw - t,      bot),
            new Vec2(-hw,          bot),
            new Vec2(-hw + fo,     top),
            new Vec2(-hw + fo - t, top),
        ], 0.8, 0.05);

        this.spawnFunnelWall('WallRight', [
            new Vec2( hw,          bot),
            new Vec2( hw + t,      bot),
            new Vec2( hw - fo + t, top),
            new Vec2( hw - fo,     top),
        ], 0.8, 0.05);

        const innerTopW = TRACK_W - 2 * fo;
        this.spawnBoxWall('WallTop',    0, top, innerTopW, t, 0.0, 1.0);
        this.spawnBoxWall('WallBottom', 0, bot, TRACK_W,   t, 0.0, 0.0);
    }

    private spawnFunnelWall(name: string, points: Vec2[], restitution: number, friction: number): void {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(0, 0);
        const rb   = node.addComponent(RigidBody2D);
        rb.type    = ERigidBody2DType.Static;
        const col  = node.addComponent(PolygonCollider2D);
        col.points = points;
        col.friction    = friction;
        col.restitution = restitution;
    }

    private spawnBoxWall(name: string, x: number, y: number, w: number, h: number, restitution: number, friction: number): void {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(x, y);
        const rb   = node.addComponent(RigidBody2D);
        rb.type    = ERigidBody2DType.Static;
        const col  = node.addComponent(BoxCollider2D);
        col.size   = new Size(w, h);
        col.friction    = friction;
        col.restitution = restitution;
    }
}
