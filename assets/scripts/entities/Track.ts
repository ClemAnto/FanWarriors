import { _decorator, Component, Node, Graphics, Color, RigidBody2D, ERigidBody2DType, BoxCollider2D, PolygonCollider2D, Size, Vec2 } from 'cc';
const { ccclass } = _decorator;

export const TRACK_W = 432;          // width at bottom (widest point)
export const TRACK_H = 680;
export const GAME_OVER_LINE_Y = 0;
const WALL_T = 20;
const FUNNEL_ANGLE_DEG = 6;
// horizontal offset per side from bottom to top: tan(6°) × TRACK_H ≈ 71px
const FUNNEL_OFFSET = Math.tan(FUNNEL_ANGLE_DEG * Math.PI / 180) * TRACK_H;

@ccclass('Track')
export class Track extends Component {
    start() {
        console.log('[Track] start');
        this.node.setPosition(0, 0, 0);
        this.drawTrack();
        this.buildWalls();
        console.log(`[Track] ready — funnel angle ${FUNNEL_ANGLE_DEG}° offset=${FUNNEL_OFFSET.toFixed(0)}px/side`);
    }

    private drawTrack(): void {
        const g = this.node.addComponent(Graphics);
        const hw = TRACK_W / 2;
        const hh = TRACK_H / 2;
        const fo = FUNNEL_OFFSET;

        // Canvas background
        g.fillColor = new Color(18, 18, 32, 255);
        g.rect(-640, -360, 1280, 720);
        g.fill();

        // Funnel fill: trapezoid wider at bottom, narrower at top
        g.fillColor = new Color(100, 100, 110, 255);
        g.moveTo(-hw,      -hh);
        g.lineTo( hw,      -hh);
        g.lineTo( hw - fo,  hh);
        g.lineTo(-hw + fo,  hh);
        g.close();
        g.fill();

        // Visible borders (inner edge of walls)
        g.lineWidth = WALL_T;
        g.strokeColor = new Color(50, 50, 65, 255);

        // Left wall inner edge
        g.moveTo(-hw,      -hh);
        g.lineTo(-hw + fo,  hh);
        g.stroke();

        // Right wall inner edge
        g.moveTo( hw,      -hh);
        g.lineTo( hw - fo,  hh);
        g.stroke();

        // Top edge
        g.moveTo(-hw + fo,  hh);
        g.lineTo( hw - fo,  hh);
        g.stroke();

        // Game over line (clamped to funnel width at y=0)
        const halfLineW = hw - fo / 2;
        g.lineWidth = 4;
        g.strokeColor = new Color(220, 40, 40, 255);
        g.moveTo(-halfLineW, GAME_OVER_LINE_Y);
        g.lineTo( halfLineW, GAME_OVER_LINE_Y);
        g.stroke();
    }

    private buildWalls(): void {
        const hw  = TRACK_W / 2;
        const hh  = TRACK_H / 2;
        const fo  = FUNNEL_OFFSET;
        const t   = WALL_T;

        // Left wall — angled: bottom at x=-hw, top at x=-hw+fo
        this.spawnFunnelWall('WallLeft', [
            new Vec2(-hw - t, -hh),
            new Vec2(-hw,     -hh),
            new Vec2(-hw + fo,      hh),
            new Vec2(-hw + fo - t,  hh),
        ], 0.8, 0.05);

        // Right wall — angled: bottom at x=+hw, top at x=+hw-fo
        this.spawnFunnelWall('WallRight', [
            new Vec2(hw,          -hh),
            new Vec2(hw + t,      -hh),
            new Vec2(hw - fo + t,  hh),
            new Vec2(hw - fo,      hh),
        ], 0.8, 0.05);

        // Top wall — spans narrowed opening
        const topWidth = TRACK_W - 2 * fo;
        this.spawnBoxWall('WallTop',    0,   hh,  topWidth, t, 0.0, 1.0);

        // Bottom wall — full width, invisible
        this.spawnBoxWall('WallBottom', 0,  -hh,  TRACK_W,  t, 0.0, 0.0);
    }

    private spawnFunnelWall(name: string, points: Vec2[], restitution: number, friction: number): void {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(0, 0);

        const rb = node.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Static;

        const col = node.addComponent(PolygonCollider2D);
        col.points = points;
        col.friction = friction;
        col.restitution = restitution;
    }

    private spawnBoxWall(name: string, x: number, y: number, w: number, h: number, restitution: number, friction: number): void {
        const node = new Node(name);
        node.setParent(this.node);
        node.setPosition(x, y);

        const rb = node.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Static;

        const col = node.addComponent(BoxCollider2D);
        col.size = new Size(w, h);
        col.friction = friction;
        col.restitution = restitution;
    }
}
