# Playgama Playbook — pubblicare un gioco HTML5 su Playgama

> Guida riutilizzabile per qualsiasi progetto (scritta su Cocos Creator 3.8 web-mobile, valida per ogni build HTML5).
> Compilata il 2026-11-08 da: wiki.playgama.com (bridge-sdk/*, game-requirements/*, submitting-a-game, game-self-check, faq/payments-and-statistics), github.com/Playgama/bridge, github.com/Playgama/bridge-cocos-creator.
> Prima applicazione: FunWarriors (`D:\Projects\FunWarriors\PLAYGAMA.md` = istanza di questo playbook).
> ⚠️ Verificare termini e limiti sulla wiki prima di ogni nuovo progetto: cambiano.

---

## 1. Il canale in breve

| Voce | Valore |
|------|--------|
| SDK | **Playgama Bridge**, obbligatorio (nessun opt-out). Una integrazione → ~25 piattaforme |
| Revenue share | Catalogo Playgama + network iframe: **50% fisso**. Siti partner (net revenue mensile): **70%** fino a $1k → $700 + 80% oltre $1k fino a $3k → $2.300 + 90% oltre $3k |
| Soglia pagamento | $100 (bonifico, crypto su richiesta) |
| Review | Catalogo 1–5 gg lavorativi; partner fino a 2 settimane. Primo gioco: il team apre una chat |
| Esclusiva | No |
| Build | ZIP ≤ 300 MB, `index.html` in root, nomi file/cartelle solo latini, picco memoria < 2 GB all'avvio |
| Non coperti | Playgama **non** pubblica su CrazyGames, Poki, VK (TikTok in pausa) → lì si va direttamente |
| Barriera | Bassa rispetto a CG/Poki/GD: buon canale per **raccogliere dati di retention** |

### Partner e requisiti specifici (scegliere opt-out nel form)
| Partner | Requisiti chiave |
|---------|------------------|
| GameSnacks (Google) | ogni file < 10 MiB, totale < 100 MiB, download iniziale < 15 MiB; supporta 9:16 portrait |
| YouTube Playables | build iniziale ≤ 30 MB, ≤ 8000 file, **zero chiamate esterne** (anche analytics), niente barre nere su desktop, no titoli dominati da AI generativa |
| Yandex / Playhop | localizzazione **russa** obbligatoria, > 10 min di contenuto |
| MSN | build < 50 MB, landscape o entrambe le orientazioni |
| Facebook | ≤ 200 MB, ≤ 500 file, almeno 2 tra IAP / leaderboard / multiplayer / social share, load < 3 s, no ad all'avvio |
| Xiaomi | ≤ 100 MB, load < 15 s, supporto Android |
| GameDistribution | no link in uscita, no analytics esterne, tutto self-hosted |
| CrazyGames (diretto) | load ≤ 5 s, 20+ min engagement, 13+, gioco "polished and unique", no barre nere in landscape |

---

## 2. Integrazione Bridge

### Script e config
- CDN: `https://bridge.playgama.com/v2/stable/playgama-bridge.js` — **primo script in `<head>`**, non async, **non iniettato da codice**.
- Alternativa npm (CSP stretta/offline): `npm i @playgama/bridge` → `import bridge from '@playgama/bridge'` (+ `@playgama/bridge/constants`, `@playgama/bridge/global` per le typings).
- `playgama-bridge-config.json` **accanto a `index.html`**. Editor visuale: https://playgama.github.io/bridge-config-editor/
  - `advertisement.minimumDelayBetweenInterstitial` (default 60 s — lasciarlo)
  - `advertisement.interstitial|rewarded|banner`: `disable`, `preloadOnStart`, `placementFallback`, `placements[{id, "<platformId>": "<native id>"}]`
  - `platforms.<id>`: override per piattaforma (es. `game_distribution.gameId`, `msn.gameId`)
  - `leaderboards[{id, isMain}]`, `payments[{id}]`, `achievements[{id}]`, `social{shares,invites,posts}`

### Cocos Creator 3.8
- Ufficiale: npm + script CDN in `build-templates/web-mobile/index.ejs` + config in `build-templates/web-mobile/`; `bridge.engine = 'cocos'`. Esiste anche un'estensione editor (non combinarla con npm).
- **Pattern consigliato multi-portale** (build standalone pulita): NON toccare il build template; uno script `pack-playgama.js` che
  1. imposta il flag portale (es. `PORTAL = 'playgama'`) in un file config,
  2. build headless web-mobile,
  3. ripristina SEMPRE il config (try/finally),
  4. inietta `<script src=".../playgama-bridge.js"></script>` come **primo tag di `<head>`** in `index.html`,
  5. copia `playgama-bridge-config.json` nella build,
  6. inietta un overlay CSS "rotate your device" per l'orientamento non supportato,
  7. zippa il **contenuto** della build con **pwsh 7** (`Compress-Archive` di PowerShell 5.1 scrive `\` nei path → ZIP rifiutati da server Linux).
- L'adapter legge `window.bridge` (già caricato), non carica script.

### API — cheat sheet
| Area | API |
|------|-----|
| Init | `bridge.initialize()` → Promise. **Nessuna chiamata SDK prima**; il gioco non deve iniziare a caricare prima del Bridge. Fuori piattaforma c'è un mock |
| Ready | `bridge.platform.sendMessage('game_ready')` al **primo frame giocabile**, a loading screen sparito |
| Messaggi | `in_game_loading_started/stopped`, `level_started`, `level_completed`, `level_failed`, `level_paused`, `level_resumed` (opz. `{world, level}`) |
| Piattaforma | `bridge.platform.id` (`playgama`, `yandex`, `crazy_games`, `poki`…), `bridge.platform.language` (ISO 639-1), `isExternalLinksAllowed`, `getServerTime()` |
| Audio | `bridge.platform.isAudioEnabled` all'avvio; `bridge.platform.on(bridge.EVENT_NAME.AUDIO_STATE_CHANGED, on => …)` |
| Pausa | `bridge.platform.on(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, paused => …)` — handler unico per ads + tab nascosto: ferma gameplay, timer, audio |
| Interstitial | `isInterstitialSupported`, `showInterstitial(placement?)`, `interstitialState`: `loading/opened/closed/failed`, evento `INTERSTITIAL_STATE_CHANGED`. **Niente timer/contatori nostri**: decide il Bridge |
| Rewarded | `isRewardedSupported`, `showRewarded(placement?)`, stati `loading/opened/closed/rewarded/failed`, evento `REWARDED_STATE_CHANGED`. Premiare **solo su `rewarded`** |
| Banner | `isBannerSupported`, `showBanner('top'|'bottom')`, `hideBanner()`. **Non supportati sul catalogo Playgama** (né Poki/YouTube) |
| Storage | `bridge.storage.get([k…])` → Promise<array, null se mancante>, `set([k…],[v…])`, `delete([k…])`. Backend scelto dal Bridge (cloud dove c'è). **Mai** localStorage/IndexedDB/cookie |
| Leaderboard | `bridge.leaderboards.type`: `not_available/in_game/native/native_popup`; `setScore(id, n)`, `getEntries(id)` (solo in_game), `showNativePopup(id)`. **Non disponibili su playgama/poki/crazy_games** |

---

## 3. Requisiti di pubblicazione (checklist)

### Tecnici
- [ ] Bridge aggiornato + tutti i "Required steps" SDK
- [ ] **Nessuna risorsa/chiamata esterna** (tutto nello ZIP; niente Firebase/backend propri, font remoti, CDN). Unica eccezione: lo script Bridge
- [ ] Nessuna analytics esterna (GA4 ecc.) — usare il modulo analytics del Bridge
- [ ] Link esterni solo se `isExternalLinksAllowed`
- [ ] Video embedded nello ZIP (no YouTube)
- [ ] Mobile: fullscreen, tastiera su focus input, **rotate placeholder**, long-press senza selezione/menu/lente iOS, nessun warning WebGL/engine all'avvio
- [ ] Desktop: mouse e/o tastiera, **Esc non usato**
- [ ] Display: riempire l'area a qualsiasi ratio **incluso 1:1**, niente scrollbar, ogni popup chiudibile, testo leggibile
- [ ] Stabilità: niente crash/freeze su rotazione, minimizzazione, ads, history back; gioco **completabile**; Chrome/Firefox/Opera/Safari/Edge su Win/macOS/Android/iOS

### Ads
- [ ] Solo ads Bridge; **interstitial obbligatori**, solo a pause logiche (fine livello, game over, pausa)
- [ ] Audio + gameplay in pausa durante ads; se l'ad fallisce il gioco prosegue
- [ ] Rewarded: opt-in con testo chiaro, rifiutabile, revive max 1 per tentativo, premio solo se visto fino in fondo
- [ ] Banner solo Bridge (sticky/advanced), niente RTB/fullscreen
- [ ] Pagamenti solo via Bridge payments; niente vincite in denaro / gambling

### UX
- [ ] Progressione o meccaniche/trama, difficoltà crescente, **tutorial/onboarding**
- [ ] Progressi solo via `bridge.storage`, persistenti dopo reload/rotazione/ads
- [ ] Musica + SFX (ogg/mp3, no audio sintetizzato da codice), **bottone mute**
- [ ] Mute di piattaforma rispettato anche dopo reload; audio fermo a pagina nascosta
- [ ] **Inglese** obbligatorio e default; lingua solo da `bridge.platform.language`; tradotte tutte le lingue dichiarate
- [ ] Titolo in-game = titolo della richiesta

### Contenuti
- [ ] Niente contenuti vietati (violenza esplicita, politica, religione, sesso, volgarità…)
- [ ] Niente materiale protetto da copyright né copie di giochi del catalogo
- [ ] AI ammessa, ma non giochi interamente generati senza valore aggiunto; **no emoji come icone**, no look da template
- [ ] Dati utente solo con consenso esplicito; privacy/licenza come testo

### Self-check (motivi di rimando più comuni)
Progressi persi / storage fuori Bridge / letto-scritto troppo spesso · interstitial assenti o temporizzati da noi · audio durante ad o con mute di piattaforma · UI tagliata a qualche ratio (anche quadrata) · Esc o long-press · niente tutorial · leaderboard/shop dove non supportati · lingua non dal Bridge · **caricamento prima del Bridge / `game_ready` mancante o prematuro** · crash · titolo diverso · link/analytics esterni · look AI/emoji · copia di altro gioco.

---

## 4. Roadmap template

### P1 — Integrazione tecnica *(~1 giorno su un progetto con adapter portali già astratto)*
- [ ] Flag portale `'playgama'` + factory dell'adapter
- [ ] Adapter Bridge: `init` → `initialize()`; loading finito → `game_ready`; gameplay start/stop → (opz.) `level_*`; break → `showInterstitial()` con resolve su `closed`/`failed` + timeout di sicurezza; wiring eventi AUDIO/PAUSE
- [ ] Disattivare feature con chiamate esterne (leaderboard online ecc.) o mapparle su `bridge.leaderboards` dove disponibili
- [ ] Storage: layer con **cache in memoria** — preload di tutte le chiavi con una sola `get` al boot (prima di qualsiasi lettura), letture sincrone dalla cache, scritture batch/debounced via `set`. Eliminare ogni accesso diretto a localStorage
- [ ] `playgama-bridge-config.json` (interstitial on, rewarded/banner secondo il gioco)
- [ ] Pack script (vedi §2) + comando npm dedicato

### P2 — QA *(~mezza giornata)*
- [ ] Build locale (mock Bridge) → DevTools Network: zero richieste esterne oltre al Bridge
- [ ] Reload: progressi e mute persistenti; tab nascosto: pausa + silenzio; ad fallito: il gioco prosegue
- [ ] Ratio 1:1, 16:9, mobile portrait/landscape (rotate overlay)
- [ ] Browser matrix (§3)
- [ ] Limiti dei partner scelti (dimensioni, numero file)
- [ ] **Test Game** (QA tool) nel developer portal

### P3 — Asset & submission *(~mezza giornata)*
- [ ] Cover **800×800**, **1080×1920**, **1920×1080** (PNG/JPEG ≤ 10 MB) — servono tutte e tre. Screenshot/icone/video opzionali (dimensioni non documentate)
- [ ] Title (2–4 parole, = in-game), Description e How to play (≥ 100 caratteri ciascuno, inglese), Story opz. (150–900, no link)
- [ ] Form: Game Engine corretto (`cocos-creator` per Cocos, non `js`), Supported Devices, Orientation, Game Features, Languages, Distribution (opt-out partner non idonei), Link se già pubblicato
- [ ] developer.playgama.com → Add Game → Test Game → Submit (o Save as Draft)
- [ ] Opzionale: MCP del developer cabinet → `claude mcp add --transport http playgama-developer-cabinet https://developer.playgama.com/api/mcp` (gestisce metadati/cover; la submit resta manuale)

### P4 — Post-pubblicazione
- [ ] 2–3 settimane di statistiche (giocatori, sessione, retention)
- [ ] Se positive: localizzazione russa (Yandex), rewarded, feature social per Facebook, ecc.

---

## 5. Gotcha
- **Storage asincrono vs codice sincrono**: il preload deve chiudersi prima di qualsiasi lettura (anche audio/settings al boot).
- **Il gioco non deve partire prima del Bridge**: in Cocos l'engine parte da `index.html`; con lo script Bridge sincrono in head + `initialize()` atteso prima del primo scene load si è a posto.
- **`game_ready`** va inviato quando il primo schermo interattivo (anche il menu) è visibile, non a fine caricamento asset nascosti né con loading screen ancora a video.
- **Mute di sistema ≠ mute utente**: tenerli separati, altrimenti un resume del Bridge riattiva l'audio che l'utente aveva spento.
- **Build condivisa**: un pack script che sovrascrive `build/web-mobile` sporca la build standalone → ricostruire prima di deployare altrove.
- **ZIP con pwsh 7**, non PowerShell 5.1.
