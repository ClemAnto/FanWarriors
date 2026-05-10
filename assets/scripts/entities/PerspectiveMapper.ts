import { _decorator, Component, Node } from 'cc';
import { TRACK_BOTTOM_Y, TRACK_TOP_Y } from './Track';
const { ccclass } = _decorator;

const SCALE_BOTTOM  = 0.55;  // bottom of track — farthest from player (narrow end of funnel)
const SCALE_TOP     = 1.0;   // top of track — closest to player (launch/wide end)
const VISUAL_SCALE  = 1.65;  // visual size multiplier relative to physics radius

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
        const scale = (SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * depth) * VISUAL_SCALE;
        this.viewNode.setScale(scale, scale, 1);
    }
}
