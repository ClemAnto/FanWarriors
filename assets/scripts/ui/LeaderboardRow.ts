import { _decorator, Component, Label, Sprite, SpriteFrame, Color } from 'cc';

const { ccclass, property } = _decorator;

const MEDAL_INK     = new Color(255, 248, 225, 255);
const MEDAL_OUTLINE = new Color(74, 38, 8, 255);
const MEDAL_FONT    = 24;

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
    @property({ type: Label, tooltip: 'Rank number (on top of the medal for ranks 1-3).' })
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
        const rl = this.rankLabel;
        if (rl) {
            if (this._rankStyle === null) this._rankStyle = { color: rl.color.clone(), size: rl.fontSize, outline: rl.enableOutline };
            rl.string = String(rank);
            rl.node.active = true;
            // On a medal (ranks 1-3) the number sits on the disc: cream with a dark outline to read on gold/silver/bronze.
            const s = this._rankStyle;
            rl.color = medalFrame ? MEDAL_INK : s.color;
            rl.fontSize = medalFrame ? MEDAL_FONT : s.size;
            rl.enableOutline = medalFrame ? true : s.outline;
            if (medalFrame) { rl.outlineColor = MEDAL_OUTLINE; rl.outlineWidth = 3; }
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

    private _rankStyle: { color: Color; size: number; outline: boolean } | null = null;

    private _plate(mine: boolean): void {
        const frame = mine ? this.mineFrame : this.normalFrame;
        if (this.plate && frame) this.plate.spriteFrame = frame;
    }
}
