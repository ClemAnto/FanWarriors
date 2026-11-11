#!/usr/bin/env node
// Every UI button / toggle reacts to a press by shrinking slightly (SCALE transition on the button
// node itself, so its art, label and icon shrink together) instead of swapping to a pressed sprite.
// Re-runnable; edits the scenes and prefab assets in place.
//
//   node tools/ui/buttons-scale.mjs

import { CocosAsset } from './cocos-edit.mjs';

export const PRESS_SCALE = 0.92;
const FILES = [
    'assets/scenes/Game.scene', 'assets/scenes/MainMenu.scene', 'assets/scenes/Ranking.scene',
    'assets/prefabs/GameOverPanel.prefab', 'assets/prefabs/VictoryPanel.prefab', 'assets/prefabs/PausePanel.prefab',
    'assets/resources/LeaderboardPanel.prefab',
];

for (const rel of FILES) {
    const a = new CocosAsset(rel);
    let n = 0;
    a.arr.forEach(o => {
        if (o?.__type__ !== 'cc.Button' && o?.__type__ !== 'cc.Toggle') return;
        o._transition = 3;                 // SCALE
        o._zoomScale = PRESS_SCALE;
        o._duration = 0.08;
        o._target = { __id__: o.node.__id__ };
        n++;
    });
    a.save();
    console.log(`  ${n} button(s) in ${rel}`);
}
