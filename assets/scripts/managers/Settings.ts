import { _decorator, Component, Node, Toggle, Button, UIOpacity, tween, sys, instantiate, Label, UITransform } from 'cc';
import { AudioManager } from './AudioManager';
import { SafeStorage } from '../utils/SafeStorage';

const { ccclass, property } = _decorator;

const LS_VIBRATION = 'fw_vibration';

/**
 * Centralized settings dialog — shared by MainMenu and Game scenes.
 * Attach to an ALWAYS-ACTIVE node (e.g. Canvas) and set `dialogNode` to the
 * Dialog panel — that way the Dialog can stay inactive in the editor and onLoad
 * still runs. (If left unset, `dialogNode` falls back to this component's own node.)
 * The component hides the dialog itself in onLoad before the first frame renders.
 *
 * Owns the four toggles (vibration / sfx / music / fullscreen) and the open/close
 * fade. Audio mute state lives in AudioManager (persisted in localStorage), vibration
 * in localStorage under fw_vibration — both shared across scenes automatically.
 *
 * Host hooks let a scene react without duplicating the dialog logic:
 *   - canOpen      → return false to veto opening (e.g. game over)
 *   - onBeforeOpen → called right before the dialog fades in (e.g. pause the game)
 *   - onAfterClose → called after the dialog is hidden (e.g. resume the game)
 */
@ccclass('Settings')
export class Settings extends Component {
    @property({ type: Node, tooltip: 'The Dialog panel to show/hide. If unset, uses this component\'s own node.' })
    dialogNode: Node | null = null;
    @property({ type: Node, tooltip: 'Button that opens this dialog (outside the dialog).' })
    menuButton: Node | null = null;
    @property({ type: Node, tooltip: 'Button that closes this dialog.' })
    closeButton: Node | null = null;
    @property({ type: Node, tooltip: 'Optional pre-made "Restart" button. If unset, one is cloned from closeButton when onRestart is provided (Game scene only).' })
    restartButton: Node | null = null;
    @property({ type: Toggle, tooltip: 'Vibration on/off.' })
    vibrToggle: Toggle | null = null;
    @property({ type: Toggle, tooltip: 'SFX on/off.' })
    sfxToggle: Toggle | null = null;
    @property({ type: Toggle, tooltip: 'Music on/off.' })
    musicToggle: Toggle | null = null;
    @property({ type: Toggle, tooltip: 'Fullscreen on/off.' })
    fsToggle: Toggle | null = null;

    /** Host hooks — set by the owning scene (GameManager). Null in MainMenu. */
    canOpen:      (() => boolean) | null = null;
    onBeforeOpen: (() => void)    | null = null;
    onAfterClose: (() => void)    | null = null;
    /** Restart the current game. Set by GameManager (Game scene only); null in MainMenu → no button. */
    onRestart:    (() => void)    | null = null;

    private _op: UIOpacity | null = null;
    private _syncing = false;
    private _restartBtn: Node | null = null;

    /** Shared source of truth for the vibration preference. */
    static get vibrationEnabled(): boolean {
        return SafeStorage.get(LS_VIBRATION) !== '0';
    }

    /** The dialog panel — explicit dialogNode, or this component's own node as fallback. */
    private get _dialog(): Node {
        return this.dialogNode ?? this.node;
    }

    onLoad(): void {
        const dlg = this._dialog;
        this._op = dlg.getComponent(UIOpacity) ?? dlg.addComponent(UIOpacity);
        this._op.opacity = 0;
        dlg.active = false;

        // Ensure a Button exists so CLICK is emitted, then wire it (matches the old GameManager behavior).
        if (this.menuButton) {
            this.menuButton.getComponent(Button) ?? this.menuButton.addComponent(Button);
            this.menuButton.on(Button.EventType.CLICK, this.open, this);
        }
        if (this.closeButton) {
            this.closeButton.getComponent(Button) ?? this.closeButton.addComponent(Button);
            this.closeButton.on(Button.EventType.CLICK, this.close, this);
        }
        if (this.restartButton) {
            this.restartButton.getComponent(Button) ?? this.restartButton.addComponent(Button);
            this.restartButton.on(Button.EventType.CLICK, this._doRestart, this);
        }

        this.vibrToggle?.node.on('toggle',  () => { if (!this._syncing) this._toggleVibration(); }, this);
        this.sfxToggle?.node.on('toggle',   () => { if (!this._syncing) AudioManager.instance.toggleSfx(); }, this);
        this.musicToggle?.node.on('toggle', () => { if (!this._syncing) AudioManager.instance.toggleMusic(); }, this);
        this.fsToggle?.node.on('toggle',    () => { if (!this._syncing) this._toggleFullscreen(); }, this);

        // Fullscreen unsupported (no requestFullscreen) → hide its row.
        if (this.fsToggle && (!sys.isBrowser || !(document.documentElement as any).requestFullscreen)) {
            this.fsToggle.node.active = false;
        }
    }

    open(): void {
        const dlg = this._dialog;
        if (dlg.active) return;
        if (this.canOpen && !this.canOpen()) return;
        this.onBeforeOpen?.();
        dlg.active = true;
        this._ensureRestartButton();
        const restartNode = this.restartButton ?? this._restartBtn;
        if (restartNode) restartNode.active = !!this.onRestart;
        this._syncToggles();
        if (this._op) {
            this._op.opacity = 0;
            tween(this._op).to(0.2, { opacity: 255 }).start();
        }
    }

    close(): void {
        const dlg = this._dialog;
        if (!dlg.active) return;
        if (!this._op) {
            dlg.active = false;
            this.onAfterClose?.();
            return;
        }
        tween(this._op)
            .to(0.2, { opacity: 0 })
            .call(() => {
                dlg.active = false;
                this.onAfterClose?.();
            })
            .start();
    }

    private _doRestart(): void {
        if (!this.onRestart) return;
        const restart = this.onRestart;
        this.close();
        restart();
    }

    /**
     * Build a "Ricomincia" button by cloning closeButton the first time the dialog opens with
     * an onRestart hook set (Game scene only). No-op if a dedicated restartButton was assigned
     * in the editor, or if there's no closeButton to clone, or in MainMenu (onRestart null).
     */
    private _ensureRestartButton(): void {
        if (this._restartBtn || this.restartButton || !this.onRestart || !this.closeButton) return;
        const cb    = this.closeButton;
        const clone = instantiate(cb);
        clone.name  = 'RestartButton';
        clone.setParent(cb.parent);
        // Sit just above the close button (clone shares its parent space, scale and styling).
        const uit = cb.getComponent(UITransform);
        const dy  = (uit ? uit.contentSize.height : 40) * cb.scale.y * 1.4;
        const p   = cb.position;
        clone.setPosition(p.x, p.y + dy, p.z);
        const lbl = clone.getComponentInChildren(Label);
        if (lbl) { lbl.string = 'Restart'; lbl.overflow = Label.Overflow.SHRINK; }
        clone.getComponent(Button) ?? clone.addComponent(Button);
        clone.on(Button.EventType.CLICK, this._doRestart, this);
        this._restartBtn = clone;
    }

    private _syncToggles(): void {
        this._syncing = true;
        if (this.vibrToggle)  this.vibrToggle.isChecked  = Settings.vibrationEnabled;
        if (this.sfxToggle)   this.sfxToggle.isChecked   = !AudioManager.instance.sfxMuted;
        if (this.musicToggle) this.musicToggle.isChecked = !AudioManager.instance.musicMuted;
        if (this.fsToggle)    this.fsToggle.isChecked    = sys.isBrowser && !!document.fullscreenElement;
        this._syncing = false;
    }

    private _toggleVibration(): void {
        const enabled = !Settings.vibrationEnabled;
        SafeStorage.set(LS_VIBRATION, enabled ? '1' : '0');
    }

    private _toggleFullscreen(): void {
        if (!sys.isBrowser) return;
        if (!(document as any).fullscreenElement) {
            (document.documentElement as any).requestFullscreen?.().catch?.(() => {});
        } else {
            (document as any).exitFullscreen?.().catch?.(() => {});
        }
    }
}
