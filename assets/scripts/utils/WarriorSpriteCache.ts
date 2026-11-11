import { Texture2D, SpriteFrame, Rect, resources } from 'cc';
import { WARRIOR_UUID_MAP } from './WarriorUUIDs';

/**
 * Loads warrior atlas sprites from assets/resources/warriors/ at startup (round-1 species first).
 *
 * CC 3.8 stores assets by UUID internally — filename is not available at runtime.
 * WarriorUUIDs.ts maps each asset UUID to its atlas name (e.g. 'frog_2x2').
 * Regenerate it with "npm run gen:placeholders" after importing new sprites.
 *
 * Atlas name format: {speciesType}_{cols}x{rows}  (e.g. frog_2x2, wolf_2x3)
 * Grid layout: left-to-right, top-to-bottom → lv1, lv2, …
 */
export class WarriorSpriteCache {
    private static readonly _frames = new Map<string, SpriteFrame>();
    private static readonly _registered = new Set<string>();

    /**
     * Load the warrior atlases. With `firstTypes` (e.g. the round-1 species) only those atlases are
     * awaited before `onDone` — the game can start after ~3 sheets instead of all 7 (~1.5 MB) — and
     * the rest stream in right after, in the background (new species only appear from round 3).
     * Without `firstTypes` (e.g. restoring a saved mid-game board) everything is awaited.
     */
    static preload(onDone: () => void, firstTypes?: readonly string[]): void {
        const loadAll = (done?: () => void): void => {
            resources.loadDir('warriors', Texture2D, (err: Error | null, textures: Texture2D[]) => {
                if (err) console.warn('[WarriorSpriteCache] loadDir failed:', err);
                if (!err && textures?.length) for (const tex of textures) WarriorSpriteCache._register(tex);
                done?.();
            });
        };
        const atlasNames = Object.values(WARRIOR_UUID_MAP);
        const firstPaths = (firstTypes ?? [])
            .map(type => atlasNames.find(name => name.startsWith(`${type}_`)))
            .filter((name): name is string => !!name)
            .map(name => `warriors/${name}/texture`);
        if (firstPaths.length === 0) { loadAll(onDone); return; }

        resources.load(firstPaths, Texture2D, (err: Error | null, textures: Texture2D[]) => {
            if (err || !textures?.length) {
                // Path lookup failed (renamed sheet?) — fall back to awaiting the whole folder.
                console.warn('[WarriorSpriteCache] priority load failed, loading all:', err);
                loadAll(onDone);
                return;
            }
            for (const tex of textures) WarriorSpriteCache._register(tex);
            onDone();
            loadAll();  // remaining species in the background (already-loaded sheets come from cache)
        });
    }

    static get(speciesType: string, level: number): SpriteFrame | null {
        return WarriorSpriteCache._frames.get(`${speciesType}_lv${level}`) ?? null;
    }

    /** Slice one atlas texture into per-level frames (idempotent per texture). */
    private static _register(tex: Texture2D): void {
        const baseUuid  = ((tex as any)._uuid ?? '').split('@')[0];
        if (WarriorSpriteCache._registered.has(baseUuid)) return;
        const atlasName = WARRIOR_UUID_MAP[baseUuid] ?? '';
        const m = atlasName.match(/^(.+)_(\d+)x(\d+)$/);
        if (!m) return;
        WarriorSpriteCache._registered.add(baseUuid);

        const [, speciesType, colsStr, rowsStr] = m;
        const cols  = parseInt(colsStr, 10);
        const rows  = parseInt(rowsStr, 10);
        const cellW = tex.width  / cols;
        const cellH = tex.height / rows;
        let level = 1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const sf = new SpriteFrame();
                sf.texture = tex;
                sf.rect = new Rect(c * cellW, r * cellH, cellW, cellH);
                sf.onLoaded();
                WarriorSpriteCache._frames.set(`${speciesType}_lv${level}`, sf);
                level++;
            }
        }
    }
}
