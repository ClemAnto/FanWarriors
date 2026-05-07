# Game Design Document — FanWarriors

> Documento sintetico di game design. Versione 0.1 — da aggiornare durante lo sviluppo.

## 1. Concept in una frase

Un puzzle-arcade ibrido tra Suika Game e curling: lanci animaletti-guerrieri su una pista in salita, quelli uguali si attraggono e si fondono evolvendo, con progressione a livelli stile Tetris.

## 2. Pitch (per Poki/CrazyGames)

> Lancia i tuoi animaletti-guerrieri sulla pista del torneo! Quando due eroi uguali si toccano, si fondono in un guerriero più forte. Riempi la pista di evoluzioni, raggiungi il livello 5 per scatenare un'esplosione di punti, ma attento: se un personaggio supera il nastro rosso, è game over!

## 3. Riferimenti

- **Suika Game** — meccanica core di merge per contatto
- **Tetris** — progressione per livelli con difficoltà e varietà crescente
- **Curling / Petanque** — fisica del lancio dal basso, attrito, mira+forza
- **Biliardo** — rimbalzi laterali, prospettiva pseudo-3D

## 4. Target

- Piattaforma primaria: **Poki / CrazyGames** (portali HTML5 occidentali)
- Età: **8-14 anni** (sweet spot Poki), gender-neutral
- Dispositivi: desktop + mobile + tablet
- Orientamento: **landscape primario**, verticale come fallback
- Sessioni attese: 2-5 minuti per partita, "una partita ancora" effect

## 5. Loop di gioco

1. Il giocatore vede un personaggio in attesa di lancio (bottom center) e l'anteprima del prossimo (NEXT)
2. Mira con drag (angolo + forza visualizzati come freccia)
3. Rilascia → il personaggio scivola sulla pista
4. La pista è in **leggera salita verso il fondo (alto)**: l'attrito + gravità rallentano e fermano il personaggio in alto
5. Personaggi dello stesso tipo+livello che si trovano vicini si **attraggono magneticamente** (raggio corto)
6. Dopo qualche centinaio di millisecondi di contatto, **due personaggi uguali si fondono** al centro nella loro evoluzione successiva
7. Il giocatore continua a lanciare, accumulando punti per ogni merge
8. **Game over**: se un personaggio non supera la linea del nastro rosso (a metà pista) — anche un solo personaggio oltre la linea è fine partita

## 6. Sistema di evoluzione

### Catena per ogni specie

Ogni specie animale ha la propria catena evolutiva. **5 step base**, estendibile fino a 7 nei livelli avanzati di gioco.

Esempio per una specie:
1. Cucciolo (forma più piccola, accessori semplici)
2. Apprendista guerriero (scudo o spada base)
3. Guerriero esperto (armatura visibile)
4. Capitano (elmetto piumato, arma più imponente)
5. **Eroe leggendario** → al raggiungimento, **esplode dando bonus di punti** e libera spazio
6. Solo nei livelli avanzati: stadi superiori (semidio, arcimago, ecc.)
7. Solo nei livelli avanzati

### Specie disponibili (7 totali)

1. **Rana** — verde, agile, scudo
2. **Gatto** — grigio/arancione, agile, spada
3. **Gallina** — bianca, comica, lancia
4. **Lupo** — grigio, robusto, ascia
5. **Aquila** — marrone, fiera, lancia/arco
6. **Leone** — dorato, regale, mazza
7. **Drago** — verde/rosso, finale epico

> Nota: l'ordine 1→7 può anche riflettere una scala di "rarità/potenza percepita" introdotta nel gioco col progredire dei livelli.

### Regole di merge

- Si fondono **solo personaggi della stessa specie E dello stesso livello evolutivo**
- Una rana livello 2 + una rana livello 2 → una rana livello 3
- Una rana livello 2 + un gatto livello 2 → niente, restano separati
- Una rana livello 2 + una rana livello 3 → niente, restano separati

## 7. Progressione del gioco (livelli)

Stile Tetris: il gioco è endless ma diviso in **livelli di difficoltà crescente**. Si avanza al livello successivo accumulando punti.

| Livello | Specie disponibili | Personaggi lanciabili | Note |
|---------|---------------------|------------------------|------|
| 1-2 | 3 specie (Rana, Gatto, Gallina) | Solo livello 1 | Tutorial implicito, pace lento |
| 3-4 | 4 specie (+ Lupo) | Livello 1-2 | Aumenta varietà |
| 5-6 | 5 specie (+ Aquila) | Livello 1-2 | Drop più frequenti |
| 7-8 | 6 specie (+ Leone) | Livello 1-3 | Difficoltà media-alta |
| 9-10 | 7 specie (+ Drago) | Livello 1-3 | Tutte le specie attive |
| 11+ | 7 specie | Livello 1-3 | Step di evoluzione estesi a 6-7, drop ancora più frequenti |

**Regole di promozione tra livelli**: ogni livello richiede un punteggio target (es. lvl 1 → 1000pt, lvl 2 → 2500pt, lvl 3 → 5000pt, ecc.). Curva da bilanciare in playtest.

## 8. Sistema di punteggio

- Merge livello 1 → 2: **10 punti**
- Merge livello 2 → 3: **30 punti**
- Merge livello 3 → 4: **80 punti**
- Merge livello 4 → 5: **200 punti**
- **Esplosione livello 5**: **500 punti bonus** + libera spazio
- Combo (più merge consecutivi senza nuovi lanci): **moltiplicatore x1.5, x2, x3**
- Bonus passaggio di livello del gioco: **punti fissi** + 1 secondo di slow-motion celebrativo

## 9. Fisica e controlli

### Input
- **Mouse/touch**: drag dal personaggio in attesa per mirare
- Direzione drag = angolo di lancio
- Lunghezza drag = forza (visualizzata con barra/freccia)
- Rilascio = lancio
- (Opzionale fase 2) tap rapido al centro = lancio diretto con forza media

### Fisica
- Engine: **Box2D** integrato in Cocos Creator
- Tutti i personaggi hanno **hitbox circolare** (la sagoma sopra è solo rendering)
- **Pareti laterali**: rimbalzo elastico (restituzione ~0.6)
- **Fondo della pista** (in alto): "muro di stop" con attrito alto
- **Inizio pista** (in basso): sotto il punto di lancio non si torna, "muro" invisibile
- **Attrito superficie**: medio (~0.4) per simulare scivolosità ma con frenata progressiva
- **Gravità simulata**: forza costante diretta verso il **basso del giocatore** (cioè verso il punto di lancio), modellando l'inclinazione in salita

### Magnetismo
- Attivo solo tra personaggi di **stessa specie + stesso livello**
- Raggio: ~2x il diametro del personaggio
- Forza: leggera, percettibile ma non "teleportante"
- Soglia di merge: dopo **~300ms di contatto continuo**, fusione
- Nuovo personaggio appare al **centro geometrico** dei due fondenti, con piccola animazione di scale-up + flash

## 10. Game over

- Linea visibile come **nastro rosso** orizzontale a metà pista
- Anche **un solo personaggio** che supera la linea (centro della base oltre la linea per >0.5s) → game over
- Schermata: punteggio finale, livello raggiunto, "Riprova" + "Condividi"

## 11. UI / HUD

### In partita
- **Top-left**: punteggio + livello
- **Top-right**: pulsanti settings (audio on/off, info)
- **Bottom-center**: personaggio in attesa di lancio + freccia di mira
- **Bottom-right**: anteprima NEXT (prossimo personaggio)
- **Mid-pista**: nastro rosso (linea game over)

### Schermate
- **Splash/menu**: titolo, "Gioca", "Come si gioca", "Crediti"
- **Game over**: punteggio, miglior punteggio, livello raggiunto, "Riprova", "Menu"
- **Tutorial**: 3-4 popup contestuali alla prima partita (mira, lancio, merge, game over)
- **Pause**: settings + riprendi + esci

## 12. Audio

- **Musica di sottofondo**: 1-2 loop tematici (medievale-festivo, ma leggero), volume moderato
- **SFX**:
  - Lancio (whoosh)
  - Personaggio che si ferma (thud morbido)
  - Magnetismo (suono di "click magnetico")
  - Merge (chime ascendente, varia con livello evolutivo)
  - Esplosione livello 5 (boom festoso + cheer del pubblico)
  - Avvicinamento al game over (heartbeat sottile)
  - Game over (trombetta triste comica)
  - Level up (fanfara breve)

## 13. Stile visivo

- **Direzione**: cartoon kawaii, "giocattoloso", colori saturi e allegri
- **Riferimento attuale**: mockup con castello medievale + tendoni + bandiere
- **Decisione finale stile**: aperta, da rivalutare con prototipo giocabile
- **Personaggi**: chibi tondeggianti su base circolare con numero del livello evolutivo visibile
- **Pista**: superficie liscia tipo ghiaccio chiaro o legno laccato
- **Background**: festa/torneo medievale (decorativo, non distrae)

## 14. Asset necessari (stima)

- **7 specie × 5 livelli = 35 sprite base** (estensibile a 49 con livelli 6-7)
- Animazioni minime: idle (respiro), squash on landing, pop on merge
- Effetti VFX: scintille merge, esplosione livello 5, indicatore magnetismo
- UI: 8-10 elementi (pulsanti, frecce, popup)
- Background: 1 illustrazione fissa + eventuali parallax
- Audio: ~15 SFX + 1-2 tracce musicali

## 15. Out of scope per la v1

Per mantenere lo scope realistico, **NON** includiamo nella v1:
- Multiplayer
- Power-up speciali
- Skin/cosmetics
- Achievements/leaderboard cloud
- Eventi stagionali
- Pubblicità rewarded (solo banner/interstitial Poki SDK base)
- Personalizzazione personaggi
- Modalità di gioco alternative

> Tutte queste sono ottime feature per una v2 dopo aver validato il core.

## 16. Monetizzazione

- **Revenue share Poki/CrazyGames** via SDK ufficiale
- Banner ad + interstitial tra partite (frequenza moderata, mai durante il gameplay)
- Nessuna IAP nella v1

## 17. Metriche di successo

KPI da monitorare dopo il lancio:
- **D1 retention**: target >35% (media Poki ~30%)
- **Sessione media**: target >4 minuti
- **Partite per sessione**: target >2.5
- **Completion rate level 1-3**: target >70% (per validare onboarding)
