import { _decorator, Component, Node, Button, Label, UIOpacity, UITransform, Vec2, Vec3, tween, Tween } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Round-up BOOST offer (rewarded ad → Aura on the launcher). Behaviour only: the BOOST button and
 * the confirm modal are authored in Game.scene (scripts/add-boost-offer.js) and stay INACTIVE in
 * the editor; this component shows/hides them and reports the player's choice to the host.
 *
 * Flow: offer(centerSec, parkSec) shows the BOOST button at its editor position (centre, under the
 * round-up banner) for `centerSec`, then slides it just above `parkAnchor` (the settings gear) for
 * `parkSec` and fades it out → tap → onRequest (host decides WHEN: it pauses the game and calls
 * openPanel() — right away, or once the warrior in flight has landed)
 * + confirm panel "WATCH AN AD TO GET YOUR BOOST" → WATCH → onWatch (host runs the rewarded ad)
 * or NO THANKS → onDecline (host resumes). The ad and the reward are entirely the host's job.
 * If no ad could be shown, showUnavailable() reuses the same modal as a notice
 * ("NO AD AVAILABLE RIGHT NOW" + OK); the host then withdraws the BOOST for a couple of rounds.
 */
const UNAVAILABLE_TITLE = 'NO AD AVAILABLE RIGHT NOW';
const UNAVAILABLE_INFO  = 'The BOOST will be back in a few rounds';
@ccclass('BoostOffer')
export class BoostOffer extends Component {
    @property({ type: Button, tooltip: 'BOOST button; its editor position is the centre slot under the round-up banner (inactive in editor).' })
    boostButton: Button | null = null;
    @property({ type: Node, tooltip: 'Confirm modal root (Widget fullscreen + UIOpacity + BlockInputEvents, inactive in editor).' })
    panel: Node | null = null;
    @property({ type: Button, tooltip: 'WATCH button inside the confirm modal.' })
    watchButton: Button | null = null;
    @property({ type: Button, tooltip: 'NO THANKS button inside the confirm modal.' })
    noThanksButton: Button | null = null;
    @property({ type: Node, tooltip: 'Node the BOOST button parks above once the round-up banner is gone (the settings gear).' })
    parkAnchor: Node | null = null;
    @property({ tooltip: 'Vertical gap (design px) between the parked BOOST button and the anchor.' })
    parkGap = 12;
    @property({ type: Label, tooltip: 'Modal title label (swapped to the "no ad" notice when no ad could be shown).' })
    titleLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Modal info line under the title.' })
    infoLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Label of the NO THANKS button (becomes OK in the "no ad" notice).' })
    noThanksLabel: Label | null = null;

    /** Host hooks — set by GameManager. */
    /** BOOST tapped: the host must eventually pause the game and call openPanel(). */
    onRequest: (() => void) | null = null;
    onWatch:   (() => void) | null = null;
    onDecline: (() => void) | null = null;

    private _hideTimer: (() => void) | null = null;
    private _parkTimer: (() => void) | null = null;
    private _centerPosition: Vec3 | null = null;
    /** Set while the modal shows the "no ad" notice: its single button runs this instead of onDecline. */
    private _unavailableDone: (() => void) | null = null;
    private _texts: { title: string; info: string; noThanks: string } | null = null;

    get isPanelOpen(): boolean { return !!this.panel?.active; }

    onLoad(): void {
        this.boostButton?.node.on(Button.EventType.CLICK, this._onBoostTap, this);
        this.watchButton?.node.on(Button.EventType.CLICK, () => this._closePanel(() => this.onWatch?.()), this);
        this.noThanksButton?.node.on(Button.EventType.CLICK, () => this._closePanel(() => {
            const done = this._unavailableDone;
            if (done) { this._unavailableDone = null; this._restoreTexts(); done(); }
            else this.onDecline?.();
        }), this);
        this._texts = {
            title:    this.titleLabel?.string ?? '',
            info:     this.infoLabel?.string ?? '',
            noThanks: this.noThanksLabel?.string ?? '',
        };
        if (this.boostButton) {
            this._centerPosition = this.boostButton.node.position.clone();  // editor position = centre slot
            this.boostButton.node.active = false;
        }
        if (this.panel) this.panel.active = false;
    }

    /** Show the BOOST button at the centre for `centerSeconds` (pulsing), then park it above the
     *  settings gear for `parkSeconds`, then fade it out — unless tapped first. */
    offer(centerSeconds: number, parkSeconds: number): void {
        const buttonNode = this.boostButton?.node;
        if (!buttonNode) return;
        this._cancelTimers();
        buttonNode.active = true;
        const opacity = this._opacity(buttonNode);
        Tween.stopAllByTarget(opacity);
        Tween.stopAllByTarget(buttonNode);
        if (this._centerPosition) buttonNode.setPosition(this._centerPosition);
        opacity.opacity = 0;
        buttonNode.setScale(Vec3.ONE);
        tween(opacity).to(0.25, { opacity: 255 }).start();
        this._startPulse(buttonNode);
        this._parkTimer = () => this._park(parkSeconds);
        this.scheduleOnce(this._parkTimer, centerSeconds);
    }

    /** Offer the button again directly in its parked slot (after a "no ad" notice). */
    showParked(seconds: number): void {
        const buttonNode = this.boostButton?.node;
        if (!buttonNode) return;
        this._cancelTimers();
        buttonNode.active = true;
        Tween.stopAllByTarget(buttonNode);
        const target = this._parkPosition(buttonNode);
        if (target) buttonNode.setPosition(target);
        buttonNode.setScale(Vec3.ONE);
        const opacity = this._opacity(buttonNode);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity).to(0.25, { opacity: 255 }).start();
        this._startPulse(buttonNode);
        this._hideTimer = () => this.hideOffer();
        this.scheduleOnce(this._hideTimer, seconds);
    }

    /** The modal as a notice: no ad could be shown. Its single OK button calls `done` (the host
     *  resumes the game and re-offers the BOOST). */
    showUnavailable(done: () => void): void {
        this._unavailableDone = done;
        if (this.titleLabel)    this.titleLabel.string    = UNAVAILABLE_TITLE;
        if (this.infoLabel)     this.infoLabel.string     = UNAVAILABLE_INFO;
        if (this.noThanksLabel) this.noThanksLabel.string = 'OK';
        if (this.watchButton)   this.watchButton.node.active = false;
        this.openPanel();
    }

    private _restoreTexts(): void {
        if (this._texts) {
            if (this.titleLabel)    this.titleLabel.string    = this._texts.title;
            if (this.infoLabel)     this.infoLabel.string     = this._texts.info;
            if (this.noThanksLabel) this.noThanksLabel.string = this._texts.noThanks;
        }
        if (this.watchButton) this.watchButton.node.active = true;
    }

    /** Fade the BOOST button out (offer expired, game over, …). */
    hideOffer(): void {
        this._cancelTimers();
        const buttonNode = this.boostButton?.node;
        if (!buttonNode?.active) return;
        Tween.stopAllByTarget(buttonNode);
        const opacity = this._opacity(buttonNode);
        Tween.stopAllByTarget(opacity);
        tween(opacity).to(0.2, { opacity: 0 }).call(() => { buttonNode.active = false; }).start();
    }

    /** True when a screen point (EventTouch.getLocation) lands on the visible BOOST button —
     *  lets the InputController ignore that tap instead of starting an aim drag under it. */
    hitsButton(screenPoint: Vec2): boolean {
        const buttonNode = this.boostButton?.node;
        if (!buttonNode?.active) return false;
        return !!buttonNode.getComponent(UITransform)?.hitTest(screenPoint);
    }

    private _onBoostTap(): void {
        this._cancelTimers();
        const buttonNode = this.boostButton?.node;
        if (buttonNode) { Tween.stopAllByTarget(buttonNode); buttonNode.active = false; }
        this.onRequest?.();
    }

    /** Show the confirm modal (the host has already paused the game). */
    openPanel(): void {
        if (!this.panel) { this.onDecline?.(); return; }
        this.panel.active = true;
        const opacity = this._opacity(this.panel);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity).to(0.2, { opacity: 255 }).start();
    }

    private _closePanel(then: () => void): void {
        const panel = this.panel;
        if (!panel?.active) return;
        const opacity = this._opacity(panel);
        Tween.stopAllByTarget(opacity);
        tween(opacity).to(0.15, { opacity: 0 }).call(() => { panel.active = false; then(); }).start();
    }

    /** Slide the button just above the park anchor (right edges aligned), then fade after `seconds`. */
    private _park(seconds: number): void {
        this._parkTimer = null;
        const buttonNode = this.boostButton?.node;
        if (!buttonNode?.active) return;
        const target = this._parkPosition(buttonNode);
        if (target) {
            Tween.stopAllByTarget(buttonNode);
            buttonNode.setScale(Vec3.ONE);
            tween(buttonNode)
                .to(0.35, { position: target }, { easing: 'quadOut' })
                .call(() => this._startPulse(buttonNode))
                .start();
        }
        this._hideTimer = () => this.hideOffer();
        this.scheduleOnce(this._hideTimer, seconds);
    }

    /** Anchor top edge + gap, right edge aligned with the anchor's — in the button parent's space,
     *  from the anchor's real world transform (Widget-driven, differs per orientation). */
    private _parkPosition(buttonNode: Node): Vec3 | null {
        const anchor = this.parkAnchor;
        const parentTransform = buttonNode.parent?.getComponent(UITransform);
        const anchorTransform = anchor?.getComponent(UITransform);
        const buttonTransform = buttonNode.getComponent(UITransform);
        if (!anchor?.isValid || !parentTransform || !anchorTransform || !buttonTransform) return null;
        const anchorBox = anchorTransform.getBoundingBoxToWorld();
        const topRight = parentTransform.convertToNodeSpaceAR(new Vec3(anchorBox.xMax, anchorBox.yMax, 0));
        const parentScale = buttonNode.parent!.worldScale;
        const gap = this.parkGap / (parentScale.y || 1);
        return new Vec3(topRight.x - buttonTransform.width / 2, topRight.y + gap + buttonTransform.height / 2, 0);
    }

    private _startPulse(buttonNode: Node): void {
        tween(buttonNode)
            .to(0.45, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
            .to(0.45, { scale: Vec3.ONE }, { easing: 'sineInOut' })
            .union().repeatForever().start();
    }

    private _cancelTimers(): void {
        if (this._hideTimer) { this.unschedule(this._hideTimer); this._hideTimer = null; }
        if (this._parkTimer) { this.unschedule(this._parkTimer); this._parkTimer = null; }
    }

    private _opacity(node: Node): UIOpacity {
        return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    }
}
