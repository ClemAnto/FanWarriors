import { game, Game } from 'cc';
import { PortalSdk } from './PortalSdk';

/**
 * Platform pause (Playgama Bridge `PAUSE_STATE_CHANGED`, e.g. YouTube Playables): while the
 * platform says "paused" the WHOLE engine main loop stops — rendering, scheduler, tweens,
 * physics, input — via `game.pause()`; `game.resume()` restarts it exactly where it was.
 * The engine clamps the first dt after a long gap (Game.DEBUG_DT_THRESHOLD), so nothing
 * "jumps" on resume. Audio is silenced separately by AudioManager (Web Audio isn't tied to
 * the main loop). Installed once per portal instance; no-op on portals without the signal.
 */
export class PlatformPause {
    private static _installed = false;
    private static _pausedByPlatform = false;

    static install(portal: PortalSdk): void {
        if (PlatformPause._installed || !portal.onPlatformState) return;
        PlatformPause._installed = true;
        portal.onPlatformState({
            audio: () => { /* handled by AudioManager */ },
            pause: (paused) => PlatformPause._apply(paused),
        });
        // The engine pauses itself on tab hide and resumes on show (pauseByEngine/resumeByEngine).
        // If the platform pause arrived while the tab was hidden, that show would restart the loop
        // under a still-active platform pause: stop it again.
        game.on(Game.EVENT_RESUME, () => {
            if (PlatformPause._pausedByPlatform) game.pause();
        });
    }

    private static _apply(paused: boolean): void {
        if (paused === PlatformPause._pausedByPlatform) return;
        PlatformPause._pausedByPlatform = paused;
        try {
            if (paused) game.pause();
            else game.resume();
        } catch (e) {
            console.warn('[PlatformPause] engine pause/resume failed (ignored):', e);
        }
        console.log(`[PlatformPause] platform ${paused ? 'paused' : 'resumed'} the game`);
    }
}
