# Roadmap Tecnica — Critter Clash

> Roadmap di sviluppo in Cocos Creator (JavaScript/TypeScript). Stima realistica part-time. Versione 0.1.

## Stack tecnologico

- **Engine**: Cocos Creator (versione 3.x consigliata)
- **Linguaggio**: TypeScript (preferito) o JavaScript
- **Fisica**: Box2D (modulo built-in di Cocos)
- **Build target**: HTML5 (Web Mobile + Desktop)
- **SDK portale**: Poki SDK (o CrazyGames SDK) — integrazione finale
- **Version control**: Git (consigliato repo privato GitHub/GitLab)
- **Asset pipeline**: PNG sprite + Aseprite/Photoshop, audio in OGG/MP3

## Stima totale realistica

- **8-12 settimane part-time** (10-15h/settimana)
- Distribuite indicativamente come segue:

| Fase | Durata | Output |
|------|--------|--------|
| 1. Setup + prototipo greybox | 2 settimane | Fisica + lancio + merge funzionanti |
| 2. Core gameplay completo | 2 settimane | Loop completo greybox |
| 3. Asset + UI definitiva | 3 settimane | Look finale |
| 4. Polish + audio + balancing | 2 settimane | Esperienza rifinita |
| 5. Integrazione SDK + submission | 1 settimana | Build pubblicabile |

---

## FASE 1 — Setup e prototipo greybox (Settimane 1-2)

**Obiettivo**: avere un prototipo cliccabile in cui si lancia un cerchio sulla pista, rimbalza, si ferma per attrito, e due cerchi uguali si uniscono al contatto.

### Settimana 1: Setup e fisica base

**Giorno 1-2: Setup progetto**
- [ ] Installare Cocos Creator 3.x
- [ ] Creare nuovo progetto "CritterClash"
- [ ] Configurare TypeScript
- [ ] Setup Git, .gitignore standard Cocos
- [ ] Configurare risoluzione di riferimento (es. 1280x720 landscape, design canvas)
- [ ] Importare un set di sprite placeholder (cerchi colorati con numeri = "guerrieri" temporanei)

**Giorno 3-4: Pista e fisica**
- [ ] Creare scena principale "GameScene"
- [ ] Configurare PhysicsSystem2D (Box2D)
- [ ] Creare "Track" node con SpriteComponent (rettangolo grigio greybox)
- [ ] Aggiungere 4 muri statici (Collider2D BoxCollider): pareti sx, dx, fondo (top), bottom invisibile
- [ ] Configurare gravità globale a 0 (gestiremo manualmente la "salita")
- [ ] Test: una palla che cade dentro non subisce gravità

**Giorno 5-7: Lancio personaggio**
- [ ] Creare prefab "Critter" con: SpriteComponent (cerchio colorato + numero), CircleCollider2D, RigidBody2D
- [ ] Spawn position: bottom-center
- [ ] Input system: drag con mouse → calcola direzione e magnitude
- [ ] Visualizzare freccia di mira (Graphics o Sprite ruotato)
- [ ] Al rilascio: applyLinearImpulse al rigidbody nella direzione mira
- [ ] **Forza simulata di "salita verso il basso"**: applicare ogni frame una gravità custom verso il bottom (es. -200 sull'asse Y se Y+ è up)
- [ ] Configurare friction (~0.4) e restitution (~0.6) sui personaggi
- [ ] Test: il personaggio scivola, rimbalza sulle pareti, si ferma per attrito

### Settimana 2: Merge e magnetismo

**Giorno 8-10: Sistema di identificazione e merge**
- [ ] Aggiungere a Critter: properties `species: number` (0-6) e `level: number` (1-5)
- [ ] Color-code temporaneo: ogni species un colore diverso, ogni level un numero scritto sul cerchio
- [ ] Implementare detection di collisione con stesso species+level (callback onBeginContact)
- [ ] Timer di "contact persistence": se restano in contatto >300ms → trigger merge
- [ ] Funzione `mergeCritters(a, b)`:
  - Calcola posizione media
  - Distruggi a e b
  - Spawn nuovo Critter con stesso species, level+1, alla posizione media
  - Effetto visivo placeholder (flash bianco)

**Giorno 11-12: Magnetismo**
- [ ] Ogni frame, per ogni Critter, calcolare i Critter compatibili nel raggio di ~2x diametro
- [ ] Applicare una piccola forza di attrazione verso il critter compatibile più vicino
- [ ] Tuning della forza: deve essere percepibile ma non "teletrasportare"
- [ ] Test: lanci due rane lvl 1, si avvicinano, si toccano, si fondono in una rana lvl 2

**Giorno 13-14: Refactor + spawn loop**
- [ ] Implementare "queue" di prossimi critter: array di {species, level} casuali
- [ ] Mostrare preview "NEXT" (anche solo come testo sullo schermo per ora)
- [ ] Dopo ogni lancio, spawn nuovo critter dalla queue alla position di lancio
- [ ] Game state base: idle / aiming / inflight / settling
- [ ] Refactor del codice in classi pulite: GameManager, Critter, InputController, SpawnManager
- [ ] **Milestone Fase 1**: prototipo giocabile per 30+ secondi senza crash, merge funzionante

---

## FASE 2 — Core gameplay completo (Settimane 3-4)

**Obiettivo**: tutto il loop di gioco è giocabile in greybox: punteggio, livelli, game over, esplosione lvl 5.

### Settimana 3: Punteggio, livelli, game over

**Giorno 15-17: Sistema di punteggio**
- [ ] Aggiungere proprietà `score` al GameManager
- [ ] Punti su merge in base a level di destinazione (10, 30, 80, 200, 500)
- [ ] UI temporanea: testo punteggio top-left
- [ ] Combo detection: se merge a catena entro 1s, moltiplicatore x1.5/x2/x3
- [ ] Visualizzazione "+10", "+30" che fluttua dal punto di merge

**Giorno 18-19: Livelli del gioco**
- [ ] Aggiungere `gameLevel` (1-10+) al GameManager
- [ ] Tabella di soglie punteggio per level-up
- [ ] All'aumento di gameLevel: aggiungere nuova specie alla pool spawnabile, aggiornare regole spawn
- [ ] Notifica visiva "LIVELLO UP" + breve pausa celebrativa
- [ ] Implementare logica spawn: a gameLevel 1-2 solo level 1; a gameLevel 3-4 anche level 2; ecc.

**Giorno 20-21: Game over**
- [ ] Linea rossa visibile a metà pista (Graphics o sprite)
- [ ] Check ogni frame: se un critter "settled" (velocità < soglia) ha la sua position oltre la linea per >0.5s → game over
- [ ] Schermata game over: pannello con punteggio, "Riprova", "Menu"
- [ ] Restart partita pulisce scena e resetta state

### Settimana 4: Esplosione livello 5 e refinement

**Giorno 22-23: Esplosione livello 5**
- [ ] Quando si crea un critter di level 5, dopo breve animazione, "esplode"
- [ ] Esplosione: VFX placeholder (cerchio che cresce e svanisce)
- [ ] Restituisce 500 punti bonus
- [ ] Distrugge il critter, libera spazio
- [ ] (Opzionale) leggera onda d'urto fisica che spinge i critter vicini

**Giorno 24-25: Tutorial primo lancio**
- [ ] Alla primissima partita, mostrare 3 popup:
  - "Trascina per mirare"
  - "Rilascia per lanciare"
  - "Unisci due uguali per evolverli!"
- [ ] Salvare flag in localStorage per non rimostrarli
- [ ] (Avvertenza: usa localStorage solo nel build standalone, NON in artefatti web — qui siamo in build HTML5 normale, quindi ok)

**Giorno 26-28: Bilanciamento iniziale e bug fixing**
- [ ] Playtest sessioni multiple
- [ ] Tunare: forza magnetismo, attrito, gravità simulata, tempo di contatto per merge
- [ ] Tunare: curva difficoltà (soglie level-up, frequenza spawn livelli alti)
- [ ] Fix bug evidenti
- [ ] **Milestone Fase 2**: il gioco è completo come loop, anche se brutto da vedere. Si gioca, si perde, si rigioca.

---

## FASE 3 — Asset definitivi e UI (Settimane 5-7)

**Obiettivo**: il gioco assomiglia al mockup finale.

### Settimana 5: Sprite dei personaggi

- [ ] Decisione finale stile artistico (cartoon vs stilizzato — rivalutare con prototipo)
- [ ] Procurare/disegnare/commissionare 35 sprite (7 specie × 5 livelli)
  - Opzioni: AI generation + rifinitura, illustratore freelance, asset pack
  - Budget stimato se commissionato: 500-2000€
- [ ] Esportare in dimensioni adeguate (es. 128x128 base + retina 256x256)
- [ ] Importare in Cocos come Atlas (per performance)
- [ ] Sostituire i placeholder con sprite veri
- [ ] Aggiungere il numero di livello sulla base (UI overlay o parte dello sprite)

### Settimana 6: Pista, background, VFX

- [ ] Sprite della pista (texture ghiaccio o legno laccato)
- [ ] Background fisso (castello + fiera medievale, da mockup)
- [ ] Nastro rosso animato (leggera ondulazione)
- [ ] Pareti della pista con prospettiva (più strette in alto)
- [ ] Effetti particellari su:
  - Merge (scintille colorate)
  - Esplosione level 5 (esplosione festosa con confetti)
  - Magnetismo attivo (leggero glow tra i critter compatibili)
  - Atterraggio (piccola polvere)

### Settimana 7: UI completa

- [ ] Schermata splash + menu principale
- [ ] HUD in-game definitivo (font, layout, animazioni numeri punteggio)
- [ ] Schermata game over con tutti i dettagli
- [ ] Pause menu
- [ ] Tutorial popup con grafica definitiva
- [ ] Pulsanti settings (audio on/off)
- [ ] Animazione "NEXT" (preview prossimo critter)
- [ ] **Milestone Fase 3**: il gioco assomiglia visivamente al prodotto finale.

---

## FASE 4 — Polish, audio, bilanciamento (Settimane 8-9)

**Obiettivo**: il gioco si sente "premium".

### Settimana 8: Audio e juice

- [ ] Procurare/comporre musica di sottofondo (1-2 loop)
- [ ] Procurare/registrare ~15 SFX
  - Lancio, atterraggio, magnetismo, merge (5 varianti per livello), esplosione, game over, level up, click UI, vittoria, ambient
- [ ] Implementare AudioManager con volume controls
- [ ] Aggiungere "juice" al gameplay:
  - Camera shake leggera su esplosione lvl 5
  - Squash & stretch su atterraggio
  - Slow-motion 0.3s su merge importante (lvl 4→5)
  - Floating numbers per i punti
  - Trail leggero dietro al critter in volo

### Settimana 9: Bilanciamento approfondito

- [ ] **Playtest con 5-10 persone esterne** (importantissimo, non saltare)
- [ ] Raccogliere feedback su: difficoltà, leggibilità, feel del lancio, chiarezza dei merge
- [ ] Iterare su:
  - Curve di difficoltà
  - Velocità progressione livelli
  - Frequenza spawn varietà specie
  - Forza magnetismo (è il parametro più sensibile)
- [ ] Aggiungere audio cue di "stress" quando si è vicini al game over
- [ ] **Milestone Fase 4**: il gioco è divertente da giocare ripetutamente.

---

## FASE 5 — Integrazione SDK e pubblicazione (Settimana 10+)

**Obiettivo**: gioco pubblicato sui portali.

### Integrazione Poki SDK

- [ ] Registrare account sviluppatore Poki (o CrazyGames)
- [ ] Leggere documentazione SDK (https://sdk.poki.com/)
- [ ] Implementare:
  - `PokiSDK.init()` all'avvio
  - `PokiSDK.gameplayStart()` quando inizia partita
  - `PokiSDK.gameplayStop()` a game over
  - `PokiSDK.commercialBreak()` tra partite (interstitial), non durante gameplay
  - (Opzionale) `PokiSDK.rewardedBreak()` per "rivivi una volta"
- [ ] Implementare loading screen secondo specifiche Poki
- [ ] Test in Poki sandbox

### Asset di marketing

- [ ] **Thumbnail** (cruciale): immagine 512x512 accattivante con i personaggi più belli, colori saturi, leggibile in piccolo
- [ ] Screenshots di gameplay (3-5)
- [ ] Trailer GIF/video breve (15-30s) che mostra: lancio, merge, esplosione, livello up
- [ ] Descrizione del gioco (in inglese)
- [ ] Tag: merge, casual, puzzle, physics, animals

### Submission

- [ ] Build HTML5 ottimizzata (max 20-30MB consigliato per Poki)
- [ ] Test su browser multipli (Chrome, Firefox, Safari, Edge)
- [ ] Test su device reali: iPhone, Android, tablet, desktop
- [ ] Submit a Poki/CrazyGames
- [ ] Attendere review (1-4 settimane di solito)
- [ ] Iterare su feedback dei portali (richiedono spesso aggiustamenti UI o di SDK)

---

## Strumenti raccomandati

- **Cocos Creator 3.x** — engine
- **VS Code** — editor (con plugin Cocos)
- **Aseprite** o **Photoshop** — sprite
- **Audacity** o **Reaper** — audio
- **Tiled** o editor interno Cocos — eventuali level layout
- **TexturePacker** — atlas (Cocos ha anche il suo)
- **GitHub/GitLab** — version control + backup

## Risorse utili da consultare

- Documentazione Cocos Creator: https://docs.cocos.com/creator/manual/en/
- Poki for Developers: https://developers.poki.com/
- CrazyGames Developer Portal: https://developer.crazygames.com/
- Esempi di SDK integration: cercare "poki sdk html5 example" su GitHub

## Rischi principali e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Asset art troppo costoso/lungo | Alta | Alto | Iniziare con AI generation + rifinitura, validare prima di commissionare 35 sprite finiti |
| Magnetismo difficile da bilanciare | Alta | Medio | Esporre come parametro live-tunabile, testare presto con utenti reali |
| Performance su mobile basso-end | Media | Medio | Limitare numero max critter simultanei (~30), atlas sprite, evitare effetti pesanti |
| Poki rifiuta per "troppo simile a Suika" | Bassa | Alto | Enfatizzare differenziatori (curling, magnetismo, livelli) nel pitch e nel gameplay |
| Scope creep durante sviluppo | Alta | Alto | Mantenere la lista "out of scope" del GDD come reminder |

## Prossime azioni concrete

1. **Oggi/domani**: installare Cocos Creator 3.x, creare progetto vuoto, fare un "hello world" con un cerchio che cade per familiarizzare
2. **Settimana 1**: completare i punti della Settimana 1 di questa roadmap
3. **A fine Settimana 2**: avere il prototipo della Fase 1 funzionante e fare una decisione informata se continuare con questo concept o pivottare
