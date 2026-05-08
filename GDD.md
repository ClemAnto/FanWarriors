# Game Design Document — FanWarriors

> Documento sintetico di game design. Versione 0.1 — da aggiornare durante lo sviluppo.

## 1. Concept in una frase

Un puzzle-arcade ibrido tra Suika Game e curling: lanci animaletti-guerrieri su una pista in salita, quelli uguali si attraggono e si fondono evolvendo, con progressione a round stile Tetris.

## 2. Pitch (per Poki/CrazyGames)

> Lancia i tuoi animaletti-guerrieri sulla pista del torneo! Quando due eroi uguali si toccano, si fondono in un guerriero più forte. Riempi la pista di evoluzioni, raggiungi il livello 5 per scatenare un'esplosione di punti, ma attento: se un personaggio supera il nastro rosso, è game over!

## 3. Riferimenti

- **Suika Game** — meccanica core di merge per contatto
- **Tetris** — progressione per livelli con difficoltà e varietà crescente
- **Puzzle Bobble** — stile di lancio: fionda dal basso verso l'alto con controllo angolo+forza
- **Curling / Petanque** — attrito, mira, fisica di scivolamento
- **Biliardo** — rimbalzi laterali, prospettiva pseudo-3D

## 4. Target

- Piattaforma primaria: **Poki / CrazyGames** (portali HTML5 occidentali)
- Età: **8-14 anni** (sweet spot Poki), gender-neutral
- Dispositivi: desktop + mobile + tablet
- Orientamento: **landscape primario**, verticale come fallback
- Sessioni attese: **2-20 minuti** per partita, "una partita ancora" effect

## 5. Loop di gioco

1. La partita inizia con **3 warrior prefill** già posizionati nella parte alta della pista (tipi 0, 1, 2 — un warrior per tipo), dando al giocatore targets immediati per il merge
2. Il giocatore vede un personaggio in attesa di lancio (bottom center) e l'anteprima del prossimo (NEXT)
3. Mira con drag (angolo + forza visualizzati come freccia)
4. Rilascia → il personaggio scivola sulla pista
5. La pista è in **leggera salita verso il fondo (alto)**: l'attrito + gravità rallentano e fermano il personaggio in alto
6. Personaggi dello stesso tipo+livello che si trovano vicini si **attraggono magneticamente** (raggio corto)
7. Dopo qualche centinaio di millisecondi di contatto, **due personaggi uguali si fondono** al centro nella loro evoluzione successiva
8. Il giocatore continua a lanciare, accumulando punti per ogni merge
9. **Game over**: se il personaggio lanciato non supera la linea del nastro rosso (a metà pista) — anche un solo personaggio oltre la linea è fine partita

## 6. Sistema di evoluzione

### Catena per ogni specie

Ogni specie animale condivide la stessa catena evolutiva a **6 livelli**. I livelli 5 e 6 sono disponibili solo per alcune specie selezionate.

| Livello | Nome | Equipaggiamento | Raggio | Note |
|---------|------|-----------------|--------|------|
| 1 | **Cucciolo** | Nessun accessorio | 20px | Punto di partenza, forma più piccola |
| 2 | **Apprendista** | Arma e scudo di legno | 28px | Prima trasformazione |
| 3 | **Soldato** | Arma vera (piccola) | 36px | Aspetto da combattente |
| 4 | **Guerriero** | Elmetto/copricapo + arma più imponente | 42px | Presenza sul campo |
| 5 | **Campione** | Elmetto/copricapo + stivali + arma rara | 48px | *Solo alcune specie* — al raggiungimento **esplode** dando bonus di punti e liberando spazio |
| 6 | **Eroe** | Armatura completa + arma epica | 54px | *Solo alcune specie* — al raggiungimento **esplode** dando bonus alto di punti e liberando spazio |
| 7 | **Leggenda** | Armatura e arma leggendaria | 60px | *Solo 1 specie* — il culmine assoluto della catena |

### Specie disponibili (7 totali)

1. **Rana** — verde, agile, pugnale
2. **Gatto** — arancione, agile, spada
3. **Gallina** — bianca, comica, lancia
4. **Lupo** — grigio, robusto, ascia
5. **Aquila** — marrone, fiera, arco
6. **Leone** — dorato, regale, mazza
7. **Drago** — viola, maestoso, scettro di fuoco

> Nota: l'ordine 1→7 può anche riflettere una scala di "rarità/potenza percepita" introdotta nel gioco col progredire dei round.

### Regole di merge

- Si fondono **solo personaggi della stessa specie E dello stesso livello evolutivo**
- Una rana livello 2 + una rana livello 2 → una rana livello 3
- Una rana livello 2 + un gatto livello 2 → niente, restano separati
- Una rana livello 2 + una rana livello 3 → niente, restano separati

## 7. Progressione del gioco (round)

Stile Tetris: il gioco è endless ma diviso in **round di difficoltà crescente**. Si avanza al round successivo raggiungendo un numero di merge.

| Round | Specie disponibili | Personaggi lanciabili | Timer lancio | Note |
|-------|---------------------|------------------------|--------------|------|
| 1-2 | 3 specie (Rana, Gatto, Gallina) | Solo livello 1 | ~15s | Tutorial implicito, pace lento |
| 3-4 | 4 specie (+ Lupo) | Livello 1-2 | ~10s | Aumenta varietà |
| 5-6 | 5 specie (+ Aquila) | Livello 1-2 | ~8s | Drop più frequenti |
| 7-8 | 6 specie (+ Leone) | Livello 1-3 | ~5s | Difficoltà media-alta |
| 9-10 | 7 specie (+ Drago) | Livello 1-3 | ~4s | Tutte le specie attive |
| 11+ | 7 specie | Livello 1-3 | ~3s | Timer minimo, pressione massima |

**Regole di promozione tra round**: si avanza al round successivo dopo aver eseguito un numero di merge totali pari alla soglia del round corrente. Soglie da bilanciare in playtest (es. round 1 → 10 merge, round 2 → 25 merge, ecc.).

## 8. Sistema di punteggio

### Formula

```
Punti = 10 × 2^(livello_creatura - 1) × round_corrente × 2^(merge_nello_stesso_lancio - 1)
```

- **livello_creatura**: livello evolutivo della creatura risultante dal merge (1–7)
- **round_corrente**: numero del round in corso (1, 2, 3…)
- **merge_nello_stesso_lancio**: quanti merge ha generato questo lancio in totale (1° merge = ×1, 2° = ×2, 3° = ×4…)

### Valori base (round 1, primo merge del lancio)

| Merge | Livello creatura | Punti base |
|-------|-----------------|------------|
| 1 → 2 | 1 | 10 |
| 2 → 3 | 2 | 20 |
| 3 → 4 | 3 | 40 |
| 4 → 5 | 4 | 80 |
| 5 → 6 | 5 | 160 |
| 6 → 7 | 6 | 320 |

### Esempi

- Merge livello 4, round 3, primo del lancio: `10 × 2³ × 3 × 1 = 240 pt`
- Merge livello 2, round 5, secondo del lancio: `10 × 2¹ × 5 × 2 = 200 pt`
- Merge livello 1, round 1, terzo del lancio: `10 × 1 × 1 × 4 = 40 pt`

> **Punteggio massimo per merge singolo (senza combo):** il merge più alto è livello 6→7 (Leggenda), che vale `10 × 2⁵ = 320 pt` base. Moltiplicato per il round corrente, il massimo teorico è **320 × round** — senza cap. Al round 11 (primo tier a timer minimo) vale già **3.520 pt**, che attiva il feedback di massima enfasi (≥ 1000 pt).

### Bonus speciali

- **Esplosione Campione (livello 5)**: +500 pt bonus fisso *(solo specie con Campione)*
- **Esplosione Eroe (livello 6)**: +1000 pt bonus fisso *(solo specie con Eroe)*
- **Esplosione Leggenda (livello 7)**: +2000 pt bonus fisso *(solo specie con Leggenda)*

### Feedback visivo del punteggio

Ad ogni merge appare un **floating score** nel punto di fusione. Dimensione, colore e FX scalano in base all'entità del punteggio ottenuto:

Sotto i 1000 pt: solo variazione di testo e colore, nessun FX di scena.
Da 1000 pt in su: effetti particellari e di scena in scala crescente.

Tutti gli FX sono implementabili nativamente in Cocos Creator: particelle (`ParticleSystem`), shake via offset camera, flash via overlay node con animazione opacità, slowmo via `director.getScheduler().setTimeScale()`.

#### Tier v1 (6 tier attivi)

| # | Soglia | Testo | Colore | FX |
|---|--------|-------|--------|----|
| 1 | < 50 pt | piccolo | bianco | — |
| 2 | 50–299 pt | medio | giallo | — |
| 3 | 300–999 pt | grande, bold | rosso | — |
| 4 | 1000–3999 pt | molto grande | oro | scintille + lampo leggero |
| 5 | 4000–11999 pt | enorme | oro con outline | esplosione + coriandoli + shake + lampo + slowmo leggero (×0.8 da 10.000 pt) |
| 6 | ≥ 12000 pt | massivo, pulsante | arcobaleno | esplosione max + coriandoli + shake forte + lampo + slowmo (×0.5) |

> Riferimento: merge Leggenda (livello 6→7) al round 11 vale 3.520 pt senza combo. Con 2 combo consecutivi ~7.040 pt, con 3 ~14.080 pt — quindi la fascia ≥ 10.000 pt è reale ma rara.

Il floating score sale verso l'alto e svanisce in ~1s. Punteggi ≥ 1000 pt restano visibili ~2s; punteggi ≥ 4000 pt restano visibili ~3s.

#### Tier futuri (12 tier — riferimento per evoluzione)

> Da implementare in una versione successiva per maggiore granularità visiva.

| # | Soglia | Testo | Colore | FX |
|---|--------|-------|--------|----|
| 1 | < 20 pt | minuscolo | grigio | — |
| 2 | 20–49 pt | piccolo | bianco | — |
| 3 | 50–149 pt | piccolo | giallo pallido | — |
| 4 | 150–299 pt | medio | giallo | — |
| 5 | 300–599 pt | grande | arancione | — |
| 6 | 600–999 pt | grande, bold | rosso | — |
| 7 | 1000–1999 pt | molto grande | oro | scintille leggere |
| 8 | 2000–3999 pt | enorme | oro | scintille medie + lampo leggero |
| 9 | 4000–9999 pt | enorme, bold | oro/arancione | esplosione + coriandoli + shake medio |
| 10 | 10000–11999 pt | massivo | oro con outline | esplosione grande + coriandoli + shake forte + lampo + slowmo (×0.8) |
| 11 | 12000–14999 pt | massivo, animato | arcobaleno | esplosione grande + coriandoli + shake forte + lampo + slowmo (×0.6) |
| 12 | ≥ 15000 pt | massivo, pulsante | arcobaleno luminoso | esplosione max + coriandoli + shake forte + lampo + slowmo (×0.4) |

## 9. Fisica e controlli

### Input
- **Mouse e touch sono equivalenti**: tutte le interazioni descritte funzionano identicamente con dito (touch) o puntatore (mouse)

### Meccanica di lancio (stile fionda + Puzzle Bobble)
Il lancio si ispira a **Puzzle Bobble** per la direzione (sempre verso l'alto dalla base) e a una **fionda/elastico** per il controllo di forza e angolo:

1. **Press** sul personaggio in attesa
2. **Drag verso il basso** (o in diagonale basso-sinistra / basso-destra) per caricare la fionda
3. Viene visualizzata una **corda elastica** tra il punto di press e la posizione corrente del drag
4. La **direzione di lancio è opposta al drag**: drag in basso → lancio verso l'alto; drag in basso-sinistra → lancio in alto-destra
5. La **lunghezza del drag** determina la forza del lancio (più si tira, più si carica)
6. **Rilascio** → il personaggio viene proiettato nella direzione opposta con la forza caricata
7. **Soglia minima**: se al rilascio la distanza del drag è inferiore a una soglia minima, il lancio viene annullato e il personaggio rimane in attesa. La soglia minima è calibrata in modo che **qualsiasi lancio valido sia sempre sufficiente a far superare la linea di game over**, indipendentemente dalla direzione — in assenza di ostacoli
8. **Soglia massima**: la forza è cappata a una distanza massima di drag — trascinare oltre non aumenta la potenza; la corda visiva smette di allungarsi a indicare il cap raggiunto

### Timer di lancio
- Il giocatore ha un tempo limitato per effettuare il lancio, visualizzato come conto alla rovescia
- Allo scadere del timer: **lancio automatico** nella direzione corrente del drag con forza media
- **Round 1**: 15 secondi
- Il timer si riduce progressivamente avanzando di round, fino a un **minimo di 3 secondi** nei round avanzati
- La curva di riduzione è da bilanciare in playtest (es. lineare, esponenziale, a gradini)

#### Feedback visivo del timer
Il timer è **poco visibile quando il tempo è abbondante** e si accende progressivamente man mano che scade:

| Tempo rimanente | Visibilità | Aspetto |
|----------------|------------|---------|
| > 10s | quasi invisibile | opacità bassa (~20%), colore neutro |
| 6–10s | visibile | opacità piena, colore bianco/giallo |
| 3–5s | in evidenza | colore arancione, leggero pulse |
| ≤ 2s | critico | colore rosso, pulse rapido |

#### Feedback audio del timer
- **Ultimi 5 secondi**: inizia un **ticchettio** sincronizzato con ogni secondo che passa
- Il ticchettio accelera o si intensifica negli ultimi 2 secondi
- Si interrompe immediatamente al lancio

### Fisica
- Engine: **Box2D** integrato in Cocos Creator
- Tutti i personaggi hanno **hitbox circolare** (la sagoma sopra è solo rendering)
- **Gravità**: ignorata — nessuna forza gravitazionale applicata ai personaggi

#### Superficie
- Il rallentamento è controllato dal **damping lineare** del rigidbody (non da un attrito di superficie), producendo il comportamento di scivolata + smorzamento progressivo tipico del bowling/curling

#### Pareti e bordi
- **Pareti laterali**: rimbalzo **consistente ed elastico** (restituzione ~0.8, attrito basso ~0.05) — il personaggio rimbalza con poca perdita di energia, consentendo traiettorie di rimbalzo utili strategicamente
- **Fondo pista** (parete in alto): **alto smorzamento** (restituzione ~0.1, attrito alto ~0.8) — il personaggio perde quasi tutta la velocità all'impatto e si ferma vicino al fondo
- **Ingresso pista** (in basso): muro invisibile sotto il punto di lancio, il personaggio non può tornare indietro

#### Stabilità dei personaggi in pista
- I personaggi fermi sono **molto stabili**: alto damping lineare e angolare (2.5), assorbono gli urti senza essere proiettati via
- Il personaggio lanciato **trasferisce poca energia cinetica** ai personaggi colpiti — l'impatto è morbido, non una bocciata da biliardo
- I personaggi si spostano leggermente per colpo ma si fermano rapidamente
- Un sistema di **settling** rileva quando tutti i personaggi in pista sono fermi (velocità < soglia) e solo allora abilita il lancio successivo — impedisce lanci multipli sovrapposti

### Magnetismo
- Attivo **esclusivamente** tra personaggi che possono fondersi: **stessa specie E stesso livello evolutivo**
- Nessuna attrazione tra specie diverse o livelli diversi, anche se visivamente vicini
- Raggio: ~75px (fisso, non scala con la dimensione del warrior)
- Forza: **quadratica con la prossimità** — quasi impercettibile a distanza, molto più forte a contatto ravvicinato; evita il "teletrasporto" mantenendo l'effetto di aggancio
- Soglia di merge: dopo **~300ms di contatto continuo**, fusione
- Nuovo personaggio appare al **centro geometrico** dei due fondenti, con piccola animazione di scale-up + flash

## 10. Game over

La linea di game over è visualizzata come **nastro rosso** orizzontale a metà pista.

### Regole di attraversamento

- **Lancio valido**: il personaggio lanciato deve **superare completamente la linea dal basso verso l'alto** per entrare in gioco — il turno è considerato ok
- **Game over**: se il personaggio lanciato non supera completamente la linea (rimane sotto o si ferma sulla linea) → game over immediato

### Rimbalzo oltre la linea (malus)

Se un personaggio già in gioco, a seguito di rimbalzi, **riattraversa completamente la linea dall'alto verso il basso**:
- **Non** causa game over
- Il personaggio **esplode** con un'animazione di penalità
- Viene applicato un **malus al punteggio** pari al valore di un merge della sua categoria: `10 × 2^(livello_creatura - 1) × round_corrente`
- Il malus non può portare il punteggio sotto zero
- **Feedback visivo malus**: un **flash rosso semitrasparente** copre l'intera schermata per ~0.3s (vignette rossa che appare e svanisce rapidamente) — unico effetto negativo, usato esclusivamente per i malus

### Schermata di fine partita
- Punteggio finale, round raggiunto, "Riprova", "Menu"

## 11. UI / HUD

### In partita
- **Top-left**: punteggio corrente + round
- **Top-right**: pulsanti settings (audio on/off, info)
- **Bottom-center**: personaggio in attesa di lancio + freccia di mira
- **Bottom-right**: anteprima NEXT (prossimo personaggio)
- **Mid-pista**: nastro rosso (linea game over)

### Animazione del round
Quando il round avanza, il numero del round nel HUD fa un breve effetto per segnalare il cambio: scale-up → bounce → ritorno a dimensione normale, con un flash leggero sul testo. Dura ~0.5s.

### Animazione del punteggio (contachilometri)
Ad ogni merge il punteggio nel HUD non salta al valore finale, ma **si incrementa gradualmente** come un contatore/odometro:
- La velocità di incremento scala con l'entità del bonus: punteggi piccoli si sommano velocemente (~0.3s), punteggi grandi più lentamente (~1–1.5s) per enfatizzare la crescita
- Se arriva un nuovo merge mentre il contatore sta ancora scorrendo, il contatore **accelera** e parte dal nuovo valore target senza reset
- Durante lo scroll il testo del punteggio può avere un leggero glow o pulse per attirare l'attenzione

### Schermate
- **Splash/menu**: titolo, "Gioca", "Come si gioca", "Crediti"
- **Game over**: punteggio, miglior punteggio, round raggiunto, "Riprova", "Menu"
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
  - Nuovo round (fanfara breve)

## 13. Stile visivo

- **Direzione**: cartoon kawaii, "giocattoloso", colori saturi e allegri
- **Riferimento attuale**: mockup con castello medievale + tendoni + bandiere
- **Decisione finale stile**: aperta, da rivalutare con prototipo giocabile
- **Personaggi**: chibi tondeggianti su base circolare con numero del livello evolutivo visibile
- **Pista**: superficie liscia tipo ghiaccio chiaro o legno laccato
- **Background**: festa/torneo medievale (decorativo, non distrae)

## 14. Asset necessari (stima)

### Sprite personaggi
- **7 specie × 4 livelli base** (Cucciolo, Apprendista, Soldato, Guerriero) = **28 sprite**
- **Campione** (livello 5, solo alcune specie): ~4–5 sprite
- **Eroe** (livello 6, solo alcune specie): ~2–3 sprite
- **Leggenda** (livello 7, solo 1 specie): 1 sprite
- **Totale stimato: ~35–37 sprite**

### Animazioni personaggi
- Idle (respiro leggero) — per ogni sprite
- Squash on landing
- Pop on merge
- Esplosione bonus — varianti per Campione, Eroe, Leggenda (3 animazioni distinte)
- Esplosione malus (rimbalzo oltre la linea)

### VFX particellari
**3 asset particellari** riutilizzati con parametri variabili (`startSize`, `totalParticles`, `duration`) per ogni tier:
- **Scintille** — usato nei tier 4–6 con intensità crescente
- **Esplosione** — usato nei tier 5–6 con scala e densità crescenti; variante per esplosioni bonus Campione/Eroe/Leggenda
- **Coriandoli** — usato nei tier 5–6, con gravità
- **Aura magnetismo** — asset dedicato (piccolo, sempre uguale)

### VFX di scena (nessun asset esterno — implementati via codice)
- Screen shake (offset camera)
- Flash/lampo positivo (overlay node, opacità animata)
- Flash rosso malus (overlay node rosso)
- Slowmo (`timeScale`)

### UI
- Label punteggio (animazione contachilometri)
- Label round (animazione bounce al cambio)
- Timer (4 stati visivi: quasi invisibile → pulse rosso)
- Corda elastica della fionda (drawn proceduralmente o sprite)
- Indicatore forza/angolo di lancio
- Anteprima NEXT personaggio
- Nastro rosso (linea game over)
- Floating score labels (12 varianti di stile testo/colore)
- Pulsanti: Gioca, Riprova, Menu, Pausa, Settings, Audio, Info — ~8 elementi
- Popup tutorial (3–4 schermate)
- Schermata splash, game over, pausa

### Background
- 1 illustrazione fissa (festa/torneo medievale)
- Eventuali layer parallax

### Audio
| SFX | Descrizione |
|-----|-------------|
| Lancio | Whoosh alla partenza |
| Landing | Thud morbido all'arresto |
| Magnetismo | Click magnetico |
| Merge (×6) | Chime ascendente, una variante per livello evolutivo |
| Esplosione Campione | Boom medio + cheer |
| Esplosione Eroe | Boom grande + cheer |
| Esplosione Leggenda | Boom epico + cheer lungo |
| Malus | Suono negativo (buzz/clang) |
| Ticchettio timer | Tick sincronizzato, ultimi 5s |
| Avvicinamento game over | Heartbeat sottile |
| Game over | Trombetta triste comica |
| Nuovo round | Fanfara breve |

- **Totale SFX: ~17** (escludendo varianti merge)
- **Musica**: 1–2 loop tematici (medievale-festivo)

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
- **Completion rate round 1-3**: target >70% (per validare onboarding)
