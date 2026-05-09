import { Color } from 'cc';

export interface LevelData {
    name: string;
    radius: number;
    explosion?: boolean;
    bonus?: number;
    label?: string;
    vfxColor?: Color;
}

export interface WarriorData {
    id: number;
    type: string;
    nome: string;
    maxLevel: number;
    color: Color;
    introRound: number;
}

// index = level (0 unused, 1–7 valid)
export const LEVEL_CONFIG: readonly (LevelData | null)[] = [
    null,
    { name: 'Cucciolo',    radius: 16 },
    { name: 'Apprendista', radius: 22 },
    { name: 'Soldato',     radius: 29 },
    { name: 'Guerriero',   radius: 34 },
    { name: 'Campione',    radius: 38, explosion: true, bonus:  500, label: 'CAMPIONE!', vfxColor: new Color(255, 200,  50, 255) },
    { name: 'Eroe',        radius: 43, explosion: true, bonus: 1000, label: 'EROE!',     vfxColor: new Color(180, 100, 255, 255) },
    { name: 'Leggenda',    radius: 48, explosion: true, bonus: 2000, label: 'LEGGENDA!', vfxColor: new Color(255,  80,  60, 255) },
];

// index = type (0–6)
export const WARRIORS: readonly WarriorData[] = [
    { id: 0, type: 'frog',    nome: 'RANA',    maxLevel: 4, color: new Color(231,  76,  60), introRound: 1 },
    { id: 1, type: 'cat',     nome: 'GATTO',   maxLevel: 4, color: new Color(230, 126,  34), introRound: 1 },
    { id: 2, type: 'chicken', nome: 'GALLINA', maxLevel: 4, color: new Color(241, 196,  15), introRound: 1 },
    { id: 3, type: 'wolf',    nome: 'LUPO',    maxLevel: 5, color: new Color( 46, 204, 113), introRound: 3 },
    { id: 4, type: 'eagle',   nome: 'AQUILA',  maxLevel: 5, color: new Color( 52, 152, 219), introRound: 5 },
    { id: 5, type: 'lion',    nome: 'LEONE',   maxLevel: 6, color: new Color(155,  89, 182), introRound: 7 },
    { id: 6, type: 'dragon',  nome: 'DRAGO',   maxLevel: 7, color: new Color( 26, 188, 156), introRound: 9 },
];

export function spawnTypesForRound(round: number): number {
    return WARRIORS.filter(w => w.introRound <= round).length;
}
