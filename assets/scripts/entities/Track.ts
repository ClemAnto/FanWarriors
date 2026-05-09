import { _decorator, Component, Node, Graphics, Color, RigidBody2D, ERigidBody2DType, BoxCollider2D, PolygonCollider2D, Size, Vec2 } from 'cc';
const { ccclass } = _decorator;

export const TRACK_W          = 500;   // width at the bottom opening
export const TRACK_BOTTOM_Y   = -600;  // world Y of the bottom wall
export const TRACK_TOP_Y      =  450;  // world Y of the top wall
export const TRACK_H          = TRACK_TOP_Y - TRACK_BOTTOM_Y;  // 1050 — kept for back-compat
export const GAME_OVER_LINE_Y = -80;   // world Y of the launch/play dividing line

const WALL_T           = 20;
const FUNNEL_ANGLE_DEG = 5;
const FUNNEL_OFFSET    = Math.tan(FUNNEL_ANGLE_DEG * Math.PI / 180) * TRACK_H;  // ≈ 92 px/side

@ccclass('Track')
export class Track extends Component {
    start() {
        console.log('[Track] start');
        this.node.setPosition(0, 0, 0);
        this.drawTrack();
        this.buildWalls();
        console.log(`[Track] ready — bottom=${TRACK_BOTTOM_Y} top=${TRACK_TOP_Y} w=${TRACK_W} angle=${FUNNEL_ANGLE_DEG}° offset=${FUNNEL_OFFSET.toFixed(0)}px`);
    }

    private drawTrack(): void {
        const g   = this.node.addComponent(Graphics);
        const hw  = TRACK_W / 2;
        const bot = TRACK_BOTTOM_Y;
        const top = TRACK_TOP_Y;
        const fo  = FUNNEL_OFFSET;

        // Full-screen dark background (extra-wide to cover all aspect ratios)
        g.fillColor = new Color(18, 18, 32, 255);
        g.rect(-2000, -640, 4000, 1280);
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
