import { _decorator, Component, Node, Label, Button, Canvas, director, sys, view, ResolutionPolicy } from 'cc';
import { AudioManager } from './AudioManager';
import { VERSION } from './GameManager';
import { LeaderboardPanel } from './LeaderboardPanel';

const { ccclass, property } = _decorator;

const LS_BEST_SCORE = 'fw_best_score';
const GAME_SCENE    = 'Game';

/**
 * Main menu scene controller — splash + PLAY.
 * The options dialog is handled by the shared Settings component (on the Dialog node),
 * not here, so both scenes use the same logic.
 */
@ccclass('MainMenu')
export class MainMenu extends Component {
    @property({ type: Node, tooltip: 'PLAY button — starts the Game scene.' })
    playButton: Node | null = null;
    @property({ type: Label, tooltip: 'Best score label.' })
    bestLabel: Label | null = null;
    @property({ type: Label, tooltip: 'Version label.' })
    versionLabel: Label | null = null;
    @property({ type: Node, tooltip: 'LEADERBOARD button — opens the top scores panel.' })
    leaderboardButton: Node | null = null;
    /** Leaderboard overlay — instantiated from resources at start (no editor binding). */
    private leaderboardPanel: LeaderboardPanel | null = null;

    start(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);

        // Audio: shared singleton, mute state persisted in localStorage.
        AudioManager.instance.playMusic();
        AudioManager.instance.ensureMusic();

        const best = parseInt(sys.localStorage.getItem(LS_BEST_SCORE) ?? '0', 10) || 0;
        if (this.bestLabel)    this.bestLabel.string    = `Best Score\n${best}`;
        if (this.versionLabel) this.versionLabel.string = `v${VERSION}`;

        // Wire buttons FIRST so nothing below can block them.
        this.playButton?.on(Button.EventType.CLICK, this.onPlay, this);
        if (this.leaderboardButton) {
            this.leaderboardButton.getComponent(Button) ?? this.leaderboardButton.addComponent(Button);
            this.leaderboardButton.on(Button.EventType.CLICK, this.onLeaderboard, this);
        }

        // Preload the panel (best effort); onLeaderboard also lazy-loads if this didn't finish.
        this._ensurePanel();
    }

    /** Resolve the panel (cached, else load+instantiate from resources). */
    private _ensurePanel(cb?: (panel: LeaderboardPanel | null) => void): void {
        if (this.leaderboardPanel) { cb?.(this.leaderboardPanel); return; }
        const canvasNode = director.getScene()?.getComponentInChildren(Canvas)?.node ?? this.node;
        LeaderboardPanel.spawn(canvasNode, (p) => { this.leaderboardPanel = p; cb?.(p); });
    }

    /** Public so it can also be wired via the editor's clickEvents if preferred. */
    onPlay(): void {
        director.loadScene(GAME_SCENE);
    }

    /** Opens the leaderboard panel; loads it on demand if not ready yet. */
    onLeaderboard(): void {
        const lbl = this.leaderboardButton?.getComponentInChildren(Label) ?? null;
        this._ensurePanel((p) => {
            if (!p) { if (lbl) lbl.string = 'LB ERR'; return; } // visible diagnostic on phone
            const n = p.node;
            if (n.parent) n.setSiblingIndex(n.parent.children.length - 1);
            p.open({});
        });
    }
}
