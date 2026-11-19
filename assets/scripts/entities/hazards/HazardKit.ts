import { Node, Sprite, SpriteFrame, UITransform, UIOpacity, RigidBody2D, ERigidBody2DType, CircleCollider2D, Contact2DType, Color, tween, Tween, Vec3, gfx } from 'cc';
import { Warrior } from '../Warrior';
import { PerspectiveMapper } from '../PerspectiveMapper';
import { SFX } from '../../managers/AudioManager';

/**
 * What an arena hazard needs from the game (built by GameManager). Positions are in Box2DLayer
 * local space (the physics space the warriors live in): a circle there is a flat ellipse on screen.
 */
export interface HazardContext {
    box2dLayer: Node;
    warriorsLayer: Node;
    /** Floor decals (ice, mud, cracks, holes): above the track, under tokens and warriors. */
    floorLayer: Node;
    warriors(): readonly Warrior[];
    /** Physics Y of the game-over line (warriors pile up above it). */
    lineY(): number;
    /** Physics Y of the inner edge of the back wall. */
    topY(): number;
    /** Inner wall x range (physics) at physics y. */
    wallX(y: number): [number, number];
    frame(name: string): SpriteFrame | null;
    shake(amplitude: number, duration: number): void;
    sfx(id: SFX, volume?: number): void;
    /** Collider radius of a level-2 warrior right now (physics units): obstacles are that big. */
    obstacleRadius(): number;
}

/** Physics → screen scale of the Box2DLayer: x, and y including the perspective squash. */
export function screenScale(ctx: HazardContext): { x: number; y: number } {
    const ws = ctx.box2dLayer.worldScale;
    return { x: ws.x, y: ws.y * ctx.box2dLayer.scale.y };
}

export function additive(sp: Sprite): void {
    const s = sp as unknown as { srcBlendFactor: number; dstBlendFactor: number };
    s.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
    s.dstBlendFactor = gfx.BlendFactor.ONE;
}

/** A sprite node (CUSTOM size) under `parent`, on the parent's render layer, with a UIOpacity. */
export function makeSprite(parent: Node, name: string, frame: SpriteFrame | null, w: number, h: number, anchorY = 0.5): { node: Node; sprite: Sprite; opacity: UIOpacity } {
    const node = new Node(name);
    node.layer = parent.layer;
    node.setParent(parent);
    const uit = node.addComponent(UITransform);
    uit.setContentSize(w, h);
    uit.setAnchorPoint(0.5, anchorY);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    const opacity = node.addComponent(UIOpacity);
    return { node, sprite, opacity };
}

/** A physics-space anchor in the Box2DLayer whose view (any node) follows it like a warrior's. */
export function makeAnchor(ctx: HazardContext, name: string, x: number, y: number, view: Node, yOffset = 0): { node: Node; mapper: PerspectiveMapper } {
    const node = new Node(name);
    node.layer = ctx.box2dLayer.layer;
    node.setParent(ctx.box2dLayer);
    node.setPosition(x, y, 0);
    const mapper = node.addComponent(PerspectiveMapper);
    mapper.viewNode = view;
    mapper.yOffset = yOffset;
    mapper.lateUpdate();
    return { node, mapper };
}

/**
 * A flat zone on the floor: a decal whose ellipse on screen is the zone. `contains` tests a physics
 * point (with a pad, e.g. part of a warrior radius).
 */
export class FloorDecal {
    readonly anchor: Node;
    readonly view: Node;
    readonly sprite: Sprite;
    readonly opacity: UIOpacity;
    readonly mapper: PerspectiveMapper;
    /** Zone half-axes in physics units. */
    readonly rx: number;
    readonly ry: number;
    readonly x: number;
    readonly y: number;

    constructor(ctx: HazardContext, name: string, frame: SpriteFrame | null, x: number, y: number, screenW: number, screenH: number) {
        const s = screenScale(ctx);
        this.x = x; this.y = y;
        this.rx = screenW / 2 / s.x;
        this.ry = screenH / 2 / s.y;
        const v = makeSprite(ctx.floorLayer, name, frame, screenW, screenH);
        this.view = v.node; this.sprite = v.sprite; this.opacity = v.opacity;
        this.opacity.opacity = 0;
        const a = makeAnchor(ctx, `${name}Anchor`, x, y, this.view);
        this.anchor = a.node;
        this.mapper = a.mapper;
    }

    contains(px: number, py: number, pad = 0): boolean {
        const dx = (px - this.x) / (this.rx + pad), dy = (py - this.y) / (this.ry + pad);
        return dx * dx + dy * dy <= 1;
    }

    get alive(): boolean { return this.view.isValid; }

    fadeIn(sec: number, to = 255): void {
        Tween.stopAllByTarget(this.opacity);
        tween(this.opacity).to(sec, { opacity: to }, { easing: 'sineOut' }).start();
    }

    /** Fade out, then destroy. */
    fadeOut(sec: number): void {
        if (!this.view.isValid) return;
        Tween.stopAllByTarget(this.opacity);
        tween(this.opacity).to(sec, { opacity: 0 }).call(() => this.destroy()).start();
    }

    destroy(): void {
        if (this.opacity.isValid) Tween.stopAllByTarget(this.opacity);
        if (this.sprite.isValid) Tween.stopAllByTarget(this.sprite);
        if (this.view.isValid) Tween.stopAllByTarget(this.view);
        Tween.stopAllByTarget(this.mapper);
        if (this.view.isValid) this.view.destroy();
        if (this.anchor.isValid) this.anchor.destroy();
    }
}

/** Static round obstacle in the physics world (deflects the warriors) with a view among them. */
export class Obstacle {
    readonly body: Node;
    readonly view: Node;
    readonly sprite: Sprite;
    readonly mapper: PerspectiveMapper;
    readonly radius: number;
    private _collider: CircleCollider2D | null = null;
    onHit: ((w: Warrior) => void) | null = null;

    constructor(ctx: HazardContext, name: string, frame: SpriteFrame | null, x: number, y: number, radius: number, viewW: number, viewH: number) {
        this.radius = radius;
        const v = makeSprite(ctx.warriorsLayer, name, frame, viewW, viewH);
        this.view = v.node; this.sprite = v.sprite;
        const a = makeAnchor(ctx, `${name}Body`, x, y, this.view, radius * Warrior.viewYOffset);
        this.body = a.node; this.mapper = a.mapper;
    }

    /** Turn the collider on (once the obstacle is out of the floor / has landed). */
    solidify(restitution = 0.55): void {
        if (this._collider || !this.body.isValid) return;
        const rb = this.body.addComponent(RigidBody2D);
        rb.type = ERigidBody2DType.Static;
        rb.enabledContactListener = true;
        const col = this.body.addComponent(CircleCollider2D);
        col.radius = this.radius;
        col.restitution = restitution;
        col.friction = 0.1;
        col.apply();
        col.on(Contact2DType.BEGIN_CONTACT, (_a: unknown, other: CircleCollider2D) => {
            const w = other?.node?.getComponent(Warrior);
            if (w && this.onHit) this.onHit(w);
        });
        this._collider = col;
    }

    get solid(): boolean { return !!this._collider; }
    get alive(): boolean { return this.body.isValid; }

    /** Remove the collider (next frame: never inside a physics callback), keep the view for its exit. */
    unsolidify(): void {
        const col = this._collider;
        this._collider = null;
        if (!col) return;
        const body = this.body;
        setTimeout(() => {
            if (!body.isValid) return;
            body.getComponent(CircleCollider2D)?.destroy();
            body.getComponent(RigidBody2D)?.destroy();
        }, 0);
    }

    destroy(): void {
        const body = this.body, view = this.view;
        if (view.isValid) { Tween.stopAllByTarget(view); view.destroy(); }
        Tween.stopAllByTarget(this.mapper);
        setTimeout(() => { if (body.isValid) body.destroy(); }, 0);
    }
}

/** Little pieces flying out of a point of the warriors layer (dust, shards, ice chips). */
export function burst(ctx: HazardContext, frame: SpriteFrame | null, at: Vec3, count: number, size: number, tint: Color, spread: number, glow = false): void {
    if (!frame) return;
    for (let i = 0; i < count; i++) {
        const s = makeSprite(ctx.warriorsLayer, 'HazardBit', frame, size, size);
        s.sprite.color = tint;
        if (glow) additive(s.sprite);
        s.node.setWorldPosition(at.x, at.y, 0);
        const ang = Math.random() * Math.PI * 2, d = spread * (0.5 + Math.random() * 0.7);
        const life = 0.45 + Math.random() * 0.35;
        s.node.angle = Math.random() * 360;
        const to = new Vec3(at.x + Math.cos(ang) * d, at.y + Math.abs(Math.sin(ang)) * d * 0.6 + 10, 0);
        tween(s.node).to(life, { worldPosition: to, angle: s.node.angle + (Math.random() - 0.5) * 360 }, { easing: 'quadOut' }).start();
        tween(s.opacity).delay(life * 0.5).to(life * 0.5, { opacity: 0 }).call(() => { if (s.node.isValid) s.node.destroy(); }).start();
    }
}

/** Uniform random in [a, b]. */
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Free spot (physics) on the track above the line, clear of warriors and of `taken`. */
export function freeSpot(ctx: HazardContext, clearance: number, taken: { x: number; y: number; r: number }[], yFrom = 0.18, yTo = 0.78): { x: number; y: number } | null {
    const lo = ctx.lineY(), hi = ctx.topY();
    for (let tries = 0; tries < 14; tries++) {
        const y = lo + (hi - lo) * rand(yFrom, yTo);
        const [l, r] = ctx.wallX(y);
        const x = rand(l + clearance * 1.2, r - clearance * 1.2);
        if (x <= l || x >= r) continue;
        const near = ctx.warriors().some(w => w.node?.isValid && Math.hypot(w.node.position.x - x, w.node.position.y - y) < w.radius + clearance * 1.3);
        if (near) continue;
        if (taken.some(t => Math.hypot(t.x - x, t.y - y) < t.r + clearance * 1.4)) continue;
        return { x, y };
    }
    return null;
}

/** One arena difficulty. ArenaHazards ticks the active one during play and multiplies the warriors'
 *  damping by `dampingFactor` while they stand in its zones. */
export abstract class ArenaHazard {
    constructor(protected readonly ctx: HazardContext) {}
    /** Advance timers, spawn / expire (only while the game is playing). */
    abstract tick(dt: number): void;
    /** Damping multiplier for warrior `w` at physics (x, y): 1 = no effect, < 1 slides more, > 1 brakes. */
    dampingFactor(_x: number, _y: number, _w: Warrior): number { return 1; }
    /** Remove everything (arena change, game reset). */
    abstract clear(): void;
    /** QA: spawn one right now (true if it did). */
    spawnNow(): boolean { return false; }
    /** Live elements (QA / tests). */
    abstract get count(): number;
}

/** A warrior counts as moving (launched or knocked) above this speed (Box2D units, = SETTLE_VELOCITY). */
export const MOVING_SPEED = 0.4;
