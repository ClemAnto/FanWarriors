import { _decorator, Component, Label, Sprite, SpriteFrame } from 'cc';

const { ccclass, property } = _decorator;

/**
 * One leaderboard row (prefab LeaderboardRow): parchment plate, medal for ranks 1-3, labels.
 * Behaviour only — layout and art live in the prefab. LeaderboardPanel fills it via show()/clear().
 */
@ccclass('LeaderboardRow')
export class LeaderboardRow extends Component {
    @property({ type: Sprite, tooltip: 'Row plate (the "skin" child). Its frame switches to the highlighted plate on the player\'s own row.' })
    plate: Sprite | null = null;
    @property({ type: SpriteFrame, tooltip: 'Plate for every other row.' })
    normalFrame: SpriteFrame | null = null;
    @property({ type: SpriteFrame, tooltip: 'Plate for the player\'s own row.' })
    mineFrame: SpriteFrame | null = null;
    @property({ type: Sprite, tooltip: 'Medal shown instead of the rank number for ranks 1-3.' })
    medal: Sprite | null = null;
    @property({ type: [SpriteFrame], tooltip: 'Gold, silver, bronze.' })
    medalFrames: SpriteFrame[] = [];
    @property({ type: Label, tooltip: 'Rank number (hidden when a medal is shown).' })
    rankLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Player name.' })
    nameLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Round reached (hidden on boards without rounds).' })
    roundLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Score.' })
    scoreLabel: Label | null = null;

    show(rank: number, name: string, round: number, score: number, mine: boolean): void {
        const medalFrame = rank >= 1 && rank <= this.medalFrames.length ? this.medalFrames[rank - 1] : null;
        if (this.medal) {
            this.medal.node.active = !!medalFrame;
            if (medalFrame) this.medal.spriteFrame = medalFrame;
        }
        if (this.rankLabel) {
            this.rankLabel.string = String(rank);
            this.rankLabel.node.active = !medalFrame;
        }
        if (this.nameLabel) this.nameLabel.string = name;
        if (this.roundLabel) {
            this.roundLabel.string = round > 0 ? String(round) : '';
            this.roundLabel.node.active = round > 0;
        }
        if (this.scoreLabel) this.scoreLabel.string = String(score);
        this._plate(mine);
    }

    /** Blank row (sparse board): keeps the plate so the list stays packed at the top. */
    clear(): void {
        if (this.medal) this.medal.node.active = false;
        for (const l of [this.rankLabel, this.nameLabel, this.roundLabel, this.scoreLabel]) if (l) l.string = '';
        this._plate(false);
    }

    private _plate(mine: boolean): void {
        const frame = mine ? this.mineFrame : this.normalFrame;
        if (this.plate && frame) this.plate.spriteFrame = frame;
    }
}
