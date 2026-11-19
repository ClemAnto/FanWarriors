import { _decorator, Component, Node, SpriteFrame, RigidBody2D, resources } from 'cc';
import { ARENAS } from '../data/Arenas';
import { Warrior } from '../entities/Warrior';
import { ArenaHazard, HazardContext } from '../entities/hazards/HazardKit';
import { IceZoneHazard } from '../entities/hazards/IceZoneHazard';
import { MudLaneHazard } from '../entities/hazards/MudLaneHazard';
import { SkullHazard } from '../entities/hazards/SkullHazard';
import { LavaCrackHazard } from '../entities/hazards/LavaCrackHazard';
import { LavaRockHazard } from '../entities/hazards/LavaRockHazard';

const { ccclass, property } = _decorator;

/** Art of each arena's difficulty (resources/hazards/<name>, lazy-loaded with the arena). */
const FRAMES: Record<string, string> = {
    'ice-patch': 'hazards/ice-patch/spriteFrame',
    'mud-pool': 'hazards/mud-pool/spriteFrame',
    'lava-crack': 'hazards/lava-crack/spriteFrame',
    'lava-rock': 'hazards/lava-rock/spriteFrame',
    'lava-shard': 'hazards/lava-shard/spriteFrame',
    'skull-head': 'hazards/skull-head/spriteFrame',
    'floor-hole': 'hazards/floor-hole/spriteFrame',
    'aura': 'particles/aura/spriteFrame',
};
/** Frames each arena needs (by arena id). */
const ARENA_FRAMES: Record<string, string[]> = {
    castle: [],
    ice: ['ice-patch'],
    swamp: ['mud-pool'],
    dungeon: ['skull-head', 'floor-hole'],
    volcano: ['lava-crack', 'lava-rock', 'lava-shard', 'aura'],
};

/**
 * Arena difficulties (2026-11-19): the hazards of the arena on screen. Castle: none. Frozen Lake:
 * patches of ice for a while (everybody slides more). Misty Swamp: deep mud down the middle (brakes).
 * Castle Dungeons: skulls popping out of the floor (deflect the shots). Volcano Forge: glowing cracks
 * (slow the shots) and falling lava rocks (deflect, shatter).
 * Behaviour only: the floor decals go in `floorLayer` (World/HazardLayer, in Game.scene), obstacles
 * among the warriors (Y-sorted with them). GameManager builds the context and ticks it during play.
 */
@ccclass('ArenaHazards')
export class ArenaHazards extends Component {
    @property({ type: Node, tooltip: 'World/HazardLayer — floor decals (above the track, under tokens and warriors).' })
    floorLayer: Node | null = null;

    private _ctx: HazardContext | null = null;
    private _arena = 0;
    private _hazards: ArenaHazard[] = [];
    private _frames = new Map<string, SpriteFrame>();
    private _loading = new Set<string>();
    /** Warriors whose damping we changed: base damping and the value we set. */
    private _damped = new Map<Warrior, { base: number; set: number }>();

    /** Set by GameManager once its layers exist (floorLayer from the scene is added here). */
    init(ctx: Omit<HazardContext, 'floorLayer' | 'frame'>): void {
        if (!this.floorLayer) return;
        this._ctx = { ...ctx, floorLayer: this.floorLayer, frame: name => this._frames.get(name) ?? null };
    }

    get arena(): number { return this._arena; }
    /** Live hazards of the current arena (QA / tests). */
    get hazards(): readonly ArenaHazard[] { return this._hazards; }

    /** Download (in the background) the art of arena `index`. */
    preload(index: number): void {
        for (const name of ARENA_FRAMES[ARENAS[index]?.id] ?? []) this._load(name);
    }

    /** Switch to the difficulties of arena `index` (clears the previous ones). */
    setArena(index: number): void {
        this.clear();
        this._arena = index;
        if (!this._ctx) return;
        this.preload(index);
        const ctx = this._ctx;
        switch (ARENAS[index]?.id) {
            case 'ice': this._hazards = [new IceZoneHazard(ctx)]; break;
            case 'swamp': this._hazards = [new MudLaneHazard(ctx)]; break;
            case 'dungeon': this._hazards = [new SkullHazard(ctx)]; break;
            case 'volcano': this._hazards = [new LavaCrackHazard(ctx), new LavaRockHazard(ctx)]; break;
            default: this._hazards = [];
        }
    }

    /** Remove every hazard on the track and give the warriors their damping back. */
    clear(): void {
        for (const h of this._hazards) h.clear();
        this._hazards = [];
        this._restoreDamping();
    }

    /** One frame of play (not called while paused, in a round-up or after game over). */
    tick(dt: number): void {
        if (!this._ctx || this._hazards.length === 0) return;
        // wait for the art: no invisible hazards
        if ((ARENA_FRAMES[ARENAS[this._arena]?.id] ?? []).some(n => !this._frames.has(n))) return;
        for (const h of this._hazards) h.tick(dt);
        this._applyDamping();
    }

    /** QA: spawn one element of each hazard of the current arena now. */
    spawnNow(): number {
        return this._hazards.filter(h => h.spawnNow()).length;
    }

    private _applyDamping(): void {
        const ctx = this._ctx!;
        const seen = new Set<Warrior>();
        for (const w of ctx.warriors()) {
            if (!w?.node?.isValid || w.merging) continue;
            const rb = w.node.getComponent(RigidBody2D);
            if (!rb) continue;
            const p = w.node.position;
            let k = 1;
            for (const h of this._hazards) k *= h.dampingFactor(p.x, p.y, w);
            const entry = this._damped.get(w);
            // someone else changed the damping since our last write (settle, reset…): that is the new base
            const base = entry && Math.abs(rb.linearDamping - entry.set) < 1e-4 ? entry.base : rb.linearDamping;
            if (k === 1) {
                if (entry) { if (Math.abs(rb.linearDamping - entry.set) < 1e-4) rb.linearDamping = entry.base; this._damped.delete(w); }
                continue;
            }
            const set = base * k;
            rb.linearDamping = set;
            this._damped.set(w, { base, set });
            seen.add(w);
        }
        for (const w of [...this._damped.keys()]) if (!seen.has(w)) this._damped.delete(w);
    }

    private _restoreDamping(): void {
        for (const [w, e] of this._damped) {
            const rb = w.node?.isValid ? w.node.getComponent(RigidBody2D) : null;
            if (rb && Math.abs(rb.linearDamping - e.set) < 1e-4) rb.linearDamping = e.base;
        }
        this._damped.clear();
    }

    private _load(name: string): void {
        if (this._frames.has(name) || this._loading.has(name) || !FRAMES[name]) return;
        this._loading.add(name);
        resources.load(FRAMES[name], SpriteFrame, (err, sf) => {
            this._loading.delete(name);
            if (err || !sf) { console.warn(`[ArenaHazards] cannot load ${FRAMES[name]}`, err); return; }
            this._frames.set(name, sf);
        });
    }
}
