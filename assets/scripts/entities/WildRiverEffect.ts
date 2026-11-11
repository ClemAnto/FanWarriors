import { _decorator, Node, SpriteFrame, Color } from 'cc';
import { Warrior } from './Warrior';
import { GlowPulseEffect } from './GlowPulseEffect';

const { ccclass } = _decorator;

/** Launcher glow for the WildRiver powerup — implementation in GlowPulseEffect. */
@ccclass('WildRiverEffect')
export class WildRiverEffect extends GlowPulseEffect {
    protected readonly nodePrefix      = 'Wr';
    protected readonly pulseStep       = 0.65;
    protected readonly innerFadeTarget = 120;
    protected readonly sparkleInterval = 0.13;
    protected readonly fadeOutDur      = 0.6;
    // Ruby red: WildRiver's own color (same hue as its next-slot preview glow)
    protected readonly outerColor      = new Color(210,  30,  60, 255);
    protected readonly innerColor      = new Color(255, 100, 110, 255);
    protected readonly sparkPalette: readonly Color[] = [
        new Color(240,  60,  80, 220),
        new Color(255, 150, 150, 200),
        new Color(220,  40,  70, 180),
    ];

    static attach(warrior: Warrior, sparkleFrame: SpriteFrame | null = null, glowFrame: SpriteFrame | null = null): WildRiverEffect {
        const node = new Node('WildRiverEffect');
        node.setParent(warrior.viewNode);
        const wr = node.addComponent(WildRiverEffect);
        wr._radius       = warrior.radius;
        wr._sparkleFrame = sparkleFrame;
        wr._startVFX(glowFrame);
        return wr;
    }
}
