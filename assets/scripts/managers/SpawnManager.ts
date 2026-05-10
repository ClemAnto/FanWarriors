import { Node } from 'cc';
import { Warrior } from '../entities/Warrior';
import { GAME_OVER_LINE_Y, TRACK_BOTTOM_Y, TRACK_TOP_Y, TRACK_W } from '../entities/Track';

export class SpawnManager {
    private parent: Node;
    private spawnTypes: number;
    private maxLevel = 1;
    private nextType = 0;
    private nextLevel = 1;
    private readonly spawnY: number;

    onMergeReady: ((a: Warrior, b: Warrior) => void) | null = null;
    onNextGenerated: (() => void) | null = null;

    constructor(parent: Node, spawnTypes: number) {
        this.parent = parent;
        this.spawnTypes = spawnTypes;
        // center of lower half — read after initLayout() has been called by GameManager
        this.spawnY = (GAME_OVER_LINE_Y + TRACK_BOTTOM_Y) / 2;
        this.generateNext();
    }

    get next(): { type: number; level: number } {
        return { type: this.nextType, level: this.nextLevel };
    }

    spawnNext(): Warrior {
        const w = Warrior.spawn(this.parent, this.nextType, this.nextLevel, 0, this.spawnY);
        w.onMergeReady = this.onMergeReady;
        this.generateNext();
        return w;
    }

    prefill(): Warrior[] {
        const zoneH = TRACK_TOP_Y - GAME_OVER_LINE_Y;
        const py    = GAME_OVER_LINE_Y + Math.round(zoneH * 0.65);
        const px    = Math.round(TRACK_W * 0.22);
        const positions = [{ x: -px, y: py }, { x: 0, y: py + Math.round(zoneH * 0.08) }, { x: px, y: py }];
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
