import { _decorator, Component, Node, Label, Button, director, view, ResolutionPolicy } from 'cc';
import { AudioManager } from './AudioManager';
import { VERSION } from './GameManager';
import { SafeStorage } from '../utils/SafeStorage';

const { ccclass, property } = _decorator;

const LS_BEST_SCORE = 'fw_best_score';
const GAME_SCENE    = 'Game';
const RANKING_SCENE = 'Ranking';

/**
 * Main menu scene controller — splash + PLAY + LEADERBOARD.
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
    @property({ type: Node, tooltip: 'LEADERBOARD button — opens the Ranking scene.' })
    leaderboardButton: Node | null = null;

    start(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);

        // Audio: shared singleton, mute state persisted in localStorage.
        AudioManager.instance.playMusic();
        AudioManager.instance.ensureMusic();

        const best = parseInt(SafeStorage.get(LS_BEST_SCORE) ?? '0', 10) || 0;
        if (this.bestLabel)    this.bestLabel.string    = `Best Score\n${best}`;
        if (this.versionLabel) this.versionLabel.string = `v${VERSION}`;

        this.playButton?.on(Button.EventType.CLICK, this.onPlay, this);
        if (this.leaderboardButton) {
            // Ensure a Button exists so CLICK is emitted even if the node lacks one.
            this.leaderboardButton.getComponent(Button) ?? this.leaderboardButton.addComponent(Button);
            this.leaderboardButton.on(Button.EventType.CLICK, this.onLeaderboard, this);
        }
    }

    /** Public so it can also be wired via the editor's clickEvents if preferred. */
    onPlay(): void {
        director.loadScene(GAME_SCENE);
    }

    /** Opens the dedicated Ranking scene (leaderboard always visible there). */
    onLeaderboard(): void {
        director.loadScene(RANKING_SCENE);
    }
}
