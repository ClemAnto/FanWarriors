#!/usr/bin/env node
// Settings › "Left-handed" row (2026-11-19): a copy of the Fullscreen row (checkbox, icon, label) at the
// end of the options Layout, in the Game and MainMenu dialogs; bound to Settings.leftHandToggle.
// The icon is the onboarding hand, mirrored (a left hand). Idempotent.
import { CocosAsset, frameOf, scriptType } from './cocos-edit.mjs';
import crypto from 'node:crypto';

const ref = i => ({ __id__: i });
const randomId = () => crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 22);

/** Deep copy of the subtree at `src` as a new last child of the same parent (scene files only). */
function cloneNode(a, src, name) {
    const ids = [];
    const walk = i => { ids.push(i); for (const c of a.arr[i]._components || []) ids.push(c.__id__); for (const c of a.kids(i)) walk(c); };
    walk(src);
    const map = new Map();
    for (const i of ids) map.set(i, a.arr.length + map.size);
    const fix = v => {
        if (Array.isArray(v)) return v.map(fix);
        if (v && typeof v === 'object') {
            if (Object.keys(v).length === 1 && typeof v.__id__ === 'number') return map.has(v.__id__) ? { __id__: map.get(v.__id__) } : v;
            const o = {}; for (const [k, x] of Object.entries(v)) o[k] = fix(x); return o;
        }
        return v;
    };
    for (const i of ids) { const o = fix(a.arr[i]); if ('_id' in o) o._id = randomId(); a.arr.push(o); }
    const copy = map.get(src);
    a.arr[copy]._name = name;
    a.arr[a.arr[src]._parent.__id__]._children.push(ref(copy));
    return copy;
}

for (const scene of ['assets/scenes/Game.scene', 'assets/scenes/MainMenu.scene']) {
    const a = new CocosAsset(scene);
    const fs = a.node('Layout/Fullscreen');
    const layout = a.arr[fs]._parent.__id__;
    for (const old of a.all('LeftHanded', layout)) a.removeNode(old);
    const row = cloneNode(a, fs, 'LeftHanded');
    a.arr[row]._active = true;
    const label = a.c(a.node('LeftHanded/Label', layout), 'cc.Label');
    label._string = 'Left-handed';
    const icon = a.node('LeftHanded/Icon', layout);
    a.c(icon, 'cc.Sprite')._spriteFrame = { __uuid__: frameOf('textures/hud/hand.png'), __expectedType__: 'cc.SpriteFrame' };
    a.arr[icon]._lscale = { __type__: 'cc.Vec3', x: -1, y: 1, z: 1 };   // a left hand
    const toggleId = a.comp(row, 'cc.Toggle');
    const ST = scriptType('managers/Settings');
    const settingsComps = a.arr.map((o, i) => (o.__type__ === ST && !a.dead.has(i) ? i : -1)).filter(i => i >= 0);
    for (const s of settingsComps) a.arr[s].leftHandToggle = ref(toggleId);
    a.save();
    console.log(`  ${scene}: row added, bound to ${settingsComps.length} Settings component(s)`);
}
