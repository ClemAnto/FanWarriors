import { PortalSdk, PlatformStateHandler, AnalyticsData } from './PortalSdk';
import { BREAK_TIMEOUT_MS } from '../config/PortalConfig';
import { SafeStorage } from '../utils/SafeStorage';

/** Minimal surface of the Playgama Bridge we use (window.bridge). */
interface PlaygamaBridgeLike {
    initialize(): Promise<void>;
    EVENT_NAME: {
        AUDIO_STATE_CHANGED: string;
        PAUSE_STATE_CHANGED: string;
        INTERSTITIAL_STATE_CHANGED: string;
        REWARDED_STATE_CHANGED: string;
    };
    platform: {
        id: string;
        isAudioEnabled: boolean;
        sendMessage(message: string): void;
        on(event: string, cb: (value: boolean) => void): void;
    };
    advertisement: {
        isInterstitialSupported: boolean;
        interstitialState: string;
        showInterstitial(placement?: string): void;
        isRewardedSupported: boolean;
        showRewarded(placement?: string): void;
        on(event: string, cb: (state: string) => void): void;
        off?(event: string, cb: (state: string) => void): void;
    };
    /** Bridge analytics module (custom game events). Optional: older Bridge builds lack it. */
    analytics?: {
        send(eventName: string, data?: AnalyticsData): void;
    };
}

interface PlaygamaWindow {
    bridge?: PlaygamaBridgeLike;
    /** Promise created by the boot shim (pack-playgama.js): Bridge initialised + storage preloaded. */
    __fwBridgeBoot?: Promise<void>;
    /** Set to true by the boot shim once bridge.initialize() resolved. */
    __fwBridgeReady?: boolean;
}

/** If no interstitial state arrives within this window after showInterstitial(), assume the Bridge
 *  skipped it (e.g. its own minimum delay between interstitials) and let the game continue. */
const NO_AD_GRACE_MS = 1500;
/** Upper bound for a rewarded ad (videos are typically 15–30 s, plus load time). */
const REWARDED_TIMEOUT_MS = 90_000;
/** Game-level rewarded placement id (playgama-bridge-config.json → advertisement.rewarded). */
const REWARDED_PLACEMENT = 'boost';

/**
 * Playgama Bridge adapter.
 *
 * Unlike the other adapters it does NOT load the SDK: Playgama requires the Bridge script to be
 * the first <head> tag (not injected from code) and the game must not start loading before the
 * Bridge. scripts/pack-playgama.js injects the script plus a boot shim that calls
 * bridge.initialize() and preloads the Bridge storage BEFORE System.import('./index.js').
 * Here we just await that shim and map our lifecycle onto the Bridge API. No-throw everywhere.
 *
 *  - init()                → await window.__fwBridgeBoot (already resolved by the time we run)
 *  - gameLoadingFinished() → hides the HTML loading screen synchronously, then
 *                            platform.sendMessage('game_ready') (moderation rejects it under the screen)
 *  - gameplayStart/Stop()  → deduped bookkeeping only (Bridge has no gameplay signal we need)
 *  - commercialBreak(cb)   → advertisement.showInterstitial(); `cb` on 'opened', resolve on
 *                            'closed'/'failed', grace period if the Bridge skips it, safety timeout.
 *                            NO own timers/counters — the Bridge enforces the interstitial cadence.
 *  - onPlatformState(h)    → isAudioEnabled + AUDIO_STATE_CHANGED / PAUSE_STATE_CHANGED
 */
export class PlaygamaPortal implements PortalSdk {
    private _initPromise: Promise<void> | null = null;
    private _bridge: PlaygamaBridgeLike | null = null;
    private _loadingFinishedSent = false;
    private _gameplayActive = false;
    private _stateHandlers: PlatformStateHandler[] = [];
    private _breakListener: ((state: string) => void) | null = null;

    init(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            const w = window as unknown as PlaygamaWindow;
            try {
                if (w.__fwBridgeBoot) await w.__fwBridgeBoot;
                const bridge = w.bridge;
                if (!bridge) { console.warn('[Portal] Playgama Bridge missing (continuing without)'); return; }
                if (!w.__fwBridgeReady) await bridge.initialize();  // shim missing (e.g. editor preview)
                this._bridge = bridge;
                this._subscribePlatformEvents(bridge);
                console.log(`[Portal] Playgama Bridge ready (platform: ${bridge.platform.id})`);
            } catch (e) {
                console.warn('[Portal] Playgama Bridge init failed (continuing without):', e);
            }
        })();
        return this._initPromise;
    }

    gameLoadingFinished(): void {
        if (this._loadingFinishedSent) return;
        this._loadingFinishedSent = true;
        // Called from the entry scene's start() → the menu is already launched and interactive.
        // Remove the HTML loading screen NOW instead of waiting for its rAF-driven 100% + fade:
        // that animation adds ~1 s to every load and stalls entirely when the browser throttles
        // rAF (background tab / occluded or off-screen iframe), which left the screen stuck at 95%
        // and game_ready sent under it after the 6 s fallback. Moderation requires game_ready to be
        // sent only once the loading screen is gone → hide synchronously, then send.
        this._hideLoadingScreen();
        try { this._bridge?.platform.sendMessage('game_ready'); } catch { /* ignore */ }
        console.log(`[Portal] Playgama game_ready sent (t=${Math.round(performance.now())} ms)`);
    }

    gameplayStart(): void { this._gameplayActive = true; }

    trackEvent(name: string, data?: AnalyticsData): void {
        void this.init().then(() => {
            try { this._bridge?.analytics?.send(name, data); }
            catch (e) { console.warn(`[Portal] Playgama analytics.send('${name}') failed (ignored):`, e); }
        });
    }

    gameplayStop(): void { this._gameplayActive = false; }

    commercialBreak(onAdStart?: () => void): Promise<void> {
        const bridge = this._bridge;
        if (!bridge) return Promise.resolve();
        try { if (!bridge.advertisement.isInterstitialSupported) return Promise.resolve(); }
        catch { return Promise.resolve(); }
        this.gameplayStop();

        return new Promise<void>(resolve => {
            let done = false;
            let gotState = false;
            const ev = bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED;
            const finish = (): void => {
                if (done) return;
                done = true;
                clearTimeout(graceTimer);
                clearTimeout(safetyTimer);
                this._detachBreakListener(bridge, ev);
                resolve();
            };
            const listener = (state: string): void => {
                gotState = true;
                if (state === 'opened') { try { onAdStart?.(); } catch { /* ignore */ } }
                else if (state === 'closed' || state === 'failed') finish();
            };
            const graceTimer  = setTimeout(() => { if (!gotState) finish(); }, NO_AD_GRACE_MS);
            const safetyTimer = setTimeout(finish, BREAK_TIMEOUT_MS);
            try {
                this._detachBreakListener(bridge, ev);
                this._breakListener = listener;
                bridge.advertisement.on(ev, listener);
                bridge.advertisement.showInterstitial();
            } catch (e) {
                console.warn('[Portal] Playgama showInterstitial threw (ignored):', e);
                finish();
            }
        });
    }

    isRewardedSupported(): boolean {
        try { return !!this._bridge?.advertisement.isRewardedSupported; } catch { return false; }
    }

    showRewarded(onAdStart?: () => void): Promise<boolean> {
        const bridge = this._bridge;
        if (!bridge || !this.isRewardedSupported()) return Promise.resolve(false);
        this.gameplayStop();

        return new Promise<boolean>(resolve => {
            let done = false;
            let rewarded = false;
            const ev = bridge.EVENT_NAME.REWARDED_STATE_CHANGED;
            const listener = (state: string): void => {
                if (state === 'opened') { try { onAdStart?.(); } catch { /* ignore */ } }
                // Reward ONLY on 'rewarded' (Bridge docs): 'closed' alone = skipped / closed early.
                else if (state === 'rewarded') rewarded = true;
                else if (state === 'closed' || state === 'failed') finish();
            };
            const finish = (): void => {
                if (done) return;
                done = true;
                clearTimeout(safetyTimer);
                try { bridge.advertisement.off?.(ev, listener); } catch { /* ignore */ }
                resolve(rewarded);
            };
            // Rewarded videos run longer than interstitials: generous cap, never block forever.
            const safetyTimer = setTimeout(finish, REWARDED_TIMEOUT_MS);
            try {
                bridge.advertisement.on(ev, listener);
                bridge.advertisement.showRewarded(REWARDED_PLACEMENT);
            } catch (e) {
                console.warn('[Portal] Playgama showRewarded threw (ignored):', e);
                finish();
            }
        });
    }

    onPlatformState(handler: PlatformStateHandler): void {
        this._stateHandlers.push(handler);
        void this.init().then(() => {
            if (!this._bridge) return;
            try { handler.audio(this._bridge.platform.isAudioEnabled !== false); } catch { /* ignore */ }
        });
    }

    private _subscribePlatformEvents(bridge: PlaygamaBridgeLike): void {
        try {
            bridge.platform.on(bridge.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled: boolean) => {
                for (const h of this._stateHandlers) { try { h.audio(enabled); } catch { /* ignore */ } }
            });
            bridge.platform.on(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, (paused: boolean) => {
                if (paused) SafeStorage.flush();  // page may be about to close — persist now
                for (const h of this._stateHandlers) { try { h.pause(paused); } catch { /* ignore */ } }
            });
        } catch (e) {
            console.warn('[Portal] Playgama event subscription failed (ignored):', e);
        }
    }

    private _detachBreakListener(bridge: PlaygamaBridgeLike, ev: string): void {
        if (!this._breakListener) return;
        try { bridge.advertisement.off?.(ev, this._breakListener); } catch { /* ignore */ }
        this._breakListener = null;
    }

    private _hideLoadingScreen(): void {
        if (typeof document === 'undefined') return;
        const el = document.getElementById('loading-screen');
        if (el) el.style.display = 'none';
    }
}
