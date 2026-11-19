import { PowerupId } from './PowerupInfo';

/** Powers earned by collecting tokens on the track. The Aura stays reserved to the BOOST rewarded ad. */
export type TokenKind = Exclude<PowerupId, 'aura'>;

export interface TokenConfig {
    kind: TokenKind;
    /** First round its tokens can appear (same unlock order as the old rescue forms). */
    fromRound: number;
    /** Tokens to collect to charge the power onto the launcher (stronger power → more tokens). */
    needed: number;
    /** Glow tint of the token and its counter. */
    color: [number, number, number];
}

/** Order = HUD counter order and GameManager.tokenFaces order. */
export const TOKENS: readonly TokenConfig[] = [
    { kind: 'brotherhood', fromRound: 2, needed: 3, color: [180,  60, 240] },
    { kind: 'wildRiver',   fromRound: 5, needed: 4, color: [220,  60,  60] },
    { kind: 'psychoForce', fromRound: 7, needed: 4, color: [ 60, 230, 255] },
    { kind: 'thunderRain', fromRound: 4, needed: 4, color: [255, 210,  50] },
];

export const TOKEN_FIRST_DELAY_SEC = 4;     // after the first round with tokens starts
/** On the track, including the final blink: time for two aimed tries (notice + aim + travel ≈ 3.5 s each). */
export const TOKEN_LIFETIME_SEC       = 8;
/** The game's first token: nothing explains it, so the player gets longer to notice and try. */
export const TOKEN_FIRST_LIFETIME_SEC = 12;

/** Active-play seconds from one token's appearance to the next (one at a time: if the previous one is still
 *  on the track, the next waits for it), by warriors on the track: few tokens while the track is empty,
 *  almost always one once it is crowded (25+ = where the old automatic rescue used to fire).
 *  Tuned on the v0.10.40 telemetry, 2026-11-18. First match wins. */
export const TOKEN_INTERVALS: readonly { minOnTrack: number; sec: number }[] = [
    { minOnTrack: 25, sec: 8 },
    { minOnTrack: 15, sec: 12 },
    { minOnTrack: 0,  sec: 20 },
];

/** Tokens dropped by the first appearance of a new species: a full charge of the power unlocked in the
 *  same round (Cat → Brotherhood, Wolf → Thunder Rain, Eagle → WildRiver, Lion → PsychoForce), otherwise a single random one. */
export const NEW_SPECIES_TOKENS_UNLOCK = 3;
export const NEW_SPECIES_TOKENS_OTHER  = 1;
export const TOKEN_BLINK_SEC       = 1.5;   // blinking before it vanishes
export const TOKEN_POINTS_PER_ROUND = 25;   // points for a pickup = this × round

export function tokenConfig(kind: TokenKind): TokenConfig {
    return TOKENS.find(t => t.kind === kind)!;
}

export function tokenIntervalFor(onTrack: number): number {
    return (TOKEN_INTERVALS.find(i => onTrack >= i.minOnTrack) ?? TOKEN_INTERVALS[TOKEN_INTERVALS.length - 1]).sec;
}

/** The power whose tokens start in `round`, if any. */
export function tokenUnlockedIn(round: number): TokenConfig | null {
    return TOKENS.find(t => t.fromRound === round) ?? null;
}

export function tokensUnlockedAt(round: number): TokenConfig[] {
    return TOKENS.filter(t => t.fromRound <= round);
}
