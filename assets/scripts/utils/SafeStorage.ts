import { sys } from 'cc';
import { PORTAL, PLAYGAMA_SAVE_KEY } from '../config/PortalConfig';

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

    static set(key: string, value: string): void {
        const store = SafeStorage._bridgeStore();
        if (store) {
            if (store[key] === value) return;  // no-op write → no Bridge traffic
            store[key] = value;
            SafeStorage._scheduleFlush();
            return;
        }
        try { sys.localStorage.setItem(key, value); }
        catch { /* storage unavailable — ignore */ }
    }

    static remove(key: string): void {
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
        if (SafeStorage._flushTimer !== null) return;
        SafeStorage._flushTimer = setTimeout(() => {
            SafeStorage._flushTimer = null;
            SafeStorage.flush();
        }, FLUSH_DELAY_MS);
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
