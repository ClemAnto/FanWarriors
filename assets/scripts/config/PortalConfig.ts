/**
 * Portal SDK configuration — the only file to edit per distribution target.
 *
 * PORTAL:
 *   'none' → NullPortal (GitHub Pages / standalone builds — no SDK, zero overhead)
 *   'poki' → PokiPortal (Poki submission build: SDK loaded at runtime from their CDN)
 */
export type PortalKind = 'none' | 'poki';

export const PORTAL: PortalKind = 'none';

/** Poki SDK v2 script — loaded lazily at runtime when PORTAL = 'poki'. */
export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/** Safety cap for commercialBreak: never block the flow longer than this (ms). */
export const BREAK_TIMEOUT_MS = 35000;
