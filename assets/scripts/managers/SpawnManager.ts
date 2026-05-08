import { Node } from 'cc';
import { Warrior } from '../entities/Warrior';

export const SPAWN_X = 0;
export const SPAWN_Y = -220;

export class SpawnManager {
    private parent: Node;
    private spawnTypes: number;
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
        const positions = [{ x: -180, y: 240 }, { x: 0, y: 270 }, { x: 180, y: 240 }];
        return positions.map(({ x, y }, i) => {
            const w = Warrior.spawn(this.parent, i % this.spawnTypes, 1, x, y);
            w.crossedLine = true;
            w.onMergeReady = this.onMergeReady;
            return w;
        });
    }

    private generateNext(): void {
        this.nextType  = Math.floor(Math.random() * this.spawnTypes);
        this.nextLevel = 1;
        this.onNextGenerated?.();
    }
}
