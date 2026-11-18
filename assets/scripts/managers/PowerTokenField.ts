import { Node, SpriteFrame } from 'cc';
import { PowerToken } from '../entities/PowerToken';
import { Warrior } from '../entities/Warrior';
import { WALL_LT, WALL_RB } from '../entities/Track';
import {
    TokenKind, tokensUnlockedAt,
    TOKEN_FIRST_DELAY_SEC, TOKEN_LIFETIME_SEC, TOKEN_FIRST_LIFETIME_SEC, TOKEN_BLINK_SEC, tokenIntervalFor,
} from '../data/PowerTokens';

/** Pickup reach of a token in physics-local units (a warrior's radius is added). */
const TOKEN_REACH = 20;
/** Free space required around a new token (on top of the warrior's radius / between tokens). */
const SPAWN_CLEARANCE = 40;
const TOKEN_GAP = 90;
/** Spawn area: fraction of the track length (0 = launcher end, 1 = far end) and of its width. */
const SPAWN_Y_MIN = 0.42;   // keeps clear of the crossbow
const SPAWN_Y_MAX = 0.9;
const SPAWN_X_FRAC = 0.3;

export interface PowerTokenFieldDeps {
    layer: Node;          // World/TokenLayer (below WarriorsLayer: tokens under every warrior)
    box2dLayer: Node;
    faceFor: (kind: TokenKind) => SpriteFrame | null;
    sparkle: () => SpriteFrame | null;
    warriors: () => Warrior[];
    round: () => number;
    /** Warriors on the track (past the line): sets the spawn interval (PowerTokens.TOKEN_INTERVALS). */
    onTrack: () => number;
    onSpawn: (kind: TokenKind) => void;
    onExpire: (kind: TokenKind) => void;
    /** A warrior went over the token: the field has already removed it from the track. */
    onCollect: (kind: TokenKind, token: PowerToken, by: Warrior, ageSec: number) => void;
}

interface Live { token: PowerToken; kind: TokenKind; life: number; lifetime: number }

/**
 * Spawns, ages and checks pickups of the power tokens. The regular clock puts one token on the
 * track at a time; a burst (new species) drops several, a short delay apart. Driven by
 * GameManager.update with `active` = real gameplay (not paused, not in a round-up freeze, no modal),
 * so lifetimes, bursts and the spawn clock never run while the player can't act.
 */
export class PowerTokenField {
    private _live: Live[] = [];
    private _clock = 0;
    private _spawnedAny = false;   // the first token comes TOKEN_FIRST_DELAY_SEC into the first token round
    private _lastKind: TokenKind | null = null;
    /** Pending burst tokens, in order (undefined = random unlocked kind): a second burst queues
     *  behind the first instead of overwriting its kind. */
    private _burstQueue: (TokenKind | undefined)[] = [];
    private _burstGap = 0;
    private _burstClock = 0;

    constructor(private readonly deps: PowerTokenFieldDeps) {}

    /** First token on the track (QA / tests). */
    get current(): { kind: TokenKind; token: PowerToken } | null {
        const l = this._live[0];
        return l ? { kind: l.kind, token: l.token } : null;
    }

    get count(): number { return this._live.length; }

    /** Tokens on the track plus the burst still to drop (null = random kind): saved in the game
     *  snapshot so a reload doesn't lose a new species' drop. Restore with `burst(1, gap, kind)` each. */
    get pending(): (TokenKind | null)[] {
        return [...this._live.map(l => l.kind), ...this._burstQueue.map(k => k ?? null)];
    }

    tick(dt: number, active: boolean): void {
        this._live = this._live.filter(l => l.token.node?.isValid);
        if (!active) return;

        for (const l of this._live.slice()) {
            l.life -= dt;
            l.token.tickIdle(dt, l.life <= TOKEN_BLINK_SEC);
            const by = this._pickupBy(l.token);
            if (by) {
                this._remove(l);
                this.deps.onCollect(l.kind, l.token, by, l.lifetime - l.life);
            } else if (l.life <= 0) {
                this._remove(l);
                l.token.vanish();
                this.deps.onExpire(l.kind);
            }
        }

        if (this._burstQueue.length > 0) {
            this._burstClock += dt;
            if (this._burstClock >= this._burstGap) {
                this._burstClock = 0;
                if (this.spawn(this._burstQueue[0], true)) this._burstQueue.shift();
            }
            return;
        }

        if (tokensUnlockedAt(this.deps.round()).length === 0) return;
        this._clock += dt;   // counts from the last appearance, also while that token is on the track
        if (this._live.length > 0) return;
        // Re-read every frame: the interval shortens as soon as the track fills up.
        const interval = this._spawnedAny ? tokenIntervalFor(this.deps.onTrack()) : TOKEN_FIRST_DELAY_SEC;
        if (this._clock >= interval) {
            if (this.spawn()) this._clock = 0;
            else this._clock = interval - 1;   // no free spot now: retry in a second
        }
    }

    /** Drop `n` tokens of `kind` (default: random unlocked kinds), `gapSec` apart (the first right away).
     *  The regular clock restarts after it. */
    burst(n: number, gapSec: number, kind?: TokenKind): void {
        if (tokensUnlockedAt(this.deps.round()).length === 0) return;
        if (this._burstQueue.length === 0) this._burstClock = gapSec;
        for (let i = 0; i < n; i++) this._burstQueue.push(kind);
        this._burstGap = gapSec;
        this._clock = 0;
    }

    /** Spawn a token of `kind` (default: random unlocked kind, avoiding a repeat when possible).
     *  Unless `alongside`, only when the track has no token. */
    spawn(kind?: TokenKind, alongside = false): boolean {
        if (this._live.length > 0 && !alongside) return false;
        const unlocked = tokensUnlockedAt(this.deps.round());
        if (!kind) {
            if (unlocked.length === 0) return false;
            const pool = unlocked.length > 1 ? unlocked.filter(c => c.kind !== this._lastKind) : unlocked;
            kind = pool[Math.floor(Math.random() * pool.length)].kind;
        }
        const spot = this._freeSpot();
        if (!spot) return false;
        const token = PowerToken.create(this.deps.layer, this.deps.box2dLayer, spot.x, spot.y, {
            face: this.deps.faceFor(kind),
            sparkle: this.deps.sparkle(),
        });
        token.appear();
        const lifetime = this._spawnedAny ? TOKEN_LIFETIME_SEC : TOKEN_FIRST_LIFETIME_SEC;
        this._live.push({ token, kind, life: lifetime, lifetime });
        this._lastKind = kind;
        this._spawnedAny = true;
        this.deps.onSpawn(kind);
        return true;
    }

    /** Remove every token at once (game over, scene exit) and cancel a pending burst. */
    clear(): void {
        for (const l of this._live) if (l.token.node?.isValid) l.token.node.destroy();
        this._live = [];
        this._burstQueue = [];
    }

    private _remove(l: Live): void {
        const i = this._live.indexOf(l);
        if (i >= 0) this._live.splice(i, 1);
    }

    private _pickupBy(t: PowerToken): Warrior | null {
        for (const w of this.deps.warriors()) {
            if (!w.node?.isValid || w.merging || !w.fired) continue;
            if (w.velocity.length() < 0.5) continue;   // only a moving warrior "runs over" it
            const p = w.node.position;
            const reach = w.radius + TOKEN_REACH;
            const dx = p.x - t.x, dy = p.y - t.y;
            if (dx * dx + dy * dy <= reach * reach) return w;
        }
        return null;
    }

    private _freeSpot(): { x: number; y: number } | null {
        const sy = this.deps.box2dLayer.scale.y || 1;
        const span = WALL_LT.y - WALL_RB.y;
        const halfW = (WALL_RB.x - WALL_LT.x) * SPAWN_X_FRAC;
        const ws = this.deps.warriors().filter(w => w.node?.isValid);
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() * 2 - 1) * halfW;
            const y = (WALL_RB.y + span * (SPAWN_Y_MIN + Math.random() * (SPAWN_Y_MAX - SPAWN_Y_MIN))) / sy;
            const clearOfWarriors = ws.every(w => {
                const p = w.node.position;
                const d = w.radius + TOKEN_REACH + SPAWN_CLEARANCE;
                return (p.x - x) ** 2 + (p.y - y) ** 2 > d * d;
            });
            const clearOfTokens = this._live.every(l => (l.token.x - x) ** 2 + (l.token.y - y) ** 2 > TOKEN_GAP * TOKEN_GAP);
            if (clearOfWarriors && clearOfTokens) return { x, y };
        }
        return null;
    }
}
