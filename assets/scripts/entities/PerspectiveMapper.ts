import { _decorator, Component, Node } from 'cc';
import { TRACK_BOTTOM_Y, TRACK_TOP_Y } from './Track';
const { ccclass } = _decorator;

const SCALE_NEAR    = 1.0;   // bottom of track — closest to player
const SCALE_FAR     = 0.62;  // top of track — farthest from player
const VISUAL_SCALE  = 2.0;   // visual size multiplier relative to physics radius

@ccclass('PerspectiveMapper')
export class PerspectiveMapper extends Component {
    viewNode!: Node;

    lateUpdate(): void {
        if (!this.viewNode) return;
        const y    = this.node.worldPosition.y;
        const span = TRACK_TOP_Y - TRACK_BOTTOM_Y;
        const depth = span > 0
            ? Math.max(0, Math.min(1, (y - TRACK_BOTTOM_Y) / span))
            : 0;
        const scale = (SCALE_NEAR + (SCALE_FAR - SCALE_NEAR) * depth) * VISUAL_SCALE;
        this.viewNode.setScale(scale, scale, 1);
    }
}
