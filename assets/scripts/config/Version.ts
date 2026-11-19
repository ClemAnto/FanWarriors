/**
 * Game version — single source of truth, aligned with `version` in package.json
 * (bump the patch in both on every `npm run serve`). Re-exported by GameManager.
 * Lives in its own module so low-level utils (SafeStorage) can stamp saves with it
 * without importing GameManager (circular import).
 */
export const VERSION = '0.10.47';

/** Compare two dotted numeric versions ("0.10.37"): <0 if a<b, 0 if equal, >0 if a>b.
 *  Missing or non-numeric parts count as 0, so a malformed version sorts as oldest. */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.'), pb = b.split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0);
        if (d !== 0) return d;
    }
    return 0;
}
