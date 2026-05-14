import { Node } from 'cc';
import { Warrior } from '../entities/Warrior';
import { WALL_LT, WALL_RB } from '../entities/Track';

export class SpawnManager {
    private parent: Node;
    private visualParent: Node;
    private spawnTypes: number;
    private layerScaleY: number;
    private maxLevel = 1;
    private nextType = 0;
    private nextLevel = 1;
    // WALL_* are in canvas space; divide by layerScaleY to get local coords for box2dLayer children
    private canvasToLocal(y: number): number { return y / this.layerScaleY; }
    private get spawnY(): number { return Math.round(this.canvasToLocal(WALL_RB.y + (WALL_LT.y - WALL_RB.y) * 0.25)); }

    onMergeReady: ((a: Warrior, b: Warrior) => void) | null = null;
    onNextGenerated: (() => void) | null = null;

    constructor(parent: Node, visualParent: Node, spawnTypes: number, layerScaleY = 1) {
        this.parent = parent;
        this.visualParent = visualParent;
        this.spawnTypes = spawnTypes;
        this.layerScaleY = layerScaleY;
        this.generateNext();
    }

    get next(): { type: number; level: number } {
        return { type: this.nextType, level: this.nextLevel };
    }

    spawnNext(): Warrior {
        const w = Warrior.spawn(this.parent, this.visualParent, this.nextType, this.nextLevel, 0, this.spawnY);
        w.onMergeReady = this.onMergeReady;
        this.generateNext();
        return w;
    }

    prefill(): Warrior[] {
        const py = Math.round(this.canvasToLocal(WALL_RB.y + (WALL_LT.y - WALL_RB.y) * 0.92));
        const px = Math.round((WALL_RB.x - WALL_LT.x) * 0.3);
        const positions = [
            { x: -px, y: py },
            { x:   0, y: py },
            { x:  px, y: py },
        ];
        return positions.map(({ x, y }, i) => {
            const w = Warrior.spawn(this.parent, this.visualParent, i % this.spawnTypes, 1, x, y);
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
