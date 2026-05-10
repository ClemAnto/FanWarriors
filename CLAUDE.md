# FunWarriors — Contesto progetto

Progetto Cocos Creator 3.8.8, TypeScript, gioco puzzle-arcade ibrido tra Suika Game e curling per portali HTML5 (Poki/CrazyGames).

## Documenti di riferimento
- GDD.md — game design completo
- ROADMAP.md — piano di sviluppo per fasi

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

## Stato attuale
Fase 2 — Core gameplay completo, layout responsivo stabile.