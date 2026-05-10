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
Fase 2 — Core gameplay completo, layout responsivo stabile. GUI HUD posizionata con Widget responsive (UILayer/HUD fullscreen + figli con offset dagli angoli).