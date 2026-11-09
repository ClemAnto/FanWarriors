import { LeaderboardEntry, LeaderboardService, SubmitResult } from './LeaderboardService';
import { PLAYGAMA_LEADERBOARD_ID } from '../config/PortalConfig';
import { SCORE_CAP, REQUEST_TIMEOUT_MS } from '../config/LeaderboardConfig';
import { SafeStorage } from '../utils/SafeStorage';

/** Minimal surface of the Playgama Bridge leaderboards module we use. */
interface BridgeLeaderboardEntry {
    id?: string;
    name?: string;
    photo?: string;
    score?: number | string;
    rank?: number | string;
}
interface BridgeLeaderboardsLike {
    leaderboards: {
        type: string;   // 'not_available' | 'in_game' | 'native' | 'native_popup'
        setScore(id: string, score: number): Promise<unknown>;
        getEntries(id: string): Promise<BridgeLeaderboardEntry[]>;
    };
}

/** Best score already accepted by the platform board — never re-submit a lower one. */
const LS_SUBMITTED_BEST = 'fw_lb_submitted_best';
/** Platform names can be long ("Okay Catshark…"); the LeaderboardRow "Name" Label is centred with
 *  no overflow clamp and sits between Rank and Round → ~150 px free. Seen in the QA tool
 *  (2026-11-09): 12 chars covered the rank number, 9 still touched it → 8 (7 + "…"). */
const NAME_MAX_CHARS = 8;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]);
}

/**
 * Leaderboard backed by the Playgama Bridge (`bridge.leaderboards`). On the Playgama
 * catalog it runs as an `in_game` board through Playgama "Bridge SaaS" (enabled by the
 * `saas` block in playgama-bridge-config.json) — no external backend of ours, so it
 * respects Playgama's "no external requests" rule (Firebase stays off on this build).
 *
 * Differences from the Firestore board (see LeaderboardService):
 *  - The platform owns player identity → `providesNames = true`: no arcade name entry,
 *    entries carry the platform name. Round/version are not stored (round = 0 → UI shows "–").
 *  - `isAvailable` is true only when the platform reports `in_game` (we render the board).
 *    On `native`/`native_popup` platforms the score is still submitted (the platform renders
 *    its own board), but the in-game Ranking UI must stay hidden. `not_available` → no-op.
 *  - `qualifies()` is true for any new personal best: the platform keeps one row per player,
 *    so every improvement matters, not only top-N.
 */
export class PlaygamaLeaderboard implements LeaderboardService {
    readonly providesNames = true;

    private _initPromise: Promise<boolean> | null = null;
    private _type = 'not_available';

    get isAvailable(): boolean { return this._type === 'in_game'; }

    init(): Promise<boolean> {
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            const w = window as unknown as { __fwBridgeBoot?: Promise<void>; bridge?: BridgeLeaderboardsLike };
            try {
                if (w.__fwBridgeBoot) await w.__fwBridgeBoot;
                this._type = w.bridge?.leaderboards?.type ?? 'not_available';
            } catch {
                this._type = 'not_available';
            }
            console.log(`[Leaderboard] Playgama leaderboards type: ${this._type}`);
            return this._type !== 'not_available';
        })();
        return this._initPromise;
    }

    async getTop(limit: number): Promise<LeaderboardEntry[]> {
        await this.init();
        const bridge = this._bridge();
        if (!bridge || !this.isAvailable) return [];
        try {
            const raw = await withTimeout(bridge.leaderboards.getEntries(PLAYGAMA_LEADERBOARD_ID), REQUEST_TIMEOUT_MS);
            return (raw ?? [])
                .map(e => ({ e, rank: Number(e.rank ?? Number.MAX_SAFE_INTEGER) }))
                .sort((a, b) => a.rank - b.rank || Number(b.e.score ?? 0) - Number(a.e.score ?? 0))
                .slice(0, limit)
                .map(({ e }) => ({
                    name: PlaygamaLeaderboard._shortName(e.name),
                    score: Math.max(0, Math.floor(Number(e.score ?? 0))),
                    round: 0,
                    version: '',
                    createdAt: 0,
                }));
        } catch (e) {
            console.warn('[Leaderboard] Playgama getEntries failed:', e);
            return [];
        }
    }

    async qualifies(score: number): Promise<boolean> {
        await this.init();
        if (this._type === 'not_available') return false;
        return Number.isInteger(score) && score > 0 && score <= SCORE_CAP && score > this._submittedBest();
    }

    async submit(entry: LeaderboardEntry): Promise<SubmitResult> {
        await this.init();
        const bridge = this._bridge();
        if (!bridge || this._type === 'not_available') return { ok: false, rank: null, error: 'leaderboards not available' };
        const score = entry.score;
        if (!Number.isInteger(score) || score <= 0 || score > SCORE_CAP) return { ok: false, rank: null, error: 'score out of range' };
        if (score <= this._submittedBest()) return { ok: true, rank: null };  // platform already holds a better one
        try {
            await withTimeout(bridge.leaderboards.setScore(PLAYGAMA_LEADERBOARD_ID, score), REQUEST_TIMEOUT_MS);
            SafeStorage.set(LS_SUBMITTED_BEST, String(score));
            return { ok: true, rank: null };
        } catch (e) {
            console.warn('[Leaderboard] Playgama setScore failed:', e);
            return { ok: false, rank: null, error: String(e) };
        }
    }

    private _submittedBest(): number {
        return parseInt(SafeStorage.get(LS_SUBMITTED_BEST) ?? '0', 10) || 0;
    }

    private _bridge(): BridgeLeaderboardsLike | null {
        if (typeof window === 'undefined') return null;
        return (window as unknown as { bridge?: BridgeLeaderboardsLike }).bridge ?? null;
    }

    private static _shortName(name: string | undefined): string {
        const n = (name ?? '').trim() || 'Player';
        return n.length > NAME_MAX_CHARS ? `${n.slice(0, NAME_MAX_CHARS - 1)}…` : n;
    }
}
