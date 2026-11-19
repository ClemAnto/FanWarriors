/**
 * Arenas (2026-11-19): every ARENA_ROUNDS rounds the game moves to a new arena — new background
 * (cross-fade) and new skin of the track (wipe from the back wall to the front), announced by the
 * "NEW ARENA..." banner during the round-up pause. After the last arena the cycle starts again.
 *
 * Each arena has its own difficulty (managers/ArenaHazards.ts): none, ice patches, mud lane, skulls, lava.
 * The first arena uses the scene's own frames (no load); the others are lazy-loaded from
 * resources/ (kept off the first load: they are fetched while the player is still in arena 1).
 */
export interface ArenaConf {
    /** Stable id (telemetry, resources folder). */
    id: string;
    /** Name on the "NEW ARENA..." banner (English, upper case). */
    name: string;
    /** resources/ path of the background SpriteFrame; null = the scene's own frame. */
    bg: string | null;
    /** resources/ path of the track SpriteFrame; null = the scene's own frame. */
    track: string | null;
}

/** Rounds spent in each arena: round 1–5 arena 0, 6–10 arena 1… */
export const ARENA_ROUNDS = 5;

export const ARENAS: readonly ArenaConf[] = [
    { id: 'castle',  name: 'CASTLE SQUARE',   bg: null,                                track: null },
    { id: 'ice',     name: 'FROZEN LAKE',     bg: 'arenas/ice/background/spriteFrame',     track: 'arenas/ice/track/spriteFrame' },
    { id: 'swamp',   name: 'MISTY SWAMP',     bg: 'arenas/swamp/background/spriteFrame',   track: 'arenas/swamp/track/spriteFrame' },
    { id: 'dungeon', name: 'CASTLE DUNGEONS', bg: 'arenas/dungeon/background/spriteFrame', track: 'arenas/dungeon/track/spriteFrame' },
    { id: 'volcano', name: 'VOLCANO FORGE',   bg: 'arenas/volcano/background/spriteFrame', track: 'arenas/volcano/track/spriteFrame' },
];

/** Index in ARENAS of the arena where `round` is played. */
export function arenaIndexForRound(round: number): number {
    return Math.floor((Math.max(1, Math.floor(round)) - 1) / ARENA_ROUNDS) % ARENAS.length;
}

/** True when reaching `round` moves the game to a new arena (round 6, 11, 16…). */
export function isArenaChangeRound(round: number): boolean {
    return round > 1 && (round - 1) % ARENA_ROUNDS === 0;
}

/** Minimum multiplier of every score (2026-11-19): it grows with the arena difficulty, +0.5 per arena
 *  reached — ×1 in the first arena, ×1.5 from round 6, ×2 from round 11… (it keeps growing after the cycle). */
export function scoreMultiplierForRound(round: number): number {
    return 1 + 0.5 * Math.floor((Math.max(1, Math.floor(round)) - 1) / ARENA_ROUNDS);
}

/** "×1.5", "×2" */
export function formatMultiplier(k: number): string {
    return `×${Number.isInteger(k) ? k : k.toFixed(1)}`;
}
