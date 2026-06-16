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
| `friction` (collider warrior) | 0.3 | `Warrior.contactFriction` — la scivolata è data dal damping, non dalla friction |
| `restitution` | 0.04 | Impatti molto smorzanti, quasi anelastici |
| `MERGE_DELAY` | 0.3s | Tempo contatto prima del merge |

`settle()` viene chiamato automaticamente da `forceStop()` e anche sui warrior di prefill al momento dello spawn — da quel momento reagiscono agli impatti ma non schizzano.

### Track walls (Track.ts)
| Parete | Restitution | Friction | Note |
|--------|-------------|----------|------|
| Laterali (PolygonCollider2D) | 0.8 | 0.05 | Da bottom-left→top-left e bottom-right→top-right di TrackSprite |
| Top (BoxCollider2D) | 0.0 | 1.0 | Larghezza = `funnelPercentage`% della larghezza sprite |
| Bottom (BoxCollider2D) | 0.0 | 0.0 | Larghezza = larghezza sprite |

I muri sono costruiti da `buildWalls()` sui bounds reali di **TrackSprite** (UITransform + position + scale + anchor) — non dalle costanti `TRACK_W`/`TRACK_BOTTOM_Y`. Si rigenerano automaticamente su `SIZE_CHANGED` / `TRANSFORM_CHANGED`. Spessore = `wallThickness`% della larghezza sprite (default 12% — raddoppiato da 6% in v0.6.14).


**CRITICO — `worldPosition.y` in CC3 2D restituisce la Y LOCALE** (senza applicare la scala del parent). Confermato da `PerspectiveMapper` che moltiplica manualmente `wp.y * sy` per ottenere la Y canvas. Per convertire in canvas-space: `localY * parentScaleY`. Il confronto con `GAME_OVER_LINE_Y` (canvas space) deve quindi essere fatto in spazio locale: `w.node.position.y >= GAME_OVER_LINE_Y / box2dLayer.scaleY`.

**2DBox layer ha scaleY = 0.5**: canvas Y di un warrior = `w.node.position.y * 0.5`. Il getter `GameManager.gameOverLineLocal` centralizza la conversione della soglia di game-over.

**ENDLINE — soglia prospettica corretta (v0.8.41)**: NON usare `GAME_OVER_LINE_Y / sy` (con `GAME_OVER_LINE_Y = node.worldPosition.y`): è world-space usato come canvas-centrato → la soglia finiva troppo in alto rispetto alla linea rossa dello sprite (il game-over scattava col warrior nettamente sopra). `gameOverLineLocal` ora fa `coords.visualToPhys(endlineNode.worldPosition.y − warriorsLayer.worldPosition.y)` → inverte la stessa mappatura di rendering, calcolato live ogni accesso (robusto a resize/timing). Debug: flag `SHOW_ENDLINE_DEBUG` → linea viola su WarriorsLayer a `physToVisual(gol)` (coincide con la rossa). Dettagli in TECH.md.

**CRITICO — live values da Track:** le `export let` primitive importate possono essere snapshot al momento dell'import nei bundle CC3. `trackLayout` è stato rimosso — usare direttamente `TRACK_TOP_Y` / `TRACK_BOTTOM_Y` leggendoli nel momento in cui servono (non in fase di import), oppure chiamare `initLayout()` prima di leggerli.

### InputController (InputController.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `MIN_DRAG` | 20px | Soglia minima drag valido |
| `MAX_DRAG` | 80px | Cap visivo e di forza |
| `MAX_IMPULSE_BASE` | 1150 | Forza base al livello 1 — scala con `(r/r1)^2` |
| Angolo max lancio | ±75° | Clampato da `clampLaunchDir()` |

**Forza per livello**: `maxImpulse = MAX_IMPULSE_BASE × scale × (r/r1)²` — esponente 2 compensa esattamente la massa (∝ r²), dando velocità iniziale **identica per tutti i livelli** a parità di drag.

**Balestra — angolo post-lancio**: la `snapAnim` non reimposta più l'angolo a 0. Il `launcherNode` rimane all'angolo del lancio fino al `clearWarrior()` (chiamato quando viene caricato il warrior successivo), che lo riporta a 0.

**Swap Next (v0.8.6)** — listener diretto `nextPreviewNode.on(Node.EventType.TOUCH_END, () => this.swapNextWithLauncher(), this)` in GameManager. Rimosso il vecchio meccanismo `onSwapNext` + `_swapTapStart` da InputController. `_isInsideTrack()` delimita il drag alla geometria reale della pista (interpolazione pareti alla Y del tocco), quindi i tocchi sul NextPreview (fuori dal track) non avviano più il drag.

**CRITICO — `getChildByName` cerca solo figli diretti**: in CC3, `node.getChildByName('X')` non fa ricerca ricorsiva. Per nodi annidati usare `existingHud.getChildByName('X')` se il nodo esatto è in scope, oppure `find('UILayer/HUD/X')` partendo dal root. Esempio bug: `this.node.parent!.getChildByName('MenuButton')` → Canvas cerca tra i figli diretti, ma MenuButton è a `Canvas > UILayer > HUD > MenuButton` → sempre null.

**Traiettoria — collisione disco-disco**: `rayCircleT` usa `w.radius + this.warrior.radius` come raggio di collisione. Il raggio da solo (`w.radius`) causa stop anticipato — il corretto punto di stop è quando le superfici si toccano.

**Traiettoria — collisione disco-parete**: le pareti vengono spostate verso l'interno di `warrior.radius` prima del ray-cast, così il bounce point corrisponde alla posizione del centro quando il cerchio tocca la parete. Attenzione: la normale della parete destra `(rwNu, rwNv)` punta verso destra (fuori dal track) quindi l'offset è `-radius * (rwNu, rwNv)`; la parete sinistra ha normale verso destra (dentro) quindi `+radius * (lwNu, lwNv)`. Anche il `trackTopY` viene abbassato di `radius`.

**`showBounds`**: impostato a `DEBUG_ENGINE` (non più hardcoded `true`). Mostra i bound della pista sovrapposti alla traiettoria.

### GameManager (GameManager.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `SETTLE_VELOCITY` | 0.4 | Soglia "fermo" — alzata per damping basso |
| `MAGNET_GAP_BASE` | 30px | Gap superficie-superficie (non centro-centro) — scalato da `LAYOUT_SCALE` |
| `MAGNET_FORCE_BASE` | 40 | Forza base — scalata da `LAYOUT_SCALE`; quadratica + massa |
| `LAUNCH_CHECK_DELAY` | 0.8s | Attesa prima di valutare se il lancio ha fallito |
| `waitForSettling` | `false` | `false` = nuovo warrior appena il lanciato supera la linea |
| `SPAWN_X` | 0 | Centro orizzontale |
| spawn Y | live | `SpawnManager.spawnY` è un getter che legge `GAME_OVER_LINE_Y`/`WALL_RB.y` ad ogni spawn (non più costante) |


---

## Magnetismo — surface-to-surface (non center-to-center)

**CRITICO:** il magnetismo usa il gap superficie-superficie, non la distanza centro-centro.  
Con warrior lv7 (r=60), due warrior a contatto hanno centri a 120px — usando center-to-center con raggio 75px non si attraggono mai.

```typescript
const gap = Math.max(0, dist - a.radius - b.radius);  // gap superfici
if (gap < MAGNET_GAP) { ... }
```

La forza è **quadratica con la prossimità** e scala anche con la massa (∝ r²) per dare accelerazione uguale a tutti i livelli:
```typescript
const t = 1 - (nearestDist / MAGNET_RADIUS);     // 0=lontano, 1=vicino
const massScale = (a.radius * a.radius) / r1sq;  // r1sq = raggio lv1 al quadrato
force = MAGNET_FORCE * (1 + t*t*8) * massScale;  // ≈8 lontano, ≈72 a contatto
```
Questo garantisce attrazione impercettibile a distanza ma forte snap al contatto.

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

### `Label.lineHeight` default 40 — clipping verticale con fontSize grandi
Il default di `lineHeight` in CC3 è **40px fissi**, NON segue `fontSize`. Una Label creata da codice con `fontSize` > ~40 (es. i numeri 88px del banner round-up) viene **clippata verticalmente** — peggio con MedievalSharp che ha ascendenti alti. Impostare sempre `lbl.lineHeight = fontSize × ~1.15` sulle Label runtime con font grande. (Scoperto 2026-06-12 sul banner round-up.)

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

### `node.isValid` non si aggiorna subito dopo `node.destroy()`
In CC3, `node.destroy()` schedula la distruzione ma non imposta `isValid = false` immediatamente. Se si fa un check su `node.isValid` nello stesso frame (o nella stessa callback `scheduleOnce`) dopo `destroy()`, il nodo risulta ancora valido.

**Fix obbligatorio**: dopo `node.destroy()`, filtrare **subito** l'array manualmente:
```typescript
if (a.node.isValid) a.node.destroy();
if (b.node.isValid) b.node.destroy();
this.warriors = this.warriors.filter(x => x !== a && x !== b); // <-- subito, non dopo
```
Non affidarsi a `w.node?.isValid` per escludere warrior appena distrutti — potrebbero ancora risultare validi.




### Tutti i nodi 2D devono essere figli di Canvas
Nodi creati a runtime con `new Node()` devono avere `setParent(canvasNode)` — il GameManager usa `this.node.parent` assumendo che il suo nodo sia figlio di Canvas. Non spostare il nodo GameManager fuori da Canvas.

### Widget TOP/BOTTOM — UITransform height del nodo figlio conta
Con Widget ALWAYS e allineamento TOP, il motore calcola la posizione del centro del nodo come:
`y_center = parent.height/2 - widget_top - nodeHeight * anchorY`
Se il nodo figlio ha una UITransform height sproporzionata (es. 680 invece di 80), il centro scende di `(680-80)*0.5 = 300px` rispetto al previsto. Controllare sempre la `_contentSize` del nodo ancorabile.

### `instantiate(node)` clona anche il Widget — e `destroy()` è differito
Clonando un bottone che ha un Widget con `alignMode: ALWAYS`, il clone eredita il Widget e viene risnappato **ogni frame** sulla posizione dell'originale (sovrapposizione perfetta: si vede solo il clone, che è sibling successivo). Non basta `clone.getComponent(Widget)?.destroy()`: la distruzione dei componenti è **differita a fine frame**, quindi il Widget fa in tempo a un ultimo allineamento DOPO il `setPosition`. Serve disabilitarlo subito: `w.enabled = false; w.destroy();` (caso reale: bottone Quit clonato dal Close nel dialog Settings, 2026-06-12).

### `scheduleOnce` / `unschedule` — reference alla callback
`this.unschedule(cb)` richiede la stessa **reference** alla funzione passata a `scheduleOnce`. Per questo il merge usa `mergeCallbacks: Map<Warrior, () => void>` — la callback viene salvata per poterla annullare in `onEndContact`.

### Deploy web + cache del browser — usare `md5Cache=true`
Su GitHub Pages i bundle Cocos (`assets/main/`, `assets/resources/`) hanno nomi stabili → il browser (specie mobile) li serve da cache anche dopo un nuovo deploy, mostrando codice/asset vecchi pur con `index.html` aggiornato. **Soluzione**: `scripts/build.js` builda con `md5Cache=true` → ogni file prende un hash nel nome, quindi un nuovo build = nuovi nomi = niente stale cache. `patch-html.js` cache-busta gli `<script src>` locali ma **non** gli URL assoluti (CDN Firebase). Deploy = `npm run build` poi `npm run deploy` (force-push su `gh-pages`), MAI in automatico.

### `director.getScene().name` è `""` in `onLoad` (nei build) — NON usarlo per il comportamento
Tentativo (abbandonato) di far cambiare comportamento a `LeaderboardPanel` via `director.getScene()?.name === 'Ranking'` in `onLoad`: nei build il nome scena è **stringa vuota** durante `onLoad` → la detection falliva e il pannello si auto-nascondeva ("vedo solo lo sfondo"). Non basare la logica di `onLoad`/`start` sul nome della scena. Se serve distinguere contesti, passare un dato esplicito (es. `static pendingScore` impostato prima di `loadScene`) — è così che oggi il game-over consegna lo score alla scena Ranking.

### `.node.off(...)` su componente già distrutto in `onDestroy` → crash
`if (this._comp) this._comp.node.off(...)` NON basta: un componente CCObject distrutto resta **truthy** ma `.node` è `null` → `null.off(...)` ("Cannot read properties of null (reading 'off')"). Emerge nel teardown scena (es. game-over → `loadScene('Ranking')`). Guardare `isValid`: `const n = this._comp?.node; if (n?.isValid) n.off(...)`. Vedi `Track.onDestroy`.

### Nodi-layer creati a runtime NON hanno `UITransform` → `getComponent(UITransform)?.convert…` salta in silenzio
`VFXLayer` non esiste in nessuna scena: GameManager lo crea a runtime come `new Node()` puro. Un `getComponent(UITransform)?.convertToNodeSpaceAR(...)` su quel nodo restituisce `undefined` e il codice a valle non viene eseguito **senza alcun errore** (bug del burst della sagoma "che non si vede", 2026-06-12). Fix: `getComponent(UITransform) ?? addComponent(UITransform)` — con size 0 e anchor centrato la conversione è una pura trasformata inversa.

### Asset copiati a mano in `resources/` — meta minimale e l'editor completa
Per portare `atom.png` dalla libreria internal di Cocos: copiare il PNG in `assets/resources/particles/` + scrivere un meta minimale (`importer: image`, `imported: false`, uuid nuovo, `userData.type: sprite-frame`) → l'editor al refresh completa l'import con i subMeta `texture`/`spriteFrame`. Il loader runtime ha comunque il doppio path `…/spriteFrame` → fallback `Texture2D`.

---

## Architettura del sistema di settling

Il problema: dopo un lancio, bisogna aspettare che tutti i warrior si fermino prima di abilitare il lancio successivo. Senza questo, lanci ravvicinati si sovrappongono.

**Soluzione implementata:**
1. `Warrior.launched: boolean` — diventa `true` quando `applyImpulse()` è chiamato
2. `GameManager.settling: boolean` — attivato da `onWarriorLaunched`, disattivato quando tutti i warrior `launched` hanno velocità < `SETTLE_VELOCITY`
3. In ogni frame `checkSettled()`: forza-ferma i warrior lenti (`forceStop()`), poi controlla se tutti sono fermi
4. Il prossimo warrior viene attivato solo quando `settling = false`

**Race condition risolta:** `pendingWarrior` viene creato quando il warrior attraversa la linea (`checkLineLogic`), NON al momento del lancio. Se creato al lancio, un merge veloce completava il settling prima dei 0.3s di delay del spawn → il warrior non veniva mai attivato.

(Formula del magnetismo quadratico → sezione "Magnetismo" sopra.)

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

Posizioni aggiornate in Fase 2 per la pista a funnel: x=±90 lascia ampio margine dalle pareti a y=220.

I warrior prefill hanno `crossedLine = true` e `fired = true` impostati manualmente — non passano per il sistema di lancio ma sono soggetti al check di game-over.

> Nota: la larghezza pista non è una costante fissa — `TRACK_W` è calcolato da `initLayout()` (`TRACK_H × 6/10 × 1.2`, ≈691 a design 720×1280). Vedi COCOS.md per le coordinate di design.

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

**Visibilità condizionale**: il nodo è creato sempre (serve comunque per leggere `GAME_OVER_LINE_Y` dall'editor), ma `lineNode.active = this.showDebugLine`. `Track.showDebugLine` viene impostato a `DEBUG_ENGINE` da `GameManager.start()` prima di chiamare `relayout()`. Con `DEBUG_ENGINE = false` (produzione) la linea esiste ma è invisibile e inattiva.

**Pulse di pericolo**: quando almeno un warrior (da turni precedenti) ha il bordo inferiore ≤ `GAME_OVER_LINE_Y`, `GameManager.checkLineLogic()` chiama `track.setLinePulse(true)`. `Track` avvia un tween `UIOpacity` 255→30→255 in loop (0.7s/ciclo) solo se `showDebugLine` è attivo. Appena nessun warrior tocca la linea, `setLinePulse(false)` ferma il tween e ripristina opacità 255.

`setLinePulse` è idempotente: controlla `_linePulseActive` prima di avviare/fermare per evitare restart ogni frame.

---

## Linea di game over DINAMICA (2026-06-12)

La linea **parte alzata e scende** a ogni specie sbloccata (curva di difficoltà: tensione early, sollievo quando la combinatoria peggiora).

- **Quota editor = posizione FINALE (più bassa)**, raggiunta a tutte le specie sbloccate. Il nodo editor `TrackSprite > GameOverLine` **non viene MAI mosso da codice** (resta l'ancora autoritativa; il suo `Sprite` è disattivato a runtime). **Deroga controllata** alla regola "non muovere nodi editor": si muove solo il clone runtime `GameOverLineDyn`.
- Raise iniziale: `GO_LINE_RAISE_FRAC = 0.13 × TRACK_H` (costante in GameManager, **da tarare in playtest**); scende di ¼ a ogni `introRound` (3/5/7/9).
- Soglia logica: `gameOverLineLocal = visualToPhys(quota editor + _goLineRaisePx)`; il globale `GAME_OVER_LINE_Y` include il raise via `Track.setGameOverLineRaisePx` (consumatori: penaliseAndReturn spawnY, overlay debug).
- Larghezza: `funnelWidthRatioAt(raisePx)` — il funnel si stringe verso l'alto, quindi la linea alzata è proporzionalmente più CORTA e si allarga scendendo.
- **Discesa animata (1.4s) SOLO dentro il freeze fisica del banner round-up** (finestra 2.16s) + `LineDescentEffect`. La logica scatta subito alla quota target (linea più bassa = più permissiva, mai dannosa).
- **Sicurezza check game-over/malus**: i check usano contatori di permanenza vs `gol` corrente, non attraversamenti prev/now → una linea che SCENDE può solo concedere `crossedLine` a chi è sopra, mai triggerare malus/game-over. Una linea che SALE (solo new-game/debug round-down) azzera `framesBelowLine`; col debug round-down warriors già piazzati possono comunque finire sotto la linea e esplodere dopo i soliti N frame — accettato, è tooling.
- **Min-force NON è un vincolo**: il lancio debole che non supera la linea alzata cade nel normale percorso failed-launch (malus + ritorno), che con la linea alta è semplicemente più probabile = tensione early voluta.

---

## Auto-pausa (v0.6.0)

Il gioco si mette in pausa automaticamente quando l'app perde il focus (background/standby).

**Implementazione**: `GameManager` registra tre listener browser (solo se `sys.isBrowser`) all'interno del callback `WarriorSpriteCache.preload()`:
- `document.visibilitychange` → `_onVisibilityChange` (arrow function per `this` stabile)
- `window.blur` → `_onWindowBlur`
- `window.focus` → `_onWindowFocus`

Vengono deregistrati in `onDestroy()`. Il flag `_autoPaused` distingue la pausa automatica da quella manuale — evita che `_autoResume` sblocchi una pausa manuale premuta dall'utente.

Guards in `_autoPause`: non fa nulla se lo stato è già `GameOver`, `Paused` o `Idle`.

**Trigger (riepilogo)**: solo perdita di focus/visibilità — NESSUNA pausa per inattività/timeout. Pausa su: cambio scheda, finestra minimizzata, altra app/finestra (blur), schermo bloccato (mobile). Ripresa su visible/focus.

**Tap-to-resume + blocco input (v0.8.x)**: vedi TECH.md → "Pausa — tap-to-resume + blocco input".

**AudioManager**: `muteForPause()` azzera il volume music senza modificare le preferenze utente; `unmuteForPause()` lo ripristina. SFX bloccati tramite flag `_pauseMuted` controllato in `play()`.

---

## Blackhole VFX (v0.6.14, ridisegnato "tornado" 2026-06-12)

`VFXManager.spawnBlackhole()` — particelle a spirale + stardust + ghost creatura.
Calibrato a iterazioni con l'utente il 2026-06-12 — prima di ritoccare i parametri sotto, rileggere la dinamica.

**Particelle spirale — dinamica tornado** (texture unica `particles/atom.png`, glow dot arancio caldo copiato dalla libreria internal di Cocos: le tinte si moltiplicano e virano verso il caldo):
- Count: `level * 12 - 16` (lv3=20, lv7=68); size `(14–54 | tonde 26–60) * (0.6 + level * 0.15)`
- Durata scalata col livello: `durScale = 0.5 + level * 0.07` (lv3≈0.71, lv7≈0.99) applicato a finestra di nascita e viaggi — effetto più corto per i livelli bassi; sotto lv5 i viaggi sono però ×1.25 (particelle più LENTE sulla spirale piccola)
- Giri: lv5+ `2–3.5`, sotto `1.2–2.0` (vortice gentile per i livelli bassi)
- Centro spirale: `vortexY = yCanvas + 30` (SOLO spirale; i dischi stardust restano a `yCanvas`)
- Spawn ring: `((30 + level*27) + radius*0.70) * 2/3` (scaling ripido: stretto ai livelli bassi, largo agli alti), raggio `× (0.85 + rnd*1.9)` — MAI vicino al centro (le nascite centrali sembravano particelle ferme)
- Quota: `lift = 10–30px + rnd * 160 * lvScale`, scende a 0 con `(1 - t)` — risucchio inward + downward (colonna del tornado); il punto di assorbimento finale è a `vortexY - 30 * t` (30px sotto il centro spirale)
- Nascite accelerate: `delay = (i/n)^0.35 * 0.6` — una alla volta all'inizio, raffica alla fine
- Viaggi indipendenti `0.25–0.95s` (NO convergenza sincronizzata — deve essere un flusso continuo, l'utente ha esplicitamente cassato il collasso corale)
- Raggio/angolo: componente lineare (35%/25%) + componente `pow` (`decayExp 1.4–2.8`, `angleExp 1.8–2.6`) — moto attivo dal primo frame, tuffo e giri concentrati nel finale
- Streak legato alla velocità reale: `stretch = min(3.2, 1 + distPerFrame * 0.22)`, orientato col moto — framerate-dependent (a 30fps streak più lunghi). SOLO `level >= 5` (Champion+): sui vortici piccoli dei livelli bassi le streak fanno brutto effetto (cassate dall'utente) — lì tutte le particelle sono tonde
- Bobble scala per particella: amp 0.18–0.38, 2–4 cicli, fase random; envelope `sin(tπ)`; flicker opacity PROVATO E CASSATO (non si vedeva)
- Tinte: 40% bianco / 35% colore livello / 25% lerp al 50% (param `color` di spawnBlackhole)

**Stardust** (due dischi sfasati):
- Parent `StardustDisc`: `scaleY = 0.5`, flicker opacity (picco 170), si restringe verso il centro; baseSize `400 + tier*100`
- Child `Stardust`: `scale(1,1,1)`, rotazione continua `by(dur, {angle: ±540°})`
- Due istanze: delay 0.2s e 0.4s, rotazioni opposte, secondo più piccolo (×0.8)

**Merge ghost — implosione "gomma"** (solo su blackhole merge):
- Copia `spriteFrame` della creatura A; nodo in `warriorsLayer`; `node.layer = warriorsLayer.layer` — CRITICO
- 4 fasi (~1.1s ≈ ⅔ del vortice): stira verticale `(0.70,1.55)` 0.35s → squash orizzontale `(1.65,0.60)` 0.35s → respiro `(0.85,1.25)` 0.20s → snap a zero 0.20s `quartIn`. NON ruota (cassato)
- Fade altalenante `205 ± 50` (3 cicli) + shimmer colore nero ↔ viola scuro `GHOST_VIOLET (70,10,110)` (2.2 cicli, fasi indipendenti)
- Allo snap: burst radiale color SPECIE (`WARRIORS[type].color` lerp 40% verso bianco — i colori scuri spariscono nel blend additivo), 16 scintille 26–54px, raggio 70–160px, via `_spawnScoreBurst` generalizzato

**Implosione fisica**:
- Forza `sin(π * elapsed / duration)` (bell-curve) verso il centro del merge
- `impForce = (200 + tier * 60) * LAYOUT_SCALE`, durata 1.5–2.5s per tier
- Fallback proximity merge: `_checkProximityMerge(dt)` ogni frame — due soglie: (1) < 85% radii → merge immediato; (2) < 105% radii per ≥ 2s → merge forzato. Predicato di eleggibilità: `launched || crossedLine` (fix 2026-06-12 — il solo `launched` escludeva i warriors nati da merge/evolve/powerup, che hanno `crossedLine`/`fired` ma mai `launched`: restavano "vicini ma senza merge" quando i collider non si toccavano fisicamente; il warrior in attesa sul launcher resta escluso). Timer in `_proximityTimers: Map<string, number>` (chiave `uuidA|uuidB`).
- **Gotcha — vicinanza visiva ≠ contatto fisico**: il collider del warrior ha diametro `2r` ma lo sprite è largo `4r` (`setContentSize(r*4, r*4)`). Due warriors che a schermo sembrano quasi sovrapposti possono essere fisicamente staccati → nessun `BEGIN_CONTACT` Box2D, merge solo via fallback di prossimità.

---

## AURA Powerup (v0.8.19) *(ex LevelBoost)*

### Architettura
- `AuraEffect` — Component in `entities/AuraEffect.ts`, attaccato a `warrior.viewNode`
- Attivazione via `GameManager.activateAura()` (debug) — ha precedenza su BH e PF (li disattiva)
- `_auraWarrior`, `_auraEffect`, `_auraProxTimers`, `_zapTargetEnergy`, `_zapTimerFrozen`, `_zapSparkGlobalIdx` (static) in GameManager

### Parametri chiave
| Costante | Valore | File |
|----------|--------|------|
| `AURA_DURATION` | **1.5s** | `AuraEffect.ts` |
| `AURA_REPEL_RANGE` | 160 px (baseline Dragon, top di 7 specie) | `GameManager.ts` — range **quadratico** per specie (v0.8.55): `_auraRangeForType(type) = 160 × k²`, `k = (type+1)/WARRIORS.length`. Frog≈2% Cat≈8% Chicken≈18% Wolf≈33% Eagle≈51% Lion≈73% Dragon=100% |
| `AURA_REPEL_FORCE` | 500 px | `GameManager.ts` |
| `AURA_ZAPP_HOLD` | 0.2s | `GameManager.ts` |
| `AURA_ZAP_MIN_TYPE` | 2 (v0.8.55) | `GameManager.ts` — specie con `type < 2` (Frog, Cat) fanno **solo repulsione**, niente zap/auto-merge (`canZap = src.type >= AURA_ZAP_MIN_TYPE` in `_applyAuraRepel`) |
| Stagger primo gap | 500ms → decrescente | `1.25×(1−0.6^i)` s |
| Spark size | `120 × energy^0.35` px | `_zappWarrior` |
| Trail dot size | 112px | `_flySparkToTarget` |
| Range ring opacity | 12 (molto trasparente) | `AuraEffect.ts _build` |
| Spark twinkle | opacità 230↔135 ogni 0.11s, `repeatForever` su `sparkOp` | `_zappWarrior startSpark` |

### Ciclo di vita aura (fix 2026-05-26)
- Il timer parte in `onWarriorLaunched` → `startTimer()` → scade dopo `AURA_DURATION`
- `onExpired` chiama `detach()` (fade-out visual) + cleanup GameManager (`_auraWarrior = null` ecc.)
- **Non** si spegne su `settled` — in passato `settled = true` veniva impostato nello stesso frame di `crossedLine`, causando detach immediato senza nessun frame di repel
- **Merge**: se il warrior con aura si fonde, l'aura viene trasferita al `merged` (con timer fresco); nel caso blackhole viene solo cleanup pulito
- **Nuovo lancio**: se un warrior con aura è già in pista, il visual principale viene rimosso al lancio del warrior successivo (effetti zap già in propagazione continuano)
- **Lancio fallito (malus)**: il powerup è perso — `activateWarrior(w)` detacca l'aura al ritorno del warrior

### Flusso zap
1. Warrior in range ≥ `AURA_ZAPP_HOLD` → `_zappWarrior(w)`: `w.merging=true`, collapse anim, poi `startSpark()`
2. `startSpark()`: rimuove warrior da lista, **score zap** (`5 × round × 2^(level−1)`), crea scintilla colorata (colore specie), cerca target (stessa specie, `crossedLine`, `!merging`, max Y), registra in `_zapTargetEnergy`
3. Rise 150px + flash, poi `doFly` con stagger geometrico; al volo: ri-cerca target se invalido (`_redirectSparkTarget`)
4. `_onSparkHit`: score zap (`5×round×energy`) + flash+hop+pulse scala (`1.0+0.10×energy^0.35`) sul target, accumula energia, se `count=0` chiama `_evolveWarrior`
5. `_evolveWarrior`: `finalLevel = floor(log₂(initEnergy + accEnergy)) + 1` → **score evoluzione** (`20 × round × ΔLevel`) → spawn evolved o blackhole; animazione bubble post-flash

### Round illimitati
`MAX_ROUND` rimosso. `_roundThreshold(round)` usa `ROUND_THRESHOLDS[round]` per i round 1–7, poi `round × 20` per i round successivi.

### Gotcha Tween
**`Tween.stopAllByTarget(component)` quando non ci sono tween attivi corrompe il sistema tween CC3** — i tween successivi sullo stesso target completano istantaneamente. Usare sempre la reference all'istanza: `this._myTween = tween(...).start()` poi `this._myTween?.stop()`.

---

## SpawnManager — Smart Bag (v0.7.1)

`SpawnManager` è ora un `@ccclass Component` (aggiunto dinamicamente via `this.node.addComponent(SpawnManager)` in GameManager). I parametri sono esposti nell'inspector:

| Parametro | Default | Significato |
|-----------|---------|-------------|
| `bagMultiplier` | 2 | Copie di ogni specie per ciclo bag |
| `contextBiasChance` | 0.35 | Probabilità di favorire una specie stranded |
| `levelBiasChance` | 0.30 | Probabilità di favorire il livello di un warrior stranded |
| `strandedRadiusMultiplier` | 3.0 | Un warrior è stranded se non ha peer compatibili entro `× 2r` |

**Bag**: array shuffled con copie per specie pesate da `_speciesWeight`; si pesca dalla testa; si rigenera vuoto. **Rampa specie nuova (2026-06-12)**: allo sblocco (`setSpawnTypes`) la specie entra con una **coppia adiacente** spliced a posizione random nel bag corrente (la prima non resta orfana: la gemella arriva subito dopo) e peso 1; il peso sale di +1 a ogni rebuild del bag fino a `bagMultiplier`. Le specie iniziali partono a peso pieno. Nota: il restore da snapshot ripassa da `setSpawnTypes` → una specie già in pista rientra in rampa; distorsione minima, solo percorso di recovery.

**Bias contestuale**: prima di pescare dalla testa, con probabilità `contextBiasChance` cerca specie con warrior stranded in pista, fa weighted pick proporzionale al numero di stranded, cerca quella specie nel bag e la rimuove (non dalla testa); fallback alla testa se non trovata.

**Inizializzazione**: `spawnMgr.init(parent, visualParent, spawnTypes, layerScaleY)` — chiamare dopo `addComponent`. `getWarriors = () => this.warriors` deve essere assegnato subito dopo.

---

## Floating score — tier visivi (v0.8.4+)

`VFXManager.spawnFloatingScore()` applica stili diversi in base ai punti:

| Punti | Colore | Font size | Effetto |
|-------|--------|-----------|---------|
| negativi | rosso `(255,80,80)` | 34 / 44 large | — |
| 0–500 | grigio chiaro `(210,210,210)` | 34 / 44 large | — |
| 501–1000 | bianco `(255,255,255)` | 34 / 44 large | — |
| 1001–2000 | oro animato | 46 / 58 large | `_applyGoldenShine`: sweep gold→bright-gold→gold in 0.4s |
| > 2000 | viola pulsante | 52 / 64 large | `_applyPurpleShine`: color pulse `(200,60,255)↔(255,220,255)` 0.76s/ciclo + scale pulse `1.0↔1.07` 0.9s/ciclo |

Entrambi gli effetti speciali attivano anche `enableOutline` con outline scuro (3px) per effetto bold.
Hold a opacità 100%: **1.0s** (era 0.55s). Nessuna particella (rimossa).

---

## Spawn log (v0.8.4+)

`GameManager._spawnLog: Map<round, Map<type, count>>` — traccia quante creature di ogni tipo vengono spawnate per round.

- Reset in `start()` (ogni partita) e in `resetDebugState()`
- Registrato in `createWarrior()` e in `prefill()` (quest'ultimo conta round 1)
- Stampato in console al game-over/vittoria con `_logSpawnReport()`

Formato log:
```
[SpawnLog] ── Spawn report ──
  Round 1: Frog×5, Cat×4, Chicken×3
  Round 2: Wolf×2, Eagle×1
  Total: Frog×5, Cat×4, Chicken×3, Wolf×2, Eagle×1
```

---

## CRITICO — Box2D crash `b2BroadPhase.UpdatePairs` durante round-up (fix v0.8.4+)

**Sintomo**: `Uncaught Error` in `b2TreeNode.get → b2BroadPhase.UpdatePairs → b2World.Step`, tipicamente al round-up 6+ mentre l'animazione banner finisce.

**Causa**: durante il round-up `PhysicsSystem2D.instance.enable = false` per 2.16s, ma `update()` continuava ad applicare forze fisiche ai body Box2D (`applyMagnetism`, `applyUpwardDrift`, `applyCohesion`, `applyVortexImplosion`) e a triggherare merge di prossimità (`_checkProximityMerge`). Ogni `applyForce` su un body aggiunge il suo proxy al `m_moveBuffer` di Box2D. Senza `Step()` il buffer non viene mai consumato. Quando la fisica viene riabilitata, `UpdatePairs` processa proxy potenzialmente invalidi → crash.

**Fix**: in `update()`, tutti i blocchi che toccano fisica sono ora guardati da `if (!this.roundUpPause)`:
- `_checkProximityMerge(dt)`
- `applyMagnetism()` / `applyUpwardDrift()`
- `applyCohesion()`
- `applyVortexImplosion(dt)`
- `checkLineLogic(dt)`

**Regola generale**: mai applicare forze a body Box2D mentre `PhysicsSystem2D.instance.enable = false`. Il buffer si accumula senza essere consumato → crash al prossimo `Step()`.

---

## BloodHood Powerup — attivazione

### Condizioni (in `activateWarrior`)

```typescript
const sameTypeOnTrack = warriors.filter(w => w.crossedLine && w.node?.isValid && w.type === launcher.type).length;
if (sameTypeOnTrack >= 8 && _bhCooldownLaunches === 0 && launcherSenzaAltriPowerup) {
    bloodhoodEnabled = true;
}
```

| Regola | Valore |
|--------|--------|
| Stessa specie in pista | ≥ 8 |
| Cooldown tra BH | 10 lanci (`_bhCooldownLaunches`, resettato al trigger) |
| Blocker | launcher con aura *(ex levelBoost)* attiva |

- `_bhCooldownLaunches` viene impostato a 10 in `onWarriorLaunched` quando BH è attivo, decrementato di 1 ad ogni lancio non-BH.
- BH e PsychoForce sono **mutualmente esclusivi**: PF si valuta solo se `!bloodhoodEnabled`.

---

## PsychoForce Powerup (v0.8.9)

### Concetto
Powerup "jolly": crea spazio prima della endline permettendo merge cross-species per 5 secondi.

### Architettura
- `PsychoForceEffect` — Component dedicato in `entities/PsychoForceEffect.ts`, attaccato a `warrior.viewNode` (regola: ogni VFX ha la propria classe)
- `IPsychoForce` interface in `Warrior.ts` — `{ detach(): void; resetTimer(): void; }` — evita import circolare
- `Warrior.psychoForce: IPsychoForce | null` + `Warrior.onPsychoContact: callback | null`

### Flusso di contagio (scatter a cascata)
1. Warrior con PsychoForce tocca warrior in-track → `Warrior.onBeginContact` chiama `onPsychoContact(source, target)` (one-shot: callback azzerata subito in `_onPsychoContact`)
2. `_onPsychoContact`: calcola Y media del contatto; raccoglie tutti i warrior in `TRACK_W × 70%` centrato su quella Y; ordina per distanza dal source; lancia scatter `scheduleOnce` (0.04s + 0.12s × i)
3. `_infectWarrior(w)`: se già infetto → `resetTimer()`; altrimenti `PsychoForceEffect.attach` + `onExpired → _deinfectWarrior`
4. `_playPsychoInfectAnim`: scale bump `1.30 → 1.0` (0.07s + 0.20s elasticOut) su `viewNode`
5. `_deinfectWarrior`: detach effetto + azzera `psychoForce` e `onPsychoContact`

### Cross-species merge
In `Warrior.onBeginContact`: se livelli uguali ma specie diverse, merge consentito solo se almeno uno dei due ha `psychoForce != null`.

In `mergeWarriors`:
- `isPsychoMerge = a.type !== b.type && (a.psychoForce || b.psychoForce)`
- Tipo risultante = tipo del warrior che **non** porta PsychoForce (per conservare il tipo ospite)
- `parentWasPsycho = a.psychoForce || b.psychoForce` → se vero, il merged eredita l'infezione via `_infectWarrior(merged)`
- Cleanup: `a.psychoForce?.detach()` + `b.psychoForce?.detach()` prima di distruggere a e b (sia per merge normale che per branch BH maxLevel)

### Timer e scadenza
- Expiry: 5s (`EXPIRE_SECS` in `PsychoForceEffect.ts`)
- Timer parte (o resetta) in `checkLineLogic` quando il warrior attraversa la linea: `w.psychoForce.resetTimer()` + assign `onPsychoContact`
- `resetTimer` cancella e ripianifica `this.scheduleOnce(this._expireCb, 5.0)`

### VFX (PsychoForceEffect.ts)
| Layer | Size | Color | Opacity | Behavior |
|-------|------|-------|---------|----------|
| `PsychoTint` | radius × 2.1 | `(60,230,255)` | 55 | Static body wash |
| `PsychoGlow` (outer) | radius × 3.2 | `(40,210,255)` | 85 | Pulse scale 1.0↔1.20, 0.45s/ciclo, additive blend |

Usa `auraFrame` (stessa texture di LevelBoost), blend `SRC_ALPHA + ONE`.

### Parametri chiave
| Costante | Valore | Note |
|----------|--------|------|
| `EXPIRE_SECS` | 5.0s | In `PsychoForceEffect.ts` |
| Spread range | ±35% `TRACK_W` | In local-Y: `TRACK_W * 0.35 / box2dLayer.scale.y` |
| Scatter initial delay | 0.04s | Primo contagiato |
| Scatter interval | 0.12s | Tra contagiati successivi |

---

## Genocide Powerup

### Concetto
Powerup automatico: il launcher porta l'effetto Genocide; al primo contatto con un warrior in pista scatena una **cascata di implosioni** su tutti i warrior dello stesso tipo del bersaglio (`_triggerGenocideCascade`). Ogni implosione genera punti + un vortice attrattivo.

### Condizioni di attivazione (v0.8.55)
In `onWarriorLaunched`, attivato sul nuovo launcher se **tutte** vere:
1. `onTrack >= 25` — almeno 25 warrior in pista (`crossedLine`)
2. `_gnCooldownLaunches === 0` — **cooldown 10 tiri** dall'ultimo genocide
3. `_gnCooldownMerges === 0` — **cooldown 10 merge** dall'ultimo genocide *(aggiunto v0.8.55)*
4. `!_genocideCarrier` e `_nextPowerup === null`

### Cooldown
- Al trigger (`_genocideCarrier === w` in `onWarriorLaunched`): `_gnCooldownLaunches = 10` **e** `_gnCooldownMerges = 10` (prima era solo 20 tiri).
- `_gnCooldownLaunches` decrementa di 1 ad ogni lancio non-genocide.
- `_gnCooldownMerges` decrementa di 1 ad ogni **merge reale** (non-effect) in `mergeWarriors`.
- Entrambi persistiti in snapshot (`cooldowns.gn` / `cooldowns.gnMerges`), azzerati in reset.

### Cap livello (verificato)
Il cascade **non crea merge**: implode (distrugge) i warrior target. I warrior con `onGenocideContact`/`genocideInfected` sono esclusi dal merge (`Warrior.ts`). Eventuali merge indotti dal vortice passano da `mergeWarriors`, cappato a `WARRIORS[type].maxLevel` (blackhole oltre il max). → genocide non può produrre warrior sopra il max-level di specie. Stesso vale per aura (`finalLevel > maxLevel` → blackhole in `_evolveWarrior`).

---

## Sistema powerup su swap Next↔Launcher (2026-05-26)

Quando un warrior con powerup (aura/PsychoForce/bloodhood) viene swappato nel next, **il powerup segue il warrior**, non lo slot.

### Meccanismo (`GameManager.ts`)
- `_nextPowerup: 'aura' | 'psychoForce' | 'bloodhood' | null` — powerup salvato per il warrior nel next slot
- `_nextPowerupPending: boolean` — flag impostato da `createWarrior()`, consumato da `activateWarrior()`
- `_applyPendingPowerup(w, powerup)` — applica il powerup salvato al warrior che torna al launcher

### Flusso swap→swap
1. `swapNextWithLauncher()`: rileva il powerup di `cur`, salva `_nextPowerup = curPowerup`; applica `pendingForNw` (dal swap precedente) al nuovo launcher
2. Swap successivo: il warrior con powerup torna al launcher con `_applyPendingPowerup`

### Flusso swap→lancio normale
1. `createWarrior()` imposta `_nextPowerupPending = true` se `_nextPowerup !== null`
2. `activateWarrior(w)` al termine applica il powerup e svuota entrambe le flag
3. `penaliseAndReturn`: NON consuma `_nextPowerupPending` (il warrior non viene da `createWarrior()`) → powerup preservato per il prossimo genuino promuovimento

### Glow nel next preview
- `_nextPreviewGlowNode` — nodo figlio di `nextNextWarriorNode`, 86×86, blend additivo
- Colori: arancio-giallo (aura), ciano (PsychoForce), viola (bloodhood)
- Animazione pulsante `repeatForever`; fade-out quando `_nextPowerup = null`
- `_updateNextPreviewPowerupGlow()` chiamato alla fine di ogni `updateNextPreview()`

### Regole lifecycle powerup
- **Lancio warrior Y**: se warrior X (già in pista) ha ancora aura/PF visual attivo, viene rimosso al momento del lancio di Y (effetti già propagati continuano)
- **Lancio fallito (malus)**: `penaliseAndReturn` fa cleanup esplicito di PF (`_pfLaunchWarrior`) e BH (`_bhLaunchWarrior`) — powerup perso al ritorno del warrior

---

## Cosa NON è ancora implementato (aggiornato 2026-06-10, sera)

Fase 3 chiusa: HUD completato (font MedievalSharp, animazione round, timer), posizione NextPreview sistemata. La migrazione completa del DebugPanel in scena è stata **cassata** (non necessaria — resta il `DebugPanel.ts` programmatico).

Restano per la Fase 4: audio completo (loop musicali + SFX mancanti), slowmo tier alti, trail in volo, squash on landing, playtest e bilanciamento (vedi ROADMAP).

## Audio (v0.6.x)

- **Volume lancio**: modulato dalla forza del drag — `play(SFX.LAUNCH, Math.max(0.3, forcePct))` con `forcePct = impulse.length() / MAX_IMPULSE`
- **Bounce vs Hit**: costanti separate `BOUNCE_VOL_MAX = 280` e `HIT_VOL_MAX = 80` in `Warrior.ts`
- **HIT throttle**: `HIT_THROTTLE_MS = 120` — niente spam audio su contatti ravvicinati
- **DRAW sfx**: suonato in `InputController.handleDragStart` al primo tocco/click sulla balestra
- **Autoplay musica**: `ensureMusic()` aggiunge un listener `pointerdown` one-shot per aggirare le policy browser
- **Duck su round-up**: `duckMusicTo(0.15)` all'advance del round + 2s slowmo; `unduckMusic()` alla fine dello slowmo in `tickSlowmo()`

## Vittoria drago (v0.6.13)

Quando un merge crea un drago oltre il suo `maxLevel` (tipo `dragon` al livello max), scatta `triggerVictory()`:
- Tutti i warrior in pista esplodono a cascata con delay `i * 0.08s` — score `50 × level` per warrior
- Si mostra una schermata "HAI VINTO!" con "Nuova partita" (identica al RIPROVA del game over)
- Musica duckata + `SFX.WIN` + `unduckMusic()` dopo 2s

## Merge white flash (v0.6.x)

`playMergeOutEffect` / `playMergeInEffect` in `Warrior.ts` usano due tween paralleli:
1. `UIOpacity` opacity 255→0 (OUT) o 0→255 (IN)
2. `Sprite.color` da `(255,255,255,255)` → `(255,255,255,0)` (OUT) o viceversa (IN)

Il tween su `Sprite.color` produce il flash bianco senza overlay Graphics separato.

## DebugPanel — migrazione in scena (v0.6.13)

**Toggle runtime (2026-06-12)**: doppio tap (<350ms) sulla sezione ROUND dell'HUD apre/chiude il DebugPanel — funziona anche nei build di produzione, indipendente dal flag `DEBUG` (che continua a spawnarlo all'avvio). Vedi `GameManager._wireDebugPanelGesture` / `_toggleDebugPanel` / `_spawnDebugPanel`. Il tap passa anche all'InputController (può accennare la mira, si auto-annulla sotto soglia).

Il vecchio `DebugPanel.ts` (canvas 2D programmatico) è ancora attivo ma si sta migrando a nodi nella scena:
- `WinButton` (nodo Button) → `clickEvents` wired a `GameManager.debugWin()`
- `FrogIcon` (nodo con `DebugDraggable` component, tipo=0 lv=1) — drag & drop sulla pista
- `DebugDraggable.ts` in `assets/scripts/managers/` — coordinate conversion `_toWorld()` + `_toPhysY()` + ghost Graphics circle

**CRITICO `DebugDraggable`**: usa `IGameManagerDebug` da `DebugPanel.ts` — evitare import circolare (DebugPanel non deve importare DebugDraggable).

---

## HUD — struttura corrente (v0.6.0)

| Sezione | Posizione | Font caption / valore |
|---------|-----------|----------------------|
| ScoreSec | top-left | 28 / 46 |
| RoundSec | top-right | 28 / 46 — include ring progress e label `N/M` |
| TimerSec | centro zona di lancio | 44 |

**MERGES rimossa dalla HUD** in v0.3.6 — il tracciamento dei merge è ora implicito nel ring del round.  
**Ring progress round**: `R=35`, `LW=10` (spessore raddoppiato rispetto a v0.3.4). Sfondo `(60,60,70,220)`, arco `(120,220,255,255)`.

**NextSec rimosso** in v0.6.0 (nodo eliminato dall'editor). La preview del prossimo warrior è ora su **NextPreview**, nodo figlio diretto di **Track** (non della HUD). `GameManager.start()` lo cerca con `this.track?.node.getChildByName('NextPreview')`.  
**Regola critica**: non creare elementi UI programmaticamente — vanno aggiunti nella scena dall'editor.

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

**CRITICO — game over robusto (v0.8.23)**: `triggerGameOver()`/`triggerVictory()` schedulano la schermata **prima** di eseguire i side-effect (audio/log/score), che sono ora in `try/catch`. Motivo: queste funzioni girano dentro il `try/catch` di `update()` che **inghiotte le eccezioni**; se un side-effect lanciava dopo aver impostato `state = GameOver` ma prima di schedulare `showGameOverScreen`, il gioco restava congelato con warrior rosso e nessuna schermata. (Era il sospetto per il **bug 2**.)

**Follow-up bug 2 — CHIUSO (2026-06-10)**: non si è più ripresentato dopo il fix v0.8.23. Nota rimasta valida come spiegazione del comportamento: `Warrior.setDangerTint` tinge di rosso in base alla prossimità del **bordo inferiore** alla linea, mentre il game-over richiede il **centro** sotto la linea per 3 frame — un warrior completamente rosso senza game over è quindi normale, non un bug.

**Anti-tunneling muri (v0.8.23)**: i warrior hanno `rb.bullet = true` (continuous collision detection) in `Warrior.buildPhysics()`. Senza, un lancio veloce poteva attraversare le pareti sottili del funnel in un singolo step fisico e scivolare fuori dalla pista (**bug 1**). Se il bug 1 si ripresenta nonostante `bullet`, sospetto di riserva: corruzione del broadphase Box2D quando `PhysicsSystem2D.enable` viene spento nei path di pausa/auto-pausa mentre un callback di merge/spawn crea/distrugge body (i path di pausa non hanno il defer che ha il round-up — vedi sezione round-up).

**Messaggio nuovo record (v0.8.23)**: in `showGameOverScreen`, se `_newBest` → label "HAI SUPERATO IL TUO MIGLIOR PUNTEGGIO!" (oro, pulse). `_newBest` settato in `triggerGameOver`/`triggerVictory` **prima** di sovrascrivere `bestScore`: vero solo se `bestScore_precedente > 0 && score > bestScore_precedente && score > NEW_BEST_MIN_SCORE` (10000).

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

## Merge cap — maxLevel per specie

Ogni specie ha il proprio `maxLevel` (`WARRIORS[type].maxLevel`). Se un merge supera il cap della specie, la creatura **esplode con blackhole VFX** e bonus punti (vedi GDD §6); il Drago oltre il suo max scatena `triggerVictory()`. Vale anche per i merge indotti da aura/genocide (verificato v0.8.55).

---

## Responsive layout — LIVE_RESIZE

Flag `LIVE_RESIZE` in `GameManager.ts`: **`true` anche in produzione** (decisione 2026-06-10 — costo trascurabile, scatta solo al resize del browser).

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
| **Componente su nodo disattivo non fa nulla** | Un `@ccclass` su un nodo con `_active:false` non riceve `onLoad` → wiring/eventi mai registrati (es. `Settings` sul Dialog disattivo: MenuButton non apriva) | Mettere il componente su un nodo **sempre attivo** e referenziare il nodo target via `@property` (es. `Settings.dialogNode`). Lo script nasconde il target a runtime in `onLoad` |
| **Bottone senza `cc.Button` non emette CLICK** | `node.on(Button.EventType.CLICK, ...)` non scatta se il nodo non ha un componente `cc.Button` | Aggiungerlo via codice se manca: `node.getComponent(Button) ?? node.addComponent(Button)` (pattern in `Settings`/vecchio GameManager) |
| **Loading screen non vede asset del bundle** | Lo splash HTML gira prima di Cocos: non può usare texture importate (nome hashato nel bundle) | Mettere una copia statica in `build-templates/web-mobile/` (es. `title.png`) e referenziarla relativa in `index.html`. Ricopiare se l'asset cambia |
| **`loadScene` "not in build settings"** | Nome scena errato passato a `director.loadScene`. `director.getScene()?.name` può restituire vuoto → scattava il fallback con nome stale `'GameScene'`, ma la scena ora si chiama `'Game'` (retry/new-game game over+vittoria non ricaricavano) | Fallback con il nome reale della scena (`'Game'`); il file `.scene` ha `_name` autoritativo. Fixato v0.8.22 |

### Bug — warrior inflight che fonde prima di superare la linea (RISOLTO v0.3.6)

**Scenario**: warrior lanciato (A, `launched=true`, `crossedLine=false`) tocca un warrior esistente (B, stesso tipo/livello, `crossedLine=true`) nella zona di lancio sotto la game-over line. Merge schedula in 0.3s; entrambi vengono distrutti; il merged warrior nasce con `crossedLine=true`. `checkLineLogic` non trova più nessun warrior con `!crossedLine && launched` → `activateWarrior` non viene mai chiamato → `state` rimane `Inflight` per sempre.

`checkLaunchResult` (schedulato a +0.8s) trova `!w.node.isValid` → early return senza attivare nulla.

**Fix**: all'inizio di `mergeWarriors`, calcolare `inflightMerged = state === Inflight && (a.launched && !a.crossedLine || b.launched && !b.crossedLine)`. Alla fine (e dopo il `return` early per max-level), chiamare `activateAfterInflightMerge()` se il flag è `true`.

---


## Juice Fase 4 — trail e slowmo punteggi (v0.8.59)

**TrailEffect** (`entities/TrailEffect.ts`) — scia dietro il warrior in volo, agganciata in `onWarriorLaunched`:
| Parametro | Valore | Note |
|-----------|--------|------|
| `EMIT_INTERVAL` | 0.035s | frequenza check emissione |
| `MIN_MOVE_FACTOR` | 0.30 | emette solo se spostato ≥ raggio×0.30 dall'ultimo dot (niente dot in pausa/da fermo) |
| `IDLE_TICKS_MAX` | 20 (~0.7s) | fermo per questo tempo → self-detach |
| `DOT_LIFE` | 0.30s | fade+shrink del dot |
| Dot | sparkle additive, bianco-caldo, size = raggio×0.7–1.2, opacità 150 | |

Con `PhysicsSystem2D.enable=false` (pausa) il trail si congela senza contare ticks idle.

**Slowmo punteggi** (`_maybeScoreSlowmo` in GameManager): ×0.8 per 0.9s da 10.000 pt, ×0.5 per 1.2s da 12.000 pt — solo merge e Track Cleared; guard su GameOver e roundUpPause; riusa `activateSlowmo` (vince la scala più lenta).

---

## Budget dimensione build (requisito Poki < ~20 MB)

Stato 2026-06-10: build **14,9 MB** (era 44,3). Come ci si resta:

- **`npm run optimize:images`** (`scripts/optimize-images.js`, usa `sharp`): quantizza in PNG8 con dithering tutti i PNG **in-place** (stessi file/UUID → niente da toccare in scene/meta), particelle ridimensionate a max 512px (il codice le dimensiona sempre via `setContentSize`). Ri-eseguibile: i file già ottimizzati vengono saltati. **Lanciarlo dopo ogni import di asset nuovi.**
- Musica `main.mp3` a **112 kbps senza cover art** (ffmpeg-static): 3,5 → 2,0 MB. Ricodificare così eventuali tracce nuove.
- Niente asset inutilizzati dentro `assets/resources/` — viene bundlato TUTTO ciò che ci sta dentro (la traccia alternativa è in `unused_assets/` alla root, fuori dalla build).
- I PNG quantizzati sono PNG8 palette: per editare un asset ripartire dal sorgente originale, non dal file quantizzato.

## Deploy su GitHub Pages

Deploy attivo su **GitHub Pages** (Netlify rimosso del tutto il 2026-06-10 — file, config e CLI):

```powershell
npm run deploy   # scripts/deploy.js — inietta versione + pusha su branch gh-pages
```

URL live: **https://clemanto.github.io/FanWarriors/** — short link per i tester: **https://tinyurl.com/funwarriors**

> ⚠️ Il gioco si chiama **FunWarriors**; solo il repo GitHub (e quindi remote git + URL Pages) è `FanWarriors` per un refuso storico. Decisione 2026-06-12: NON rinominare il repo (romperebbe URL Pages e tinyurl, non recuperabili). Ogni `FanWarriors` nel progetto è un riferimento tecnico al repo, non il nome del gioco.

### Come funziona il deploy script

`scripts/deploy.js` usa un repo git temporaneo in `os.tmpdir()` per aggirare il `.gitignore` root che esclude `native/` e `build/`. Senza questo workaround, i file in `assets/main/native/` (PNG degli asset Cocos) non venivano pushati e il gioco crashava con errore 4930.

Flusso:
1. `patchHtml()` da `scripts/patch-html.js` — inietta versione + aggiunge `?v=VERSION` a tutti gli `<script src>` e a `System.import('./index.js')` (cache-busting, v0.8.3)
2. Crea `.nojekyll` nella build dir (impedisce a GitHub Pages di girare Jekyll)
3. Copia `build/web-mobile` in una dir temp
4. Init git fresh + commit + `git push -f FanWarriors HEAD:gh-pages`
5. Cleanup dir temp

**`scripts/patch-html.js`** — modulo condiviso usato da `serve-remote.js`, `deploy.js` **e `pack-crazygames.js`** (aggiunto 2026-06-15: senza, la build CrazyGames mostrava `v__VERSION__` nel loading screen). Sostituisce `__VERSION__`, poi aggiunge `?v=X.Y.Z` a ogni `src="*.js"`, `src="*.json"` e a `System.import('./index.js')`. Cocos non hasha i nomi dei file JS/CSS, quindi senza questo il browser serve versioni vecchie ad ogni deploy.

---

## Pacchetto CrazyGames (2026-06-15)

```powershell
npm run pack:crazygames   # scripts/pack-crazygames.js
```
1. Mette `PORTAL='crazygames'` in `PortalConfig.ts` (temporaneo), 2. builda web-mobile headless, 3. **ripristina sempre** `PortalConfig.ts` in un `finally` (git non porta mai il flag), 4. patch-html (versione + cache-bust), 5. zippa in `dist/funwarriors-crazygames.zip`.

- **Si carica la CARTELLA `build/web-mobile`** nel QA tool di CrazyGames (ospitano loro i file → non vogliono una URL pubblica). Lo zip in `dist/` è un di più, ignorabile (`dist/` è in `.gitignore`).
- ⚠️ La cartella resta la build CrazyGames finché non rilanci `npm run build`/`deploy` (che usano `PORTAL='none'`): rigenera con `pack:crazygames` prima di ricaricare in QA.
- Aggiornare su CrazyGames = caricare una nuova build sullo stesso gioco nel dev portal; la versione nel loading screen conferma a colpo d'occhio che il QA serve la build nuova (non cache).

---

## Forze framerate-independent (FORCE_FPS_REF, 2026-06-15)

CrazyGames richiede fisica consistente su monitor 144/165 Hz. Le forze continue sono applicate **una volta per frame di render**, ma Box2D fa step a rate fisso → su 144 Hz la stessa forza si accumula ~2,4× per step fisico. Fix: ogni forza per-frame moltiplicata per `dt × FORCE_FPS_REF` (=`dt × 60`). A 60 fps il valore è 1 → **bilanciamento invariato**; ad alto refresh le applicazioni più frequenti si compensano. Toccati TUTTI i metodi che applicano forze in `GameManager`: `applyMagnetism`, `applyUpwardDrift`, `applyCohesion` (ricevono `dtScale` da `update`), `_applyAuraRepel`, `applyVortexImplosion` (già ricevevano `dt`, ora lo usano anche per la forza, non solo per i timer).

## Resize/fullscreen — remap warriors nel funnel (2026-06-15)

`relayout()` ricostruisce muri/linea dal `TrackSprite` ma NON tocca i warriors in pista → su resize/fullscreen restavano alle vecchie coordinate (disallineati). Fix (opzione A): al primo evento di resize si fotografa la posizione **normalizzata nel funnel** di ogni warrior (`normX` in [-1,1] sulla larghezza, `t` in [0,1] bottom→top) contro i muri *vecchi*; la si ri-applica contro i muri *nuovi* quando il layout è **stabile**, agganciandosi allo stesso sampler `_goLineStableTick` della linea game-over (`GameManager._captureWarriorNorm`/`_applyWarriorNormIfPending`). `Warrior.rescaleToLayout()` ri-adatta collider (`col.apply()`) + visual + `mapper.yOffset` al nuovo `LAYOUT_SCALE`; velocità azzerata (il warrior si ri-assesta). La normalizzazione contro i muri è coordinate-system-agnostica → non serve ragionare sullo `scaleY` del box2dLayer.

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

**2. Serve locale**
```powershell
npm run serve   # scripts/serve-remote.js — avvia Python HTTP server porta 8080 (localhost only)
```

**3. Impedire standby PC**
```bash
# Disabilita standby AC (prima di uscire)
powercfg /change standby-timeout-ac 0
# Ripristina (quando torni)
powercfg /change standby-timeout-ac 15
```

### CRITICO — kill prima di rebuild
Serve deve essere spento prima di rilanciare la build, altrimenti CC non riesce a scrivere i file (EPERM — file lock di Windows):
```powershell
Get-Process -Name "node" | Stop-Process -Force
# poi cancellare la build se ci sono errori di permesso
cmd /c rd /s /q "d:\Projects\FunWarriors\build"
```

