# Playgama — Requisiti & Roadmap di pubblicazione

> Compilato il 2026-11-08 dopo i rigetti di CrazyGames ("concept too close to existing titles") e GameDistribution ("not matching partners' audiences").
> Fonti: wiki.playgama.com (bridge-sdk/*, game-requirements/*, submitting-a-game, faq/payments-and-statistics), github.com/Playgama/bridge, github.com/Playgama/bridge-cocos-creator.
> **Versione generica e riutilizzabile:** `PLAYGAMA_PLAYBOOK.md` (in root progetto) (API Bridge, checklist completa, template roadmap). Questo file è l'istanza per FunWarriors.
> Obiettivo: **traffico reale + dati di retention** a costo minimo, per decidere se investire nel rework di differenziazione.

---

## 0. Il canale in breve

| Voce | Valore |
|------|--------|
| SDK | **Playgama Bridge** (obbligatorio, nessun opt-out) — una integrazione, ~25 piattaforme |
| Revenue share | Catalogo Playgama + network iframe: **50% fisso**. Distribuzione su siti partner: 70% fino a $1k/mese → 80% fino a $3k → 90% oltre |
| Soglia pagamento | $100 |
| Review | Catalogo Playgama 1–5 gg lavorativi; partner fino a 2 settimane |
| Esclusiva | No |
| Limite build | ZIP ≤ 300 MB, `index.html` in root, nomi file solo latini |
| NB | Playgama **non** pubblica su CrazyGames, Poki, VK (TikTok in pausa) |

### Partner raggiungibili realisticamente (con la build attuale)
| Partner | Esito | Motivo |
|---------|-------|--------|
| Catalogo Playgama | ✅ | target primario |
| **GameSnacks** (Google) | ✅ probabile | supporta 9:16 portrait; file < 10 MiB, totale < 100 MiB, download iniziale < 15 MiB → verificare |
| YouTube Playables | ✅ possibile | ≤ 30 MB, ≤ 8000 file, **zero chiamate esterne**, niente barre nere su desktop (da verificare) |
| Yandex / Playhop | ⏳ dopo | richiede **localizzazione russa** + > 10 min di contenuto |
| MSN | ❌ | richiede landscape o entrambe le orientazioni |
| Facebook | ❌ | ≤ 500 file + 2 tra IAP/leaderboard/multiplayer/social |

---

## 1. Gap analysis — cosa cambia rispetto alla build CrazyGames

| # | Requisito Playgama | Stato attuale | Azione |
|---|--------------------|---------------|--------|
| G1 | Bridge come **primo script in `<head>`**, non async, **non iniettato da codice** | i nostri adapter caricano l'SDK lazy da codice | il pack script inietta `<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js">` in `index.html`; l'adapter usa `window.bridge` già presente |
| G2 | `playgama-bridge-config.json` accanto a `index.html` | — | file in `scripts/playgama/`, copiato dal pack script nella build |
| G3 | **Nessuna risorsa/chiamata esterna** (1.2.5) | leaderboard Firebase (gstatic + Firestore) | `LEADERBOARD_ALLOWED = false` anche su `playgama` (Ranking + bottone menu nascosti, come GD). Bridge leaderboards **non disponibili** sul catalogo Playgama |
| G4 | Salvataggi **solo via `bridge.storage`** (mai localStorage) | `SafeStorage` + accessi diretti `sys.localStorage` in GameManager (snapshot partita, `fw_last_error`), MockLeaderboard, AudioManager, hint onboarding, settings | layer di storage con cache in memoria: preload di tutte le chiavi `fw_*` con **una** `bridge.storage.get([...])` al boot, letture sincrone dalla cache, scritture cache + `bridge.storage.set` batch/debounced. Portare tutti gli accessi diretti su `SafeStorage` |
| G5 | `isAudioEnabled` all'avvio + evento `AUDIO_STATE_CHANGED` | mute gestito da noi | adapter → AudioManager (mute di sistema separato dal mute utente) |
| G6 | Evento `PAUSE_STATE_CHANGED` (tab nascosto, ads) → pausa gameplay, timer, audio | gestiamo blur/focus da `window` | adapter instrada sullo stesso handler di blur/focus |
| G7 | `sendMessage('game_ready')` al primo frame giocabile | `gameLoadingFinished()` chiamato in Game.onLoad | mappare `gameLoadingFinished` → `game_ready`; verificare che arrivi già quando il **MainMenu** è interattivo (primo frame giocabile = menu) |
| G8 | Interstitial solo a pause logiche, **niente timer/contatori nostri** (Bridge applica 60 s minimi) | `commercialBreak` tra sessioni (restart/fine partita) | `commercialBreak` → `showInterstitial()`, risolve su `closed`/`failed` + timeout; mute su `opened`. **Nessun preroll** (gating GD invariato) |
| G9 | Rotate placeholder per l'orientamento non supportato (mobile) | overlay CSS esiste in `pack-gamedistribution.js` | estrarre `injectRotateOverlay` in modulo condiviso e riusarlo |
| G10 | Riempire l'area a qualsiasi ratio, anche 1:1; niente scrollbar | portrait con spicchio centrale su schermi larghi | verificare in QA tool a 1:1 e 16:9 che lo sfondo copra tutto (niente barre nere) |
| G11 | Esc non usato (desktop) | nessun uso di ESCAPE nel codice | ✅ |
| G12 | Long-press senza selezione/menu/lente iOS | fatto per CrazyGames | ✅ ricontrollare |
| G13 | Musica + SFX (ogg/mp3), **bottone mute** | presenti | ✅ |
| G14 | Lingua: inglese obbligatorio, lingua solo da `bridge.platform.language` | solo inglese | ✅ dichiarare solo EN |
| G15 | Nessuna analytics esterna | nessuna | ✅ |
| G16 | Titolo in-game = titolo nella richiesta | "FunWarriors" | ✅ usare esattamente "FunWarriors" |
| G17 | Tutorial/onboarding, difficoltà crescente | OnboardingHints + rampa specie | ✅ |

---

## 2. Roadmap

### Fase P1 — Integrazione tecnica ✅ fatta 2026-11-08 (v0.10.19, branch `feature/playgama`)
- [x] `PortalConfig.ts`: aggiungere `'playgama'` a `PortalKind`; `LEADERBOARD_ALLOWED = PORTAL !== 'gamedistribution' && PORTAL !== 'playgama'`
- [x] `services/PlaygamaPortal.ts` (implementa `PortalSdk`, no-throw come gli altri):
  - `init()` → `bridge.initialize()` (nessun caricamento script: è già in head)
  - `gameLoadingFinished()` → `bridge.platform.sendMessage('game_ready')` (una volta)
  - `gameplayStart/Stop()` → dedupe; opzionale `level_started` / `level_failed` / `level_completed`
  - `commercialBreak(onAdStart)` → `showInterstitial()` + ascolto `INTERSTITIAL_STATE_CHANGED` (`opened` → onAdStart, `closed`/`failed` → resolve) + `BREAK_TIMEOUT_MS`
  - wiring `AUDIO_STATE_CHANGED` / `PAUSE_STATE_CHANGED` / `isAudioEnabled`
- [x] `PortalProvider`: case `'playgama'`
- [x] Estendere `PortalSdk` con hook opzionali per pausa/audio di piattaforma (no-op negli altri adapter)
- [x] **Storage**: `SafeStorage` diventa backend-aware (localStorage di default, `bridge.storage` + cache su Playgama); preload al boot **prima** del caricamento del MainMenu; migrare gli accessi diretti a `sys.localStorage` (GameManager, MockLeaderboard, AudioManager, OnboardingHints, Settings)
- [x] `scripts/playgama/playgama-bridge-config.json`: interstitial abilitato, `minimumDelayBetweenInterstitial` lasciato al default, rewarded e banner disabilitati
- [x] `scripts/pack-playgama.js` (clone di pack-gamedistribution): flip PORTAL → build headless → restore → inject script Bridge **come primo tag in head** + rotate overlay → copia config json → ZIP con pwsh 7 → `dist/funwarriors-playgama.zip`
- [x] `package.json`: `"pack:playgama"`
- [x] Bump versione (package.json + `VERSION` in GameManager)

### Fase P2 — QA *(~mezza giornata)*
- [x] Test locale della build Playgama (mock Bridge): Bridge prima del motore, `game_ready` dopo il loading screen, unica richiesta esterna = script Bridge, save `fw_save` persistente dopo reload, nessuna scrittura diretta in localStorage, classifica nascosta, layout OK a 1:1 e stretto
- [x] **QA tool** Playgama (build servita da localhost:8099): Bridge v2.4.1 init, storage get, `game_ready`, download iniziale 6 MB "optimal"; toggle audio/pausa piattaforma → eventi ricevuti + flush storage su pausa. ⚠️ "Total loading time 18 s" da verificare (probabile overhead del tool)
- [ ] Verifiche: nessuna richiesta di rete esterna oltre al Bridge (DevTools Network), progressi persistenti dopo reload, mute di piattaforma rispettato dopo reload, pausa su tab nascosto, interstitial a fine partita senza freeze, gioco che prosegue se l'ad fallisce
- [ ] Display: ratio 1:1, 16:9 desktop, mobile portrait; rotate overlay in landscape mobile
- [ ] Browser: Chrome, Firefox, Safari (macOS + iOS), Edge, Android Chrome
- [ ] Controllo dimensione/numero file contro i limiti GameSnacks (file < 10 MiB, download iniziale < 15 MiB)

### Fase P3 — Asset & submission *(~mezza giornata, condivisa con gli asset già pianificati per CG)*
- [x] Cover: **800×800**, **1080×1920**, **1920×1080** in `submission/playgama/` (generate da `scripts/gen-playgama-covers.js`)
- [ ] Description (≥ 100 caratteri) e How to play (≥ 100 caratteri), in inglese. Spingere sul lato **lancio/curling** (mira, carica, carambole), non sul "merge" → differenziazione
- [ ] Story opzionale (150–900 caratteri, niente link)
- [ ] Form: Engine = `cocos-creator`, Devices = iOS/Android/Desktop, Orientation = **portrait**, Languages = English
- [ ] Distribuzione: lasciare attivi i partner (opt-out di MSN/Facebook se proposti, tanto non qualificano)
- [x] Account + scheda creata (2026-11-08): titolo, engine cocos-creator, agent Claude Code, categoria Merge, ZIP v0.10.19, device tutti, portrait, EN, 3 cover — salvata in bozza
- [x] **Sandbox LIVE (2026-11-08)** con build v0.10.20 → https://playgama.ai/play/ivo67cyadktzzf. Orientamento dichiarato **portrait + landscape** (il gioco supporta entrambi → niente rotate overlay nella build Playgama). Link "published elsewhere" = GitHub Pages.
- [ ] **Target Sandbox per accedere alla Review** (categoria Merge): **100 qualifying plays**, **avg play time 9:00**, **0.30 ad shows per play**. Leve: boost gratuiti nel portale. **Usati (2026-11-08):** Starter (~50 plays, fino al 9/11) + Share #1 = post Facebook pubblico dell'utente (link incollato in "Share your game" → Claim). Resta Share #2 (post diverso, es. Instagram) + Invite. Il post deve essere PUBBLICO (su FB: audience "Tutti" solo per quel post, togliere "Imposta come pubblico predefinito").
- [ ] Send for Review quando i target sono raggiunti
- ⚠️ Il portale tiene le build **per nome file**: ricaricare lo stesso nome NON sostituisce la build → `pack:playgama` ora produce `funwarriors-playgama-v<versione>.zip`; poi "Update in Sandbox" scegliendo la build nuova.
- ✅ Interstitial verificato nel QA tool: loading → opened → pausa+mute+flush storage → closed → resume → menu.

### Fase P4 — Dopo la pubblicazione *(misura, poi decide)*
- [ ] Monitorare per 2–3 settimane: giocatori, durata sessione, retention D1 (statistiche del portale)
- [ ] Se i numeri sono buoni:
  - [ ] localizzazione **russa** → Yandex/Playhop (serve > 10 min di contenuto)
  - [ ] rewarded "revive" (una volta per partita, opt-in, ricompensa solo su stato `rewarded`)
  - [ ] rework di differenziazione e nuovo tentativo CrazyGames come gioco "nuovo"

---

## 2b. Classifica Playgama (2026-11-09, v0.10.23)
- Bridge leaderboards **non** esistono nativamente su `playgama` → si usano le **SaaS leaderboards**: classifica `top_score` creata nel portale (Bridge SaaS → Leaderboards, Numeric, Higher is better) + blocco `saas` in `scripts/playgama/playgama-bridge-config.json` (`publicToken` = token del gioco, `platforms: ["playgama","qa_tool"]`) → `bridge.leaderboards.type === 'in_game'`.
- `services/PlaygamaLeaderboard.ts`: `setScore`/`getEntries`; il **nome viene dalla piattaforma** (`providesNames` → niente NameEntry), round/versione non salvati (UI mostra "–"), si inviano solo i nuovi record personali (`fw_lb_submitted_best`), nomi troncati a 8 caratteri (oltre coprivano il numero di posizione).
- Bottone Ranking e routing fine partita solo se `type === 'in_game'`; su piattaforme `native` si invia solo il punteggio.
- Verificato: QA tool (game over 340 → submit → riga evidenziata) e sandbox live (bottone visibile, board vuota). Form portale: Game Features → **Leaderboards** spuntato.

## 3. Self-check moderazione (motivi di rimando più comuni, da wiki)
- [ ] Progressi persi dopo reload / salvati fuori da `bridge.storage` / storage letto-scritto troppo spesso
- [ ] Interstitial assenti o temporizzati da noi invece che dal Bridge
- [ ] Audio che continua durante ad, a pagina minimizzata o con mute di piattaforma
- [ ] UI tagliata o sovrapposta a qualche ratio, **incluso finestra quadrata**
- [ ] Uso di Esc, long-press che seleziona testo
- [ ] Niente tutorial / poca progressione
- [ ] Leaderboard o shop mostrati dove la piattaforma non li supporta → Ranking OFF
- [ ] Lingua non presa dal Bridge / inglese non default
- [ ] **Gioco che inizia a caricare prima del Bridge**, `game_ready` non inviato o inviato con loading screen ancora visibile
- [ ] Crash/freeze, gioco non completabile
- [ ] Titolo in-game ≠ titolo della richiesta
- [ ] Link esterni / analytics esterne (verificato: nessun `openURL`/link nei manager)
- [ ] Look da template generato / emoji come icone
- [ ] Copia di un altro gioco del catalogo (4.2) → nella descrizione insistere sulla meccanica di lancio

## 4. Gotcha previsti
- **Storage asincrono**: `bridge.storage.get` è una Promise, il nostro codice legge in modo sincrono → il preload deve completarsi prima di qualunque lettura (MainMenu / AudioManager al boot). Fuori piattaforma il mock deve comportarsi come localStorage.
- **Build condivisa**: come `pack:crazygames`, anche `pack:playgama` sovrascrive `build/web-mobile` → rifare `npm run build` prima di un `npm run deploy` su GitHub Pages.
- **SDK in head vs build template**: non toccare `build-templates/web-mobile/index.html` (servirebbe anche alla build standalone); l'iniezione la fa solo il pack script.
- **ZIP**: usare pwsh 7 (separatori `/`), come già scoperto per GD.
