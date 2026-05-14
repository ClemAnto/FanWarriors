# Note Tecniche — FunWarriors

> Decisioni architetturali non ovvie. Da aggiornare quando si fanno scelte significative.

---

## Track — muri fisici derivati da TrackSprite (branch refactor/no-runtime-resize, 2026-05-12)

**Decisione**: `buildWalls()` non usa più le costanti `TRACK_BOTTOM_Y`/`TRACK_TOP_Y`/`FUNNEL_OFFSET` per costruire i collider. Legge invece i bounds di `TrackSprite` direttamente (`UITransform.contentSize`, `anchorPoint`, `position`, `scale`).

**Perché**: eliminando `drawTrack()` e tutti i `setPosition`/`setContentSize` runtime su Track node, la pista è ora posizionata e dimensionata interamente dall'editor. I muri fisici devono seguire lo sprite grafico — non le costanti di layout che riflettono lo schermo, non il nodo.

**Come funziona**:
- `buildWalls()` calcola left/right/bot/top dai dati UITransform di TrackSprite (con offset posizione e scala)
- `wallThickness` e `funnelPercentage` sono `private readonly` nella classe Track
- I muri vengono rigenerati automaticamente tramite listener `SIZE_CHANGED` e `TRANSFORM_CHANGED` su TrackSprite
- `_walls: Node[]` traccia i nodi creati per distruggerli senza affidarsi a `getChildByName` (evita duplicati da destroy deferrato)

**Costanti ancora attive**: `TRACK_W`, `TRACK_BOTTOM_Y`, `TRACK_TOP_Y`, `GAME_OVER_LINE_Y`, `LAYOUT_SCALE`, `FUNNEL_OFFSET`, `initLayout()` — restano esportate e usate da `GameManager`, `InputController`, `PerspectiveMapper`. Non sono più usate in `buildWalls()`.

---

## Sistema di coordinate pseudo-isometrico

**Visuale**: la pista e i warrior sono disegnati in prospettiva pseudo-isometrica — le basi dei warrior (fisicamente cerchi) appaiono come ellissi schiacciate.

**Soluzione**: il mondo fisico Box2D è puramente 2D (cerchi perfetti). La conversione in visuale è `x → x`, `y → y/2`, ottenuta mettendo `Box2DLayer.scaleY = 0.5`. I cerchi fisici proiettati con questo scale corrispondono esattamente alle ellissi degli sprite.

**Gerarchia layer sotto `World`**:

| Nodo | scaleY | Ruolo |
|---|---|---|
| `Box2DLayer` | **0.5** | Fisica Box2D — coordinate locali compresse |
| `GameLayer` | 1 | VFX generici (burst, floating score) |
| `WarriorsLayer` | 1 | Sprite visivi dei warrior (viewNode) |

**Tre spazi di coordinate**:
| Spazio | Descrizione | Esempio Y range |
|---|---|---|
| `physLocalY` | Locale di `Box2DLayer` — input per Box2D | ≈ -1280..+1280 |
| `worldY` | 3D world space — `physLocalY * sy + box2dWorldY` | Canvas center = 360 |
| `warriorsLocalY` | Locale di `WarriorsLayer` — usato da `setPosition` per VFX/sprite | ≈ -640..+640 |

**Formula di conversione** (da derivazione scena + dati runtime):
- `physToVisual(physLocal) = physLocal * sy² + box2dWorldY * (sy - 1)`
- Per `sy=0.5`, `box2dWorldY=640`: `= physLocal * 0.25 - 320`
- Inverso: `visualToPhys(c) = (c - box2dWorldY * (sy - 1)) / sy²` = `(c + 320) * 4`
- Utility: `CoordConverter(box2dScaleY, box2dWorldY)` in `utils/CoordConverter.ts`

**Perché `box2dWorldY = 640` (non 360)**: il file scena salva `Canvas._lpos.y = 360` perché la scena era aperta in modalità landscape (1280×720 → centro Y = 360). A runtime, `view.setDesignResolutionSize(720, 1280, FIXED_HEIGHT)` aggiusta il Canvas a `worldY = designHeight/2 = 640`. Questo avviene **dopo** il completamento di tutti i `start()`, quindi leggere `worldPosition.y` durante `start()` restituirebbe ancora 360. La soluzione è usare `view.getDesignResolutionSize().height / 2` al posto di `worldPosition.y`.

**Regola pratica**: VFX attaccati a `WarriorsLayer` devono usare `coords.physToVisual(y)` per la coordinata Y. La fisica usa sempre coordinate locali di `Box2DLayer`.

**`PerspectiveMapper`**: legge `worldPosition.y = physLocalY * sy + box2dWorldY`, lo moltiplica per `sy` via `setWorldPosition(wp.x, wp.y * sy + yOffset)`. Il risultato è `viewWorldY = physLocalY * sy² + box2dWorldY * sy + yOffset`; convertito in locale WarriorsLayer: `warriorsLocalY = physLocalY * sy² + box2dWorldY * (sy - 1) + yOffset`.

**Costanti Track**: `TRACK_BOTTOM_Y`, `TRACK_TOP_Y`, `GAME_OVER_LINE_Y` sono in spazio canvas (world Y). Quando servono in spazio fisico locale si divide per `scaleY` (`gameOverLineLocal = GAME_OVER_LINE_Y / scaleY`).

---

## Separazione layer fisico / layer visivo

**Implementato** in Fase 2 (`PerspectiveMapper.ts`, `Warrior.ts`).

**Decisione**: ogni entità di gioco ha due nodi separati — un nodo fisico (invisibile) e un nodo visivo (sprite).

```
Warrior (root)
├── RigidBody2D + CircleCollider2D  — fisica Box2D, non scalato
└── viewNode (Node "View")          — Sprite/Graphics, scalato da PerspectiveMapper
```

**Perché**: se si scalasse il nodo con il collider, Box2D userebbe le dimensioni visive ridotte per le collisioni. Con layer separati, Box2D lavora in spazio piatto uniforme e la proiezione è responsabilità esclusiva del mapper.

**Implementazione attuale** (`PerspectiveMapper.ts`):

```typescript
const SCALE_BOTTOM = 0.55;  // bottom pista — lontano (pile)
const SCALE_TOP    = 1.0;   // top pista — vicino (launcher)
const VISUAL_SCALE = 1.65;  // moltiplicatore rispetto al raggio fisico

const depth = (y - TRACK_BOTTOM_Y) / span; // 0=bottom, 1=top
const scale = (SCALE_BOTTOM + (SCALE_TOP - SCALE_BOTTOM) * depth) * VISUAL_SCALE;
viewNode.setScale(scale, scale, 1);
```

**Direzione prospettica**: top=vicino/grande, bottom=lontano/piccolo — vista dall'alto come curling/shuffleboard.

**Offset visivo sprite**: `viewNode.setPosition(0, r * 0.5)` in `Warrior.buildSprite` — il centro dello sprite è leggermente sopra il centro fisico. Valore calibrabile.

**Z-sorting**: `GameManager.zSortWarriors()` ogni frame — warrior con Y più bassa (più lontani) renderizzati per primi (dietro).

**Debug mode**: `PhysicsSystem2D.instance.debugDrawFlags = EPhysics2DDrawFlags.Shape` mostra i collider Box2D sovrapposti ai visual — attivato da `DEBUG_ENGINE` in `GameManager.ts`.

---

## Linea di game over — editor-driven (v0.5.0)

**Decisione**: la quota `GAME_OVER_LINE_Y` è ora derivabile da un nodo scena, non solo dalla formula matematica.

**Come funziona**: `Track.buildWalls()` cerca un nodo figlio di `TrackSprite` chiamato `GameOverLine`. Se presente, legge `worldPosition.y` e sovrascrive `GAME_OVER_LINE_Y` e il nuovo `GAME_OVER_AREA` (ratio normalizzato 0..1). In assenza del nodo, il valore di `initLayout()` resta valido come fallback.

**Perché**: permette di spostare la linea nell'editor senza toccare il codice. Su resize, `relayout()` ricalcola automaticamente dalla posizione del nodo (se dotato di Widget proporzionale).

**Coordinare con gameOverLineLocal**: `GameManager` espone un getter privato `gameOverLineLocal = GAME_OVER_LINE_Y / box2dLayer.scale.y`. Tutti i check di attraversamento linea (`checkLineLogic`, `checkLaunchResult`, `onWarriorLaunched`) usano `w.node.position.y` vs `gameOverLineLocal` — mai `worldPosition.y` vs `GAME_OVER_LINE_Y`.

---

## Sistema danger tint + pulse linea (v0.4.0)

**Decisione**: la linea di game over è disegnata in `Track.buildWalls()` (nodo Track) anziché in `GameManager` (nodo gameLayer). Questo garantisce che sia sempre sotto i warrior nella gerarchia di rendering, senza richiedere `setSiblingIndex`.

**Tint warrior**: `Warrior.setDangerTint(factor)` imposta `Sprite.color` come moltiplicatore RGB. Factor 0 = bianco (nessun tint), factor 1+ = rosso intenso. Calcolato in `GameManager.checkLineLogic()` dal bordo inferiore del warrior rispetto a `GAME_OVER_LINE_Y`.

**Pulse linea**: `Track.setLinePulse(bool)` gestisce un tween `UIOpacity` 255→30→255 (loop ricorsivo con flag `_linePulseActive` come guard). `GameManager` accumula `anyDanger` nel loop di `checkLineLogic` e chiama `setLinePulse` una volta a fine frame — transizione solo se lo stato cambia.

**Esclusione `inflightWarrior`**: il warrior del turno corrente non contribuisce a `anyDanger` né riceve tint, anche dopo aver superato la linea. Diventa eleggibile solo quando viene lanciato il warrior successivo (che sovrascrive il riferimento in `onWarriorLaunched`). Motivazione UX: l'effetto pericolo deve segnalare accumulo dal mucchio storico, non la normale traiettoria di ingresso.
