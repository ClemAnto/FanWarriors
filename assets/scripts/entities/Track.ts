import { _decorator, Component, Node, Graphics, Color, RigidBody2D, ERigidBody2DType, BoxCollider2D, Size } from 'cc';
const { ccclass } = _decorator;

export const TRACK_W = 648;
export const TRACK_H = 680;
export const GAME_OVER_LINE_Y = 0;
const WALL_T = 20;

@ccclass('Track')
export class Track extends Component {
    start() {
        console.log('[Track] start');
        this.node.setPosition(0, 0, 0);
        this.drawTrack();
        this.buildWalls();
        console.log('[Track] track and walls ready');
    }

    private drawTrack(): void {
        const g = this.node.addComponent(Graphics);

        // Surface
        g.fillColor = new Color(100, 100, 110, 255);
        g.rect(-TRACK_W / 2, -TRACK_H / 2, TRACK_W, TRACK_H);
        g.fill();

        // Visible borders: left, top, right (U shape — bottom stays open/invisible)
        g.lineWidth = WALL_T;
        g.strokeColor = new Color(50, 50, 65, 255);
        g.moveTo(-TRACK_W / 2, -TRACK_H / 2);
        g.lineTo(-TRACK_W / 2,  TRACK_H / 2);
        g.lineTo( TRACK_W / 2,  TRACK_H / 2);
        g.lineTo( TRACK_W / 2, -TRACK_H / 2);
        g.stroke();

        // Game over line
        g.lineWidth = 4;
        g.strokeColor = new Color(220, 40, 40, 255);
        g.moveTo(-TRACK_W / 2, GAME_OVER_LINE_Y);
        g.lineTo( TRACK_W / 2, GAME_OVER_LINE_Y);
        g.stroke();
    }

    private buildWalls(): void {
        // Lateral walls: elastic bounce
        this.spawnWall('WallLeft',   -TRACK_W / 2, 0, WALL_T, TRACK_H, 0.8, 0.05);
        this.spawnWall('WallRight',   TRACK_W / 2, 0, WALL_T, TRACK_H, 0.8, 0.05);
        // Top wall (back of track): high damping
        this.spawnWall('WallTop',    0,  TRACK_H / 2, TRACK_W, WALL_T, 0.1, 0.8);
        // Invisible bottom wall: blocks re-entry below launch line
        this.spawnWall('WallBottom', 0, -TRACK_H / 2, TRACK_W, WALL_T, 0.0, 0.0);
    }

    private spawnWall(name: string, x: number, y: number, w: number, h: number, restitution: number, friction: number): void {
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
