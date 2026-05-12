import { _decorator, Component, Node } from 'cc';
import { trackLayout } from './Track';
const { ccclass } = _decorator;

const SCALE_BOTTOM  = 1.2;
const SCALE_TOP     = 1.0;
const VISUAL_SCALE  = 1.1;

@ccclass('PerspectiveMapper')
export class PerspectiveMapper extends Component {
    viewNode!: Node;

    lateUpdate(): void {
        if (!this.viewNode) return;
        const y    = this.node.position.y;
        const span = trackLayout.topY - trackLayout.bottomY;
        const depth = span > 0
            ? Math.max(0, Math.min(1, (y - trackLayout.bottomY) / span))
            : 0;
        const scale = (SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * depth) * VISUAL_SCALE;
        this.viewNode.setScale(scale, scale, 1);
    }
}
