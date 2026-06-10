import { _decorator, Node, SpriteFrame } from 'cc';
import { Warrior } from './Warrior';
import { GlowPulseEffect } from './GlowPulseEffect';

const { ccclass } = _decorator;

/** Launcher glow for the BloodHood powerup — implementation in GlowPulseEffect. */
@ccclass('BloodhoodEffect')
export class BloodhoodEffect extends GlowPulseEffect {
    protected readonly nodePrefix      = 'Bh';
    protected readonly pulseStep       = 0.65;
    protected readonly innerFadeTarget = 120;
    protected readonly sparkleInterval = 0.13;
    protected readonly fadeOutDur      = 0.6;

    static attach(warrior: Warrior, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): BloodhoodEffect {
        const node = new Node('BloodhoodEffect');
        node.setParent(warrior.viewNode);
        const bh = node.addComponent(BloodhoodEffect);
        bh._radius       = warrior.radius;
        bh._sparkleFrame = sparkleFrame;
        bh._startVFX(glowFrame);
        return bh;
    }
}
