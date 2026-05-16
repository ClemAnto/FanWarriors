import { Node, Graphics, Color, Label, UIOpacity, Vec2, Vec3, tween, UITransform } from 'cc';

export class VFXManager {
    private readonly vfxLayer:  Node;
    private readonly uiLayer:   Node;
    private readonly worldNode: Node;

    private _shakeTimer = 0;
    private _shakeDur   = 0;
    private _shakeAmp   = 0;

    constructor(vfxLayer: Node, uiLayer: Node, worldNode: Node) {
        this.vfxLayer  = vfxLayer;
        this.uiLayer   = uiLayer;
        this.worldNode = worldNode;
    }

    // ── screen shake ──────────────────────────────────────────────────────

    screenShake(amplitude: number, duration: number): void {
        if (amplitude >= this._shakeAmp || this._shakeTimer <= 0) {
            this._shakeAmp   = amplitude;
            this._shakeDur   = duration;
            this._shakeTimer = duration;
            console.log(`[VFXManager] screenShake amp=${amplitude} dur=${duration}`);
        }
    }

    tick(dt: number): void {
        if (this._shakeTimer <= 0) return;
        const uit = this.worldNode.getComponent(UITransform);
        if (!uit) return;
        this._shakeTimer -= dt;
        if (this._shakeTimer <= 0) {
            this._shakeTimer = 0;
            this._shakeAmp   = 0;
            uit.anchorPoint = new Vec2(0.5, 0.5);
            return;
        }
        const amp = this._shakeAmp * (this._shakeTimer / this._shakeDur);
        const dx  = (Math.random() * 2 - 1) * amp;
        const dy  = (Math.random() * 2 - 1) * amp;
        const w   = uit.contentSize.width  || 720;
        const h   = uit.contentSize.height || 1280;
        uit.anchorPoint = new Vec2(0.5 + dx / w, 0.5 + dy / h);
    }

    // ── merge VFX ─────────────────────────────────────────────────────────

    flashMerge(mapper: { animScale: number } | null): void {
        if (!mapper) return;
        tween(mapper)
            .to(0.08, { animScale: 1.4 })
            .to(0.12, { animScale: 1.0 })
            .start();
    }

    // ── score / banners ───────────────────────────────────────────────────

    spawnFloatingScore(x: number, y: number, points: number, large = false): void {
        const node = new Node('FloatingScore');
        node.setParent(this.uiLayer);
        node.setSiblingIndex(this.uiLayer.children.length - 1);
        node.setPosition(x, y);

        const lbl = node.addComponent(Label);
        lbl.string   = points >= 0 ? `+${points}` : `${points}`;
        lbl.fontSize = large ? 44 : 34;
        lbl.isBold   = true;
        lbl.color    = points >= 0 ? new Color(255, 220, 50, 255) : new Color(255, 80, 80, 255);

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        tween(node).by(0.9, { position: new Vec3(0, 90, 0) }).start();
        tween(opacity).delay(0.35).to(0.55, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); }).start();
    }

    showRoundUpBanner(round: number): void {
        const node = new Node('RoundUpBanner');
        node.setParent(this.uiLayer);
        node.setPosition(0, 0);
        node.setScale(0.4, 0.4, 1);

        const lbl = node.addComponent(Label);
        lbl.string   = `ROUND ${round}`;
        lbl.fontSize = 45;
        lbl.isBold   = true;
        lbl.color    = new Color(255, 220, 50, 255);

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        tween(node)
            .to(0.25, { scale: new Vec3(1.1, 1.1, 1) })
            .to(0.08, { scale: new Vec3(1.0, 1.0, 1) })
            .start();
        tween(opacity).delay(1.05).to(0.4, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); }).start();
    }

    // ── explosion VFX ─────────────────────────────────────────────────────

    spawnExplosionRings(x: number, yCanvas: number, radius: number, color: Color): void {
        for (let i = 0; i < 2; i++) {
            const vfx = new Node('ExpVFX');
            vfx.setParent(this.vfxLayer);
            vfx.setPosition(x, yCanvas);
            const g = vfx.addComponent(Graphics);
            g.lineWidth   = 6 - i * 2;
            g.strokeColor = color;
            g.circle(0, 0, radius);
            g.stroke();
            const op = vfx.addComponent(UIOpacity);
            op.opacity = 255;
            const dur = 0.45 + i * 0.12;
            tween(vfx).to(dur, { scale: new Vec3(3 + i, 3 + i, 1) }).start();
            tween(op).to(dur, { opacity: 0 })
                .call(() => { if (vfx.isValid) vfx.destroy(); }).start();
        }
    }

    spawnExplosionLabel(x: number, yCanvas: number, text: string, color: Color): void {
        if (!text) return;
        const node = new Node('ExpLabel');
        node.setParent(this.uiLayer);
        node.setSiblingIndex(this.uiLayer.children.length - 1);
        node.setPosition(x, yCanvas);
        const lbl = node.addComponent(Label);
        lbl.string   = text;
        lbl.fontSize = 40;
        lbl.isBold   = true;
        lbl.color    = color;
        const op = node.addComponent(UIOpacity);
        op.opacity = 255;
        tween(node).by(0.7, { position: new Vec3(0, 55, 0) }).start();
        tween(op).delay(0.3).to(0.4, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); }).start();
    }

    spawnBurstRing(x: number, yCanvas: number, radius: number, color: Color): void {
        const vfx = new Node('BurstVFX');
        vfx.setParent(this.vfxLayer);
        vfx.setPosition(x, yCanvas);
        const g = vfx.addComponent(Graphics);
        g.lineWidth   = 4;
        g.strokeColor = color;
        g.circle(0, 0, radius);
        g.stroke();
        const op = vfx.addComponent(UIOpacity);
        op.opacity = 200;
        tween(vfx).to(0.3, { scale: new Vec3(2, 2, 1) }).start();
        tween(op).to(0.3, { opacity: 0 })
            .call(() => { if (vfx.isValid) vfx.destroy(); }).start();
    }

    // ── suction VFX (rings + particles; physics state stays in GameManager) ──

    spawnSuctionVFX(cx: number, cyCanvas: number, ringColor: Color, strength: number, duration: number): void {
        const vs = Math.max(strength, 0.35);

        for (let i = 0; i < 2; i++) {
            const ring = new Node('SuctionRing');
            ring.setParent(this.vfxLayer);
            ring.setPosition(cx, cyCanvas);
            const sg = ring.addComponent(Graphics);
            sg.lineWidth   = 4 - i;
            sg.strokeColor = new Color(ringColor.r, ringColor.g, ringColor.b, Math.round((200 - i * 40) * vs));
            sg.circle(0, 0, (180 + i * 60) * vs);
            sg.stroke();
            const sop = ring.addComponent(UIOpacity);
            sop.opacity = Math.round((180 - i * 40) * vs);
            const delay = i * 0.15;
            tween(ring).delay(delay).to(duration - delay, { scale: new Vec3(0.01, 0.01, 1) }).start();
            tween(sop).delay(delay).to(duration - delay, { opacity: 0 })
                .call(() => { if (ring.isValid) ring.destroy(); }).start();
        }

        const count = Math.round(5 + 7 * vs);
        for (let i = 0; i < count; i++) {
            const angle  = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const r      = (80 + Math.random() * 80) * vs;
            const startX = cx       + Math.cos(angle) * r;
            const startY = cyCanvas + Math.sin(angle) * r;
            const midA   = angle + Math.PI / 3;
            const midX   = cx       + Math.cos(midA) * r * 0.4;
            const midY   = cyCanvas + Math.sin(midA) * r * 0.4;

            const p = new Node('SuctionParticle');
            p.setParent(this.vfxLayer);
            p.setPosition(startX, startY);
            const g = p.addComponent(Graphics);
            g.fillColor = new Color(ringColor.r, ringColor.g, ringColor.b, 220);
            g.circle(0, 0, Math.max(2.5, (3 + Math.random() * 3) * vs));
            g.fill();
            const op = p.addComponent(UIOpacity);
            op.opacity = 220;

            const delay = Math.random() * 0.35;
            const dur   = (0.35 + Math.random() * 0.25) * (0.5 + vs * 0.5);
            tween(p)
                .delay(delay)
                .to(dur * 0.55, { position: new Vec3(midX, midY,     0) }, { easing: 'quadIn' })
                .to(dur * 0.45, { position: new Vec3(cx,   cyCanvas, 0) }, { easing: 'quadIn' })
                .call(() => { if (p.isValid) p.destroy(); })
                .start();
            tween(op)
                .delay(delay)
                .to(dur * 0.3, { opacity: 220 })
                .to(dur * 0.7, { opacity: 0 })
                .start();
        }
    }
}
