# Roadmap Tecnica — FunWarriors

> Roadmap di sviluppo in Cocos Creator (TypeScript). Stima realistica part-time. Versione 0.5 — aggiornata 2026-05-09.

## Stack tecnologico

- **Engine**: Cocos Creator 3.8.8
- **Linguaggio**: TypeScript (strict mode)
- **Fisica**: Box2D (modulo built-in di Cocos)
- **Build target**: HTML5 (Web Mobile + Desktop)
- **SDK portale**: Poki SDK (o CrazyGames SDK) — integrazione finale
- **Version control**: Git (repo privato GitHub/GitLab)
- **Asset pipeline**: PNG sprite + Aseprite/Photoshop, audio in OGG/MP3

## Stima totale realistica

- **Inizio**: 7 maggio 2026
- **10-15h/settimana** part-time

| Fase | Durata | Periodo | Milestone |
|------|--------|---------|-----------|
| 1. Setup + prototipo greybox | 2 settimane | 7–20 mag | Fisica + lancio fionda + merge funzionanti |
| 2. Core gameplay completo | 2 settimane | 21 mag–3 giu | Loop completo greybox |
| 3. Asset + UI definitiva | 3 settimane | 4–24 giu | Look finale |
| 4. Polish + audio + balancing | 2 settimane | 25 giu–8 lug | Esperienza rifinita |
| 5. Integrazione SDK + submission | 1 settimana | 9–15 lug | Build pubblicabile |

---

## FASE 1 — Setup e prototipo greybox *(7–20 mag 2026)* ✅ chiusa 2026-05-09

**Obiettivo**: prototipo cliccabile con lancio a fionda, rimbalzi corretti e merge funzionante.

### Settimana 1: Setup e fisica base *(7–13 mag)*

**Giorno 1-2: Setup progetto** *(7–8 mag)*
- [x] Installare Cocos Creator 3.8.8
- [x] Creare nuovo progetto "FunWarriors"
- [x] Configurare TypeScript strict mode
- [x] Setup Git, .gitignore standard Cocos
- [x] Configurare risoluzione di riferimento (720×1280 portrait, FIXED_HEIGHT — impostato via codice)
- [x] Importare sprite placeholder (cerchi colorati con numeri)

**Giorno 3-4: Pista e fisica** *(9–10 mag)*
- [x] Creare scena principale "GameScene"
- [x] Configurare PhysicsSystem2D (Box2D), **gravità globale = 0** (nessuna forza gravitazionale)
- [x] Creare "Track" node con SpriteComponent (rettangolo grigio greybox)
- [x] Aggiungere muri statici con Collider2D BoxCollider:
  - Pareti laterali: restitution ~0.8, friction bassa (rimbalzo consistente)
  - Fondo pista (top): restitution ~0.1, friction alta (smorzamento forte)
  - Bottom invisibile: blocca il rientro sotto la linea di lancio
- [x] Test: una palla lanciata rimbalza elasticamente sulle pareti laterali e si ferma sul fondo

**Giorno 5-7: Meccanica di lancio a fionda** *(11–13 mag)*
- [x] Creare prefab "Warrior": SpriteComponent (cerchio + numero), CircleCollider2D, RigidBody2D
  - Damping lineare e angolare alti (personaggi stabili, assorbono urti)
  - Friction ~0.05 (superficie scivolosa come bowling)
- [x] Spawn position: bottom-center
- [x] Input system (mouse e touch equivalenti):
  - Press sul personaggio → inizio drag
  - Drag verso il basso / diagonale-basso → visualizza corda elastica
  - Direzione lancio = opposto al vettore drag (drag giù → lancia su, drag sinistra → lancia destra)
  - Lunghezza drag = forza (cappata a distanza massima)
  - Rilascio sotto soglia minima → annulla lancio
  - Rilascio sopra soglia minima → `applyLinearImpulse` nella direzione opposta al drag
- [x] Calibrare soglia minima: deve garantire che qualsiasi lancio valido superi la linea di game over
- [x] Calibrare soglia massima: la corda smette di allungarsi al cap visivo
- [x] Visualizzare corda elastica (Graphics drawn proceduralmente) e indicatore forza
- [x] Test: il personaggio viene lanciato nella direzione opposta al drag, rimbalza sulle pareti, si ferma per attrito

### Settimana 2: Merge, magnetismo, game over *(14–20 mag)*

**Giorno 8-10: Sistema di identificazione e merge** *(14–16 mag)*
- [x] Aggiungere a Warrior: `type: number` (0–6) e `level: number` (1–7)
- [x] Color-code temporaneo: ogni type un colore, ogni level un numero sul cerchio
- [x] Collision detection con stesso type+level (callback `onBeginContact`)
- [x] Timer contatto: >300ms → trigger merge
- [x] Funzione `mergeWarriors(a, b)`:
  - Calcola posizione media
  - Distruggi a e b
  - Spawn nuovo Warrior con stesso type, level+1, alla posizione media
  - Effetto visivo placeholder (flash bianco)

**Giorno 11-12: Magnetismo e game over** *(17–18 mag)*
- [x] Ogni frame: per ogni Warrior, trovare Warrior compatibili (stessa specie E stesso livello) nel raggio ~2x diametro
- [x] Applicare piccola forza di attrazione verso il più vicino — percepibile ma non teletrasportante
- [x] Linea game over visibile (Graphics rosso) a metà pista
- [x] Logica attraversamento linea:
  - Warrior lanciato che supera **completamente** la linea **dal basso verso l'alto** → in gioco, turno OK
  - Warrior che **non** supera la linea → **game over**
  - Warrior in gioco che riattraversa **dall'alto verso il basso** → **esplode** con malus (non game over)
- [x] Schermata game over placeholder: punteggio e "Riprova"

**Giorno 13-14: Timer di lancio + spawn loop** *(19–20 mag)*
- [x] Timer di lancio (Round 1 = 15s): conto alla rovescia visibile
- [x] Allo scadere: lancio automatico nella direzione corrente del drag con forza media
- [x] Queue di prossimi warrior: array `{type, level}` casuali
- [x] Preview "NEXT" (testo placeholder)
- [x] Dopo ogni lancio, spawn nuovo warrior dalla queue
- [x] Game state: `idle / aiming / inflight / settling`
- [x] Refactor in classi pulite: `GameManager`, `Warrior`, `InputController`, `SpawnManager`
- [x] **Milestone Fase 1** *(chiusa 2026-05-09)*: prototipo giocabile 30s+, merge funzionante, game over attivo

---

## FASE 2 — Core gameplay completo *(21 mag–3 giu 2026)* ← **sei qui**

**Obiettivo**: tutto il loop di gioco giocabile in greybox — punteggio formula completa, round, game over, malus, esplosioni livelli speciali.

### Settimana 3: Punteggio e round *(21–27 mag)*

**Giorno 15-17: Sistema di punteggio** *(21–23 mag)*
- [x] Formula punteggio: `10 × 2^(livello_creatura - 1) × round_corrente × 2^(merge_nello_stesso_lancio - 1)`
- [x] Tracciare `mergesThisLaunch` (reset ad ogni nuovo lancio)
- [x] Floating score placeholder: testo "+N" che sale dal punto di merge
- [x] Malus: penalità `10 × 2^(livello_creatura - 1) × round_corrente` quando un warrior riattraversa la linea
- [x] Malus: flash rosso overlay (~0.3s) come unico feedback visivo negativo
- [x] Punteggio non scende sotto zero

**Giorno 18-19: Progressione round** *(24–25 mag)*
- [x] Aggiungere `currentRound` al GameManager
- [x] Contatore `totalMerges` e tabella soglie merge per avanzare di round (ROUND_THRESHOLDS: 10/25/45/70/100/135)
- [x] All'avanzare del round: aggiungere specie alla pool, aggiornare regole spawn, ridurre timer di lancio
- [x] Timer di lancio scala con il round (`max(3, 15 - (round-1)*2)`)
- [x] Notifica visiva "ROUND UP" con tween scala + pausa `roundUpPause`

**Giorno 20-21: Game over e restart** *(26–27 mag)*
- [x] Verifica frame-by-frame attraversamento linea (direzione + completezza) — usa bordo superiore (`y + radius`)
- [x] Rimbalzo oltre linea → **game over immediato** (decisione design: rimosso malus a punteggio)
- [x] Flash rosso prima del game over
- [x] Restart con `director.loadScene(sceneName)` — sceneName catturato in `start()`
- [x] Salvataggio best score in localStorage

### Settimana 4: Esplosioni livelli speciali e refinement *(28 mag–3 giu)*

**Giorno 22-23: Esplosioni Campione / Eroe / Leggenda** *(28–29 mag)*
- [x] Quando merge crea warrior di livello 5 (Campione): esplosione placeholder + bonus +500pt
- [x] Quando merge crea warrior di livello 6 (Eroe): esplosione placeholder + bonus +1000pt
- [x] Quando merge crea warrior di livello 7 (Leggenda): esplosione placeholder + bonus +2000pt
- [x] Ogni esplosione: VFX placeholder (2 cerchi che crescono e svaniscono), warrior distrutto

**Giorno 24-25: Tutorial e logica spawn avanzata** *(30–31 mag)*
- [x] Logica spawn: round 1-2 solo livello 1; round 3-4 livelli 1-2; round 7+ livelli 1-3
- [x] Spawn specie scalato per round (3 specie → 7 specie progressivamente)
- [x] Tutorial primo lancio: 3 popup ("Trascina verso il basso", "Rilascia per lanciare", "Unisci due uguali!")
- [x] Flag in localStorage per non rimostrare tutorial

**Decisioni di design prese in Fase 2:**
- Pista a **funnel** (imbuto): pareti inclinate, più strette in cima, con PolygonCollider2D
- Layout pista **responsivo**: aspect ratio **500:700**, altezza = `min(75% vs.height, vs.width)` — replica `height: min(75%, 100vw); aspect-ratio: 500/700` del CSS; agganciata in basso, centrata; tutte le costanti derivano da `initLayout()` (Track.ts)
- Flag **`LIVE_RESIZE`** (GameManager.ts): `true` in sviluppo — ricalcola layout e ricostruisce pista/muri in tempo reale al resize del browser
- Lancio immediato (`waitForSettling = false`): il warrior successivo si attiva appena quello lanciato supera la linea
- Rimbalzo oltre la linea → **game over** (non più malus a punteggio)
- Momentum conservation al merge: 75% velocità media dei due warrior
- Angolo lancio clamped a ±75° dalla verticale
- Debug panel con PAUSE/RESUME, round ±, merge ±, SAVE/LOAD/RESET, palette drag-and-drop
- **Tutti i posizionamenti relativi** alle costanti di Track — nessun valore hardcoded
- Gerarchia scene: **GameLayer** (warriors, VFX, rope) + **UILayer** (HUD, overlay)
- Warrior fermi: `settle()` imposta `linearDamping=12` — si muovono ma non schizzano
- Preview NEXT: **bottom-left**, ancorata a `view.getVisibleSize()`
- Loading screen HTML/CSS in `build-templates/web-mobile/index.html`, scompare al primo frame CC

**Giorno 26-28: Bilanciamento iniziale** *(1–3 giu)*
- [ ] Playtest sessioni multiple *(manuale)*
- [ ] Tuning: forza magnetismo, attrito, tempi merge, soglie min/max fionda *(post-playtest)*
- [ ] Tuning: curva soglie punteggio per round-up *(post-playtest)*
- [ ] Fix bug evidenti *(post-playtest)*
- [ ] **Milestone Fase 2** *(3 giu)*: loop completo e giocabile anche se visivamente greybox

---

## FASE 3 — Asset definitivi e UI *(4–24 giu 2026)*

**Obiettivo**: il gioco assomiglia al prodotto finale.

### Settimana 5: Sprite personaggi + ambiente *(4–10 giu)*

- [ ] Decisione finale stile artistico (rivalutare con prototipo)
- [ ] Produrre/commissionare **28 sprite base** (7 specie × 4 livelli: Cucciolo, Apprendista, Soldato, Guerriero)
  - Opzioni: AI generation + rifinitura, illustratore freelance, asset pack
  - Budget stimato se commissionato: 600–2.000€ per i 28 base
- [ ] Produrre **~8–9 sprite livelli speciali**: Campione (~4–5 specie), Eroe (~2–3 specie), Leggenda (1 specie)
- [ ] Esportare a 128×128 base + 256×256 retina, importare come Atlas
- [ ] Sostituire placeholder con sprite definitivi
- [ ] Sprite pista (texture ghiaccio/legno laccato), nastro rosso animato, background fisso

### Settimana 6: Animazioni + VFX *(11–17 giu)*

- [ ] Animazioni per ogni sprite: idle (respiro), squash on landing, pop on merge
- [ ] Animazioni esplosione bonus (3 varianti): Campione, Eroe, Leggenda
- [ ] Animazione esplosione malus
- [ ] **3 asset particellari** riutilizzati con parametri variabili per tier:
  - Scintille (`startSize`, `totalParticles` scalati per tier 4–6)
  - Esplosione (scala e densità per tier 5–6 e bonus Campione/Eroe/Leggenda)
  - Coriandoli con gravità (tier 5–6)
  - Aura magnetismo (asset dedicato fisso)
- [ ] VFX di scena via codice: screen shake, flash overlay, flash rosso malus, slowmo

### Settimana 7: UI completa *(18–24 giu)*

- [ ] Schermata splash + menu principale
- [ ] HUD definitivo:
  - Punteggio con animazione **contachilometri** (tween su label)
  - Round con animazione **scale-up + bounce** al cambio
  - Timer con 4 stati visivi (quasi invisibile → pulse rosso) + ticchettio audio ultimi 5s
- [ ] **6 stili floating score** (testo, colore, dimensione per ogni tier v1)
- [ ] Corda elastica della fionda (Graphics procedurali)
- [ ] Anteprima NEXT definitiva
- [ ] Schermata game over, pausa, tutorial popup definitivi
- [ ] Pulsanti settings (audio on/off)
- [ ] **Milestone Fase 3** *(24 giu)*: il gioco assomiglia visivamente al prodotto finale

---

## FASE 4 — Polish, audio, bilanciamento *(25 giu–8 lug 2026)*

**Obiettivo**: il gioco si sente "premium".

### Settimana 8: Audio e juice completo *(25 giu–1 lug)*

- [ ] Procurare/comporre **1–2 loop musicali** (medievale-festivo)
- [ ] Procurare/registrare **~17 SFX + 6 varianti merge**:

  | SFX | Note |
  |-----|------|
  | Lancio (whoosh) | |
  | Landing (thud morbido) | |
  | Magnetismo (click) | |
  | Merge livello 1→6 | 6 varianti chime ascendente |
  | Esplosione Campione | Boom medio + cheer |
  | Esplosione Eroe | Boom grande + cheer |
  | Esplosione Leggenda | Boom epico + cheer lungo |
  | Malus | Buzz/clang negativo |
  | Ticchettio timer | Tick per secondo, ultimi 5s |
  | Avvicinamento game over | Heartbeat sottile |
  | Game over | Trombetta triste comica |
  | Nuovo round | Fanfara breve |
  | Click UI | |

- [ ] Implementare AudioManager con volume controls (musica separata da SFX)
- [ ] Implementare sistema **6-tier floating score** v1 (testo + colori + FX per fascia)
- [ ] Implementare slowmo: ×0.8 da 10k pt (tier 5), ×0.5 da 12k pt (tier 6)
- [ ] Trail leggero dietro al warrior in volo
- [ ] Squash & stretch sull'atterraggio

### Settimana 9: Bilanciamento approfondito *(2–8 lug)*

- [ ] **Playtest con 5–10 persone esterne** (non saltare — è il test più importante)
- [ ] Raccogliere feedback su: difficoltà, leggibilità, feel della fionda, chiarezza merge, timer
- [ ] Iterare su:
  - Curva soglie punteggio per avanzare di round
  - Timer di lancio per round (15s → 3s, forma della curva)
  - Forza e raggio magnetismo
  - Soglie min/max fionda
  - Distribuzione specie/livello nello spawn
- [ ] **Milestone Fase 4** *(8 lug)*: il gioco è divertente da giocare ripetutamente

---

## FASE 5 — Integrazione SDK e pubblicazione *(9–15 lug 2026)*

**Obiettivo**: gioco pubblicato sui portali.

### Integrazione Poki SDK *(9–11 lug)*

- [ ] Registrare account sviluppatore Poki (o CrazyGames)
- [ ] Leggere documentazione SDK
- [ ] Implementare:
  - `PokiSDK.init()` all'avvio
  - `PokiSDK.gameplayStart()` quando inizia partita
  - `PokiSDK.gameplayStop()` a game over
  - `PokiSDK.commercialBreak()` tra partite (mai durante gameplay)
- [ ] Implementare loading screen secondo specifiche Poki
- [ ] Test in Poki sandbox

### Asset di marketing *(12–13 lug)*

- [ ] **Thumbnail** (cruciale): 512×512, personaggi più belli, colori saturi, leggibile in piccolo
- [ ] Screenshots di gameplay (3–5)
- [ ] Trailer GIF/video breve (15–30s): lancio fionda → merge → esplosione → round up
- [ ] Descrizione del gioco in inglese
- [ ] Tag: merge, casual, puzzle, physics, animals

### Submission *(14–15 lug)*

- [ ] Build HTML5 ottimizzata (target <20MB)
- [ ] Test su Chrome, Firefox, Safari, Edge
- [ ] Test su device reali: iPhone, Android, tablet, desktop
- [ ] Submit a Poki/CrazyGames
- [ ] Attendere review (1–4 settimane) e iterare su feedback portale

---

## Strumenti raccomandati

- **Cocos Creator 3.8.8** — engine
- **VS Code** — editor (con plugin Cocos)
- **Aseprite** o **Photoshop** — sprite
- **Audacity** o **Reaper** — audio
- **TexturePacker** — atlas sprite
- **GitHub/GitLab** — version control + backup

## Rischi principali e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Asset art costoso/lungo (37 sprite + animazioni) | Alta | Alto | Iniziare con AI generation + rifinitura per i 28 base; commissionare solo i livelli speciali se budget lo consente |
| Magnetismo difficile da bilanciare | Alta | Medio | Esporre come parametro live-tunabile, testare presto |
| Calibrazione soglie fionda (min/max vs linea game over) | Media | Medio | Testare su tutti gli angoli di lancio fin dalla Fase 1 |
| Performance mobile con particelle | Bassa | Medio | 3 asset particellari riutilizzati con parametri variabili; pool di particelle; max ~30 warrior simultanei |
| Poki rifiuta per "troppo simile a Suika" | Bassa | Alto | Enfatizzare differenziatori: fionda, magnetismo selettivo, malus, round |
| Scope creep | Alta | Alto | Rispettare lista "out of scope" del GDD |

## Prossime azioni concrete

> Aggiornato al 2026-05-09 — Fase 2 avanzata: layout responsivo stabile (500:700, min(75%h,100%w)), LIVE_RESIZE attivo per debug, loop completo.

1. **Playtest esteso** su mobile: raccogliere feedback su feel del lancio, stabilità warrior, difficoltà round — sblocca Milestone Fase 2
2. **Tuning post-playtest**: forza magnetismo, soglie round-up, distribuzione spawn, linearDamping settled (attuale 12)
3. **Prima di Fase 3**: impostare `LIVE_RESIZE = false` in GameManager.ts; verificare layout su device reali
4. **Fase 3**: decidere stile artistico e avviare produzione sprite — geometria pista stabile (500:700, responsive), non si prevede ulteriore cambio
