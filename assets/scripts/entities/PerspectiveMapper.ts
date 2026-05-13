import { _decorator, Component, Node } from 'cc';
import { TRACK_TOP_Y, TRACK_BOTTOM_Y } from './Track';
const { ccclass } = _decorator;

const SCALE_BOTTOM = 1.2;
const SCALE_TOP    = 1.0;
const VISUAL_SCALE = 1.1;

@ccclass('PerspectiveMapper')
export class PerspectiveMapper extends Component {
    viewNode!: Node;
    yOffset   = 0;
    animScale = 1.0;

    lateUpdate(): void {
        if (!this.viewNode?.isValid) return;
        const wp    = this.node.worldPosition;
        this.viewNode.setWorldPosition(wp.x, wp.y + this.yOffset, wp.z);
        const span  = TRACK_TOP_Y - TRACK_BOTTOM_Y;
        const depth = span > 0 ? Math.max(0, Math.min(1, (wp.y - TRACK_BOTTOM_Y) / span)) : 0;
        const scale = (SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * depth) * VISUAL_SCALE * this.animScale;
        this.viewNode.setScale(scale, scale, 1);
    }
}
