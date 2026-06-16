import { _decorator, Component, director, view, ResolutionPolicy, Node, Button, Label, find } from 'cc';
import { AudioManager, SFX } from './AudioManager';
import { VERSION } from './GameManager';
import { SafeStorage } from '../utils/SafeStorage';

const { ccclass, property } = _decorator;

const GAME_SCENE = 'Game';
export const LS_TUTORIAL_SEEN = 'fw_tutorial_seen';

/**
 * Tutorial scene controller — also acts as a LOADING COVER for the heavy Game scene.
 *
 * Flow: MainMenu PLAY (first time) → Tutorial. As soon as the (light) Tutorial scene starts we
 * preload the Game scene in the background while the player reads the instructions. Tapping to
 * continue starts the Game instantly if it's ready, otherwise shows a spinner until the preload
 * finishes. Marks the tutorial as seen so later PLAYs go straight to the Game.
 */
@ccclass('Tutorial')
export class Tutorial extends Component {
    @property({ type: Node, tooltip: 'START button — begins the Game (waits for the preload if needed).' })
    startButton: Node | null = null;
    @property({ type: Node, tooltip: 'Optional spinner, shown only if START is pressed before the Game finished preloading.' })
    spinner: Node | null = null;

    private _gameReady = false;
    private _wantStart = false;
    private _loadingLabel: Label | null = null;

    start(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);
        view.resizeWithBrowserSize(true);
        AudioManager.instance.playMusic(SFX.MUSIC_MENU);  // keep the tavern menu loop through the tutorial
        AudioManager.instance.ensureMusic();
        if (this.spinner) this.spinner.active = false;

        // Small "LOADING XX%" label below the START button (separate from the button text).
        this._loadingLabel = find('Canvas/UILayer/LoadingLabel')?.getComponent(Label) ?? null;
        this._setLoading('LOADING 0%');

        // Preload the heavy Game scene while the tutorial is on screen, surfacing progress on the label.
        director.preloadScene(GAME_SCENE,
            (completed: number, total: number) => {
                if (this._gameReady) return;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                this._setLoading(`LOADING ${pct}%`);
            },
            (err: Error | null) => {
                this._gameReady = !err;
                if (this._loadingLabel?.node?.isValid) this._loadingLabel.node.active = false; // hide when ready
                if (err) console.warn('[Tutorial] Game preload failed:', err);
                if (this._wantStart) this._startGame();
            });

        if (this.startButton) {
            this.startButton.getComponent(Button) ?? this.startButton.addComponent(Button);
            this.startButton.on(Button.EventType.CLICK, this._onStart, this);
        }
    }

    private _setLoading(s: string): void {
        if (!this._loadingLabel?.isValid) return;
        this._loadingLabel.string = s;
        if (this._loadingLabel.node) this._loadingLabel.node.active = true;
    }

    private readonly _onStart = (): void => {
        if (this._wantStart) return;
        this._wantStart = true;
        SafeStorage.set(LS_TUTORIAL_SEEN, VERSION);  // tie "seen" to the version → re-shows after an update

        if (this._gameReady) this._startGame();
        else if (this.spinner) this.spinner.active = true;  // wait for the preload, show feedback
    };

    private _startGame(): void {
        director.loadScene(GAME_SCENE);
    }
}
