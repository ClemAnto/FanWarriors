import { SafeStorage } from '../utils/SafeStorage';

/** Same ids as GameManager's PowerupKind. */
export type PowerupId = 'aura' | 'wildRiver' | 'brotherhood' | 'psychoForce';

export interface PowerupInfo {
    id: PowerupId;
    /** Shown in the modal's ribbon. */
    name: string;
    /** Two fairy-tale lines: what kind of power it is. */
    lore: string;
    /** When it appears and after how long it can come back. */
    how: string;
    /** Illustration, loaded on demand: resources/<art>/spriteFrame (graphics/sheets/powerup-art). */
    art: string;
    /** False while the game never grants it on its own (debug only): kept out of the menu catalog. */
    inGame: boolean;
}

export const POWERUP_INFO: Record<PowerupId, PowerupInfo> = {
    aura: {
        id: 'aura', name: 'AURA', art: 'powerups/aura', inGame: true,
        lore: "A golden blessing from the tournament's guardian spirits. Whoever wears it pushes rivals aside and sends their strength to their kin.",
        how: 'The first Wolf, Eagle, Lion and Dragon of each game bring it along. Watch the BOOST at a new round for a Golden Aura: full power on any warrior.',
    },
    wildRiver: {
        id: 'wildRiver', name: 'WILD RIVER', art: 'powerups/wildriver', inGame: true,
        lore: 'An ancient crimson spell flows through a single tribe, binding them in one wild current.',
        how: 'From round 5, when 25+ warriors crowd the track and 8+ of them are of your kind. A rescue power can return after 10 launches and 10 merges.',
    },
    brotherhood: {
        id: 'brotherhood', name: 'BROTHERHOOD', art: 'powerups/brotherhood', inGame: true,
        lore: 'When the arena is overcrowded, the oath of brotherhood calls every sibling home at once.',
        how: 'When 25+ warriors crowd the track. A rescue power can return after 10 launches and 10 merges. REVIVE grants it too.',
    },
    psychoForce: {
        id: 'psychoForce', name: 'PSYCHO FORCE', art: 'powerups/psychoforce', inGame: true,
        lore: 'A mind spell that makes strangers feel like kin: any two of the same level can join together.',
        how: 'From round 8, when 25+ warriors crowd the track and no kind has 6 or more of them. A rescue power can return after 10 launches and 10 merges.',
    },
};

/** Order of the main-menu catalog = order of discovery in a game (only powerups the game can actually grant). */
export const POWERUP_CATALOG: PowerupId[] =
    (['aura', 'brotherhood', 'wildRiver', 'psychoForce'] as PowerupId[]).filter(id => POWERUP_INFO[id].inGame);

/** Per-player tutorial state: discovered (met at least once) and "don't show again". */
export class PowerupTutorialStore {
    static isSeen(id: PowerupId): boolean { return SafeStorage.get(`fw_pu_seen_${id}`) === '1'; }
    static markSeen(id: PowerupId): void { SafeStorage.set(`fw_pu_seen_${id}`, '1'); }
    static isMuted(id: PowerupId): boolean { return SafeStorage.get(`fw_pu_mute_${id}`) === '1'; }
    static setMuted(id: PowerupId, muted: boolean): void {
        if (muted) SafeStorage.set(`fw_pu_mute_${id}`, '1');
        else SafeStorage.remove(`fw_pu_mute_${id}`);
    }
}
