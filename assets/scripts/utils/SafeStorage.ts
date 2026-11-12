import { sys } from 'cc';
import { PORTAL, PLAYGAMA_SAVE_KEY } from '../config/PortalConfig';
import { VERSION } from '../config/Version';

/** Stamp of one saved key: game version that wrote it and when (epoch ms). */
export interface SaveStamp {
    /** Game version (config/Version.ts) of the last write. */
    v: string;
    /** Epoch ms of the last write: performance.timeOrigin + performance.now() — monotonic within
     *  the page session (a clock change while playing doesn't move it), comparable across sessions. */
    t: number;
}

/** Key holding the {key: SaveStamp} map of every stamped save (itself never stamped). */
export const SAVE_META_KEY = 'fw_meta';

/** Minimal surface of the Playgama Bridge storage we use. */
interface BridgeStorageLike {
    storage: { set(keys: string[], values: string[]): Promise<unknown> };
}

/** Debounce for Bridge writes: Playgama asks to write only on meaningful changes, batched. */
const FLUSH_DELAY_MS = 1500;

/**
 * Key/value persistence that never throws.
 *
 * Default backend: localStorage — in private/incognito browsing or with a full quota,
 * getItem/setItem can raise; portals make this a real scenario. Reads fall back, writes
 * are silently dropped.
 *
 * Playgama backend (PORTAL === 'playgama'): Playgama forbids localStorage — progress must go
 * through `bridge.storage`, which is async. The boot shim injected by scripts/pack-playgama.js
 * initialises the Bridge and preloads ONE key (PLAYGAMA_SAVE_KEY, a JSON blob of every fw_*
 * value) into `window.__fwStore` BEFORE the engine starts, so reads here stay synchronous.
 * Writes update the in-memory map and schedule a single debounced `storage.set`.
 * If the shim didn't run/failed (no `__fwStore`), we fall back to localStorage.
 */
export class SafeStorage {
    private static _flushTimer: ReturnType<typeof setTimeout> | null = null;

    static get(key: string, fallback: string | null = null): string | null {
        const store = SafeStorage._bridgeStore();
        if (store) {
            const v = store[key];
            return v === undefined || v === null ? fallback : String(v);
        }
        try { return sys.localStorage.getItem(key) ?? fallback; }
        catch { return fallback; }
    }

    /** Writes `value` and stamps the key with the current game version and time (see stampOf). */
    static set(key: string, value: string): void {
        const store = SafeStorage._bridgeStore();
        if (store) {
            if (store[key] === value) return;  // no-op write → no Bridge traffic
            store[key] = value;
            SafeStorage._stamp(key);
            SafeStorage._scheduleFlush();
            return;
        }
        try { sys.localStorage.setItem(key, value); SafeStorage._stamp(key); }
        catch { /* storage unavailable — ignore */ }
    }

    static remove(key: string): void {
        SafeStorage._unstamp(key);
        const store = SafeStorage._bridgeStore();
        if (store) {
            if (!(key in store)) return;
            delete store[key];
            SafeStorage._scheduleFlush();
            return;
        }
        try { sys.localStorage.removeItem(key); }
        catch { /* storage unavailable — ignore */ }
    }

    /** Version and time of the last write of `key`; null if absent or written before stamping
     *  existed (≤ 0.10.37) — callers treat null as "old". */
    static stampOf(key: string): SaveStamp | null {
        const s = SafeStorage._meta()[key];
        return s && typeof s.v === 'string' && typeof s.t === 'number' ? s : null;
    }

    /** Current time on the same scale as SaveStamp.t (epoch ms, monotonic within the session). */
    static now(): number {
        try { return performance.timeOrigin + performance.now(); }
        catch { return Date.now(); }
    }

    /** Deletes every stamped key for which `isStale(key, stamp)` is true; returns the deleted keys.
     *  E.g. `SafeStorage.purge((k, s) => SafeStorage.now() - s.t > maxAgeMs)`. */
    static purge(isStale: (key: string, stamp: SaveStamp) => boolean): string[] {
        const removed: string[] = [];
        const meta = SafeStorage._meta();
        for (const key of Object.keys(meta)) {
            const stamp = SafeStorage.stampOf(key);
            if (!stamp || isStale(key, stamp)) { SafeStorage.remove(key); removed.push(key); }
        }
        if (removed.length) console.log(`[SafeStorage] purged stale saves: ${removed.join(', ')}`);
        return removed;
    }

    // ── Stamps: one JSON map under SAVE_META_KEY, cached in memory after the first read ──
    private static _metaCache: Record<string, SaveStamp> | null = null;

    private static _meta(): Record<string, SaveStamp> {
        if (SafeStorage._metaCache) return SafeStorage._metaCache;
        let meta: Record<string, SaveStamp> = {};
        try {
            const parsed = JSON.parse(SafeStorage.get(SAVE_META_KEY) ?? '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed;
        } catch { /* corrupt → start over */ }
        SafeStorage._metaCache = meta;
        return meta;
    }

    private static _stamp(key: string): void {
        if (key === SAVE_META_KEY) return;
        const meta = SafeStorage._meta();
        meta[key] = { v: VERSION, t: Math.round(SafeStorage.now()) };
        SafeStorage._writeMeta(meta);
    }

    private static _unstamp(key: string): void {
        if (key === SAVE_META_KEY) return;
        const meta = SafeStorage._meta();
        if (!(key in meta)) return;
        delete meta[key];
        SafeStorage._writeMeta(meta);
    }

    /** Raw write of the stamp map (not through set(): no self-stamp, no recursion). */
    private static _writeMeta(meta: Record<string, SaveStamp>): void {
        const raw = JSON.stringify(meta);
        const store = SafeStorage._bridgeStore();
        if (store) { store[SAVE_META_KEY] = raw; SafeStorage._scheduleFlush(); return; }
        try { sys.localStorage.setItem(SAVE_META_KEY, raw); }
        catch { /* storage unavailable — ignore */ }
    }

    /** Write pending changes now (Playgama: call on platform pause / page hide). No-op otherwise. */
    static flush(): void {
        if (SafeStorage._flushTimer !== null) {
            clearTimeout(SafeStorage._flushTimer);
            SafeStorage._flushTimer = null;
        }
        const store = SafeStorage._bridgeStore();
        const bridge = SafeStorage._bridge();
        if (!store || !bridge) return;
        try {
            void bridge.storage.set([PLAYGAMA_SAVE_KEY], [JSON.stringify(store)])
                .catch((e: unknown) => console.warn('[SafeStorage] Bridge storage.set failed (ignored):', e));
        } catch (e) {
            console.warn('[SafeStorage] Bridge storage.set threw (ignored):', e);
        }
    }

    private static _scheduleFlush(): void {
        SafeStorage._installPageHideFlush();
        if (SafeStorage._flushTimer !== null) return;
        SafeStorage._flushTimer = setTimeout(() => {
            SafeStorage._flushTimer = null;
            SafeStorage.flush();
        }, FLUSH_DELAY_MS);
    }

    private static _pageHideFlushInstalled = false;

    /** The page can close inside the write debounce (no platform pause on every host): write the
     *  pending changes as soon as the page is hidden or unloaded. Installed once, on the first write. */
    private static _installPageHideFlush(): void {
        if (SafeStorage._pageHideFlushInstalled || typeof window === 'undefined') return;
        SafeStorage._pageHideFlushInstalled = true;
        const flushIfPending = (): void => { if (SafeStorage._flushTimer !== null) SafeStorage.flush(); };
        window.addEventListener('pagehide', flushIfPending);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushIfPending(); });
    }

    private static _bridge(): BridgeStorageLike | null {
        if (typeof window === 'undefined') return null;
        return (window as unknown as { bridge?: BridgeStorageLike }).bridge ?? null;
    }

    private static _bridgeStore(): Record<string, string> | null {
        if (PORTAL !== 'playgama' || typeof window === 'undefined') return null;
        const w = window as unknown as { __fwStore?: Record<string, string> };
        return w.__fwStore && SafeStorage._bridge() ? w.__fwStore : null;
    }
}
