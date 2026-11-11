import { _decorator, Component, Node, Label, Button, Sprite, SpriteFrame, UIOpacity, resources, tween, Tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * End-of-game modal panel — shared by the GameOver and Victory prefabs (same
 * structure, different title/colors set in the prefab). Behaviour only: layout
 * lives in the prefab, editable in the Cocos editor.
 *
 * Single forward action only — no choices on the panel. The owning scene
 * (GameManager) sets the host hook and calls `show()`:
 *   - onContinue → advance to the leaderboard (if enabled) → main menu
 *
 * Starts hidden (opacity 0, inactive) — GameManager fades it in via show() once
 * the game has fully settled (explosions/merges/score) and the leaderboard
 * qualification is resolved, so the Continue button can't race anything.
 */
@ccclass('EndPanel')
export class EndPanel extends Component {
    @property({ type: Label, tooltip: 'Final score line, e.g. "Score: 1234".' })
    scoreLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Round reached — shows the round number. Optional (leave unset to hide).' })
    roundLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Stored best line — hidden automatically when this run set a new best.' })
    bestLabel: Label | null = null;
    @property({ type: Node, tooltip: 'Animated "NEW BEST SCORE" node — shown only on a new record.' })
    newBestNode: Node | null = null;
    @property({ type: Button, tooltip: 'The single forward button (Continue).' })
    continueButton: Button | null = null;
    @property({ type: Sprite, tooltip: 'Illustration sprite. Left EMPTY in the prefab: the art is lazy-loaded from resources (keeps ~180 KB off the Game-scene load).' })
    illustration: Sprite | null = null;
    @property({ tooltip: 'resources/ path of the illustration, e.g. "illustrations/game_over" (no extension).' })
    illustrationPath = '';
    @property({ type: Node, tooltip: 'REVIVE group (caption + button), GameOver only. Inactive in the prefab; shown by show(..., canRevive).' })
    reviveGroup: Node | null = null;
    @property({ type: Button, tooltip: 'REVIVE button (rewarded ad → continue).' })
    reviveButton: Button | null = null;
    @property({ type: Label, tooltip: 'REVIVE button label (shows a short notice when no ad is available).' })
    reviveLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Label of the forward button. Next to REVIVE it reads "End game" ("Continue" would suggest continuing the match).' })
    continueLabel: Label | null = null;

    /** Host hooks — set by the owning scene (GameManager). */
    onContinue: (() => void) | null = null;
    /** REVIVE tapped (the host runs the rewarded ad, then calls hide() on success). */
    onRevive: (() => void) | null = null;

    private _op: UIOpacity | null = null;
    private _illustrationRequested = false;
    private _continueText: string | null = null;

    onLoad(): void {
        // Leave the node INACTIVE in the editor — this onLoad runs on the first show() activation
        // (so it must NOT self-hide via active=false, or the panel would re-hide on first show).
        this._op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        this._op.opacity = 0;
        this.continueButton?.node.on(Button.EventType.CLICK, () => this.onContinue?.(), this);
        this.reviveButton?.node.on(Button.EventType.CLICK, () => {
            if (this.reviveButton) this.reviveButton.interactable = false;  // one request at a time
            this.onRevive?.();
        }, this);
    }

    /** Start downloading the illustration in the background (GameManager calls it once play is
     *  under way). Idempotent; show() also calls it, so a slow network only delays the art. */
    preloadIllustration(): void {
        if (this._illustrationRequested || !this.illustrationPath || !this.illustration) return;
        this._illustrationRequested = true;
        resources.load(`${this.illustrationPath}/spriteFrame`, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                console.warn(`[EndPanel] illustration '${this.illustrationPath}' failed to load:`, err);
                this._illustrationRequested = false;  // let show() retry (e.g. a network blip during the 5 s preload)
                return;
            }
            if (this.illustration?.isValid) this.illustration.spriteFrame = frame;
        });
    }

    /** Fill the labels and fade the panel in. */
    show(score: number, round: number, best: number, newBest: boolean, canRevive = false): void {
        this.preloadIllustration();
        this.node.active = true;
        this.setReviveAvailable(canRevive);
        if (this.scoreLabel) this.scoreLabel.string = `Score ${score}`;
        if (this.roundLabel) this.roundLabel.string = `ROUND ${round}`;
        if (this.bestLabel) {
            this.bestLabel.string = `Best ${best}`;
            // Hide the stored best when this run beat it — the NEW BEST message is the cue then.
            this.bestLabel.node.active = !newBest;
        }
        if (this.newBestNode) {
            this.newBestNode.active = newBest;
            if (newBest) this._pulse(this.newBestNode);
        }
        if (this._op) {
            Tween.stopAllByTarget(this._op);
            this._op.opacity = 0;
            tween(this._op).to(2.0, { opacity: 255 }).start();
        }
    }

    /** Show / hide the REVIVE option (resets its label and makes it tappable again). */
    setReviveAvailable(available: boolean, label = 'REVIVE'): void {
        if (this.continueLabel) {
            if (this._continueText === null) this._continueText = this.continueLabel.string;
            this.continueLabel.string = available ? 'End game' : this._continueText;
        }
        if (this.reviveGroup) this.reviveGroup.active = available;
        if (this.reviveButton) this.reviveButton.interactable = available;
        if (this.reviveLabel) this.reviveLabel.string = label;
    }

    /** Hide the panel immediately (revive granted: the game continues underneath). */
    hide(): void {
        if (this._op) Tween.stopAllByTarget(this._op);
        if (this.newBestNode) Tween.stopAllByTarget(this.newBestNode);
        this.node.active = false;
    }

    onDestroy(): void {
        if (this._op) Tween.stopAllByTarget(this._op);
        if (this.newBestNode) Tween.stopAllByTarget(this.newBestNode);
    }

    private _pulse(n: Node): void {
        tween(n)
            .repeatForever(
                tween<Node>()
                    .to(0.45, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineOut' })
                    .to(0.45, { scale: new Vec3(1.0, 1.0, 1) },   { easing: 'sineIn'  })
            )
            .start();
    }
}
