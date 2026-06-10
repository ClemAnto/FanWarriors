import { _decorator, Node, SpriteFrame } from 'cc';
import { Warrior } from './Warrior';
import { GlowPulseEffect } from './GlowPulseEffect';

const { ccclass } = _decorator;

/** Launcher glow for the Genocide powerup — implementation in GlowPulseEffect, plus an expire timer. */
@ccclass('GenocideEffect')
export class GenocideEffect extends GlowPulseEffect {
    protected readonly nodePrefix      = 'Gn';
    protected readonly pulseStep       = 0.55;
    protected readonly innerFadeTarget = 130;
    protected readonly sparkleInterval = 0.11;
    protected readonly fadeOutDur      = 0.5;

    onExpired: (() => void) | null = null;
    private _expireCb = () => { this.onExpired?.(); };

    static attach(warrior: Warrior, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): GenocideEffect {
        const node = new Node('GenocideEffect');
        node.setParent(warrior.viewNode);
        const ge = node.addComponent(GenocideEffect);
        ge._radius       = warrior.radius;
        ge._sparkleFrame = sparkleFrame;
        ge._startVFX(glowFrame);
        return ge;
    }

    startTimer(sec: number): void {
        this.unschedule(this._expireCb);
        this.scheduleOnce(this._expireCb, sec);
    }

    protected _onDetach(): void {
        this.unschedule(this._expireCb);
    }
}
