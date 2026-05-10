# Note Tecniche — FunWarriors

> Decisioni architetturali non ovvie. Da aggiornare quando si fanno scelte significative.

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
