# Yandex Games — Requisiti, gap analysis, roadmap

> Compilato il 2026-11-12. Fonti: requisiti ufficiali Yandex Games (pagina aggiornata al 2026-10-09) e wiki Playgama Bridge (via MCP).
> Sottopagine **non lette**: 1.9 (salvataggi), 2.7 (valori età), 3.6 (cloni, testo completo), pagine SDK, payments.md (pagamenti).

## 0. Perché Yandex e come ci arriviamo

- **Moderazione tecnica.** La somiglianza viene controllata solo verso il catalogo Yandex (3.6). I giochi già pubblicati su altre piattaforme sono ammessi esplicitamente.
- **Bridge supporta `yandex`** per lingua, `game_ready`, audio/pausa, interstitial/rewarded, storage e **leaderboard `in_game`**. `PlaygamaPortal` e `PlaygamaLeaderboard` si riusano quasi così come sono.
- Moderazione: **3–5 giorni lavorativi** più la coda; la coda di un account nuovo può durare settimane. Gli invii sono illimitati, ma dopo ogni rigetto il cooldown raddoppia: 24 h → 2 → 4 → 8 → 16 giorni.
  **Rimandarlo all'ultimo passaggio, solo quando il pacchetto è stato verificato nel draft col debug panel.**

## 1. Bloccanti NON tecnici (da chiarire per primi)

| # | Tema | Stato |
|---|------|-------|
| B1 | **Contratto e pagamenti** (ricerca del 2026-11-12, §1b) | 🟡 Possibile per un privato italiano tramite l'offerta YAN. Pagamenti mai confermati in pratica. **Distribuzione UE limitata** (vedi §1b). |
| B2 | **Lingue.** Il russo non è obbligatorio, ma il pubblico è in gran parte russofono. **Lilita One non ha il cirillico**: una versione RU richiede un font in più. | ❓ Decidere: solo EN (subito) o EN+RU (fase Y-L). |
| B3 | Possibile sovrapposizione con la distribuzione di Playgama verso i suoi partner, se fra questi c'è Yandex (vietati i duplicati, 3.6). | ❓ Chiedere a Playgama se pubblica anche su Yandex. |

## 1b. Contratto e pagamenti — esito della ricerca (2026-11-12)

Fonti ufficiali: [manage-account](https://yandex.com/dev/games/doc/en/console/manage-account), [payments (ULM)](https://yandex.com/dev/games/doc/en/payments), [about-monetization](https://yandex.com/dev/games/doc/en/services/about-monetization), [YAN – individuals other countries](https://yandex.com/support/partner/en/payments/with-other-individuals), [offerta YAN](https://yandex.com/legal/yan_service_offer_ae/), [licenza](https://yandex.com/legal/licensegames), [termini UE](https://yandex.com/legal/gamesforeurope/en/).

- **Contratto in Console (ULM): NON disponibile** per i privati esteri: *"Other country or individual — signing a contract in the Console isn't available yet."* L'unica strada è l'**offerta YAN** come *"individual — only for non-residents of the Russian Federation"*. Un privato italiano rientra in questa categoria.
- **Senza contratto non si va in moderazione**: *"You can only submit a game for moderation after a contract has been signed."* Profilo, draft e periodo di prova dell'SDK sono invece disponibili subito.
- **Requisiti**: maggiore età; Yandex ID con login Yandex; nome completo, indirizzo e data di nascita; verifica via SMS; **scansione del passaporto** come prova di residenza; IBAN e SWIFT con intestatario in caratteri latini identico al nome del contratto. La revisione della richiesta può durare **fino a 30 giorni lavorativi**.
- **Controparte**: società di Dubai. Per la licenza è *Direct Cursus Technology L.L.C.*; per l'offerta YAN è *Air Smart Advertising Solutions FZ-LLC*. Non Yandex Russia. La pagina dell'offerta reindirizza a `airsmartads.com`: prima di accettare, verificare che si arrivi lì dalla Console Yandex.
- **Pagamento**: bonifico bancario. Valuta USD secondo la pagina inglese, USD o EUR secondo la tabella russa del 2020; per l'offerta, la valuta scelta in registrazione. Payoneer è solo per l'Armenia. **Soglia 100 € / 150 $**: sotto soglia l'importo slitta al periodo successivo. Il report arriva entro 10 giorni lavorativi dalla fine del mese e il pagamento **entro 60 giorni bancari** (offerta); le pagine Games indicano "20 giorni lavorativi".
- **Tasse**: le pagine si contraddicono. Secondo l'offerta e la pagina individuals si paga **lordo** e le tasse vanno dichiarate in Italia. Una nota sulla stessa pagina però dice che l'imposta sul reddito "will be deducted". Percentuale per i non residenti e certificato contro la doppia imposizione: non documentati.
- **Sanzioni**: nessuna clausola che escluda paesi o banche. Restano rischi pratici (banche italiane che bloccano bonifici da entità legate a Yandex) che le fonti non chiariscono. **Nessuna testimonianza trovata** di sviluppatori UE effettivamente pagati.
- ⚠️ **Distribuzione UE**: la licenza dice *"This Games Platform is available worldwide except European Union."* I giocatori UE si raggiungono tramite servizi separati (es. *Playhop.com*), con termini UE propri e una scelta "European Union territory" nell'account. Il pubblico reale di Yandex è soprattutto Russia/CSI, Turchia e Asia centrale.

**Conclusione**: si può fare come privato, ma è lento (fino a 30 giorni per l'approvazione YAN, più la coda di moderazione) e con pagamenti non verificati. Primo passo a costo zero: creare il profilo e inviare la richiesta YAN con un IBAN. Il lavoro tecnico si riusa comunque per altri portali Bridge.

## 2. Gap analysis (build Playgama attuale vs requisiti Yandex)

| Req. | Requisito | Stato attuale | Azione |
|------|-----------|---------------|--------|
| 1.1 / 1.19.1 | SDK Yandex con il loader attuale | Bridge carica l'SDK Yandex quando gira su un dominio Yandex | ✅ da verificare col debug panel (deve mostrare "IT") |
| 1.19.2 | `LoadingAPI.ready()` quando il gioco è interattivo, entro 90 s | `game_ready` passa da Bridge a Yandex; lo inviamo dopo aver nascosto il loading screen | ✅ verificare l'indicatore verde |
| 1.19.3 | GameplayAPI start/stop (obbligatoria **solo se usata**) | `gameplayStart/Stop` sono solo contabilità interna | 🟡 Inviare `level_started` / `level_paused` / `level_resumed` / `level_failed` (Bridge li inoltra a Yandex). Se li inviamo, la moderazione controlla menu, ads, focus e pause. |
| 2.14 | **Lingua rilevata dall'SDK all'avvio**, obbligatoria anche per giochi in una sola lingua | Non leggiamo `bridge.platform.language` | 🔴 Leggerla subito dopo init, registrarla nel log e usarla come lingua iniziale |
| 1.3 / 4.7 | Audio e gameplay in pausa su blur e durante le ads | Fatto (Y1 e mute nelle ads) | ✅ |
| 1.9 / 1.11 | Progressi salvati subito, anche dopo refresh e rotazione; flag "cloud save" nel draft | Un solo blob `fw_save` via `bridge.storage` (su Yandex: player data) | ✅ Attivare il flag "The game use cloud save" |
| 4.4 | Ads solo nelle pause logiche. Merge = turn-based: ad subito dopo un'azione dell'utente (≤2 s), oppure alla chiusura di una modale aperta senza azione dell'utente | Interstitial alla fine del banner round-up (round 6, 11, …); Bridge applica il proprio cooldown | 🟡 Probabilmente conforme: chiusura di una modale "di gioco". Da verificare. Alternativa più sicura: interstitial su Play / Play again. |
| 4.5 | Rewarded scelto dall'utente; il bottone dice chiaramente "pubblicità → premio" | BOOST e revive passano da un bottone | 🟡 Verificare che i testi dicano esplicitamente ad + premio |
| 4.1 / 1.16 | Solo ads dell'SDK; nessuna imitazione di unità pubblicitarie | ✅ | — |
| 1.6.1.8 / 1.6.2.7 | Niente menu contestuale né selezione testo su long tap / tasto destro | `oncontextmenu` sul canvas e `user-select` (pass CrazyGames) | ✅ ricontrollare su `body` |
| 1.6.2.2 | Desktop: lato lungo ≤ 2× lato corto | Landscape con sfondo full-bleed | ✅ verificare a 21:9 |
| 1.10 | Resize e rotazione senza tagli, sovrapposizioni o scroll | `test:ui` a 591 / 960 / 2276 | ✅ |
| 1.7 / 8.4 | Nessun link esterno né redirect; niente URL S3 Yandex | La privacy policy è testo; Firebase è spento sulle build portale | 🟡 Testo privacy dedicato a Yandex (oggi cita Playgama) |
| CSP | Host esterni solo se dichiarati; dati quasi tutti nell'archivio | **Bridge caricato dalla CDN `bridge.playgama.com`**; Bridge analytics/SaaS potrebbero chiamare server Playgama | 🔴 Mettere `playgama-bridge.js` dentro l'archivio. Togliere il blocco `saas` dalla config. Disattivare `analytics.send` su `yandex` se genera richieste esterne. |
| 1.21 / 1.22 | ZIP ≤ 100 MB; `index.html` nella root; nomi senza spazi né cirillico | Pacchetto ~9 MB; il check Latin-only esiste già | 🟡 Aggiungere il check sugli spazi |
| Leaderboard | — | `PlaygamaLeaderboard` gestisce già `in_game` | 🟡 Creare la leaderboard `top_score` nella Console Yandex. `setScore` richiede un giocatore autenticato: login Yandex solo su pressione di un bottone che spiega il vantaggio (1.2.1). |
| 1.12 | Monetizzazione attiva | Interstitial + rewarded | ✅ |
| 2.13 | Game Rating > 30 entro ~2 settimane, altrimenti il gioco viene ritirato | — | Monitorare dopo l'uscita |

## 3. Materiali del draft (per lingua dichiarata)

- **Titolo** ≤ 50 caratteri, unico nel catalogo, senza "free/best/top". **Descrizione** e **How to play**: 100–1000 caratteri ciascuna, testi diversi fra loro. Al massimo 2 categorie, 20 tag e 100 caratteri di keyword.
- **Icona** 512×512 PNG; **cover** 800×470 PNG, senza bordi né angoli arrotondati. Hero 1560×520 opzionale.
- **Video orizzontale** 16:9 MP4, ≤ 28 s, altezza ≥ 400 px (obbligatorio). Verticale 9:16 opzionale.
- **Screenshot**: almeno 2 per piattaforma (desktop landscape; mobile 9:16 o 16:9), lato lungo 1280–2560 px, almeno il 70% di gameplay reale.
- Orientamento: **Any** (supportiamo entrambi). Piattaforme: Desktop + Mobile (TV no). Età: da definire (contenuto cartoon, nessun sangue).
- Commento allo sviluppatore: spiegare la fusione per specie e il salvataggio automatico.

Disponibili in `submission/playgama/`: cover 1920×1080 / 1080×1920 / 800×800, da riadattare. Mancano icona 512, cover 800×470, video e screenshot nei formati Yandex.

## 4. Roadmap

- **Y-0 — Account** (utente): profilo sviluppatore con Yandex ID, chiarire B1, firmare il contratto.
- **Y-1 — Build `yandex`** (codice):
  - `PORTAL = 'yandex'` che riusa `PlaygamaPortal` e `PlaygamaLeaderboard`;
  - `npm run pack:yandex` con Bridge **incluso localmente**, config senza `saas` e check su spazi e Latin;
  - lettura di `platform.language` all'avvio;
  - eventi `level_*`;
  - testo privacy dedicato.
- **Y-2 — Draft e QA**: caricare il pacchetto nel draft; debug panel (loader IT, Game Ready verde < 90 s, lingua verde all'avvio, gamepad); test su Chrome, Firefox, Safari iOS e Yandex Browser; `test:ui` 591 / 960 / 2276.
- **Y-3 — Materiali**: icona, cover, video da 28 s, screenshot, testi EN (+ RU).
- **Y-L — Localizzazione RU** (opzionale ma consigliata): tabella stringhe, font con cirillico, verifica layout.
- **Y-4 — Invio in moderazione** (decide l'utente) e, dopo l'uscita, monitoraggio di rating e metriche.
