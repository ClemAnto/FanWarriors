# MEMO — Note tecniche FunWarriors

> Note di implementazione, gotcha, decisioni di tuning e parametri calibrati. Da consultare all'inizio di ogni sessione di sviluppo.

---


## Parametri fisici calibrati

Tutti i valori sono stati tuned in sessione di gioco reale — non modificare senza testare.

### Warrior (Warrior.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `linearDamping` (in volo) | 0.5 | Scivolata lunga stile curling |
| `linearDamping` (fermo) | 16 | Impostato da `settle()` — aumentato da 12 per più stabilità (2026-05-11) |
| `angularDamping` (in volo) | 1.5 | Rotazione smorzata ma non bloccata |
| `angularDamping` (fermo) | 5 | Impostato da `settle()` — aumentato da 4 (2026-05-11) |
| `density` | 8.0 | Alta densità = resistenza agli urti |
| `friction` | 0.05 | Superficie scivolosa (ghiaccio) |
| `restitution` | 0.04 | Impatti molto smorzanti, quasi anelastici |
| `MERGE_DELAY` | 0.3s | Tempo contatto prima del merge |

`settle()` viene chiamato automaticamente da `forceStop()` e anche sui warrior di prefill al momento dello spawn — da quel momento reagiscono agli impatti ma non schizzano.

### Track walls (Track.ts)
| Parete | Restitution | Friction | Note |
|--------|-------------|----------|------|
| Laterali (PolygonCollider2D) | 0.8 | 0.05 | Da bottom-left→top-left e bottom-right→top-right di TrackSprite |
| Top (BoxCollider2D) | 0.0 | 1.0 | Larghezza = `funnelPercentage`% della larghezza sprite |
| Bottom (BoxCollider2D) | 0.0 | 0.0 | Larghezza = larghezza sprite |

I muri sono costruiti da `buildWalls()` sui bounds reali di **TrackSprite** (UITransform + position + scale + anchor) — non dalle costanti `TRACK_W`/`TRACK_BOTTOM_Y`. Si rigenerano automaticamente su `SIZE_CHANGED` / `TRANSFORM_CHANGED`. Spessore = `wallThickness`% della larghezza sprite (default 4%).


**CRITICO — `worldPosition.y` in CC3 2D restituisce la Y LOCALE** (senza applicare la scala del parent). Confermato da `PerspectiveMapper` che moltiplica manualmente `wp.y * sy` per ottenere la Y canvas. Per convertire in canvas-space: `localY * parentScaleY`. Il confronto con `GAME_OVER_LINE_Y` (canvas space) deve quindi essere fatto in spazio locale: `w.node.position.y >= GAME_OVER_LINE_Y / box2dLayer.scaleY`.

**2DBox layer ha scaleY = 0.5**: canvas Y di un warrior = `w.node.position.y * 0.5`. Il getter `GameManager.gameOverLineLocal` centralizza questa conversione: `GAME_OVER_LINE_Y / box2dLayer.scale.y = −320` (con GAME_OVER_LINE_Y=−160).

**CRITICO — live values da Track:** le `export let` primitive importate possono essere snapshot al momento dell'import nei bundle CC3. `trackLayout` è stato rimosso — usare direttamente `TRACK_TOP_Y` / `TRACK_BOTTOM_Y` leggendoli nel momento in cui servono (non in fase di import), oppure chiamare `initLayout()` prima di leggerli.

### InputController (InputController.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `MIN_DRAG` | 20px | Soglia minima drag valido |
| `MAX_DRAG` | 80px | Cap visivo e di forza |
| `MAX_IMPULSE` | 300 | Forza massima applicata |
| Angolo max lancio | ±75° | Clampato da `clampLaunchDir()` |

**Balestra — angolo post-lancio**: la `snapAnim` non reimposta più l'angolo a 0. Il `launcherNode` rimane all'angolo del lancio fino al `clearWarrior()` (chiamato quando viene caricato il warrior successivo), che lo riporta a 0.

**Traiettoria — collisione disco-disco**: `rayCircleT` usa `w.radius + this.warrior.radius` come raggio di collisione. Il raggio da solo (`w.radius`) causa stop anticipato — il corretto punto di stop è quando le superfici si toccano.

**`showBounds`**: impostato a `DEBUG_ENGINE` (non più hardcoded `true`). Mostra i bound della pista sovrapposti alla traiettoria.

### GameManager (GameManager.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `SETTLE_VELOCITY` | 0.4 | Soglia "fermo" — alzata per damping basso |
| `MAGNET_GAP` | 30px | Gap superficie-superficie (non centro-centro) |
| `MAGNET_FORCE` | 20 | Forza base; scala quadratica + massa |
| `LAUNCH_CHECK_DELAY` | 0.8s | Attesa prima di valutare se il lancio ha fallito |
| `waitForSettling` | `false` | `false` = nuovo warrior appena il lanciato supera la linea |
| `SPAWN_X` | 0 | Centro orizzontale |
| `SPAWN_Y` | −220 | Sotto la game over line |


---

## Magnetismo — surface-to-surface (non center-to-center)

**CRITICO:** il magnetismo usa il gap superficie-superficie, non la distanza centro-centro.  
Con warrior lv7 (r=60), due warrior a contatto hanno centri a 120px — usando center-to-center con raggio 75px non si attraggono mai.

```typescript
const gap = Math.max(0, dist - a.radius - b.radius);  // gap superfici
if (gap < MAGNET_GAP) { ... }
```

La forza scala anche con la massa (∝ r²) per dare accelerazione uguale a tutti i livelli:
```typescript
const massScale = (a.radius * a.radius) / r1sq;  // r1sq = raggio lv1 al quadrato
force = MAGNET_FORCE * (1 + t*t*8) * massScale;
```

---

## Momentum conservation sul merge

Quando due warrior si fondono, il warrior risultante eredita il **75% della velocità media** dei due:
```typescript
const vx = (a.velocity.x + b.velocity.x) * 0.5 * 0.75;
const vy = (a.velocity.y + b.velocity.y) * 0.5 * 0.75;
merged.velocity = new Vec2(vx, vy);
```
Lo snap di velocità in `onBeginContact` già equalizza le velocità dei due warrior prima del merge — in pratica sono già uguali quando scatta la fusione.

---

## Angolo di lancio — clamping ±75°

La direzione di lancio è sempre limitata a ±75° dalla verticale (`clampLaunchDir` in InputController):
```typescript
const MAX_ANGLE = 75 * Math.PI / 180;
const angle = Math.atan2(dir.x, dir.y);   // 0 = su, + = destra
const clamped = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
```
Vale sia per il lancio manuale che per l'auto-launch allo scadere del timer.

---

## waitForSettling — flag di flusso lancio

`GameManager.waitForSettling` controlla quando viene attivato il warrior successivo:
- `true` → comportamento classico: aspetta che tutti i warrior siano fermi (velocity < `SETTLE_VELOCITY`)
- `false` *(default attuale)* → il warrior successivo si attiva **non appena quello lanciato supera la linea** — la pista può essere in movimento

---

## Riavvio scena — gotcha Cocos Creator 3.8

`game.restart()` causa un crash nel modulo interno `splash-screen.ts` (bug engine). **Non usarlo.**

**Soluzione corretta:** salvare il nome della scena in `start()` e usare `director.loadScene()`:
```typescript
// in start():
this.sceneName = director.getScene()?.name || 'GameScene';
// nel pulsante retry:
director.loadScene(this.sceneName);
```
La scena deve essere in **Project → Build Settings → Scenes in Build**. Se il nome risulta vuoto anche in `start()`, il fallback `|| 'GameScene'` garantisce il funzionamento.

Errore correlato: **"Can not find class 'XXXXXX'"** al reload della scena — significa che il file `.scene` ha un riferimento a un componente rinominato/eliminato. Fix: aprire la scena, trovare il nodo con l'icona ⚠️ nell'Inspector, rimuovere il componente rotto e risalvare.

---

## Gotcha Cocos Creator 3.8

### `node.color` non esiste in CC3 — usare `Sprite.color`

In CC3 i nodi 2D non hanno una proprietà `.color` accessibile via TypeScript. Per tintare uno sprite usare direttamente la proprietà `.color` del component `Sprite`:
```typescript
const sp = this.viewNode.addComponent(Sprite);
sp.color = new Color(255, gb, gb, 255);  // moltiplicatore RGB applicato alla texture
```
`node.color` funziona come moltiplicatore per `Sprite` (via shader), ma **non ha effetto su `Graphics`** — i comandi di disegno hanno colori pre-baked. Per fare un overlay su Graphics serve un nodo figlio separato.

---

### `enabledContactListener = true` — CRITICO
**Obbligatorio** su ogni `RigidBody2D` che deve ricevere callback di contatto. Senza, `Contact2DType.BEGIN_CONTACT` non viene mai chiamato. Va impostato in codice prima che il nodo entri in scena.
```typescript
rb.enabledContactListener = true;
```

### `Vec2.ZERO` è frozen
`Vec2.ZERO` è una costante read-only. Assegnare le sue proprietà causa crash runtime:
```
Cannot assign to read only property 'x' of object
```
Usare **sempre** `new Vec2(0, 0)` per valori zero scrivibili.

### `[].every(fn)` ritorna `true` (vacuous truth)
Importante nel sistema di settling: se tutti i warrior si fondono e `inPlay` è vuoto, `inPlay.every(isSettled)` è `true` — il settling si completa correttamente. Non aggiungere guard `if (inPlay.length === 0) return` — romperebbe questo comportamento.

### `component.node` diventa `null` dopo `node.destroy()`
Dopo `node.destroy()`, l'accesso a `component.node` ritorna `null` nel tick successivo. Usare `?.` ovunque e filtrare nei loop:
```typescript
this.warriors = this.warriors.filter(w => w != null && w.node != null && w.node.isValid);
```




### Tutti i nodi 2D devono essere figli di Canvas
Nodi creati a runtime con `new Node()` devono avere `setParent(canvasNode)` — il GameManager usa `this.node.parent` assumendo che il suo nodo sia figlio di Canvas. Non spostare il nodo GameManager fuori da Canvas.

### Widget TOP/BOTTOM — UITransform height del nodo figlio conta
Con Widget ALWAYS e allineamento TOP, il motore calcola la posizione del centro del nodo come:
`y_center = parent.height/2 - widget_top - nodeHeight * anchorY`
Se il nodo figlio ha una UITransform height sproporzionata (es. 680 invece di 80), il centro scende di `(680-80)*0.5 = 300px` rispetto al previsto. Controllare sempre la `_contentSize` del nodo ancorabile.

### `scheduleOnce` / `unschedule` — reference alla callback
`this.unschedule(cb)` richiede la stessa **reference** alla funzione passata a `scheduleOnce`. Per questo il merge usa `mergeCallbacks: Map<Warrior, () => void>` — la callback viene salvata per poterla annullare in `onEndContact`.

---

## Architettura del sistema di settling

Il problema: dopo un lancio, bisogna aspettare che tutti i warrior si fermino prima di abilitare il lancio successivo. Senza questo, lanci ravvicinati si sovrappongono.

**Soluzione implementata:**
1. `Warrior.launched: boolean` — diventa `true` quando `applyImpulse()` è chiamato
2. `GameManager.settling: boolean` — attivato da `onWarriorLaunched`, disattivato quando tutti i warrior `launched` hanno velocità < `SETTLE_VELOCITY`
3. In ogni frame `checkSettled()`: forza-ferma i warrior lenti (`forceStop()`), poi controlla se tutti sono fermi
4. Il prossimo warrior viene attivato solo quando `settling = false`

**Race condition risolta:** `pendingWarrior` viene creato quando il warrior attraversa la linea (`checkLineLogic`), NON al momento del lancio. Se creato al lancio, un merge veloce completava il settling prima dei 0.3s di delay del spawn → il warrior non veniva mai attivato.

**Magnetismo quadratico:**
```typescript
const t = 1 - (nearestDist / MAGNET_RADIUS);  // 0=lontano, 1=vicino
force = MAGNET_FORCE * (1 + t * t * 8);        // ≈8 lontano, ≈72 a contatto
```
Questo garantisce attrazione impercettibile a distanza ma forte snap al contatto.

---

## Snap effect al contatto

Quando due warrior compatibili si toccano (`onBeginContact`), le loro velocità vengono **equalizzate alla media**:
```typescript
const avgX = (rbA.linearVelocity.x + rbB.linearVelocity.x) / 2;
rbA.linearVelocity = new Vec2(avgX, avgY);
rbB.linearVelocity = new Vec2(avgX, avgY);
```
Senza questo, i warrior rimbalzano tra loro prima di innescare il merge. L'equalizzazione li fa "incollare" immediatamente.

---

## Prefill della pista

All'avvio la pista viene prefillata con 3 warrior (design decision, Fase 1):
- Tipo 0 a (−90, 220)
- Tipo 1 a (0, 250)
- Tipo 2 a (90, 220)

Posizioni aggiornate in Fase 2 per la pista a funnel (TRACK_W=576): a y=220 la semi-larghezza interna è ~216px, quindi x=±90 lascia ampio margine dalla parete.

I warrior prefill hanno `crossedLine = true` e `fired = true` impostati manualmente — non passano per il sistema di lancio ma sono soggetti al check di game-over.

---

## Animazione next preview (animateNextTransition)

`onNextGenerated` viene chiamato **sincrono dentro `spawnNext()`**, prima che `createWarrior()` restituisca il warrior. Quindi al momento in cui `animateNextTransition()` gira, `nextLaunchWarrior` non è ancora impostato — viene settato solo dopo il return di `spawnNext()`. Fix: `scheduleOnce(..., 0)` per rinviare al frame successivo.

**Struttura animazione:**
1. Zoom-out su `nextPreviewNode` (creatura, 0.12s) — `nextSecNode` (cerchio + label) resta fermo
2. `.delay(0.18)` — pausa di suspense
3. `updateNextPreview(true)` → bubble zoom-in su `nextPreviewNode` della nuova creatura
4. In parallelo: deferred (frame+1) → warrior al launcher parte da scala 0 e fa bounce-in

**Non animare mai `nextSecNode`** per lo zoom-out/in delle creature — altrimenti il cerchio di sfondo sparisce insieme.

---

## Linea di game over — stile visivo (v0.4.0+)

Disegnata in `Track.buildWalls()` sul nodo **Track** — garantisce che sia sempre renderizzata sotto i warrior (che stanno in `GameLayer`). Si rigenera automaticamente su `relayout()`.

- Linea tratteggiata manuale (dash 12px, gap 8px) con `Graphics`
- Spessore **6px**, rosso `(255, 0, 0, 153)` — opacità 60%
- Nodo aggiunto a `_walls[]` → distrutto e ricreato ad ogni rebuild muri

**Pulse di pericolo**: quando almeno un warrior (da turni precedenti) ha il bordo inferiore ≤ `GAME_OVER_LINE_Y`, `GameManager.checkLineLogic()` chiama `track.setLinePulse(true)`. `Track` avvia un tween `UIOpacity` 255→30→255 in loop (0.7s/ciclo). Appena nessun warrior tocca la linea, `setLinePulse(false)` ferma il tween e ripristina opacità 255.

`setLinePulse` è idempotente: controlla `_linePulseActive` prima di avviare/fermare per evitare restart ogni frame.

---

## Cosa NON è ancora implementato (stato Fase 2)

- **Livelli massimi per specie** — nel codice tutti i tipi vanno fino a lv7, ma il GDD prevede cap diversi per specie (lv5/6/7 solo per alcune). Da implementare in Fase 3 quando arrivano gli asset definitivi.
- **Contachilometri punteggio** — il punteggio salta al valore finale invece di scorrere come un odometro
- **Timer: 4 stati visivi** — attualmente solo rosso sotto 5s; mancano gli stati "quasi invisibile" e "arancione pulse"
- **Floating score tier system** — attualmente un solo stile; il GDD prevede 6 tier con dimensione/colore/FX
- **Debug panel e debug label** — da rimuovere o nascondere prima dello shipping
- **Audio** — nessun SFX né musica

---

## HUD — struttura corrente (v0.3.6)

| Sezione | Posizione | Font caption / valore |
|---------|-----------|----------------------|
| ScoreSec | top-left | 28 / 46 |
| RoundSec | top-right | 28 / 46 — include ring progress e label `N/M` |
| NextSec | left, centrata verticalmente | 13 |
| TimerSec | centro zona di lancio | 44 |

**MERGES rimossa dalla HUD** in v0.3.6 — il tracciamento dei merge è ora implicito nel ring del round.  
**Ring progress round**: `R=35`, `LW=10` (spessore raddoppiato rispetto a v0.3.4). Sfondo `(60,60,70,220)`, arco `(120,220,255,255)`.

---

## Danger tint — formula piecewise

Il warrior in pericolo (crossedLine = true) viene tintato di rosso in base alla posizione del suo **bordo inferiore** rispetto a `GAME_OVER_LINE_Y`. `h = 2 × radius` (diametro).

| Posizione bordo inferiore | factor | Colore (R=255, G=B=gb) |
|---------------------------|--------|------------------------|
| > `GAME_OVER_LINE_Y + h` | 0 | nessun tint |
| = `GAME_OVER_LINE_Y + h` | 0.1 | appena rosato |
| = `GAME_OVER_LINE_Y` | 0.8 | rosso netto |
| = `GAME_OVER_LINE_Y − h` | 1.1 | rosso intenso (max) |

Implementazione in `checkLineLogic` (GameManager.ts):
```typescript
const bottom = y - w.radius;
const h = w.radius * 2;
let factor = 0;
if (bottom <= GAME_OVER_LINE_Y + h) {
    factor = bottom >= GAME_OVER_LINE_Y
        ? 0.1 + 0.7 * (1 - (bottom - GAME_OVER_LINE_Y) / h)
        : 0.8 + 0.3 * Math.min(1, (GAME_OVER_LINE_Y - bottom) / h);
}
```
Mappatura colore in `Warrior.setDangerTint`: `gb = Math.max(0, Math.round(255 - factor * 170))`.

**CRITICO — `settled` e `fired` flag e chi li imposta**:
- **Prefill**: `SpawnManager.prefill()` chiama `w.settle()` → `settled = true`; imposta anche `w.fired = true` (è già in campo) ✓
- **Lanciati**: `checkLineLogic` imposta `w.settled = true` e `w.crossedLine = true` quando il warrior supera la linea; `fired` è già `true` (settato da `applyImpulse`) ✓
- **Merged**: `mergeWarriors()` chiama `merged.settle()` e imposta `merged.fired = true` ✓

`waitForSettling` è sempre `false` → `GameState.Settling` non viene mai raggiunto → `checkSettled()` non è il punto in cui si setta `settled`.

**`fired` (one-way flag)**: settato da `applyImpulse()` e mai resettato (diversamente da `launched` che viene resettato da `penaliseAndReturn`). Garantisce che il warrior sul launcher e quello nella preview (che non hanno mai chiamato `applyImpulse`) non possano triggerare il game over per nessuna ragione — il branch game-over in `checkLineLogic` richiede `w.fired`.

**`inflightWarrior`**: il warrior di turno corrente è escluso dall'`anyDanger` che attiva il pulse della linea. Viene impostato in `onWarriorLaunched(w)` e sovrascritto al lancio successivo.

**Condizione game-over — frame sostenuti**: la condizione non è più una singola transizione di frame (`prev >= gol && y < gol`) ma richiede `GAME_OVER_FRAMES = 3` frame consecutivi sotto la linea. Analogamente, `crossedLine = true` richiede `CROSS_LINE_FRAMES = 3` frame consecutivi sopra la linea. Questo elimina i false positive da jitter fisico e da "sfioramento" della linea per un solo frame.

---

## resetPhysics() — ripristino parametri fisici

Dopo `penaliseAndReturn`, il warrior torna al launcher con `linearDamping=16` (settato da `settle()`). Chiamare `w.resetPhysics()` nel callback del tween prima di `activateWarrior(w)` per ripristinare i valori di volo:
- `linearDamping = 0.5`, `angularDamping = 1.5`
- `density = 8.0`, `friction = Warrior.friction`, `restitution = 0.04`

---

## hitOtherWarrior — game over vs malus al fallito lancio

Se il warrior lanciato non supera la linea, il destino dipende da se ha toccato altri warrior in gioco:
- **Ha toccato warrior `crossedLine=true`** → game over immediato
- **Non ha toccato nessuno** → malus punteggio + riposizionamento

Il flag `Warrior.hitOtherWarrior` viene settato in `onBeginContact` quando `this.launched && !this.crossedLine && otherW.crossedLine`, e resettato a ogni `applyImpulse`.

---

## Merge cap a lv7

Se due warrior lv7 si fondono (`newLevel > 7`), entrambi vengono distrutti e nessun nuovo warrior viene spawnato. È il comportamento corretto — livello 7 è il massimo.

---

## Responsive layout — LIVE_RESIZE

Flag `LIVE_RESIZE` in `GameManager.ts` (riga 13): `true` in sviluppo, `false` in produzione.

- `true` → ascolta `window.resize`; ad ogni resize chiama `track.relayout()` che ricalcola `initLayout()`, ridisegna la pista e ricostruisce i muri fisici; debounce via `requestAnimationFrame` (max 1 relayout/frame)
- `false` → layout calcolato una sola volta in `start()`

**Cosa si aggiorna al relayout:**
| Elemento | Aggiornato? | Note |
|----------|-------------|------|
| Pista (grafica + muri fisici) | ✓ | `Track.relayout()` |
| HUD Widget-based | ✓ | automatico Cocos |
| Timer label (posizione) | ✓ | aggiornato esplicitamente |
| Warrior già in pista | ✗ | rimangono nel vecchio spazio — accettabile in debug |
| `SpawnManager.spawnY` | ✓ | ora è un getter che legge `GAME_OVER_LINE_Y` e `WALL_RB.y` live ad ogni spawn |

---

## DebugPanel — coordinate space (gotcha v0.5.1)

`DebugPanel` opera in canvas space (world coords), ma i warrior sono figli di `box2dLayer` (scaleY=0.5), quindi `w.node.position.y` è in local space (y_locale = y_canvas / 0.5).

Tre punti critici corretti in v0.5.1:
- **Hit detection warrior**: `Vec2.distance(world, new Vec2(wp.x, wp.y * layerScaleY))` — y locale → canvas
- **Drag move**: `node.setPosition(world.x, world.y / layerScaleY)` — canvas → local
- **Drop palette**: `addDebugWarrior(t, 1, world.x, world.y / layerScaleY)` — canvas → local

`DebugPanel.layerScaleY` deve essere impostato da GameManager prima di `init()`:
```typescript
const panel = debugNode.addComponent(DebugPanel);
panel.layerScaleY = this.box2dLayer.scale.y;
panel.init(this);
```

---

## Errori comuni in sviluppo

| Errore | Causa | Fix |
|--------|-------|-----|
| `Cannot read properties of null (reading 'isValid')` | Accesso a `w.node` dopo `destroy()` | Aggiungere `w.node != null &&` nei filter |
| `Cannot assign to read only property 'x'` | Uso di `Vec2.ZERO` | Usare `new Vec2(0, 0)` |
| Contact callbacks mai chiamate | Manca `enabledContactListener = true` | Aggiungerlo in `buildPhysics()` |
| Track in angolo bottom-left | Track node non a (0,0,0) | `this.node.setPosition(0,0,0)` in `start()` |
| Loop infinito dopo un merge | Accesso a nodo distrutto nel loop `update()` | Filtrare warriors con `node.isValid` |
| Settling non si completa mai | Guard `if (inPlay.length === 0) return` | Rimuovere il guard — `[].every()` è `true` |
| pendingWarrior non attivato | Creato troppo tardi dopo merge veloce | Creare in `checkLineLogic`, non in `onWarriorLaunched` |
| **Launcher bloccato in fase avanzata** | Warrior in volo fonde con warrior esistente prima di superare la linea → `state` resta `Inflight`, `checkLineLogic` non trova warrior da attivare | `inflightMerged` flag in `mergeWarriors` + `activateAfterInflightMerge()` — fixato in v0.3.6 |

### Bug — warrior inflight che fonde prima di superare la linea (RISOLTO v0.3.6)

**Scenario**: warrior lanciato (A, `launched=true`, `crossedLine=false`) tocca un warrior esistente (B, stesso tipo/livello, `crossedLine=true`) nella zona di lancio sotto la game-over line. Merge schedula in 0.3s; entrambi vengono distrutti; il merged warrior nasce con `crossedLine=true`. `checkLineLogic` non trova più nessun warrior con `!crossedLine && launched` → `activateWarrior` non viene mai chiamato → `state` rimane `Inflight` per sempre.

`checkLaunchResult` (schedulato a +0.8s) trova `!w.node.isValid` → early return senza attivare nulla.

**Fix**: all'inizio di `mergeWarriors`, calcolare `inflightMerged = state === Inflight && (a.launched && !a.crossedLine || b.launched && !b.crossedLine)`. Alla fine (e dopo il `return` early per max-level), chiamare `activateAfterInflightMerge()` se il flag è `true`.

---


## Deploy su GitHub Pages

Il deploy Netlify è sospeso (quota esaurita). Deploy attivo su **GitHub Pages**:

```powershell
npm run deploy   # scripts/deploy.js — inietta versione + pusha su branch gh-pages
```

URL live: **https://clemanto.github.io/FanWarriors/**

### Come funziona il deploy script

`scripts/deploy.js` usa un repo git temporaneo in `os.tmpdir()` per aggirare il `.gitignore` root che esclude `native/` e `build/`. Senza questo workaround, i file in `assets/main/native/` (PNG degli asset Cocos) non venivano pushati e il gioco crashava con errore 4930.

Flusso:
1. Iniezione versione in `index.html` (`__VERSION__` → `pkg.version`)
2. Crea `.nojekyll` nella build dir (impedisce a GitHub Pages di girare Jekyll)
3. Copia `build/web-mobile` in una dir temp
4. Init git fresh + commit + `git push -f FanWarriors HEAD:gh-pages`
5. Cleanup dir temp

### `netlify.toml` — fix ordine header (2026-05-12)

In Netlify l'ultima regola che fa match vince. La regola `/*` deve essere **prima**, le regole specifiche dopo. Ordine corretto nel file:
1. `/*` — catch-all, cache 7 giorni (immagini, audio, font)
2. `/**/*.html` / `/**/*.css` / `/**/*.js` / `/**/*.json` — `no-cache, no-store, must-revalidate`

Cocos non hasha i nomi dei file JS/CSS, quindi senza `no-cache` il browser serve versioni vecchie dopo ogni deploy.

---

## Testing remoto su mobile

Permette di testare la build su telefono fuori dalla stessa rete WiFi del PC.

### Flusso completo

**1. Build headless (CLI)**
```powershell
npm run build   # scripts/build.js — wrappa CocosCreator.exe, gestisce ELECTRON_RUN_AS_NODE
```
- Exit code **0** o **36** = successo (36 = successo con warning, normale)
- Il script cancella `ELECTRON_RUN_AS_NODE` prima di lanciare (CRITICO: altrimenti CC gira come Node.js)
- CocosCreator.exe: `C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe`

In alternativa, manualmente in PowerShell:
```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe" `
  -ArgumentList "--project","D:\Projects\FunWarriors","--build","outputName=web-mobile;platform=web-mobile;debug=false" `
  -PassThru -Wait
Write-Output "Exit code: $($proc.ExitCode)"
```

**2. Serve + tunnel in un comando**
```powershell
npm run serve   # scripts/serve-remote.js — avvia Python HTTP server porta 8080 + ngrok
```

**3. Tunnel pubblico (ngrok)**
```bash
npx ngrok http 8080
# Oppure in background e recupera URL via API:
npx ngrok http 8080 --log=stdout &
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"'
```
L'URL resta fisso per tutta la sessione ngrok (es. `https://macarena-lavender-excavator.ngrok-free.dev`).

**4. Impedire standby PC**
```bash
# Disabilita standby AC (prima di uscire)
powercfg /change standby-timeout-ac 0
# Ripristina (quando torni)
powercfg /change standby-timeout-ac 15
```

### Setup iniziale ngrok (una tantum)
```bash
# Registrarsi su ngrok.com e ottenere authtoken dal dashboard
npx ngrok config add-authtoken <TOKEN>
```

### CRITICO — kill prima di rebuild
Serve deve essere spento prima di rilanciare la build, altrimenti CC non riesce a scrivere i file (EPERM — file lock di Windows):
```powershell
Get-Process -Name "node" | Stop-Process -Force
# poi cancellare la build se ci sono errori di permesso
cmd /c rd /s /q "d:\Projects\FunWarriors\build"
```

### Perché ngrok e non localtunnel
localtunnel è gratuito ma crasha frequentemente (503 Bad Gateway, connessione persa).  
ngrok richiede account gratuito ma è stabile per sessioni di test lunghe.
