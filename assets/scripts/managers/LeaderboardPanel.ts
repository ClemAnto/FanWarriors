import { _decorator, Component, Node, Button, Label, Color, UIOpacity, tween, resources, Prefab, instantiate } from 'cc';
import { TOP_N, ENABLED } from '../config/LeaderboardConfig';
import { LeaderboardEntry } from '../services/LeaderboardService';
import { LeaderboardProvider } from '../services/LeaderboardProvider';
import { NameEntry } from './NameEntry';

const { ccclass, property } = _decorator;

/** resources path (assets/resources/LeaderboardPanel.prefab). */
const PREFAB_PATH = 'LeaderboardPanel';

/**
 * Self-contained leaderboard overlay. ONE prefab, two child sub-panels:
 *   - Board     : the top-N list (this component fills it)
 *   - NameEntry : the arcade name selector (its own NameEntry component, nested)
 *
 * The ROOT node (this.node) is the modal gate: active = overlay shown + input
 * blocked (BlockInputEvents on the root), inactive = nothing shown / passthrough.
 * It starts active so onLoad runs and bindings register, then onLoad hides it.
 * CC3 activates synchronously, so re-activating the root runs the nested
 * NameEntry.onLoad before we call into it — no deferred-binding race.
 *
 * `boardNode` is the Board sub-panel we fade; the nested NameEntry fades itself.
 *
 * Two entry points:
 *   - open()       : just show the board (e.g. a menu "Leaderboard" button)
 *   - runEndGame() : qualify → name entry → submit → board (game-over flow)
 *
 * Behavior only — layout lives in the LeaderboardPanel prefab. Each Board row node
 * must contain child Labels named "Rank", "Name", "Score".
 */
@ccclass('LeaderboardPanel')
export class LeaderboardPanel extends Component {
    @property({ type: Node, tooltip: 'The Board sub-panel (faded/toggled to show the list).' })
    boardNode: Node | null = null;
    @property({ type: NameEntry, tooltip: 'The nested NameEntry component (name selector sub-panel).' })
    nameEntry: NameEntry | null = null;
    @property({ type: [Node], tooltip: 'One row node per rank (top→bottom). Each contains child Labels "Rank","Name","Score". Length = TOP_N.' })
    rowNodes: Node[] = [];
    @property({ type: Label, tooltip: 'Status label (loading / empty).' })
    statusLabel: Label | null = null;
    @property({ type: Button, tooltip: 'Board close button.' })
    closeButton: Button | null = null;
    @property({ tooltip: 'Highlight tint for the player\'s own row.' })
    highlightColor: Color = new Color(255, 215, 60, 255);
    @property({ tooltip: 'Normal row text tint.' })
    normalColor: Color = new Color(255, 255, 255, 255);

    private _boardOp: UIOpacity | null = null;
    private _onClose: (() => void) | null = null;
    private _highlightName = '';
    private _highlightScore = -1;

    /**
     * Load the prefab from resources and instantiate it under `parent` (top sibling).
     * The robust, editor-free way to get a working overlay: callers don't need a
     * pre-placed scene instance nor an @property binding. Resolves null on failure.
     */
    static spawn(parent: Node, cb: (panel: LeaderboardPanel | null) => void): void {
        resources.load(PREFAB_PATH, Prefab, (err, prefab) => {
            if (err || !prefab) {
                console.warn('[LeaderboardPanel] resources.load failed:', err);
                cb(null);
                return;
            }
            const node = instantiate(prefab);
            node.setParent(parent);
            node.setSiblingIndex(parent.children.length - 1);
            cb(node.getComponent(LeaderboardPanel));
        });
    }

    /** The Board sub-panel, or the root as a fallback when unbound. */
    private get _board(): Node {
        return this.boardNode ?? this.node;
    }
    /** True when boardNode is a real child distinct from the root. */
    private get _hasBoardChild(): boolean {
        return !!this.boardNode && this.boardNode !== this.node;
    }

    onLoad(): void {
        const board = this._board;
        this._boardOp = board.getComponent(UIOpacity) ?? board.addComponent(UIOpacity);
        this._boardOp.opacity = 0;
        if (this._hasBoardChild) board.active = false;
        this.node.active = false; // whole overlay hidden → input passthrough
        this.closeButton?.node.on(Button.EventType.CLICK, this._close, this);
    }

    /** Show only the board (no name entry). For a menu "Leaderboard" button. */
    open(opts?: { highlightName?: string; highlightScore?: number; onClose?: () => void }): void {
        this._onClose = opts?.onClose ?? null;
        this._showBoard(opts?.highlightName, opts?.highlightScore);
    }

    /**
     * Full game-over flow: qualify → name entry → submit → board (own row highlighted).
     * No-op (resolves) when the leaderboard is disabled or the player doesn't qualify.
     */
    async runEndGame(score: number, opts?: { onClose?: () => void }): Promise<void> {
        if (!ENABLED) return;
        this._onClose = opts?.onClose ?? null;
        const svc = LeaderboardProvider.get();
        try {
            await svc.init();
            if (!(await svc.qualifies(score))) return;
        } catch {
            return;
        }
        this.node.active = true; // overlay on (also runs nested NameEntry.onLoad first time)
        if (this._hasBoardChild) this.boardNode!.active = false; // board hidden during entry
        if (this.nameEntry) {
            this.nameEntry.open(score, (name) => {
                void (async () => {
                    try { await svc.submit({ name, score, createdAt: Date.now() }); } catch { /* show board anyway */ }
                    this._showBoard(name, score);
                })();
            });
        } else {
            this._showBoard();
        }
    }

    private _showBoard(highlightName?: string, highlightScore?: number): void {
        this._highlightName = highlightName ?? '';
        this._highlightScore = highlightScore ?? -1;
        this.node.active = true;
        this._board.active = true;
        if (this._boardOp) tween(this._boardOp).to(0.25, { opacity: 255 }, { easing: 'sineOut' }).start();

        this._setStatus('Loading…');
        this._clearRows();
        void this._load();
    }

    private async _load(): Promise<void> {
        const svc = LeaderboardProvider.get();
        await svc.init();
        const entries = await svc.getTop(TOP_N);
        if (!this.node.active) return; // closed while awaiting
        this._render(entries);
    }

    private _render(entries: LeaderboardEntry[]): void {
        this._setStatus(entries.length === 0 ? 'No scores yet.' : '');
        let highlighted = false;
        for (let i = 0; i < this.rowNodes.length; i++) {
            const row = this.rowNodes[i];
            if (!row) continue;
            const e = entries[i];
            if (!e) { row.active = false; continue; }
            row.active = true;
            const isMine = !highlighted && e.name === this._highlightName && e.score === this._highlightScore;
            if (isMine) highlighted = true;
            const tint = isMine ? this.highlightColor : this.normalColor;
            this._setRowLabel(row, 'Rank', String(i + 1), tint);
            this._setRowLabel(row, 'Name', e.name, tint);
            this._setRowLabel(row, 'Score', String(e.score), tint);
        }
    }

    private _clearRows(): void {
        for (const row of this.rowNodes) if (row) row.active = false;
    }

    private _setRowLabel(row: Node, childName: string, value: string, color: Color): void {
        const lbl = row.getChildByName(childName)?.getComponent(Label);
        if (!lbl) return;
        lbl.string = value;
        lbl.color = color;
    }

    private _setStatus(msg: string): void {
        if (!this.statusLabel) return;
        this.statusLabel.string = msg;
        this.statusLabel.node.active = msg.length > 0;
    }

    private _close(): void {
        const done = () => {
            if (this._hasBoardChild) this.boardNode!.active = false;
            this.node.active = false; // overlay off → passthrough
            const cb = this._onClose;
            this._onClose = null;
            cb?.();
        };
        if (!this._boardOp) { done(); return; }
        tween(this._boardOp).to(0.2, { opacity: 0 }, { easing: 'sineIn' }).call(done).start();
    }
}
