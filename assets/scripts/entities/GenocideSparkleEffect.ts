import { _decorator, Node } from 'cc';
import { Warrior } from './Warrior';
import { TintSparkleEffect } from './TintSparkleEffect';

const { ccclass } = _decorator;

/** Infected-warrior tint+hop for the Genocide cascade — implementation in TintSparkleEffect (faster timings). */
@ccclass('GenocideSparkleEffect')
export class GenocideSparkleEffect extends TintSparkleEffect {
    protected readonly hopUpSec         = 0.10;
    protected readonly hopDownSec       = 0.10;
    protected readonly hopHeight        = 14;
    protected readonly tintInSec        = 0.08;
    protected readonly pulseSec         = 0.25;
    protected readonly mapperRestoreSec = 0.08;
    protected readonly spriteRestoreSec = 0.15;

    static attach(warrior: Warrior): GenocideSparkleEffect {
        const node = new Node('GNSparkle');
        node.setParent(warrior.viewNode);
        const gns = node.addComponent(GenocideSparkleEffect);
        gns._warrior = warrior;
        gns._startVFX();
        return gns;
    }
}
