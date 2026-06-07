# Leaderboard module — reusable across projects

A self-contained, backend-agnostic leaderboard. The **service layer** (this folder)
is pure TypeScript with no scene dependency; the two UI components
(`managers/NameEntry.ts`, `managers/LeaderboardPanel.ts`) carry only behavior and
bind to a prefab via `@property`.

## Files

| File | Role |
|------|------|
| `config/LeaderboardConfig.ts` | **The only file to edit per project**: flag, backend, Firebase keys, constants (TOP_N, NAME_LEN, SCORE_CAP). |
| `services/LeaderboardService.ts` | Interface + `LeaderboardEntry` / `SubmitResult` types. |
| `services/NullLeaderboard.ts` | No-op (portal builds / disabled). |
| `services/MockLeaderboard.ts` | In-memory + localStorage, seeded — local dev/tests, no network. |
| `services/FirestoreLeaderboard.ts` | Real backend via Firebase **compat** SDK (`window.firebase`). |
| `services/LeaderboardProvider.ts` | `LeaderboardProvider.get()` → the configured singleton. |
| `managers/NameEntry.ts` | Arcade NAME_LEN-letter name selector (behavior). Nested as a child inside the LeaderboardPanel prefab. |
| `managers/LeaderboardPanel.ts` + `prefabs/LeaderboardPanel.prefab` | Single overlay prefab: a `Board` sub-panel + a nested `NameEntry` sub-panel. `LeaderboardPanel` orchestrates the whole flow (`open()` = board only; `runEndGame()` = qualify→name→submit→board). |

## Drop into a new project

1. Copy `config/`, `services/`, the two `managers/*.ts`, and `prefabs/LeaderboardPanel.prefab`.
2. Edit `LeaderboardConfig.ts`: `FIREBASE_CONFIG`, `BACKEND`, and tuning constants.
3. Inject the Firebase compat SDK in `index.html` (see `build-templates/web-mobile/index.html`).
4. Apply `firestore.rules` to the Firebase project.
5. Place ONE `LeaderboardPanel` instance in your scene (under the UI layer) and call
   `leaderboardPanel.runEndGame(score)` at game over, or `leaderboardPanel.open({})` from a
   menu button (see `GameManager._runLeaderboardFlow` / `MainMenu.onLeaderboard`).

## Disable for portals

Set `BACKEND = 'null'` (or `ENABLED = false`) in `LeaderboardConfig.ts`, and remove
the two Firebase `<script>` tags from `index.html`. All call sites stay unchanged.

## Usage contract

Every service method is async and **never throws** — failures resolve to empty/false/
`{ ok: false }`, so the UI needs no try/catch and a dead backend degrades gracefully.
