# CrazyGames — Requisiti & Piano di risottomissione

> Documento di riferimento per la conformità CrazyGames. Compilato dopo il **rigetto QA del 2026-06-17**.
> Fonti: docs.crazygames.com/requirements/ (intro, technical, gameplay, quality, ads, account-integration, game-covers).
>
> **Diagnosi del rigetto:** la mail era il template generico ("low gameplay quality, broken builds, copyright, integration"). Tecnicamente eravamo conformi (size, SDK, privacy). Il problema quasi certo è **qualità della prima esperienza**: non si "atterra nel gameplay" e l'onboarding è una **storia testuale in ScrollView** prima del gioco — contro due regole esplicite.

---

## 0. Launch tracks

| Track | SDK | Monetizzazione | QA |
|-------|-----|----------------|-----|
| **Basic Launch** | opzionale (solo `gameplayStart`) | no | check visivi base |
| **Full Launch** | obbligatorio (start/stop + moduli) | sì (ad CrazyGames) | review completa |

→ Puntiamo al **Full Launch** (monetizzazione). Quindi valgono TUTTI i requisiti sotto.

---

## 1. Technical

| Requisito | Soglia | Stato FunWarriors |
|-----------|--------|-------------------|
| Initial download | **≤ 50MB** (≤ **20MB** per eligibilità homepage mobile) | ✅ ~5MB |
| Total file size | **≤ 250MB** | ✅ |
| File count | **≤ 1500 file** | ⚠️ da verificare (Cocos genera molti chunk) |
| Initial size measurement | da load start → primo evento `gameplayStart` | ✅ |
| Load time fino al gameplay | **≤ 20s** | ✅ (loading ottimizzato) |
| Path | **solo relativi**, mai assoluti | ✅ (build web-mobile) |
| Fisica | **framerate-independent** (refresh rate diversi) | ✅ già fatto |
| RAM target | gira fluido su **Chromebook 4GB** | ⚠️ testare |
| Browser | Chrome + Edge obbligatori; Safari testato | ⚠️ testare Safari |
| Viewport leggibile | **800×450 (mobile) → 1920×1080 (fullscreen)** | ⚠️ verificare leggibilità HUD a 800×450 |
| Mobile | mouse + tastiera + **touch** se mobile supportato | ✅ touch |
| CSS mobile | `-webkit-user-select: none` per evitare selezione/zoom | ⚠️ verificare nel template HTML |
| Audio iOS | `audioContext.resume()` dentro user gesture (touchend/click) | ⚠️ verificare |
| Sitelock | implementare ma **whitelistare i domini CrazyGames** | ⚠️ verificare |
| **Fullscreen** | ❌ **VIETATO bottone fullscreen custom** (lo fornisce la piattaforma) | ⚠️ **avevamo "fullscreen toggle off" — confermare che NON ci sia un bottone custom** |
| Engine | nessun vincolo; Unity disabilitato di default su iOS | ✅ Cocos HTML5 |

---

## 2. Gameplay (CRITICO — qui il rigetto)

| Requisito | Citazione | Stato FunWarriors |
|-----------|-----------|-------------------|
| **Atterraggio nel gameplay** | *"Games should land new users in gameplay immediately. If this is not feasible, a maximum of **1 click** is allowed."* | 🔴 **NON conforme**: MainMenu → PLAY → Tutorial → START → Game = troppi step prima del gioco |
| Caricamento & stabilità | *"must load quickly and play seamlessly without errors or crashes"* | ✅ |
| Fisica cross-refresh-rate | richiesto esplicitamente | ✅ |
| Leggibilità | 800×450 → 1920×1080 | ⚠️ verificare |
| Controlli | intuitivi su ogni device, tasti non riservati al browser | ✅ (drag&launch) |
| Lingua | **inglese obbligatorio**; rileva lingua via SDK system info | ✅ inglese |
| Età | **PEGI 12** (pubblico 13+) | ✅ powerup rinominati (BloodHood→WildRiver, Genocide→Brotherhood); resta da verificare il tono del Black Dragon |
| Originalità | *"names, assets, and overall content should exhibit originality"* | 🟡 hybrid Suika — rischio "clone-like" first impression |
| **Vietato** | bottone fullscreen custom; cross-promo a giochi/piattaforme esterne; link App Store nel gameplay | ⚠️ verificare |

### 🔴 Azione chiave #1 — Onboarding
La QA guideline richiede:
- *"Provide a simple onboarding phase where new users **land directly** [in gameplay]"*
- *"Implement the onboarding **in gameplay**"*
- *"**Prioritize visuals and limit the use of text**"*
- *"avoid explaining every single feature"*
- deve essere **skippabile**

**Stato attuale (da rivedere):** Tutorial.scene = Label ~260 parole di **storia narrativa** in uno ScrollView (content 600×1402px), tasto START. → È l'opposto di quanto richiesto: testo lungo, fuori dal gameplay, da leggere prima di giocare.

**Da fare:**
1. Boot direttamente sulla scena **Game** (max 1 click PLAY se proprio serve).
2. Eliminare il tutorial-storia come gate. La narrativa, se la si vuole tenere, va resa **opzionale** (es. accessibile da un info-button, non obbligatoria all'avvio).
3. Onboarding **in-game, visivo**: sui primi tiri mostrare overlay/gesture ("drag to aim & release", freccia animata, hint sul primo merge), pochissimo testo, **skippabile** e che sparisce dopo la prima azione.

---

## 3. Quality

**Onboarding** → vedi §2 (azione chiave #1).

**Gameplay quality:**
- obiettivi chiari e raggiungibili ✅ (score / evolvere fino al Dragon)
- facile da imparare e capire — ⚠️ da garantire SENZA il testo narrativo
- risposta immediata agli input ✅
- challenge/strategia/ritmo bilanciati ✅ (curva ammorbidita)
- layout comodo e intuitivo ⚠️ verificare a 800×450
- controlli consistenti ✅
- niente task ripetitivi/noiosi ✅

**Graphics & aesthetics:**
- alta qualità / alta risoluzione ⚠️ (avevamo ridotto i PNG 8.2→5.1MB: verificare che non siano comparsi **artifact di compressione** — esplicitamente vietati)
- risoluzione consistente in tutto il gioco ⚠️
- **niente artefatti di compressione** ⚠️ ricontrollare gli asset compressi
- stile visivo coerente (no mix di estetiche) ✅
- nome e visual coerenti col genere ✅

**Audio:**
- livelli consistenti, non troppo alto/basso ✅
- musica coerente col visual ✅ (taverna menu / main game)

**Originalità & manutenzione:**
- *"not easily confused with another"* — 🟡 rischio Suika
- evitare identificatori comuni se non si possiede l'IP ⚠️ (verificare asset/nomi)
- richiede update/manutenzione frequenti

**Controlli:**
- adattare keybinding al layout tastiera (AZERTY ZQSD) — N/A se solo drag-mouse/touch
- evitare tasti con funzioni browser (Escape, Ctrl+W) ⚠️ verificare

---

## 4. Ads (Full Launch)

| Regola | Dettaglio | Stato |
|--------|-----------|-------|
| Solo ad CrazyGames SDK | no ad esterni | ✅ |
| Funzionano con AdBlock | il gioco deve girare normalmente, mai bloccare/penalizzare | ⚠️ testare con AdBlock |
| Midgame: non interrompe il gameplay | solo a punti logici (transizioni, morte) | ✅ `commercialBreak` a fine partita |
| Midgame frequenza | **max 1 ogni 3 min** (gestito dall'SDK) | ✅ delegato all'SDK |
| Durante l'ad | gioco in pausa, bottoni disabilitati o spinner bloccante | ✅ |
| Mute audio | **quando l'ad PARTE** (`adStarted`), non quando viene richiesto | ✅ già fatto |
| Unmute | solo dopo `adFinished`/`adError` | ⚠️ verificare unmute su adError |
| adError | il gioco continua normalmente | ✅ timeout 10s |
| **No ad prima del primo gameplay** | — | ✅ già fatto |
| Rewarded (se aggiunti) | bottone non ingannevole, reward opzionale chiaro, icona video, alternativa non-ad, no chain | ⚠️ N/A ora (valutare per "extra life"/"double score") |
| Banner (se aggiunti) | solo su schermate ≥5s, mai durante gameplay, non coprono UI | ⚠️ N/A ora |
| Basic launch | ad disabilitati; **rigetto se il gioco freeza senza ad** o ha bottoni ad non funzionanti | ✅ |

---

## 5. Account integration

Obbligatoria **solo** se il gioco ha account in-game con backend custom.

- Noi usiamo **Firebase** per la leaderboard → 🔴 **potenziale conflitto**: CrazyGames vieta login di terze parti (Facebook/Google/email) e richiede, se c'è un account, login automatico CrazyGames + sync su `userId`.
- **Però** la leaderboard attuale è **arcade-style (iniziali, no login)**, non un "account in-game". Probabilmente rientra come Basic, ma:
  - ⚠️ Verificare che Firebase **non triggeri** la regola "no third-party". Lo storage su backend proprio è ammesso se collegato a `userId` CrazyGames — la nostra non ha login affatto.
  - 📌 **Post-onboarding**: migrare alla **leaderboard nativa CrazyGames** (già previsto in roadmap) è la mossa pulita e conforme.
- Se mai si aggiungono account: usare modulo **CrazyGames Data** / `getUserToken()` (JWT), identificare via `userId`, sempre guest-first, richiedere l'utente **a ogni avvio**.

---

## 6. Game covers & marketing assets

### Cover images (3 obbligatorie, stile coerente)
| Formato | Dimensioni |
|---------|-----------|
| Landscape 16:9 | **1920×1080** |
| Portrait 2:3 | **800×1200** |
| Square 1:1 | **800×800** |

Regole: niente bordi · **solo il titolo del gioco** come testo · no icone/store logo · no visual copyright · no immagini sfocate/pixelate · evitare screenshot grezzi · font stilizzato coerente.

### Preview video
- Durata **15–20s max** · **≤ 50MB** · **no audio** · no fast-forward
- Risoluzioni: **landscape 1080p 16:9 (obbligatoria)** + **portrait 1080p 2:3 (obbligatoria)**
- Escludere: transizioni d'apertura, schermate nere, transizioni logo, black bar, cursore default, testo promo, icone app/social

→ Stato: ⚠️ **da produrre** (asset marketing è già un TODO in roadmap).

---

## 7. Checklist risottomissione (priorità)

### 🔴 Bloccanti (la causa probabile del rigetto)
- [x] **Boot diretto nel gameplay** (1 click): PLAY → Game. Scena Tutorial eliminata.
- [x] **Tutorial narrativo rimosso** (niente più gate/storia all'avvio).
- [x] **Onboarding visivo in-game**: hint mano (press→carica→rilascia) + "Merge 2 warriors…", skippabili, una-tantum.

### 🟡 Alta priorità (qualità / first impression)
- [ ] Polish dei **primi 30 secondi**: feel del lancio, juice sui merge, zero attese artificiali.
- [ ] Verificare **artefatti di compressione** sugli asset ridotti (PNG 5.1MB).
- [ ] Leggibilità HUD a **800×450**.
- [x] **Nessun bottone fullscreen custom**: `Settings` nasconde il toggle quando `PORTAL==='crazygames'` ([Settings.ts:95](../assets/scripts/managers/Settings.ts#L95)).
- [x] Rinominati i powerup vs **PEGI 12**: `BloodHood→WildRiver`, `Genocide→Brotherhood` (rename completo classi/file/costanti). Aura e PsychoForce invariati.

### 🟢 Verifiche tecniche
- [x] File count ≤ 1500 → build attuale **168 file**.
- [x] `-webkit-user-select: none` + viewport `user-scalable=no, maximum-scale=1` → presenti nel template Cocos (`build-templates/web-mobile`).
- [x] `audioContext.resume()` su user gesture (iOS): musica avviata sul primo `pointerdown` ([AudioManager.ensureMusic](../assets/scripts/managers/AudioManager.ts#L135)), SFX su drag/lancio → context ripreso nel gesto. Da riconfermare su device iOS reale.
- [x] Sitelock: **non implementato** → nessun conflitto (CrazyGames lo richiede solo *se* presente, con whitelist domini). Sconsigliato aggiungerlo: rischio di rompere l'embed in iframe.
- [ ] Test con AdBlock attivo (gioco gira, unmute su adError).
- [ ] Test Safari + Chromebook 4GB.

### 📦 Asset (per la submission)
- [ ] 3 cover (1920×1080, 800×1200, 800×800), solo titolo.
- [ ] Preview video 15–20s, no audio, landscape + portrait 1080p.

### 📌 Post-onboarding (dopo accettazione)
- [ ] Migrare leaderboard a quella **nativa CrazyGames** (sostituire Firebase).
