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

## Sistema danger tint + pulse linea (v0.4.0)

**Decisione**: la linea di game over è disegnata in `Track.buildWalls()` (nodo Track) anziché in `GameManager` (nodo gameLayer). Questo garantisce che sia sempre sotto i warrior nella gerarchia di rendering, senza richiedere `setSiblingIndex`.

**Tint warrior**: `Warrior.setDangerTint(factor)` imposta `Sprite.color` come moltiplicatore RGB. Factor 0 = bianco (nessun tint), factor 1+ = rosso intenso. Calcolato in `GameManager.checkLineLogic()` dal bordo inferiore del warrior rispetto a `GAME_OVER_LINE_Y`.

**Pulse linea**: `Track.setLinePulse(bool)` gestisce un tween `UIOpacity` 255→30→255 (loop ricorsivo con flag `_linePulseActive` come guard). `GameManager` accumula `anyDanger` nel loop di `checkLineLogic` e chiama `setLinePulse` una volta a fine frame — transizione solo se lo stato cambia.

**Esclusione `inflightWarrior`**: il warrior del turno corrente non contribuisce a `anyDanger` né riceve tint, anche dopo aver superato la linea. Diventa eleggibile solo quando viene lanciato il warrior successivo (che sovrascrive il riferimento in `onWarriorLaunched`). Motivazione UX: l'effetto pericolo deve segnalare accumulo dal mucchio storico, non la normale traiettoria di ingresso.
