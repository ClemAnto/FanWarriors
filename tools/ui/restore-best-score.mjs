#!/usr/bin/env node
// Brings back the pre-@2x "Best Score" plate with the cup (menu/best_bg.png) in the MainMenu, as in
// commit 420d006 (user preference, 2026-11-12): node size, Widget, plate sprite and label.
//
//   node tools/ui/restore-best-score.mjs

import { execSync } from 'node:child_process';
import { CocosAsset, ROOT } from './cocos-edit.mjs';

const OLD = JSON.parse(execSync('git show 420d006:assets/scenes/MainMenu.scene', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }));
const oldNode = (name, parentName) => OLD.findIndex(o => o?.__type__ === 'cc.Node' && o._name === name
    && (!parentName || OLD[o._parent.__id__]?._name === parentName));
const oldComp = (i, type) => { const r = OLD[i]._components.find(c => OLD[c.__id__].__type__ === type); return r ? OLD[r.__id__] : null; };
const strip = c => { const o = { ...c }; for (const k of ['node', '__prefab', '_id', '__type__', '_name', '_objFlags', '__editorExtras__', '_enabled']) delete o[k]; return o; };

const a = new CocosAsset('assets/scenes/MainMenu.scene');
const best = a.node('BestScore');
const ob = oldNode('BestScore');
a.arr[best]._lpos = OLD[ob]._lpos;
Object.assign(a.c(best, 'cc.UITransform'), strip(oldComp(ob, 'cc.UITransform')));
Object.assign(a.c(best, 'cc.Widget'), strip(oldComp(ob, 'cc.Widget')));
for (const name of ['best_bg', 'Label']) {
    const n = a.node(name, best), on = oldNode(name, 'BestScore');
    a.arr[n]._lpos = OLD[on]._lpos;
    a.arr[n]._lscale = OLD[on]._lscale;
    Object.assign(a.c(n, 'cc.UITransform'), strip(oldComp(on, 'cc.UITransform')));
    for (const t of ['cc.Label', 'cc.Sprite']) if (oldComp(on, t) && a.comp(n, t) >= 0) Object.assign(a.c(n, t), strip(oldComp(on, t)));
}
a.save();
