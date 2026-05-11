# Cocos Creator 3.x — Reference tecnico

Appunti operativi acquisiti lavorando su FunWarriors (CC 3.8.8, TypeScript, Box2D).

---

## Formato file `.scene`

Le scene sono JSON con un array piatto di oggetti. Ogni oggetto ha un indice implicito (posizione nell'array) usato come `__id__` per i riferimenti interni.

```json
[
  { "__type__": "cc.SceneAsset", "scene": { "__id__": 1 } },   // [0]
  { "__type__": "cc.Scene", "_children": [{ "__id__": 2 }], "_globals": { "__id__": 74 } },  // [1]
  { "__type__": "cc.Node", "_name": "Canvas", "_components": [...], "_children": [...] },    // [2]
  ...
]
```

**Regole chiave:**
- L'array inizia sempre con `cc.SceneAsset` (index 0) → `cc.Scene` (index 1) → `cc.Node` Canvas (index 2)
- Ogni componente è un oggetto separato con `"node": { "__id__": N }` che punta al suo nodo
- L'ultimo blocco è sempre `cc.SceneGlobals` (copiare da una scena esistente)
- I nodi figli sono elencati con `_children: [{ "__id__": N }, ...]`
- I componenti di un nodo sono elencati con `_components: [{ "__id__": N }, ...]`

**CRITICO — eliminazione di nodi dalla scena:**  
Quando si rimuove un blocco di K oggetti che inizia all'indice S dall'array, **tutti i riferimenti `__id__` con valore ≥ S+K devono essere decrementati di K** — altrimenti CC3 va in crash con `TypeError: Cannot read properties of undefined (reading '__type__')`.

Checklist per rimozione sicura:
1. Rimuovere il riferimento `{"__id__": S}` dal `_children` del nodo padre
2. Rimuovere fisicamente i K oggetti dall'array (con PowerShell o script — non a mano)
3. Eseguire un regex replace su `"__id__": N` → `"__id__": N-K` per tutti N ≥ S+K
4. Verificare che i `"_id"` stringa degli oggetti eliminati non compaiano più nel file

```powershell
# Fix __id__ refs dopo eliminazione di K oggetti a partire da indice S
$content = [regex]::Replace($content, '"__id__": (\d+)', {
    param($m); $n = [int]$m.Groups[1].Value
    if ($n -ge ($S + $K)) { '"__id__": ' + ($n - $K) } else { $m.Value }
})
```

---

## Tipo componente per script custom

Il tipo di un componente script custom non è il nome della classe ma una stringa UUID derivata dal file `.meta`. Per trovarlo:

1. Aprire `assets/scripts/NomeScript.ts.meta`
2. Leggere il campo `"uuid"` → es. `"94892kS2iNCTr8dWkJgf9G+"`
3. Usarlo come `"__type__"` nel file `.scene`

**Valori FunWarriors:**
| Script | `__type__` nella scena |
|--------|------------------------|
| Track.ts | `"94892kS2iNCTr8dWkJgf9G+"` |
| GameManager.ts | `"87d25ILG0BIuKHr0QTJifr8"` |
| BgFill.ts | `"44d8f1JRRpNFYX05U2jj7o0"` |

---

## Widget — `_alignFlags` bitmask

```
TOP=1  VCENTER=2  BOTTOM=4  LEFT=8  HCENTER=16  RIGHT=32
```

**ATTENZIONE:** i valori CC3 reali sono DIVERSI da quelli di CC2. Non usare LEFT=1/RIGHT=2/TOP=4/BOTTOM=8.

| Combinazione | Calcolo | Valore |
|---|---|---|
| Fullscreen (top+bottom+left+right) | 1+4+8+32 | **45** |
| Top-left (top+left) | 1+8 | **9** |
| Top-right (top+right) | 1+32 | **33** |
| Bottom-left (bottom+left) | 4+8 | **12** |
| Bottom-right (bottom+right) | 4+32 | **36** |
| Top-center (top+hcenter) | 1+16 | **17** |
| Canvas fullscreen (`_alignMode=2` ALWAYS) | | **45** |

La struttura completa di un Widget fullscreen:
```json
{
  "__type__": "cc.Widget",
  "node": { "__id__": N },
  "_enabled": true,
  "__prefab": null,
  "_alignFlags": 45,
  "_target": null,
  "_left": 0, "_right": 0, "_top": 0, "_bottom": 0,
  "_horizontalCenter": 0, "_verticalCenter": 0,
  "_isAbsLeft": true, "_isAbsRight": true,
  "_isAbsTop": true, "_isAbsBottom": true,
  "_isAbsHorizontalCenter": true, "_isAbsVerticalCenter": true,
  "_originalWidth": 0, "_originalHeight": 0,
  "_alignMode": 2,
  "_lockFlags": 0
}
```

---

## Camera con sfondo scuro

```json
{
  "__type__": "cc.Camera",
  "_color": { "__type__": "cc.Color", "r": 18, "g": 18, "b": 32, "a": 255 },
  "_clearFlags": 7,
  "_projection": 0,
  "_orthoHeight": 360,
  "_near": 0, "_far": 2000,
  "_priority": 0
}
```

---

## GUI responsive — Widget fullscreen + offset dagli angoli

Il pattern corretto per una GUI che si adatta a qualsiasi schermo:

```
Canvas  (UITransform 720×1280, Widget alignFlags=45 ALWAYS)
  └─ UILayer  (Widget alignFlags=45 fullscreen ALWAYS)
       └─ HUD  (Widget alignFlags=45 fullscreen ALWAYS)
            ├─ ScoreSec     Widget alignFlags=9  (LEFT+TOP)    left=80  top=40
            ├─ RoundSec     Widget alignFlags=33 (RIGHT+TOP)   right=80 top=40
            ├─ NextSec      Widget alignFlags=12 (LEFT+BOTTOM) left=80  bottom=40
            ├─ VersionSec   Widget alignFlags=17 (TOP+HCENTER) top=40
            └─ FullscreenBtn Widget alignFlags=36 (RIGHT+BOTTOM) right=80 bottom=40
```

**Gotcha critico — Design Resolution Mismatch:**
Il Canvas `UITransform._contentSize` nella scena DEVE corrispondere alla design resolution usata a runtime (`view.setDesignResolutionSize`). Se i due valori divergono (es. scena ha 1280×720 landscape ma runtime usa 720×1280 portrait), il Widget calcola le posizioni su dimensioni sbagliate → elementi fuori posto o al centro.

**Soluzione:** Canvas `_contentSize: {width: 720, height: 1280}` + `setDesignResolutionSize(720, 1280, FIXED_HEIGHT)` a runtime.

**Posizioni design 720×1280 (angoli ± margini):**
| Angolo | x | y |
|--------|---|---|
| top-left (left=80, top=40) | -280 | 600 |
| top-right (right=80, top=40) | 280 | 600 |
| bottom-left (left=80, bottom=40) | -280 | -600 |
| bottom-right (right=80, bottom=40) | 280 | -600 |
| Timer (20% della launch zone) | 0 | -544 |

**Nell'editor:** impostare Design Resolution 720×1280 Fixed Height in Project Settings → le posizioni Widget editor = runtime.

---

## Sprite.SizeMode — `sizeMode`

**Problema**: se si assegna `spriteFrame` prima di impostare la `sizeMode`, il componente `UITransform` viene sovrascritto con le dimensioni native dello sprite.

**Soluzione**: impostare `sizeMode = 2` (CUSTOM) PRIMA di assegnare `spriteFrame`.

Nei file `.scene` il campo è `"_sizeMode": 2` nel componente `cc.Sprite`.

```json
{
  "__type__": "cc.Sprite",
  "_sizeMode": 2,
  "_spriteFrame": null
}
```

---

## Ordine nodi nel Canvas (z-order)

L'ordine nell'array `_children` determina il rendering (ultimo = sopra):

```
Canvas
  ├─ Camera
  ├─ BgLayer        ← sfondo, z più basso
  ├─ Track          ← Track.ts — pista funnel (Graphics + PolygonCollider2D muri)
  ├─ GameLayer      ← creato a runtime — warriors, Rope, VFX esplosioni/burst
  ├─ UILayer        ← creato a runtime — HUD, timer, NEXT, tutorial, game-over,
  │                    floating scores, RedFlash, DebugPanel
  └─ GameManager    ← GameManager.ts + InputController.ts (addComponent), nessun rendering
```

`GameLayer` e `UILayer` sono figli di `Canvas` (= `this.node.parent` dal GameManager). Non usare `this.node.parent` per spawnare nodi a runtime — usare `this.gameLayer` o `this.uiLayer`.


## Coordinate di design (720×1280, FIXED_HEIGHT)

| Costante | Valore design | Formula |
|---|---|---|
| `TRACK_W` | 691 | `TRACK_H × 6/10 × 1.2` (+20% larghezza) |
| `TRACK_H` | 960 | `min(75% altezza, (10/6) × 95% larghezza)` |
| `TRACK_BOTTOM_Y` | -640 | `-height / 2` |
| `TRACK_TOP_Y` | 320 | `TRACK_BOTTOM_Y + TRACK_H` |
| `GAME_OVER_LINE_Y` | -160 | `(TRACK_BOTTOM_Y + TRACK_TOP_Y) / 2` |
| `FUNNEL_OFFSET` | 72 | `TRACK_W × funnelPct / 200` (a 25%) |
| Timer Y | -544 | `TRACK_BOTTOM_Y + (GAME_OVER_LINE_Y - TRACK_BOTTOM_Y) × 0.2` |

---

## Property decorator per Inspector

```typescript
@property({ type: CCFloat, range: [0, 50, 1], slide: true, tooltip: '...' })
funnelPercentage: number = 25;
```

Il valore viene salvato nella scena come campo dell'oggetto componente:
```json
{ "__type__": "94892kS...", "funnelPercentage": 25, ... }
```

---

## Pattern find-or-create nodi da scena

```typescript
// GameManager.start() — usa nodi già presenti nella scena se esistono
this.gameLayer = this.node.parent!.getChildByName('GameLayer')
    ?? (() => { const n = new Node('GameLayer'); n.setParent(this.node.parent!); return n; })();

// HUD — legge Label da nodi scena, altrimenti crea runtime
const existingHud = this.uiLayer.getChildByName('HUD');
if (existingHud) {
    this.scoreLabel = existingHud.getChildByName('ScoreSec')?.getChildByName('ScoreValue')?.getComponent(Label) ?? null;
    // ...
    return;
}
// altrimenti: crea tutto programmaticamente
```

---

## SceneGlobals

Ogni scena termina con un `cc.SceneGlobals`. Può essere copiato identico tra scene:

```json
{
  "__type__": "cc.SceneGlobals",
  "ambient": { ... },
  "shadows": { ... },
  "skybox": { ... },
  "fog": { ... },
  "occlusion": null,
  "_id": ""
}
```

---

## Checklist scrittura scena manuale

1. Pianifica l'array e assegna ID sequenziali a tutti i nodi e componenti
2. Ogni nodo: `_type`, `_name`, `_parent.__id__`, `_children[]`, `_components[]`, `_lpos/rot/scale`, `_layer`, `_id` (stringa unica)
3. Ogni componente: `__type__`, `node.__id__`, `_enabled`, `__prefab: null`
4. `_layer` nodi UI: `33554432`; nodi mondo: `1073741824`
5. Canvas: pos `(640, 360, 0)` + UITransform + Canvas + Widget (alignFlags=45)
6. Camera: pos `(0, 0, 1000)`, `_orthoHeight=360`
7. SceneGlobals come ultimo elemento dell'array (referenziato da `cc.Scene._globals`)
8. Verificare che ogni `__id__` referenziato esista nell'array
