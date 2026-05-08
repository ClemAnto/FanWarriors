# MEMO — Note tecniche FanWarriors

> Note di implementazione, gotcha, decisioni di tuning e parametri calibrati. Da consultare all'inizio di ogni sessione di sviluppo.

---

## Parametri fisici calibrati (Fase 1)

Tutti i valori sono stati tuned in sessione di gioco reale — non modificare senza testare.

### Warrior (Warrior.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `linearDamping` | 2.5 | Rallentamento progressivo "bowling" |
| `angularDamping` | 2.5 | Blocca la rotazione eccessiva |
| `density` | 8.0 | Alta densità = resistenza agli urti |
| `friction` | 0.8 | Attrito warrior-warrior / warrior-wall |
| `restitution` | 0.2 | Rimbalzo basso tra warrior |
| `MERGE_DELAY` | 0.3s | Tempo contatto prima del merge |

### Track walls (Track.ts)
| Parete | Restitution | Friction |
|--------|-------------|----------|
| Laterali (sx/dx) | 0.8 | 0.05 |
| Fondo (top) | 0.1 | 0.8 |
| Bottom invisibile | 0.0 | 0.0 |

### InputController
| Parametro | Valore |
|-----------|--------|
| `MIN_DRAG` | 40px |
| `MAX_DRAG` | 150px |
| `MAX_IMPULSE` | 1600 |

### GameManager
| Parametro | Valore | Note |
|-----------|--------|------|
| `SETTLE_VELOCITY` | 0.1 px/s | Soglia sotto cui il warrior è "fermo" |
| `MAGNET_RADIUS` | 75px | Raggio di attivazione magnetismo |
| `MAGNET_FORCE` | 8 | Forza base; scala quadratica con prossimità |
| `SPAWN_X` | 0 | Centro orizzontale |
| `SPAWN_Y` | -220 | 220px sotto il centro (ben sotto y=0) |
| `LAUNCH_CHECK_DELAY` | 0.8s | Attesa prima di valutare se il lancio ha fallito |

---

## Coordinate e risoluzione

- Design resolution: **1280×720 landscape** (configurato in Project Settings)
- Origine world space: **centro canvas (0, 0)**
- `getUILocation()` restituisce coordinate con origine **bottom-left** → conversione: `worldX = uiX - 640`, `worldY = uiY - 360`
- Linea di game over: **y = 0** (centro verticale)
- Track: 648×680px, centrato in (0, 0) — va da y=-340 a y=+340
- Warrior spawn: y=-220 (sotto la game over line, nella zona di lancio)

---

## Gotcha Cocos Creator 3.8

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
- Tipo 0 a (-180, 240)
- Tipo 1 a (0, 270)  
- Tipo 2 a (180, 240)

I warrior prefill hanno `crossedLine = true` impostato manualmente — non passano per il sistema di lancio.

---

## Cosa NON è ancora implementato (da Fase 1)

- **Timer di lancio** + countdown visivo + auto-launch a scadenza
- **NEXT preview** del prossimo warrior
- **Sistema di punteggio** (formula, floating score, malus punteggio)
- **GameState enum** formale (idle/aiming/inflight/settling) — attualmente gestito con booleani
- **SpawnManager** separato (la logica spawn è in GameManager)
- **Penalità punteggio malus** (il warrior esplode ma non deduce punti)
- **Flash rosso malus** (la schermata non lampeggiate di rosso)
- **Debug label** — da rimuovere prima dello shipping (`createDebugLabel` in GameManager)

---

## Merge cap a lv7

Se due warrior lv7 si fondono (`newLevel > 7`), entrambi vengono distrutti e nessun nuovo warrior viene spawnato. È il comportamento corretto — livello 7 è il massimo.

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

---

## Scena e gerarchia

```
Canvas (1280×720)
  ├── Track         ← Track.ts — disegna pista e muri fisici
  ├── GameManager   ← GameManager.ts + InputController.ts (addComponent)
  │     (i warrior vengono spawnati come figli di node.parent = Canvas)
  ├── Rope          ← creato da InputController a runtime
  └── DebugLabel    ← creato da GameManager a runtime (rimuovere in prod)
```

I warrior e i loro nodi figli (label livello) sono spawnati tutti come figli diretti di Canvas tramite `node.parent!`.
