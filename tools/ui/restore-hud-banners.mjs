#!/usr/bin/env node
// Brings back the hanging red banners of the pre-@2x HUD for SCORE and ROUND (user preference,
// 2026-11-12): same nodes, sizes, Widget margins, labels and progress bar as commit 420d006,
// replacing the @2x plaques mounted by apply-ui.mjs. Fonts stay Lilita One (same font uuid).
//
//   node tools/ui/restore-hud-banners.mjs

import { execSync } from 'node:child_process';
import { CocosAsset, ROOT } from './cocos-edit.mjs';

const OLD = JSON.parse(execSync('git show 420d006:assets/scenes/Game.scene', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }));
const oldNode = (name, parentName) => OLD.findIndex(o => o?.__type__ === 'cc.Node' && o._name === name
    && (!parentName || OLD[o._parent.__id__]?._name === parentName));
const oldComp = (i, type) => { const r = OLD[i]._components.find(c => OLD[c.__id__].__type__ === type); return r ? OLD[r.__id__] : null; };
const strip = c => { const o = { ...c }; for (const k of ['node', '__prefab', '_id', '__type__', '_name', '_objFlags', '__editorExtras__', '_enabled']) delete o[k]; return o; };

const a = new CocosAsset('assets/scenes/Game.scene');
const hud = a.node('HUD');
for (const [secName, kids] of [['ScoreSec', ['ScoreCaption', 'ScoreValue']], ['RoundSec', ['RoundCaption', 'RoundValue', 'ProgressBar']]]) {
    const sec = a.node(secName, hud);
    const o = oldNode(secName);
    // section: size + Widget as before
    Object.assign(a.c(sec, 'cc.UITransform'), { _contentSize: oldComp(o, 'cc.UITransform')._contentSize });
    Object.assign(a.c(sec, 'cc.Widget'), strip(oldComp(o, 'cc.Widget')));
    a.arr[sec]._lpos = OLD[o]._lpos;
    // art: plaque skin out, banner back (first child, behind the labels)
    for (const k of a.kids(sec).filter(k => a.name(k) === 'skin' || a.name(k) === 'flag_red')) a.removeNode(k);
    const fo = oldNode('flag_red', secName);
    const flag = a.addNode(sec, 'flag_red', { at: 0, scale: OLD[fo]._lscale.x });
    a.arr[flag]._lpos = OLD[fo]._lpos;
    a.addComp(flag, 'cc.UITransform', strip(oldComp(fo, 'cc.UITransform')));
    a.addComp(flag, 'cc.Sprite', strip(oldComp(fo, 'cc.Sprite')));
    // labels / progress bar: old transform and component values
    for (const name of kids) {
        const n = a.node(name, sec), on = oldNode(name, secName);
        a.arr[n]._lpos = OLD[on]._lpos;
        a.arr[n]._lscale = OLD[on]._lscale;
        Object.assign(a.c(n, 'cc.UITransform'), strip(oldComp(on, 'cc.UITransform')));
        for (const t of ['cc.Label', 'cc.Sprite']) if (oldComp(on, t) && a.comp(n, t) >= 0) Object.assign(a.c(n, t), strip(oldComp(on, t)));
        if (name === 'ProgressBar') {
            const pb = a.c(n, 'cc.ProgressBar'), opb = oldComp(on, 'cc.ProgressBar');
            pb._totalLength = opb._totalLength;
            const bar = a.node('Bar', n), ob = oldNode('Bar', 'ProgressBar');
            a.arr[bar]._lpos = OLD[ob]._lpos;
            Object.assign(a.c(bar, 'cc.UITransform'), strip(oldComp(ob, 'cc.UITransform')));
            Object.assign(a.c(bar, 'cc.Sprite'), strip(oldComp(ob, 'cc.Sprite')));
        }
    }
}
a.save();
