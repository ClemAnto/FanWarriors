import { _decorator, Component, AudioSource, AudioClip, resources, director, Node, sys } from 'cc';
const { ccclass } = _decorator;

/**
 * Paths relative to assets/resources/ — add matching MP3 files to enable each sound.
 * e.g. SFX.MERGE_1 → assets/resources/audio/sfx/merge_1.mp3
 */
export enum SFX {
    LAUNCH             = 'audio/sfx/launch',
    LAND               = 'audio/sfx/land',
    MERGE_1            = 'audio/sfx/merge_1',
    MERGE_2            = 'audio/sfx/merge_2',
    MERGE_3            = 'audio/sfx/merge_3',
    MERGE_4            = 'audio/sfx/merge_4',
    MERGE_5            = 'audio/sfx/merge_5',
    MERGE_6            = 'audio/sfx/merge_6',
    EXPLOSION_1        = 'audio/sfx/explosion_1',
    EXPLOSION_2        = 'audio/sfx/explosion_2',
    EXPLOSION_3        = 'audio/sfx/explosion_3',
    MALUS              = 'audio/sfx/malus',
    TIMER_TICK         = 'audio/sfx/timer_tick',
    DANGER             = 'audio/sfx/danger',
    GAME_OVER          = 'audio/sfx/game_over',
    ROUND_UP           = 'audio/sfx/round_up',
    UI_CLICK           = 'audio/sfx/ui_click',
    BOUNCE             = 'audio/sfx/bounce',
    HIT                = 'audio/sfx/hit',
    DRAW               = 'audio/sfx/draw',
    WIN                = 'audio/sfx/win',
    SPAWN              = 'audio/sfx/spawn',
    MUSIC_MAIN         = 'audio/music/main',
}

const LS_SFX_MUTED   = 'fw_sfx_muted';
const LS_MUSIC_MUTED = 'fw_music_muted';

@ccclass('AudioManager')
export class AudioManager extends Component {
    private static _inst: AudioManager | null = null;

    static get instance(): AudioManager {
        if (!AudioManager._inst || !AudioManager._inst.node?.isValid) {
            const node = new Node('AudioManager');
            director.getScene()!.addChild(node);
            node.addComponent(AudioManager);
        }
        return AudioManager._inst!;
    }

    private _sfxSource!: AudioSource;
    private _musicSource!: AudioSource;
    private _clips = new Map<SFX, AudioClip | null>();

    sfxVolume    = 1.0;
    musicVolume  = 0.6;
    sfxMuted     = false;
    musicMuted   = false;
    private _pauseMuted         = false;
    private _pendingMusicPlay   = false;
    private _musicStarted       = false;
    private _gestureUnlockAdded = false;
    private _preDuckVolume      = 0.6;

    onLoad(): void {
        AudioManager._inst = this;
        this._sfxSource    = this.node.addComponent(AudioSource);
        this._musicSource  = this.node.addComponent(AudioSource);
        this._musicSource.loop = true;
        this.sfxMuted   = sys.localStorage.getItem(LS_SFX_MUTED)   === '1';
        this.musicMuted = sys.localStorage.getItem(LS_MUSIC_MUTED)  === '1';
        this._preloadAll();
    }

    private _preloadAll(): void {
        for (const path of Object.values(SFX) as SFX[]) {
            resources.load(path, AudioClip, (err, clip) => {
                this._clips.set(path, err ? null : clip);
                if (err) { console.warn(`[AudioManager] missing clip: ${path}`); return; }
                if (path === SFX.MUSIC_MAIN && this._pendingMusicPlay) {
                    this._pendingMusicPlay = false;
                    this.playMusic();
                }
            });
        }
    }

    muteForPause(): void {
        this._pauseMuted = true;
        this._musicSource.volume = 0;
    }

    unmuteForPause(): void {
        this._pauseMuted = false;
        if (!this.musicMuted) this._musicSource.volume = this.musicVolume;
    }

    play(sfx: SFX, relVolume = 1): void {
        if (this.sfxMuted || this._pauseMuted) return;
        const clip = this._clips.get(sfx);
        if (!clip) { console.warn(`[Audio] NO CLIP — ${sfx}`); return; }
        this._sfxSource.playOneShot(clip, relVolume * this.sfxVolume);
    }

    playMusic(): void {
        const clip = this._clips.get(SFX.MUSIC_MAIN);
        if (!clip) { this._pendingMusicPlay = true; return; }
        this._pendingMusicPlay   = false;
        this._musicSource.clip   = clip;
        this._musicSource.volume = this.musicMuted ? 0 : this.musicVolume;
        this._musicSource.play();
        this._musicStarted = true;
    }

    ensureMusic(): void {
        if (this._gestureUnlockAdded || !sys.isBrowser) return;
        this._gestureUnlockAdded = true;
        const handler = () => {
            if (!this._musicStarted && !this.musicMuted) this.playMusic();
            document.removeEventListener('pointerdown', handler);
        };
        document.addEventListener('pointerdown', handler);
    }

    stopMusic(): void {
        this._musicSource.stop();
    }

    toggleSfx(): boolean {
        this.sfxMuted = !this.sfxMuted;
        sys.localStorage.setItem(LS_SFX_MUTED, this.sfxMuted ? '1' : '0');
        return this.sfxMuted;
    }

    toggleMusic(): boolean {
        this.musicMuted = !this.musicMuted;
        sys.localStorage.setItem(LS_MUSIC_MUTED, this.musicMuted ? '1' : '0');
        this._musicSource.volume = this.musicMuted ? 0 : this.musicVolume;
        return this.musicMuted;
    }

    setMusicVolume(v: number): void {
        this.musicVolume = Math.max(0, Math.min(1, v));
        if (!this.musicMuted) this._musicSource.volume = this.musicVolume;
    }

    duckMusicTo(volume: number): void {
        this._preDuckVolume = this.musicVolume;
        this.setMusicVolume(volume);
    }

    unduckMusic(): void {
        this.setMusicVolume(this._preDuckVolume);
    }

    setSfxVolume(v: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, v));
    }
}
