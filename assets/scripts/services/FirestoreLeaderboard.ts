import { LeaderboardEntry, LeaderboardService, SubmitResult } from './LeaderboardService';
import { COLLECTION, FIREBASE_CONFIG, REQUEST_TIMEOUT_MS, SCORE_CAP, TOP_N } from '../config/LeaderboardConfig';

/**
 * Real online leaderboard backed by Firebase Firestore.
 *
 * Uses the Firebase **compat** SDK loaded as a global via CDN (no npm bundling) —
 * see scripts/patch-html.js / build-templates index.html, which inject
 * firebase-app-compat + firebase-firestore-compat. We touch only `window.firebase`,
 * so the engine bundle stays free of Firebase.
 *
 * Anti-cheat v1 lives entirely in Firestore security rules (validate name shape,
 * score range, createdAt == request.time, no update/delete). This client only
 * mirrors the same shape so well-formed writes pass.
 *
 * No method throws: network/SDK problems resolve to empty/false/{ok:false}.
 */
export class FirestoreLeaderboard implements LeaderboardService {
    readonly isAvailable = true;

    private _db: any = null;
    private _initPromise: Promise<boolean> | null = null;

    async init(): Promise<boolean> {
        if (this._db) return true;
        // Coalesce concurrent init() calls into one.
        if (!this._initPromise) this._initPromise = this._doInit();
        return this._initPromise;
    }

    private async _doInit(): Promise<boolean> {
        try {
            const fb = (globalThis as any).firebase;
            if (!fb || !fb.firestore) {
                console.warn('[Leaderboard] Firebase compat SDK not found on window — is the CDN injected?');
                return false;
            }
            if (!fb.apps || fb.apps.length === 0) {
                fb.initializeApp(FIREBASE_CONFIG);
            }
            this._db = fb.firestore();
            return true;
        } catch (e) {
            console.warn('[Leaderboard] Firestore init failed:', e);
            this._db = null;
            return false;
        }
    }

    async getTop(limit: number): Promise<LeaderboardEntry[]> {
        if (!(await this.init())) return [];
        try {
            const snap: any = await this._withTimeout(
                this._db.collection(COLLECTION).orderBy('score', 'desc').limit(limit).get(),
            );
            const out: LeaderboardEntry[] = [];
            snap.forEach((doc: any) => {
                const d = doc.data();
                out.push({
                    name: String(d.name ?? '???'),
                    score: Number(d.score ?? 0),
                    createdAt: FirestoreLeaderboard._toMillis(d.createdAt),
                });
            });
            return out;
        } catch (e) {
            console.warn('[Leaderboard] getTop failed:', e);
            return [];
        }
    }

    async qualifies(score: number): Promise<boolean> {
        if (!Number.isInteger(score) || score <= 0 || score > SCORE_CAP) return false;
        // Fetch the current top; we have it cheaply and avoid a count query.
        const top = await this.getTop(TOP_N);
        if (top.length === 0) return this._db != null; // empty board → anyone qualifies (if we reached it)
        if (top.length < TOP_N) return true;
        return score > top[TOP_N - 1].score;
    }

    async submit(entry: LeaderboardEntry): Promise<SubmitResult> {
        if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > SCORE_CAP) {
            return { ok: false, rank: null, error: 'score out of range' };
        }
        if (!(await this.init())) return { ok: false, rank: null, error: 'backend unavailable' };
        try {
            const fb = (globalThis as any).firebase;
            await this._withTimeout(
                this._db.collection(COLLECTION).add({
                    name: entry.name,
                    score: entry.score,
                    // Server-stamped so it matches the `createdAt == request.time` rule.
                    createdAt: fb.firestore.FieldValue.serverTimestamp(),
                }),
            );
            // Re-read the board to report the achieved rank (best effort).
            const top = await this.getTop(TOP_N);
            const idx = top.findIndex(e => e.name === entry.name && e.score === entry.score);
            return { ok: true, rank: idx >= 0 ? idx + 1 : null };
        } catch (e) {
            console.warn('[Leaderboard] submit failed:', e);
            return { ok: false, rank: null, error: String(e) };
        }
    }

    /** Reject after REQUEST_TIMEOUT_MS so a hung connection can't freeze the flow. */
    private _withTimeout<T>(p: Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS);
            p.then(
                v => { clearTimeout(t); resolve(v); },
                e => { clearTimeout(t); reject(e); },
            );
        });
    }

    /** Firestore Timestamp | number | undefined → epoch millis. */
    private static _toMillis(v: any): number {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        if (typeof v.toMillis === 'function') return v.toMillis();
        if (typeof v.seconds === 'number') return v.seconds * 1000;
        return 0;
    }
}
