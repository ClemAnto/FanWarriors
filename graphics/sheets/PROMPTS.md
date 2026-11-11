# Prompt ChatGPT per i fogli UI

Ordine: generare per primo **ui-modal**, che fissa lo stile. Ogni foglio successivo si genera allegando
il `source.png` di ui-modal già approvato come riferimento di stile.

Riferimenti da allegare a ogni prompt:
- **`graphics/reference/style.png`** (sempre): il riferimento di stile approvato il 2026-11-11 (warriors,
  legno e oro, contorni marroni spessi). Il suo sfondo scuro sfumato NON va copiato: il foglio esce trasparente;
- dal secondo foglio in poi: il `source.png` di `ui-modal` approvato.

Ogni foglio va salvato come `graphics/sheets/<foglio>/source.png`. Il PNG deve avere lo sfondo
trasparente, perché il prep scarta i pixel con alpha < 128. Se ChatGPT restituisce uno sfondo pieno,
rispondere: "Same image, background fully transparent PNG".

## Blocco stile (in testa a ogni prompt)

```
Use the attached images as the style reference: match their palette, outline thickness, shading and
mood (ignore their dark blurred background). This is a game UI sprite sheet for a cute medieval tournament puzzle game (chibi animal
warriors on a wooden arena track).
Style: kawaii cartoon, thick dark-brown outlines (not pure black), highly saturated warm colors,
flat shading with one simple highlight, festive and friendly, clean vector-like edges.
Output: one landscape 3:2 PNG with a fully TRANSPARENT background. Every piece is separate and well
spaced (at least 60 px of empty space around each), seen perfectly straight on (no perspective, no
tilt, no rotation), with NO text, NO letters, NO numbers anywhere, no drop shadow on the background,
no glow bleeding outside the outline. Pieces that come in two states are placed side by side, same
size and same position of the outline, only the state changes.
```

## 1. `ui-modal` — fondo e cornici delle finestre

```
[STYLE BLOCK]

Pieces:
1. Large modal panel, portrait rectangle about 9:10: warm wooden board frame with a light parchment
   inner area, thin gold trim along the edge, small round gold rivets in the four corners only.
   Each side must be uniform along its length so the panel can be stretched (9-slice): all
   decorations stay inside the corners.
2. Wide title ribbon, about 5:1: royal red fabric banner with folded tails at both ends and a gold
   edge. The middle must be plain and uniform so it can be stretched horizontally.
3. Long thin inset plate, about 7:1: darker parchment recessed into wood, rounded ends, plain
   uniform middle (holds a row of stats).
4. Round close button, red with a white X symbol, and next to it its pressed state (darker, highlight
   smaller, looks pushed in).
5. Square checkbox: wooden frame with empty parchment inside, and next to it the same checkbox with a
   bold green check mark.
6. Small gold star badge with a tiny red ribbon, to mark a new best score.
```

## 2. `ui-buttons` — bottoni

```
[STYLE BLOCK]

All buttons share the same rounded-rectangle shape, thick outline and a glossy highlight on the top
third. Their left and right ends are identical and the middle is uniform, so they can be stretched
(9-slice). Each button is followed by its pressed state: one shade darker, highlight smaller, shifted
down a little inside the same outline, as if pushed.

Pieces:
1. Wide button about 11:3, bright grass green (main action). Plus pressed state.
2. Wide button about 11:3, warm brown wood (secondary action). Plus pressed state.
3. Wide button about 11:3, shiny gold yellow (reward action). Plus pressed state.
4. Wide button about 11:3, muted grey-blue stone (disabled look). Single state.
5. Square button about 1:1, warm brown wood, same style, empty face (an icon will be placed on top).
   Plus pressed state.
6. Big hero button about 5:2, bright green, thicker outline and stronger highlight (the PLAY button
   of the main menu). Plus pressed state.
```

## 3. `ui-icons` — icone

```
[STYLE BLOCK]

Small square icons, all the same visual size and weight, white or cream symbols with a thick
dark-brown outline so they read on green, wood and gold buttons. No button background behind them.

Pieces:
1. Gear (settings).
2. Pause (two vertical bars).
3. Play triangle (resume).
4. Circular arrow (restart).
5. Small castle or house (home / main menu).
6. Trophy cup (ranking).
7. Video play symbol: rounded rectangle with a triangle (watch an ad).
8. Arrow pointing up and arrow pointing down (two pieces).
9. Speaker with sound waves and speaker crossed out (two pieces).
10. Music note and music note crossed out (two pieces).
11. Phone vibrating (vibrations).
12. Four corner brackets (fullscreen).
13. Heart with a small spark (revive / extra life).
14. Lightning bolt (boost).
```

## 4. `ui-hud` — barra di gioco

```
[STYLE BLOCK]

Pieces:
1. Small horizontal wooden plaque about 3:1 with a hanging red pennant on the left side, plain
   uniform middle (shows the SCORE). Stretchable horizontally.
2. The same plaque with a blue pennant (shows the ROUND).
3. Progress bar frame, very long and thin about 8:1: wooden rim with rounded ends, empty dark inside.
   Stretchable horizontally.
4. Progress bar fill, same shape as the inside of the frame: bright golden yellow with a lighter top
   stripe, rounded ends, plain uniform middle.
5. Medium parchment scroll plate about 5:2 with rolled ends (shows the best score on the main menu).
```

## 5. `ui-ranking` — classifica e inserimento nome

```
[STYLE BLOCK]

Pieces:
1. Leaderboard row plate, very wide about 9:1: light parchment strip with a thin wooden border,
   plain uniform middle, rounded ends. Stretchable horizontally.
2. The same row plate highlighted (the player's own row): warm gold parchment with a slightly
   brighter border.
3. Three round medals with a short ribbon: gold, silver, bronze (ranks 1, 2, 3), empty center.
4. Tall letter slot about 3:4: recessed wooden frame with a parchment inside, used to pick one
   letter of the player's name.
```

---

# Powerup — illustrazioni e icone (2026-11-11)

Colori dei powerup (uguali in gioco): **Aura** oro-arancio, **WildRiver** rosso rubino,
**Brotherhood** viola, **PsychoForce** ciano.

Riferimenti da allegare: `graphics/reference/style.png` + uno screenshot di gioco con la pista piena +
gli sprite delle specie usate (`assets/resources/warriors/<specie>_2xN.png`). Le illustrazioni NON sono
trasparenti (hanno la pista come sfondo); le icone sì. Salvare in `graphics/powerups/<id>.png`
(illustrazioni) e `graphics/sheets/ui-powerups/source.png` (icone).

## Blocco stile illustrazioni — "appunti a matita" (2026-11-11, v2: la v1 a inchiostro+acquerello era troppo carica)

Allegati: gli sprite delle specie usate. Il blocco va in testa a ogni prompt al posto di `[STYLE BLOCK]`.

```
Draw this as quick pencil study notes on a single page of an old magic book: plain aged cream paper
filling the whole frame, nothing else (no book, no table, no frame, no seal, no title area).
Technique: soft graphite pencil only, simple confident lines, light hatching for shadows, lots of
empty paper. The ONLY color is a few strokes of colored pencil where something must stand out: the
magic of the power (in its color) and the one key change. Everything else stays grey pencil.
Keep it VERY simple and readable at small size: three small sketches left to right that explain the
power step by step, joined by two plain hand-drawn pencil arrows. Each sketch shows only the few
warriors needed (never more than six), drawn big, on a track suggested by just two light pencil
lines in perspective. No background, no castle, no crowd, no scenery, no extra doodles, no
magnifying glass, no recap row.
Characters: the cute chibi animal warriors of the attached sprite sheets (round chibi animals on a
small round base), as simple pencil sketches but recognizable: same species, proportions, equipment.
Magic is glows, sparkles and swirls, never fire or blood, nobody hurt: warriors who vanish do it with
a little pop of stars.
Absolutely NO writing: no words, letters, runes, numbers, fake handwriting or labels.
Output: one landscape 3:2 image.
```

## 1. Aura

```
[STYLE BLOCK]

Power: AURA, highlight color warm orange-gold.
Sketch 1: a chibi dragon warrior at the bottom, circled by an orange-gold aura (colored), moving up
toward a frog and a wolf (pencil), arrow showing its path.
Sketch 2: the dragon among them: an orange-gold ring on the track pushes them outward (small pencil
motion lines); the frog and the wolf turn into two small sparks, green and grey (colored).
Sketch 3: the two sparks fly along dotted lines to a frog and a wolf higher up, which have grown into
their bigger, better equipped version (the grown warriors lightly touched with color, little stars).
```

## 2. WildRiver

```
[STYLE BLOCK]

Power: WILD RIVER, highlight color ruby red.
Sketch 1: five frog warriors scattered on the track (pencil) and, at the bottom, one frog glowing
ruby red (colored) about to be launched.
Sketch 2: the ruby frog touches the first frog and a winding ribbon of ruby light (colored) flows
from frog to frog, touching all five, each touched frog tinted ruby.
Sketch 3: the five frogs pop into small star bursts (ruby and gold, colored) and the track is empty.
```

## 3. Brotherhood

```
[STYLE BLOCK]

Power: BROTHERHOOD, highlight color violet.
Sketch 1: a crowded track near a top line drawn as a red ribbon (the only other color), with a few
mixed warriors in pencil and three wolves far apart; at the bottom a launcher glowing violet (colored).
Sketch 2: the launcher touches one wolf and all three wolves light up violet at once, linked by thin
violet lines (colored).
Sketch 3: the three wolves become small violet swirls with stars (colored) and leave big empty gaps;
the other warriors are now far from the red line.
```

## 4. PsychoForce (oggi NON si attiva in partita — solo debug)

```
[STYLE BLOCK]

Power: PSYCHO FORCE, highlight color bright cyan.
Sketch 1: a launcher glowing cyan (colored) moving toward a cat and a hen of the same size (pencil).
Sketch 2: a horizontal cyan band (colored) crosses the track and tints the cat and the hen cyan.
Sketch 3: the cyan cat and hen touch and merge into one bigger warrior with a pop of stars; a tiny
cyan hourglass next to it shows the effect is temporary.
```

## 5. `ui-powerups` — icone dei powerup

```
Use the attached images as the style reference: match their palette, outline thickness, shading and
mood (ignore their dark blurred background). This is a game UI sprite sheet for a cute medieval
tournament puzzle game (chibi animal warriors on a wooden arena track).
Style: kawaii cartoon, thick dark-brown outlines (not pure black), highly saturated warm colors,
flat shading with one simple highlight, festive and friendly, clean vector-like edges.
Output: one landscape 3:2 PNG with a fully TRANSPARENT background. Every piece is separate and well
spaced (at least 60 px of empty space around each), seen perfectly straight on, with NO text, NO
letters, NO numbers anywhere, no glow bleeding outside the outline.

Five round badge icons, all the same size: a round medallion with a thick gold rim and a colored
enamel center, a simple bold symbol in the middle in white/cream with a dark-brown outline.
1. AURA: orange-gold enamel; symbol: a radiant sun-like burst of rays around a small dot.
2. WILD RIVER: ruby-red enamel; symbol: a winding wavy river stream made of three sparkles.
3. BROTHERHOOD: violet enamel; symbol: three small round heads joined by a ring, like a family
   crest.
4. PSYCHO FORCE: cyan enamel; symbol: a spiral swirl with two small orbiting dots.
5. LOCKED: plain grey stone medallion with a dark keyhole silhouette in the center (a
   keyhole, not a letter), for powerups not discovered yet.
```
