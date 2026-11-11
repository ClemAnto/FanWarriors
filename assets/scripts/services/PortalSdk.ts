/**
 * Portal SDK abstraction (Poki / CrazyGames / none) — same layering as the
 * leaderboard service: pure TS, no scene/engine UI dependency, every method
 * is no-throw so a missing/broken SDK degrades silently.
 *
 * Lifecycle contract (Poki guidelines):
 *  - init() once at boot (idempotent, coalesced), then gameLoadingFinished()
 *    when the game is ready to play.
 *  - gameplayStart() whenever active play (re)starts — new game, resume from pause.
 *  - gameplayStop() whenever active play halts — pause, game over, victory.
 *  - commercialBreak(onAdStart?) ONLY between sessions (never during gameplay,
 *    and NEVER before the first gameplay); resolves when the game may proceed.
 *    `onAdStart` fires ONLY when an ad actually starts playing — mute audio there,
 *    not before the request (per CrazyGames: no visual change = no mute). Callers
 *    unmute unconditionally once the promise resolves.
 *
 * Implementations may dedupe start/stop internally — call sites don't need to
 * track whether gameplay is already flagged active.
 */
export interface PortalSdk {
    init(): Promise<void>;
    gameLoadingFinished(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    commercialBreak(onAdStart?: () => void): Promise<void>;
    /**
     * Optional: platform-driven audio/pause state (Playgama Bridge). The handler is invoked
     * once with the initial state after init, then on every change. Portals without such
     * signals don't implement it.
     */
    onPlatformState?(handler: PlatformStateHandler): void;
    /**
     * Optional: game-specific analytics event (Playgama `bridge.analytics.send`). Stable
     * snake_case name; variable values go in the flat `data` object, never in the name.
     * Portals without an analytics channel don't implement it.
     */
    trackEvent?(name: string, data?: AnalyticsData): void;
    /** Optional: whether an opt-in rewarded ad can be offered right now (show the BOOST UI only if true). */
    isRewardedSupported?(): boolean;
    /**
     * Optional: show an opt-in rewarded ad (from a direct player action only). Resolves `true`
     * ONLY when the platform confirms the reward (Playgama state `rewarded`) — closing early,
     * failing or timing out resolve `false`. `onAdStart` fires when the ad actually opens
     * (mute there); callers unmute unconditionally once the promise resolves. Never rejects.
     */
    showRewarded?(onAdStart?: () => void): Promise<boolean>;
}

/** Flat analytics payload: string / number / boolean values only (Bridge contract). */
export type AnalyticsData = Record<string, string | number | boolean>;

export interface PlatformStateHandler {
    /** Platform allows audio (false = platform-level mute, independent of the user's mute). */
    audio(enabled: boolean): void;
    /** Platform paused the game (ad showing, tab hidden…) — silence everything while true. */
    pause(paused: boolean): void;
}
