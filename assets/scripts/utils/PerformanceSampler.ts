import { AnalyticsData } from '../services/PortalSdk';

/** Emit one aggregated sample after this much ACTIVE (visible, unpaused) gameplay. */
const SAMPLE_ACTIVE_MS = 30_000;
/** A single delta above this is a suspend/resume gap (tab hidden, debugger…), not a frame. */
const MAX_FRAME_GAP_MS = 5_000;
const TARGET_FPS = 60;

function percentile(sortedAscending: number[], fraction: number): number {
    if (sortedAscending.length === 0) return 0;
    const index = Math.min(sortedAscending.length - 1, Math.max(0, Math.floor(fraction * (sortedAscending.length - 1))));
    return sortedAscending[index];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Playgama telemetry `performance_sample` (contract from the Playgama telemetry guide).
 * Measures real frame times with performance.now() — NOT the engine dt, which is scaled by
 * slow-motion — only during active, visible gameplay. Call {@link tick} every frame with
 * `active=false` while paused / game-over / round-up freeze: the frame chain is broken there,
 * so a pause never becomes a frozen frame. Pure TS, no engine dependency.
 */
export class PerformanceSampler {
    private _frameTimes: number[] = [];
    private _lastFrameAt = -1;
    private _windowStartedAt = -1;
    private _activeMs = 0;

    constructor(
        private readonly _emit: (data: AnalyticsData) => void,
        private readonly _buildVersion: string,
    ) {}

    tick(active: boolean): void {
        const now = performance.now();
        const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
        if (!active || !visible) { this._lastFrameAt = -1; return; }
        if (this._windowStartedAt < 0) this._windowStartedAt = now;
        if (this._lastFrameAt >= 0) {
            const frameMs = now - this._lastFrameAt;
            if (frameMs > 0 && frameMs < MAX_FRAME_GAP_MS) {
                this._frameTimes.push(frameMs);
                this._activeMs += frameMs;
            }
        }
        this._lastFrameAt = now;
        if (this._activeMs >= SAMPLE_ACTIVE_MS) this._flush(now);
    }

    private _flush(now: number): void {
        const frames = this._frameTimes;
        if (frames.length > 0) {
            const sorted = frames.slice().sort((a, b) => a - b);
            const countOver = (thresholdMs: number): number => frames.filter(f => f > thresholdMs).length;
            this._emit({
                target_fps: TARGET_FPS,
                window_ms: Math.round(now - this._windowStartedAt),
                active_ms: Math.round(this._activeMs),
                frame_count: frames.length,
                fps_avg: round1(frames.length * 1000 / this._activeMs),
                // 10th percentile of per-frame FPS = FPS of the 90th-percentile frame time.
                fps_p10: round1(1000 / percentile(sorted, 0.9)),
                frame_time_p50_ms: round1(percentile(sorted, 0.5)),
                frame_time_p95_ms: round1(percentile(sorted, 0.95)),
                frame_time_p99_ms: round1(percentile(sorted, 0.99)),
                frame_time_max_ms: round1(sorted[sorted.length - 1]),
                frames_over_50ms: countOver(50),
                frames_over_100ms: countOver(100),
                frames_over_250ms: countOver(250),
                frames_over_500ms: countOver(500),
                frames_over_1000ms: countOver(1000),
                build_version: this._buildVersion,
            });
        }
        this._frameTimes = [];
        this._activeMs = 0;
        this._windowStartedAt = now;
    }
}
