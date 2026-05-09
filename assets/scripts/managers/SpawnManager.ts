import { Node } from 'cc';
import { Warrior } from '../entities/Warrior';
import { GAME_OVER_LINE_Y, TRACK_BOTTOM_Y } from '../entities/Track';

export const SPAWN_X = 0;
// 60% down from game-over line into the launch zone
export const SPAWN_Y = GAME_OVER_LINE_Y + (TRACK_BOTTOM_Y - GAME_OVER_LINE_Y) * 0.6;

export class SpawnManager {
    private parent: Node;
    private spawnTypes: number;
    private maxLevel = 1;
    private nextType = 0;
    private nextLevel = 1;

    onMergeReady: ((a: Warrior, b: Warrior) => void) | null = null;
    onNextGenerated: (() => void) | null = null;

    constructor(parent: Node, spawnTypes: number) {
        this.parent = parent;
        this.spawnTypes = spawnTypes;
        this.generateNext();
    }

    get next(): { type: number; level: number } {
        return { type: this.nextType, level: this.nextLevel };
    }

    spawnNext(): Warrior {
        const w = Warrior.spawn(this.parent, this.nextType, this.nextLevel, SPAWN_X, SPAWN_Y);
        w.onMergeReady = this.onMergeReady;
        this.generateNext();
        return w;
    }

    prefill(): Warrior[] {
        const py = GAME_OVER_LINE_Y + 300;
        const positions = [{ x: -90, y: py }, { x: 0, y: py + 30 }, { x: 90, y: py }];
        return positions.map(({ x, y }, i) => {
            const w = Warrior.spawn(this.parent, i % this.spawnTypes, 1, x, y);
            w.crossedLine = true;
            w.onMergeReady = this.onMergeReady;
            w.settle();
            return w;
        });
    }

    setSpawnTypes(n: number): void {
        this.spawnTypes = n;
    }

    setMaxLevel(n: number): void {
        this.maxLevel = n;
    }

    private generateNext(): void {
        this.nextType  = Math.floor(Math.random() * this.spawnTypes);
        this.nextLevel = Math.floor(Math.random() * this.maxLevel) + 1;
        this.onNextGenerated?.();
    }
}
