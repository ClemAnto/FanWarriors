# FunWarriors — Contesto progetto

Progetto Cocos Creator 3.8.8, TypeScript, gioco puzzle-arcade ibrido tra Suika Game e curling per portali HTML5 (Poki/CrazyGames).

## Documenti di riferimento

| File | Scopo | Quando usare / aggiornare |
|------|-------|--------------------------|
| `GDD.md` | Specifica completa del game design: regole, meccaniche, formule, asset necessari, stile visivo. | Consultare prima di implementare feature nuove. Aggiornare solo se cambia il design del gioco. |
| `ROADMAP.md` | Piano di sviluppo per fasi con checkbox avanzamento e decisioni tecniche prese. | Consultare per capire cosa è già implementato e cosa manca. Aggiornare le checkbox a ogni milestone completata. |
| `MEMO.md` | Parametri fisici calibrati, gotcha CC 3.8, coordinate di riferimento, workflow build/test. | Consultare sempre prima di toccare fisica, coordinate o workflow. Aggiornare quando si calibra un parametro o si scopre un nuovo gotcha. |
| `TECH.md` | Decisioni architetturali non ovvie e il perché dietro a esse. | Consultare se si tocca l'architettura. Aggiornare quando si prende una decisione strutturale rilevante. |
| `COCOS.md` | Reference tecnico sul formato `.scene` CC3: UUID encoding, Widget flags, struttura HUD, coordinate design. | Consultare quando si scrive o modifica un file `.scene` manualmente. Aggiornare se si scoprono nuovi dettagli del formato. |

## Stack
- Cocos Creator 3.8.8
- TypeScript strict mode
- Box2D (fisica 2D)
- Build target: HTML5

## Nodi della scena
- **Non modificare via codice** la posizione né la scala di nodi già impostati nell'editor, salvo eccezioni esplicitamente indicate. I valori dell'editor sono autoritativi per layout e proporzioni.
- Le conversioni world → local devono usare la trasformata reale del nodo (`worldPosition` / `worldScale`), non costanti hardcoded.

## Convenzioni di codice
- Component classes in PascalCase
- File scripts: PascalCase.ts (es. GameManager.ts)
- Cartelle: lowercase (managers/, entities/, utils/)
- Decoratori @ccclass con stesso nome della classe
- Log (console.log/warn/error) sempre in inglese

## Remote control
Se la chat è aperta da qualche minuto (sessione di sviluppo attiva), avvia automaticamente il remote-control così possiamo continuare la conversazione tramite app

## Versioning
- La versione è definita in due posti: `package.json` (campo `version`) e `GameManager.ts` (costante `VERSION`) — devono essere sempre allineati.
- **Ad ogni `npm run serve` incrementa la patch** (`0.1.x → 0.1.x+1`) in entrambi i file prima di buildare.

## Comando di chiusura sessione
Quando l'utente scrive **"OK Chiudo"** (o varianti come "Ok chiudo"), significa che sta per cambiare chat. Aggiornare immediatamente tutti gli `.md` rilevanti con quanto scoperto/cambiato nella sessione corrente prima di rispondere.

## Stato attuale
Fase 5 — Pubblicazione (v0.10.18).

**Rework resize/fullscreen (v0.10.18):** centraggio del mondo fisico ora **dichiarativo via Widget** (`World`/`Track` HORIZONTAL_CENTER in `Game.scene`) — rimosso lo snap manuale `_recentreGameLayers` (era esso stesso fonte di offset). Al resize: freeze + **re-pin posizione LOCALE** dei warrior (i corpi b2World non seguono i Widget). Rebuild muri **NON** più nel percorso di resize (distruggere collider mentre si muovono i corpi → crash broadphase `UpdatePairs`): i muri statici seguono il Track ri-centrato via sync, e la geometria si rifà al lancio successivo (`_didFirstLaunchRefresh` ri-armato a ogni resize). Re-pin rinviato al resume se il resize cade in pausa-Settings. Dettagli in MEMO/TECH §Resize.

Fase 3 chiusa il 2026-06-10: gameplay completo, sprite reali, HUD (MedievalSharp), pannelli modali end-game, leaderboard Firebase (scena Ranking), powerup Aura/WildRiver/PsychoForce/Brotherhood. Audio/slowmo/trail/juice fatti.

**CrazyGames — PRIMA VERSIONE RIGETTATA (2026-06-17)** con mail generica (nessun motivo specifico). Diagnosi: non un fail tecnico (eravamo conformi) ma **first-impression/qualità**. Sorgente di verità: **`CRAZYGAMES.md`** (requisiti completi dalle 7 pagine doc + checklist risottomissione + esito ricerca). Email di richiesta motivo **inviata**.

**Pass di risottomissione fatto in v0.10.17:**
- **Scena Tutorial ELIMINATA** → PLAY entra **diretto nel Game** (1 click), regola "land in gameplay". (Rimossi Tutorial.scene/.ts, flag `fwResetTutorial`, storia ScrollView.)
- **Onboarding in-gameplay** (`OnboardingHints.ts` + nodi `Onboarding/AimHint/MergeHint` in Game.scene): hint mano (press→carica→rilascia, sprite `hud/hand.png`) al 1° turno; hint "Merge 2 warriors to create a stronger one!" al drag, fade `mergeHoldSec=1.5s` dopo il lancio. Skippabili, una-tantum (`fw_hint_*_seen`). Replay: **doppio-tap SCORE** o `fwShowHints()`.
- **Modali rifattorizzate**: `EndPanel`/`PausePanel` NON fanno più `active=false` in `onLoad` → vanno lasciate **INATTIVE in editor** + binding via `@property` su GameManager (vedi COCOS.md). DebugPanel: doppio-tap su ROUND.
- **Powerup rinominati (PEGI12)**: Genocide→**Brotherhood**, BloodHood→**WildRiver** (rename completo classi/file/costanti, script `scripts/rename-powerups.js`). Aura/PsychoForce invariati.
- **Trick QA disabilitati su build CrazyGames** (`PORTAL==='crazygames'`): replay onboarding + gesto DebugPanel. Fullscreen toggle già nascosto su CG.
- Conformità tecnica verificata: 168 file (<1500), `-webkit-user-select`/no-zoom, audio iOS su gesto, no bottone fullscreen custom, sfondi truecolor (no banding).

Tester link **ripubblicato** (v0.10.17): https://clemanto.github.io/FanWarriors/ (= tinyurl.com/funwarriors).
**Restano per risottomettere**: asset marketing (3 cover + preview video 15-20s), smoke test AdBlock+Safari, **dichiarare orientamento portrait** alla submission (su schermi larghi il gameplay è uno spicchio centrale — ammesso ma debole). Poi `npm run pack:crazygames` (carica la **cartella** `build/web-mobile`). Poki: solo richiesta account.