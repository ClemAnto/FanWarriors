# MEMO — Note tecniche FunWarriors

> Note di implementazione, gotcha, decisioni di tuning e parametri calibrati. Da consultare all'inizio di ogni sessione di sviluppo.

---

## Parametri fisici calibrati

Tutti i valori sono stati tuned in sessione di gioco reale — non modificare senza testare.

### Warrior (Warrior.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `linearDamping` (in volo) | 0.5 | Scivolata lunga stile curling |
| `linearDamping` (fermo) | 12 | Impostato da `settle()` dopo `forceStop()` — resiste agli impatti |
| `angularDamping` (in volo) | 1.5 | Rotazione smorzata ma non bloccata |
| `angularDamping` (fermo) | 4 | Impostato da `settle()` |
| `density` | 8.0 | Alta densità = resistenza agli urti |
| `friction` | 0.05 | Superficie scivolosa (ghiaccio) |
| `restitution` | 0.04 | Impatti molto smorzanti, quasi anelastici |
| `MERGE_DELAY` | 0.3s | Tempo contatto prima del merge |

`settle()` viene chiamato automaticamente da `forceStop()` e anche sui warrior di prefill al momento dello spawn — da quel momento reagiscono agli impatti ma non schizzano.

### Track walls (Track.ts)
| Parete | Restitution | Friction | Note |
|--------|-------------|----------|------|
| Laterali (PolygonCollider2D) | 0.8 | 0.05 | Inclinate 5° — più strette in alto |
| Top (BoxCollider2D) | 0.0 | 1.0 | Solo larghezza ridotta del funnel |
| Bottom (BoxCollider2D) | 0.0 | 0.0 | |

### Track — geometria funnel (Track.ts)
| Costante | Valore | Note |
|----------|--------|------|
| `TRACK_W` | 500px | Larghezza al fondo (apertura inferiore) |
| `TRACK_BOTTOM_Y` | −600 | World Y parete inferiore |
| `TRACK_TOP_Y` | +450 | World Y parete superiore |
| `TRACK_H` | 1050px | TRACK_TOP_Y − TRACK_BOTTOM_Y (back-compat) |
| `GAME_OVER_LINE_Y` | −80 | World Y linea rossa divisoria lancio/gioco |
| `FUNNEL_ANGLE_DEG` | 5° | Inclinazione pareti verso interno |
| `FUNNEL_OFFSET` | ≈92px/lato | tan(5°)×1050 |
| Larghezza in cima | ≈316px | TRACK_W − 2×FUNNEL_OFFSET |

### InputController (InputController.ts)
| Parametro | Valore | Note |
|-----------|--------|------|
| `MIN_DRAG` | 20px | Soglia minima drag valido |
| `MAX_DRAG` | 80px | Cap visivo e di forza |
| `MAX_IMPULSE` | 300 | Forza massima applicata |
| Angolo max lancio | ±75° | Clampato da `clampLaunchDir()` |

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

## Coordinate e risoluzione

- Design resolution: **720×1280 portrait**, policy `FIXED_HEIGHT` (impostato via codice in `GameManager.start()`)
- Con FIXED_HEIGHT l'altezza è sempre 1280 unità design; la larghezza si adatta all'aspect ratio del dispositivo
- Origine world space: **centro canvas (0, 0)** → schermo va da −640 a +640 in Y, e ±(visibleWidth/2) in X
- `getUILocation()` restituisce coordinate con origine **bottom-left** → usare `view.getVisibleSize()` per la conversione corretta (non hardcodare larghezza)
- **Zona di lancio:** da `TRACK_BOTTOM_Y = −600` a `GAME_OVER_LINE_Y = −80` (520 unità)
- **Zona di gioco:** da `GAME_OVER_LINE_Y = −80` a `TRACK_TOP_Y = +450` (530 unità)
- Warrior spawn: `SPAWN_Y = GAME_OVER_LINE_Y + (TRACK_BOTTOM_Y − GAME_OVER_LINE_Y) * 0.6` ≈ −392 (60% della zona di lancio)
- Prefill positions: `(−90, GAME_OVER_LINE_Y+300)`, `(0, GAME_OVER_LINE_Y+330)`, `(90, GAME_OVER_LINE_Y+300)` ≈ (−90, 220), (0, 250), (90, 220)
- **Regola:** tutti i posizionamenti devono derivare dalle costanti di Track — nessun valore hardcoded

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
- Tipo 0 a (−90, 220)
- Tipo 1 a (0, 250)
- Tipo 2 a (90, 220)

Posizioni aggiornate in Fase 2 per la pista a funnel (TRACK_W=432): a y=220 la semi-larghezza interna è ~157px, quindi x=±90 lascia ~47px di margine dalla parete.

I warrior prefill hanno `crossedLine = true` impostato manualmente — non passano per il sistema di lancio.

---

## Cosa NON è ancora implementato (stato Fase 2)

- **Livelli massimi per specie** — nel codice tutti i tipi vanno fino a lv7, ma il GDD prevede cap diversi per specie (lv5/6/7 solo per alcune). Da implementare in Fase 3 quando arrivano gli asset definitivi.
- **Contachilometri punteggio** — il punteggio salta al valore finale invece di scorrere come un odometro
- **Timer: 4 stati visivi** — attualmente solo rosso sotto 5s; mancano gli stati "quasi invisibile" e "arancione pulse"
- **Floating score tier system** — attualmente un solo stile; il GDD prevede 6 tier con dimensione/colore/FX
- **Debug panel e debug label** — da rimuovere o nascondere prima dello shipping
- **Audio** — nessun SFX né musica

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
Scene root
  ├── Track         ← Track.ts — disegna pista funnel e muri fisici (nodo statico in scena)
  ├── GameManager   ← GameManager.ts + InputController.ts (addComponent)
  ├── GameLayer     ← creato a runtime — contiene: warriors, Rope, VFX esplosioni/burst
  └── UILayer       ← creato a runtime — contiene: HUD, timer, NEXT, tutorial, game-over,
                       punteggi flottanti, RedFlash, DebugPanel, DebugLabel
```

`GameLayer` e `UILayer` sono creati in `GameManager.start()` come figli di `this.node.parent!` (scene root).  
La corda (Rope) si aggancia a `GameLayer` tramite `InputController.ropeParent`.  
**Regola:** non usare mai `this.node.parent!` per spawnare nodi a runtime — usare sempre `this.gameLayer` o `this.uiLayer`.

---

## Testing remoto su mobile

Permette di testare la build su telefono fuori dalla stessa rete WiFi del PC.

### Flusso completo

**1. Build headless (CLI)**
```bash
# CRITICO: unset ELECTRON_RUN_AS_NODE altrimenti CocosCreator.exe gira come Node.js
env -u ELECTRON_RUN_AS_NODE "C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe" \
  --project "d:\Projects\FanWarriors" \
  --build "platform=web-mobile"
```
- Exit code **0** o **36** = successo (36 = successo con warning, normale)
- Exit code diverso = errore reale

**2. Server statico locale**
```bash
npx serve -l 8080 "d:/Projects/FanWarriors/build/web-mobile"
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
```bash
# PowerShell
Get-Process -Name "node" | Stop-Process -Force
# poi cancellare la build se ci sono errori di permesso
cmd /c rd /s /q "d:\Projects\FanWarriors\build"
```

### Perché ngrok e non localtunnel
localtunnel è gratuito ma crasha frequentemente (503 Bad Gateway, connessione persa).  
ngrok richiede account gratuito ma è stabile per sessioni di test lunghe.
