# Note Tecniche — FunWarriors

> Decisioni architetturali non ovvie. Da aggiornare quando si fanno scelte significative.

---

## Separazione layer fisico / layer visivo

**Decisione**: ogni entità di gioco ha due nodi separati — un nodo fisico (invisibile) e un nodo visivo (sprite).

```
Entity (root)
├── PhysicsNode   — RigidBody2D + Collider2D, vive nel piano piatto Box2D (invisibile)
└── ViewNode      — Sprite + effetti visivi, segue il PhysicsNode con trasformazione prospettica
```

**Perché**: la pista simula una prospettiva pseudo-3D scalando i personaggi in base alla profondità (asse Y fisico = distanza dal giocatore). Se si scalasse direttamente il nodo con collider, Box2D userebbe le dimensioni visive ridotte per le collisioni — rompendo la fisica. Con layer separati, Box2D lavora sempre in spazio piatto uniforme e la proiezione è responsabilità esclusiva del mapper.

**Come funziona il mapping** (componente `PerspectiveMapper`):

```typescript
const depth = (physY - NEAR_Y) / (FAR_Y - NEAR_Y); // 0 = vicino, 1 = lontano
const scale = lerp(SCALE_NEAR, SCALE_FAR, depth);
viewNode.setScale(scale, scale, 1);
viewNode.setPosition(physX * perspectiveCorrection, screenY(depth));
```

**Conseguenza**: il z-ordering dei ViewNode va aggiornato dinamicamente ogni frame in base alla profondità fisica (oggetti più vicini sopra quelli lontani).

**Debug mode**: deve essere possibile rendere visibile il mondo Box2D in tempo reale tramite un flag di debug (es. `GameManager.debugPhysics = true`). Quando attivo, i PhysicsNode e i loro collider diventano visibili — utile per verificare che le collisioni corrispondano alla logica attesa indipendentemente dalla proiezione visiva. Cocos Creator espone `PhysicsSystem2D.instance.debugDrawFlags` per disegnare collider, joint e AABB senza codice custom.
