#!/usr/bin/env node
// Spotlight intro of the powerup tutorial modal: before the card shows, the scene dims and the
// powerup's medallion pops big over the warrior that carries it, on a glow and a star burst, then
// flies into the card's medallion slot while the card fades in (PowerupInfoPanel.showSingle).
// Additive and re-runnable: only the PowerupPanel/Spotlight subtree is (re)built, so the rest of
// the panel keeps its editor values. Game.scene only (the menu catalog opens without intro).
//
//   node tools/ui/add-powerup-spotlight.mjs

import { CocosAsset, uiFrame, scriptType, color, transform, sprite } from './cocos-edit.mjs';

const GLOW_SF  = 'edbf98bd-f2a9-40ad-8c39-b1f076c7616b@f9941';   // resources/particles/aura (radial glow)
const BURST_SF = 'f5699f15-cc6d-4c2a-9b95-d0ce02c50d73@f9941';   // resources/particles/sparkle (star burst)
const ref = i => ({ __id__: i });

const a = new CocosAsset('assets/scenes/Game.scene');
const root = a.node('PowerupPanel');
for (const old of a.all('Spotlight', root)) a.removeNode(old);

// Above Dim and Card (the medallion lands on the card), below Zoom.
const zoomAt = a.kids(root).indexOf(a.node('PowerupPanel/Zoom'));
const spot = a.addNode(root, 'Spotlight', { active: false, at: zoomAt });
transform(a, spot, 10, 10);
a.addComp(spot, 'cc.UIOpacity', { _opacity: 255 });

const glow = a.addNode(spot, 'Glow');
transform(a, glow, 420, 420);
sprite(a, glow, GLOW_SF, { tint: color(255, 200, 70) });
a.addComp(glow, 'cc.UIOpacity', { _opacity: 255 });

const burst = a.addNode(spot, 'Burst');
transform(a, burst, 620, 620);
sprite(a, burst, BURST_SF, { tint: color(255, 236, 160) });
a.addComp(burst, 'cc.UIOpacity', { _opacity: 255 });

const medal = a.addNode(spot, 'Medal');
transform(a, medal, 120, 123);   // same size as Card/Icon: it lands there at scale 1
sprite(a, medal, uiFrame('powerup-aura'));

const panel = a.c(root, scriptType('managers/PowerupInfoPanel'));
panel.dimNode = ref(a.node('PowerupPanel/Dim'));
panel.cardNode = ref(a.node('PowerupPanel/Card'));
panel.spotlightNode = ref(spot);
panel.spotlightGlow = ref(glow);
panel.spotlightBurst = ref(burst);
panel.spotlightMedal = ref(a.comp(medal, 'cc.Sprite'));
a.save();
