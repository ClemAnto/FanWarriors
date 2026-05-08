# Roadmap Tecnica — FanWarriors

> Roadmap di sviluppo in Cocos Creator (TypeScript). Stima realistica part-time. Versione 0.3 — aggiornata 2026-05-08.

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

## FASE 1 — Setup e prototipo greybox *(7–20 mag 2026)*

**Obiettivo**: prototipo cliccabile con lancio a fionda, rimbalzi corretti e merge funzionante.

### Settimana 1: Setup e fisica base *(7–13 mag)*

**Giorno 1-2: Setup progetto** *(7–8 mag)* ← **sei qui**
- [x] Installare Cocos Creator 3.8.8
- [x] Creare nuovo progetto "FanWarriors"
- [x] Configurare TypeScript strict mode
- [x] Setup Git, .gitignore standard Cocos
- [x] Configurare risoluzione di riferimento (1280x720 landscape)
- [ ] Importare sprite placeholder (cerchi colorati con numeri)

**Giorno 3-4: Pista e fisica** *(9–10 mag)*
- [x] Creare scena principale "GameScene"
- [ ] Configurare PhysicsSystem2D (Box2D), **gravità globale = 0** (nessuna forza gravitazionale)
- [ ] Creare "Track" node con SpriteComponent (rettangolo grigio greybox)
- [ ] Aggiungere muri statici con Collider2D BoxCollider:
  - Pareti laterali: restitution ~0.8, friction bassa (rimbalzo consistente)
  - Fondo pista (top): restitution ~0.1, friction alta (smorzamento forte)
  - Bottom invisibile: blocca il rientro sotto la linea di lancio
- [ ] Test: una palla lanciata rimbalza elasticamente sulle pareti laterali e si ferma sul fondo

**Giorno 5-7: Meccanica di lancio a fionda** *(11–13 mag)*
- [ ] Creare prefab "Critter": SpriteComponent (cerchio + numero), CircleCollider2D, RigidBody2D
  - Damping lineare e angolare alti (personaggi stabili, assorbono urti)
  - Friction ~0.05 (superficie scivolosa come bowling)
- [ ] Spawn position: bottom-center
- [ ] Input system (mouse e touch equivalenti):
  - Press sul personaggio → inizio drag
  - Drag verso il basso / diagonale-basso → visualizza corda elastica
  - Direzione lancio = opposto al vettore drag (drag giù → lancia su, drag sinistra → lancia destra)
  - Lunghezza drag = forza (cappata a distanza massima)
  - Rilascio sotto soglia minima → annulla lancio
  - Rilascio sopra soglia minima → `applyLinearImpulse` nella direzione opposta al drag
- [ ] Calibrare soglia minima: deve garantire che qualsiasi lancio valido superi la linea di game over
- [ ] Calibrare soglia massima: la corda smette di allungarsi al cap visivo
- [ ] Visualizzare corda elastica (Graphics drawn proceduralmente) e indicatore forza
- [ ] Test: il personaggio viene lanciato nella direzione opposta al drag, rimbalza sulle pareti, si ferma per attrito

### Settimana 2: Merge, magnetismo, game over *(14–20 mag)*

**Giorno 8-10: Sistema di identificazione e merge** *(14–16 mag)*
- [ ] Aggiungere a Critter: `species: number` (0–6) e `level: number` (1–7)
- [ ] Color-code temporaneo: ogni species un colore, ogni level un numero sul cerchio
- [ ] Collision detection con stesso species+level (callback `onBeginContact`)
- [ ] Timer contatto: >300ms → trigger merge
- [ ] Funzione `mergeCritters(a, b)`:
  - Calcola posizione media
  - Distruggi a e b
  - Spawn nuovo Critter con stesso species, level+1, alla posizione media
  - Effetto visivo placeholder (flash bianco)

**Giorno 11-12: Magnetismo e game over** *(17–18 mag)*
- [ ] Ogni frame: per ogni Critter, trovare Critter compatibili (stessa specie E stesso livello) nel raggio ~2x diametro
- [ ] Applicare piccola forza di attrazione verso il più vicino — percepibile ma non teletrasportante
- [ ] Linea game over visibile (Graphics rosso) a metà pista
- [ ] Logica attraversamento linea:
  - Critter lanciato che supera **completamente** la linea **dal basso verso l'alto** → in gioco, turno OK
  - Critter che **non** supera la linea → **game over**
  - Critter in gioco che riattraversa **dall'alto verso il basso** → **esplode** con malus (non game over)
- [ ] Schermata game over placeholder: punteggio e "Riprova"

**Giorno 13-14: Timer di lancio + spawn loop** *(19–20 mag)*
- [ ] Timer di lancio (Round 1 = 15s): conto alla rovescia visibile
- [ ] Allo scadere: lancio automatico nella direzione corrente del drag con forza media
- [ ] Queue di prossimi critter: array `{species, level}` casuali
- [ ] Preview "NEXT" (testo placeholder)
- [ ] Dopo ogni lancio, spawn nuovo critter dalla queue
- [ ] Game state: `idle / aiming / inflight / settling`
- [ ] Refactor in classi pulite: `GameManager`, `Critter`, `InputController`, `SpawnManager`
- [ ] **Milestone Fase 1** *(20 mag)*: prototipo giocabile 30s+, merge funzionante, game over attivo

---

## FASE 2 — Core gameplay completo *(21 mag–3 giu 2026)*

**Obiettivo**: tutto il loop di gioco giocabile in greybox — punteggio formula completa, round, game over, malus, esplosioni livelli speciali.

### Settimana 3: Punteggio e round *(21–27 mag)*

**Giorno 15-17: Sistema di punteggio** *(21–23 mag)*
- [ ] Formula punteggio: `10 × 2^(livello_creatura - 1) × round_corrente × 2^(merge_nello_stesso_lancio - 1)`
- [ ] Tracciare `mergesThisLaunch` (reset ad ogni nuovo lancio)
- [ ] Floating score placeholder: testo "+N" che sale dal punto di merge
- [ ] Malus: penalità `10 × 2^(livello_creatura - 1) × round_corrente` quando un critter riattraversa la linea
- [ ] Malus: flash rosso overlay (~0.3s) come unico feedback visivo negativo
- [ ] Punteggio non scende sotto zero

**Giorno 18-19: Progressione round** *(24–25 mag)*
- [ ] Aggiungere `currentRound` al GameManager
- [ ] Tabella soglie punteggio per avanzare di round
- [ ] All'avanzare del round: aggiungere specie alla pool, aggiornare regole spawn, ridurre timer di lancio
- [ ] Timer di lancio scala con il round (15s → 3s min, curva da bilanciare)
- [ ] Notifica visiva "ROUND UP" placeholder + breve pausa celebrativa

**Giorno 20-21: Game over e restart** *(26–27 mag)*
- [ ] Verifica frame-by-frame attraversamento linea (direzione + completezza)
- [ ] Esplosione malus: critter distrutto + flash rosso
- [ ] Restart pulisce scena e resetta stato completo
- [ ] Salvataggio best score in localStorage

### Settimana 4: Esplosioni livelli speciali e refinement *(28 mag–3 giu)*

**Giorno 22-23: Esplosioni Campione / Eroe / Leggenda** *(28–29 mag)*
- [ ] Quando merge crea critter di livello 5 (Campione): esplosione placeholder + bonus +500pt
- [ ] Quando merge crea critter di livello 6 (Eroe): esplosione placeholder + bonus +1000pt
- [ ] Quando merge crea critter di livello 7 (Leggenda): esplosione placeholder + bonus +2000pt
- [ ] Ogni esplosione: VFX placeholder (cerchio che cresce e svanisce), critter distrutto

**Giorno 24-25: Tutorial e logica spawn avanzata** *(30–31 mag)*
- [ ] Logica spawn: round 1-2 solo livello 1; round 3-4 livelli 1-2; round 7+ livelli 1-3
- [ ] Spawn specie scalato per round (3 specie → 7 specie progressivamente)
- [ ] Tutorial primo lancio: 3 popup ("Trascina verso il basso", "Rilascia per lanciare", "Unisci due uguali!")
- [ ] Flag in localStorage per non rimostrare tutorial

**Giorno 26-28: Bilanciamento iniziale** *(1–3 giu)*
- [ ] Playtest sessioni multiple
- [ ] Tuning: forza magnetismo, attrito, tempi merge, soglie min/max fionda
- [ ] Tuning: curva soglie punteggio per round-up
- [ ] Fix bug evidenti
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
- [ ] Trail leggero dietro al critter in volo
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
| Performance mobile con particelle | Bassa | Medio | 3 asset particellari riutilizzati con parametri variabili; pool di particelle; max ~30 critter simultanei |
| Poki rifiuta per "troppo simile a Suika" | Bassa | Alto | Enfatizzare differenziatori: fionda, magnetismo selettivo, malus, round |
| Scope creep | Alta | Alto | Rispettare lista "out of scope" del GDD |

## Prossime azioni concrete

> Aggiornato al 2026-05-08 — setup completato, fisica ancora da fare.

1. **Prossimo step** *(9-10 mag)*: configurare PhysicsSystem2D con gravità=0, aggiungere 3 muri statici con parametri corretti (restitution 0.8 laterali, 0.1 fondo)
2. **Fine Settimana 1** *(13 mag)*: meccanica fionda funzionante — drag verso il basso, lancio nella direzione opposta, soglie min/max, corda elastica visibile
3. **Fine Settimana 2** *(20 mag)*: prototipo Fase 1 completo — merge, magnetismo, game over con regole attraversamento linea, timer di lancio
