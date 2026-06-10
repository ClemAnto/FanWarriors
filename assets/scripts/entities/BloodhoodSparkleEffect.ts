import { _decorator, Node } from 'cc';
import { Warrior } from './Warrior';
import { TintSparkleEffect } from './TintSparkleEffect';

const { ccclass } = _decorator;

/** Infected-warrior tint+hop for the BloodHood cascade — implementation in TintSparkleEffect. */
@ccclass('BloodhoodSparkleEffect')
export class BloodhoodSparkleEffect extends TintSparkleEffect {
    protected readonly hopUpSec         = 0.13;
    protected readonly hopDownSec       = 0.13;
    protected readonly hopHeight        = 18;
    protected readonly tintInSec        = 0.12;
    protected readonly pulseSec         = 0.35;
    protected readonly mapperRestoreSec = 0.12;
    protected readonly spriteRestoreSec = 0.25;

    static attach(warrior: Warrior): BloodhoodSparkleEffect {
        const node = new Node('BHSparkle');
        node.setParent(warrior.viewNode);
        const bhs = node.addComponent(BloodhoodSparkleEffect);
        bhs._warrior = warrior;
        bhs._startVFX();
        return bhs;
    }
}
