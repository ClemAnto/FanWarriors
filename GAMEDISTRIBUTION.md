# GameDistribution — Linee guida sviluppatore & piano submission

> Fonte: <https://static.gamedistribution.com/developer/developers-guidelines.html> (documento 11 pagine, analizzato il 2026-06-18).
> SDK: <https://github.com/GameDistribution/GD-HTML5/wiki> · Developer panel: <https://developer.gamedistribution.com>
> Questo file è la **sorgente di verità** per la submission su GameDistribution (come `CRAZYGAMES.md` lo è per CG).

GD è il portale scelto dopo i rigetti CrazyGames (concept troppo derivativo) e il mancato accesso developer a Poki. **GD NON rigetta per "troppo simile a titoli esistenti"** — anzi §1.4.3 dice esplicitamente che ispirarsi a giochi esistenti è prassi normale; rigettano solo i cloni *copiati/rubati*. Reach: rete di 2.000+ publisher / 4.000+ siti.

---

## 0. Processo di review

- **Submission & Initial Review**: fino a ~1 settimana, valutano compatibilità con SDK e needs dei publisher.
- **Approval for Publication**: se i requisiti sono soddisfatti → "green light".
- **Feedback & Revision**: se serve, mandano feedback azionabile (a differenza della mail generica CG).
- **Ongoing Optimization**: monitoraggio post-pubblicazione.

---

## 1. Game Quality Standards (§1)

| § | Requisito | Stato FunWarriors |
|---|-----------|-------------------|
| 1.1 Replayability | Alta rigiocabilità: level structure/overview, challenges, high scores, character customization | ✅ high score + leaderboard, run arcade infinita |
| 1.2 Sound | BGM + SFX + UI sound; **toggle per sound e music** consigliato | ✅ audio completo + toggle in Settings |
| 1.3.1 In-game graphics | Alta qualità, consistenti, texture ambientali piene | ✅ sprite reali |
| 1.3.2 UI design | Niente UI sovrapposta che ostruisce; icone/font leggibili; bottoni sempre visibili | ✅ HUD MedievalSharp |
| 1.3.3 Gameplay & tutorial | Controlli intuitivi o spiegati con tutorial semplice **prima** del gameplay; elevated UX = smooth con frame-drop limitati | ✅ onboarding in-gameplay (hand hint + merge hint) |
| 1.4 Game content | Niente contenuti politici/religiosi/offensivi, riferimenti espliciti ad alcol/droghe/sesso, violenza eccessiva, discriminazione, linguaggio/meccaniche offensive | ✅ già ripulito PEGI12 (rename powerup Brotherhood/WildRiver) |

### 1.4.1–1.4.3 Copyright / IP / Stolen
- **No nomi copyright nei titoli** ("Super Mario" ecc.) → titolo originale "FunWarriors" ✅
- Devi avere diritto su tutti gli asset; pronti a gestire reclami e rimuovere contenuti.
- Prova di proprietà via form support se contestato (licenze, permessi, registrazioni marchio).
- **Stolen games**: ispirarsi è OK; copiare/rubare no. → il nostro è un ibrido originale, ok.

### 1.5 Deep Fake / AI
- Contenuti AI che rappresentano persone/eventi reali in modo fuorviante: vanno **dichiarati** come artificiali. → N/A per noi.

---

## 2. Advertising (§2) — implementazione ads OBBLIGATORIA

> ⚠️ **Differenza chiave vs CrazyGames/Poki**: GD **richiede un preroll** (CG/Poki lo vietano prima del primo gameplay). Vedi blocker 🔴 #2.

| § | Tipo | Obbligo | Quando | Stato adapter |
|---|------|---------|--------|---------------|
| 2.1.1 | **Preroll** | **Obbligatorio** | Dopo il click su "Play", **prima** che il gioco inizi | 🔴 **DA FARE** (vedi checklist) |
| 2.1.2 | **Midroll** | **Obbligatorio** | Tra le sessioni, su pause/break naturali (mai durante il gameplay) | ✅ `commercialBreak()` → `gdsdk.showAd()` |
| 2.2.1 | Rewarded | Opzionale (consigliato) | Ricompensa per video guardato; richiede **flag REWARDED ADS** attivo nel panel | ⏳ opzionale |
| 2.2.2 | Display (banner) | Opzionale | Top/bottom/lati, mai sopra il gameplay; entrate extra senza impatto | ⏳ opzionale |

### 2.3 Ad placement requirements
- Ads solo su pause naturali, **mai durante il gameplay**.
- Se mostrato di rado → CPC/Mille più alti; troppo spesso → niente entrate (player abbandona).
- Obiettivo: bilanciare la frequenza per retention.

**Modello tecnico GD** (event-driven, già implementato in `GameDistributionPortal.ts`):
- `GD_OPTIONS` globale (gameId + `onEvent`) settato **prima** del caricamento SDK.
- `SDK_GAME_PAUSE` → mute audio (l'ad è partito). `SDK_GAME_START` → resume/unmute.
- `gdsdk.showAd()` → interstitial (Promise). `gdsdk.showAd('rewarded')` → rewarded.
- `SDK_REWARDED_WATCH_COMPLETE` → dare il reward.

---

## 3. Compatibility (§3)

- **3.1 Tech**: Unity WebGL / Javascript / Construct 2&3 ecc. (Cocos ok). **No external hosting dei file di gioco** (eccetto multiplayer reale). No multiplayer senza accordo. → noi: build self-contained nello ZIP ✅, **ma** vedi blocker 🔴 #1 (chiamate Firebase esterne).
- **3.2 Desktop & browser**: Chrome/Firefox/Safari; controlli keyboard o mouse/touch. ✅
- **3.3 Fullscreen & iframe**: niente tagli/malfunzioni; **resize responsive** a ogni risoluzione; consigliato **800×600 (landscape)** come dimensione standard. **Evitare il logo Unity WebGL con opzione fullscreen** (causa problemi di scaling/ad). → il rework resize v0.10.18 aiuta; ma vedi 🟡 orientamento.
- **3.4 Mobile**: non obbligatorio ma fortemente consigliato; **giochi con orientamento preferito devono bloccare l'orientamento o mostrare uno screen "ruota il dispositivo"**. → 🟡 noi siamo **portrait**: serve rotate-screen / lock.

---

## 4. Localization (§4)

- **4.1 Default language = English** (obbligatorio per review/distribuzione). ✅ tutta la UI è in inglese.
- 4.2 Localizzazioni extra aumentano il pickup (DE, FR, ES…). Se localizzi, **lascia scegliere la lingua prima dello start** (non mostrare tutorial in lingua non scelta). ⏳ opzionale.
- 4.3 **No-Text option**: in alternativa, usa icone universali (Play/Pause/Home) per bypassare le restrizioni di lingua. → utile, abbiamo già icone.

---

## 5. Key Information / metadata submission (§5)

- **5.1 Thumbnails (OBBLIGATORIE)**: **512×512**, **512×384**, **200×120**. Alta qualità, contrasto, colori vari, non stirate; testo/logo opzionali ma leggibili, **non devono dominare**. Usate anche da search/splash/siti publisher.
- **5.2 Game title**: distinto, niente duplicati di titoli esistenti.
- **5.3 Description & instructions**: inglese corretto, character names/temi/obiettivi + come si gioca; **descrittori concreti**, non generici ("awesome/amazing" no). Aggiungere keyword SEO (anche il nome del gioco). **200–300 caratteri.**
- **5.4 Genre & tags**: min 1 / max 2 generi, max 5 tag, accurati.
- **5.5 Age groups**: scegliere i gruppi appropriati (es. 'kids friendly' o 'no blood').

---

## 6. Credits, Outgoing Links & Branding (§6)

- **6.1 Outgoing links**: **VIETATI** link esterni che portano traffico fuori (social, e-commerce, survey, affiliate, content sharing, advertisement). Restringono fortemente la reach.
- **6.2 Branding nel gioco**: **permesso** mostrare nome/logo del tuo brand su loading screen, menu principale, o pagina separata. **Vietati**: link cliccabili esterni, riferimenti/referral a social, **dati di contatto**.
- **6.3 App Store / Play Store**: riferimenti **vietati dentro il gioco** (vanno nel tab Backlinks della pagina catalogo).

→ FunWarriors: verificare che **non esistano link esterni in-game** (la leaderboard, eventuali crediti, ecc.). Il tester link/tinyurl è esterno ma sta fuori dal gioco — ok.

---

## 7. Personal Data (§7) — 🔴 BLOCKER PRINCIPALE

> **"Any collection or storing of data from a game is strictly prohibited. In addition, any types of cookies or trackers that are not directly from GD will not be permitted. Login requirements are not permitted unless permission is granted under a separate agreement."**

Tracker/servizi **espressamente vietati**: Google Analytics, Facebook Pixel, DoubleClick, Flurry, Mixpanel, Adobe Analytics, **analytics esterni da SDK di terzi**.

**Impatto su FunWarriors**: la **leaderboard Firebase/Firestore** raccoglie e **memorizza dati** (nome giocatore + punteggio) su un servizio esterno, e carica l'SDK Firebase da CDN esterna. Questo ricade quasi certamente sotto il divieto §7 (collection/storing of data + tracker non-GD) ed è la causa più probabile di un rigetto.
**Anche `SafeStorage`/localStorage** (flag onboarding `fw_hint_*`, best score) è "storing of data" — il localStorage in genere è tollerato per stato di gioco locale, ma è una zona grigia: i cookie/tracker sono il vero bersaglio, lo stato locale del gioco di solito no. La leaderboard remota invece è il rischio concreto.

→ **Decisione necessaria** (vedi checklist 🔴 #1): disabilitare la leaderboard remota sulla build GD (usare `NullLeaderboard`, leaderboard solo locale o nessuna).

---

## 7-bis. Quality Standards (pagina /developers/quality-guidelines/)

Pagina-riassunto (rimanda al Developer Guideline Document completo, già coperto sopra). Tab: Quality Standards / SDK / Device Compatibility / Prohibited Practices / Promo Materials — gli ultimi 4 ricalcano §1-6. Punti del tab **Quality Standards**:
- Qualità & **retention**: hook divertente, contenuto sufficiente per far tornare il giocatore. → ✅
- **Entrata facile nel game loop**: tutorial brevi, controlli intuitivi, obiettivi chiari. → ✅ onboarding in-gameplay.
- **Prodotto completo**, no prototipi, **no redirect ad altri siti**. → ✅ nessun link esterno.
- **Inglese obbligatorio**. → ✅ (Simple English).
- **Design moderno**, UI attraente/comprensibile, **chiarezza cross-culturale**. → ✅ HUD MedievalSharp, meccanica visiva.
- **Visivi armoniosi, no clutter, risoluzione consistente**. → ✅ design 720×1280 + resize rework.

> NB: questa pagina **non cita l'originalità del concept** come criterio (a differenza di CrazyGames) → conferma che il filtro GD è qualità/integrazione, non "troppo derivativo".

## 8. Checklist submission GameDistribution

### 🔴 Bloccanti
1. ✅ **[§7] Leaderboard Firebase disabilitata sulla build GD.** `LeaderboardProvider._create()` ritorna `NullLeaderboard` quando `PORTAL==='gamedistribution'` (gated — CG/Poki/standalone invariati). (localStorage best-score locale: tollerato.)
2. ✅ **[§2.1.1] Preroll implementato.** `GameManager` boot: dopo `portal.init()`, se `PORTAL==='gamedistribution'` esegue `commercialBreak()` prima di `gameplayStart()`. Gated — CG/Poki (che vietano il preroll) invariati.
3. ⏳ **[GD game id]** Sostituire `GAMEDISTRIBUTION_GAME_ID` placeholder in `PortalConfig.ts` con l'UUID del developer panel **dopo la registrazione** (altrimenti gli ad sono no-op).

### 🟡 Alta priorità
4. ✅ **[§3.3/3.4] Orientamento portrait — overlay "ruota il dispositivo".** Iniettato in `index.html` **solo nella build GD** (via `pack-gamedistribution.js → injectRotateOverlay`). Gate CSS `(orientation:landscape) and (hover:none) and (pointer:coarse)` → compare solo su mobile/tablet in landscape, **mai su desktop**. `screen.orientation.lock()` non usato (inaffidabile nell'iframe GD). CG/standalone non toccati.
5. **[§6.1/6.2/6.3] No link esterni / no riferimenti store** in-game. Verificare crediti, leaderboard, qualsiasi bottone.

### 🟢 Verifiche tecniche
6. [§2.1.2] Midroll già implementato (`GameDistributionPortal.commercialBreak`). Verificare che parta su break naturali (end-game), mai durante il gameplay.
7. [§3.1] Build self-contained nello ZIP (no external hosting dei file). ✅ via `npm run pack:gamedistribution`.
8. [§3.3] Resize/fullscreen senza tagli (rework v0.10.18). Smoke test su risoluzioni diverse + AdBlock + Safari.
9. [§1.4] Contenuti PEGI-safe. ✅ già fatto.
10. Trick QA disabilitati su build di portale (gate `PORTAL!=='none'`). ✅ fatto in questa sessione.

### 📦 Asset submission (§5)
11. Thumbnail **512×512**, **512×384**, **200×120** (riusabili dagli asset marketing CG).
12. Title distinto + description **200–300 char** in inglese con keyword + istruzioni.
13. Genere (max 2) + tag (max 5) + age groups.

### ⏳ Opzionali (post-accettazione)
14. Rewarded ads (richiede flag nel panel) — es. continue/revive o bonus.
15. Display/banner ads su top/bottom.
16. Localizzazioni extra (DE/FR/ES) o no-text con icone universali.

---

## 9. Integrazione tecnica — stato in repo (sessione 2026-06-18)

Già implementato sul pattern `PortalAdapter` esistente:
- `assets/scripts/config/PortalConfig.ts` — `PortalKind` esteso con `'gamedistribution'`; costanti `GAMEDISTRIBUTION_SDK_URL`, `GAMEDISTRIBUTION_GAME_ID` (placeholder).
- `assets/scripts/services/GameDistributionPortal.ts` — adapter `PortalSdk` (GD_OPTIONS/onEvent, showAd interstitial, mute su SDK_GAME_PAUSE, no-throw, degrade su AdBlock).
- `assets/scripts/services/PortalProvider.ts` — case `'gamedistribution'`.
- `assets/scripts/managers/GameManager.ts` — gate debug/onboarding-replay passati da `==='crazygames'` a `!=='none'` (debug solo su standalone).
- `scripts/pack-gamedistribution.js` + `npm run pack:gamedistribution` → `dist/funwarriors-gamedistribution.zip`.

Aggiunto in questa sessione (blocker #1, #2):
- `assets/scripts/services/LeaderboardProvider.ts` — `NullLeaderboard` forzato su GD (§7).
- `assets/scripts/managers/GameManager.ts` — preroll gated GD nel boot (§2.1.1).

`gameLoadingFinished`/`gameplayStart`/`gameplayStop` sono no-op su GD (l'SDK non ha quei segnali).

**Tutte le modifiche GD sono gated dal flag `PORTAL`** → `npm run pack:crazygames` resta identico e una build CrazyGames è sempre ricreabile senza rollback.

### ⚠️ Gotcha ZIP — separatori backslash
GD (server Linux) restituisce **"Internal Server Error"** all'upload se lo ZIP ha entry con separatori `\` invece di `/`. Causa: `Compress-Archive` di **Windows PowerShell 5.1** scrive path con backslash (viola lo standard ZIP). **Fix**: gli script `pack-*.js` ora usano **`pwsh` (PowerShell 7)**, il cui `Compress-Archive` scrive `/` corretti. Verifica rapida: `unzip -l <zip> | grep -c '\\'` deve dare `0`.
