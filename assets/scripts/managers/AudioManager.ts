import { _decorator, Component, AudioSource, AudioClip, resources, director, Node, sys } from 'cc';
import { SafeStorage } from '../utils/SafeStorage';
import { PortalProvider } from '../services/PortalProvider';
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
    // Power tokens — PLACEHOLDERS on existing clips until the chosen files land (audio/listen.html)
    TOKEN_APPEAR       = 'audio/sfx/token_appear',
    TOKEN_VANISH       = 'audio/sfx/token_vanish',
    TOKEN_COLLECT      = 'audio/sfx/token_collect',
    POWER_READY        = 'audio/sfx/power_ready',
    // Powerup effects (2026-11-19): picked from audio/library (alternatives in audio/listen.html)
    THUNDER_STRIKE     = 'audio/sfx/thunder_strike',
    LIGHTNING_ZAP      = 'audio/sfx/lightning_zap',
    AURA_ZAP           = 'audio/sfx/aura_zap',
    ENERGY_ABSORB      = 'audio/sfx/energy_absorb',
    IMPLODE            = 'audio/sfx/implode',
    PSYCHO_FORCE       = 'audio/sfx/psycho_force',
    SHRINK_EMBERS      = 'audio/sfx/shrink_embers',
    MUSIC_MAIN         = 'audio/music/main',
    MUSIC_MENU         = 'audio/music/menu',
}

/**
 * Anti-overlap (2026-11-19): power effects fire the same sound in bursts (8 bolts, a river of zaps, a
 * stream of energy spheres, a pile of bounces). Each sound gets a minimum gap between two starts and a
 * cap on copies still ringing; on top of that, at most MAX_VOICES one-shots ring at once. Sounds that
 * carry game information (ALWAYS) skip every limit.
 */
const MAX_VOICES       = 7;    // one-shots ringing at once (the music is apart)
const DEFAULT_GAP_MS   = 45;   // the same sound never restarts sooner than this
const DEFAULT_MAX_COPIES = 3;  // copies of the same sound ringing at once
const SFX_LIMITS: Partial<Record<SFX, { gap?: number; max?: number }>> = {
    [SFX.HIT]:            { gap: 70,  max: 3 },
    [SFX.BOUNCE]:         { gap: 70,  max: 3 },
    [SFX.MERGE_1]:        { gap: 60,  max: 2 },
    [SFX.MERGE_2]:        { gap: 60,  max: 2 },
    [SFX.MERGE_3]:        { gap: 60,  max: 2 },
    [SFX.MERGE_4]:        { gap: 60,  max: 2 },
    [SFX.EXPLOSION_1]:    { gap: 150, max: 2 },
    [SFX.EXPLOSION_2]:    { gap: 150, max: 2 },
    [SFX.EXPLOSION_3]:    { gap: 150, max: 2 },
    [SFX.TOKEN_APPEAR]:   { gap: 150, max: 1 },
    [SFX.TOKEN_VANISH]:   { gap: 150, max: 1 },
    [SFX.THUNDER_STRIKE]: { gap: 100, max: 3 },
    [SFX.LIGHTNING_ZAP]:  { gap: 120, max: 2 },
    [SFX.AURA_ZAP]:       { gap: 90,  max: 2 },
    [SFX.ENERGY_ABSORB]:  { gap: 110, max: 2 },
    [SFX.IMPLODE]:        { gap: 100, max: 2 },
    [SFX.PSYCHO_FORCE]:   { gap: 400, max: 1 },
    [SFX.SHRINK_EMBERS]:  { gap: 400, max: 1 },
};
/** Never dropped: they tell the player something happened (and are rare by nature). */
const ALWAYS = new Set<SFX>([SFX.LAUNCH, SFX.MALUS, SFX.GAME_OVER, SFX.WIN, SFX.ROUND_UP, SFX.POWER_READY, SFX.TOKEN_COLLECT, SFX.UI_CLICK, SFX.DANGER, SFX.TIMER_TICK]);

const LS_SFX_MUTED   = 'fw_sfx_muted';
const LS_MUSIC_MUTED = 'fw_music_muted';

@ccclass('AudioManager')
export class AudioManager extends Component {
    private static _inst: AudioManager | null = null;

    static get instance(): AudioManager {
        if (!AudioManager._inst || !AudioManager._inst.node?.isValid) {
            const node = new Node('AudioManager');
            director.getScene()!.addChild(node);
            director.addPersistRootNode(node);  // survive scene changes → continuous music + cached clips
            node.addComponent(AudioManager);
        }
        return AudioManager._inst!;
    }

    private _sfxSource!: AudioSource;
    private _musicSource!: AudioSource;
    private _clips = new Map<SFX, AudioClip | null>();
    /** One-shots still ringing (end time, ms) and the last start of each sound: the anti-overlap limits. */
    private _voices: { sfx: SFX; end: number }[] = [];
    private _lastStart = new Map<SFX, number>();

    sfxVolume    = 1.0;
    musicVolume  = 0.6;
    sfxMuted     = false;
    musicMuted   = false;
    private _pauseMuted         = false;
    /** Platform-level mute (Playgama Bridge: platform audio off, or platform pause/ad). Never persisted —
     *  kept separate from the user's sfx/music mute so a platform resume never re-enables what the user muted. */
    private _platformAudioOff   = false;
    private _platformPaused     = false;
    private _currentMusic: SFX  = SFX.MUSIC_MAIN;  // track currently requested/playing
    private _musicLoadingTrack: SFX | null = null;
    private _musicStarted       = false;
    private _gestureUnlockAdded = false;
    private _preDuckVolume      = 0.6;

    onLoad(): void {
        AudioManager._inst = this;
        this._sfxSource    = this.node.addComponent(AudioSource);
        this._musicSource  = this.node.addComponent(AudioSource);
        this._musicSource.loop = true;
        this.sfxMuted   = SafeStorage.get(LS_SFX_MUTED)   === '1';
        this.musicMuted = SafeStorage.get(LS_MUSIC_MUTED) === '1';
        // No audio download before the first playable frame (Playgama: initial download < 5 MB): the scene
        // that becomes playable calls startLoading(); the timer is a safety net for any other entry.
        this.scheduleOnce(() => this.startLoading(), 8);
        // Platform audio/pause signals (only Playgama implements this; no-op elsewhere).
        PortalProvider.get().onPlatformState?.({
            audio: (enabled) => { this._platformAudioOff = !enabled; this._applyMusicVolume(); },
            pause: (paused)  => { this._platformPaused = paused;    this._applyMusicVolume(); },
        });
    }

    private get _platformSilenced(): boolean {
        return this._platformAudioOff || this._platformPaused;
    }

    /** Music volume honouring user mute, pause mute and platform mute. */
    private _effectiveMusicVolume(): number {
        return (this.musicMuted || this._pauseMuted || this._platformSilenced) ? 0 : this.musicVolume;
    }

    private _applyMusicVolume(): void {
        if (this._musicSource) this._musicSource.volume = this._effectiveMusicVolume();
    }

    private _loadsStarted = false;

    /**
     * Start downloading the sounds (and the requested music): called once the game is playable
     * (Game scene ready / MainMenu shown), so audio never competes with the first-frame download.
     * Sounds played before then are simply skipped; a music request is kept and starts when loaded.
     */
    startLoading(): void {
        if (this._loadsStarted) return;
        this._loadsStarted = true;
        this._preloadAll();
        if (this._musicWanted) this.playMusic(this._currentMusic);
    }

    private _musicWanted = false;

    private _preloadAll(): void {
        // SFX only. Music tracks (the biggest assets) are NOT preloaded — they'd compete with the
        // Game-scene preload and aren't essential; each is lazy-loaded on its first playMusic() call
        // (menu.mp3 in the menu, main.mp3 only when the Game starts).
        for (const path of Object.values(SFX) as SFX[]) {
            if (path.startsWith('audio/music/')) continue;
            resources.load(path, AudioClip, (err, clip) => {
                this._clips.set(path, err ? null : clip);
                if (err) console.warn(`[AudioManager] missing clip: ${path}`);
            });
        }
    }

    /** Lazy-load a music track on demand; play it once loaded if it's still the requested track. */
    private _loadMusic(track: SFX): void {
        if (this._musicLoadingTrack === track || this._clips.get(track)) return;
        this._musicLoadingTrack = track;
        resources.load(track, AudioClip, (err, clip) => {
            if (this._musicLoadingTrack === track) this._musicLoadingTrack = null;
            this._clips.set(track, err ? null : clip);
            if (err) { console.warn('[AudioManager] music load failed:', track); return; }
            if (this._currentMusic === track) this.playMusic(track);
        });
    }

    muteForPause(): void {
        this._pauseMuted = true;
        this._musicSource.volume = 0;
    }

    unmuteForPause(): void {
        this._pauseMuted = false;
        this._applyMusicVolume();
    }

    /** Play a sound effect. False when it was not played (muted, missing, or dropped not to pile up). */
    play(sfx: SFX, relVolume = 1): boolean {
        if (this.sfxMuted || this._pauseMuted || this._platformSilenced) return false;
        const clip = this._clips.get(sfx);
        // undefined = not downloaded yet (startLoading not called / still loading): skipped silently.
        if (!clip) { if (clip === null) console.warn(`[Audio] NO CLIP — ${sfx}`); return false; }
        const now = performance.now();
        if (this._voices.length > 0) this._voices = this._voices.filter(v => v.end > now);
        if (!ALWAYS.has(sfx)) {
            const lim = SFX_LIMITS[sfx];
            if (now - (this._lastStart.get(sfx) ?? -Infinity) < (lim?.gap ?? DEFAULT_GAP_MS)) return false;
            let copies = 0;
            for (const v of this._voices) if (v.sfx === sfx) copies++;
            if (copies >= (lim?.max ?? DEFAULT_MAX_COPIES)) return false;
            if (this._voices.length >= MAX_VOICES) return false;
        }
        this._lastStart.set(sfx, now);
        const dur = clip.getDuration();
        this._voices.push({ sfx, end: now + (dur > 0 ? dur : 0.5) * 1000 });
        this._sfxSource.playOneShot(clip, relVolume * this.sfxVolume);
        return true;
    }

    /** Play a music track (default main). Lazy-loads it if needed; switching tracks interrupts the
     *  current one immediately (e.g. the menu loop stops when entering the game). No restart if the
     *  exact same clip is already playing. */
    playMusic(track: SFX = SFX.MUSIC_MAIN): void {
        this._currentMusic = track;
        const clip = this._clips.get(track);
        if (clip && this._musicSource.clip === clip && this._musicSource.playing) return; // same → keep
        this._musicSource.stop();  // interrupt whatever is playing (menu loop) before switching
        this._musicWanted = true;
        if (!this._loadsStarted) return;                  // before the first playable frame: started by startLoading()
        if (!clip) { this._loadMusic(track); return; }  // not loaded yet → play in the load callback
        this._musicSource.clip   = clip;
        this._musicSource.volume = this._effectiveMusicVolume();
        this._musicSource.play();
        this._musicStarted = true;
    }

    ensureMusic(): void {
        if (this._gestureUnlockAdded || !sys.isBrowser) return;
        this._gestureUnlockAdded = true;
        const handler = () => {
            if (!this._musicStarted && !this.musicMuted) this.playMusic(this._currentMusic);
            document.removeEventListener('pointerdown', handler);
        };
        document.addEventListener('pointerdown', handler);
    }

    stopMusic(): void {
        this._musicSource.stop();
    }

    toggleSfx(): boolean {
        this.sfxMuted = !this.sfxMuted;
        SafeStorage.set(LS_SFX_MUTED, this.sfxMuted ? '1' : '0');
        return this.sfxMuted;
    }

    toggleMusic(): boolean {
        this.musicMuted = !this.musicMuted;
        SafeStorage.set(LS_MUSIC_MUTED, this.musicMuted ? '1' : '0');
        this._applyMusicVolume();
        return this.musicMuted;
    }

    setMusicVolume(v: number): void {
        this.musicVolume = Math.max(0, Math.min(1, v));
        this._applyMusicVolume();
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
