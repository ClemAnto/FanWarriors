#!/usr/bin/env node
// HUD counters of the power tokens (TokenCounters): a row centred at the top of the screen, between
// the SCORE and ROUND banners — one counter per power (icon + "n/needed", plus a hidden glow flashed
// when the power charges). A horizontal Layout closes the gap of the counters still locked.
// Also adds World/TokenLayer (under WarriorsLayer) and binds GameManager.tokenCounters / tokenFaces / tokenEdge.
// Re-runnable: the HUD/TokenCounters subtree is rebuilt, the rest of the scene is untouched.
//
//   node tools/ui/add-token-counters.mjs            (icons = the powerup medallions, placeholder)
//   node tools/ui/add-token-counters.mjs --tokens   (icons + track tokens = assets/ui/token-*.png, coins in perspective)

import { CocosAsset, uiFrame, scriptType, color, transform, sprite, widget, label, TOP, CENTER } from './cocos-edit.mjs';

const ref = i => ({ __id__: i });
const GLOW_SF = 'edbf98bd-f2a9-40ad-8c39-b1f076c7616b@f9941';   // resources/particles/aura (radial glow)
const USE_TOKENS = process.argv.includes('--tokens');
const KINDS = [   // data/PowerTokens TOKENS order
    { kind: 'brotherhood', prop: 'brotherhood', medal: 'powerup-brotherhood', token: 'token-brotherhood', glow: color(180, 60, 240) },
    { kind: 'wildRiver',   prop: 'wildRiver',   medal: 'powerup-wildriver',   token: 'token-wildriver',   glow: color(220, 60, 60) },
    { kind: 'psychoForce', prop: 'psychoForce', medal: 'powerup-psychoforce', token: 'token-psychoforce', glow: color(60, 230, 255) },
];
const ICON = 62, CELL_W = 70, CELL_H = 104;
const TOKEN_ASPECT = 53 / 72;   // graphics/sheets/ui-tokens manifest size (coin in perspective)

const a = new CocosAsset('assets/scenes/Game.scene');

// World/TokenLayer, right below WarriorsLayer: tokens lie on the floor, always under every warrior
// (the launched one too) — WarriorsLayer is depth-sorted by Y, so they can't live in it.
{
    const world = a.node('World');
    for (const old of a.all('TokenLayer', world)) a.removeNode(old);
    const warriors = a.node('World/WarriorsLayer');
    const layer = a.addNode(world, 'TokenLayer', { at: a.kids(world).indexOf(warriors) });
    a.arr[layer]._layer = a.arr[warriors]._layer;
    transform(a, layer, 100, 100);
}

const hud = a.node('HUD');
for (const old of a.all('TokenCounters', hud)) a.removeNode(old);

const row = a.addNode(hud, 'TokenCounters', { active: false });
transform(a, row, CELL_W * 3 + 20, CELL_H);
widget(a, row, TOP | CENTER, { top: 18 });
a.addComp(row, 'cc.Layout', {
    _resizeMode: 1, _layoutType: 1, _cellSize: { __type__: 'cc.Size', width: 40, height: 40 }, _startAxis: 0,
    _paddingLeft: 0, _paddingRight: 0, _paddingTop: 0, _paddingBottom: 0, _spacingX: 10, _spacingY: 0,
    _verticalDirection: 1, _horizontalDirection: 0, _constraint: 0, _constraintNum: 2, _affectedByScale: false, _isAlign: true,
});

const cells = {};
for (const k of KINDS) {
    const cell = a.addNode(row, `${k.prop[0].toUpperCase()}${k.prop.slice(1)}Counter`, { active: false });
    transform(a, cell, CELL_W, CELL_H);
    const glow = a.addNode(cell, 'Glow', { pos: [0, 14], active: false });
    transform(a, glow, ICON * 2, ICON * 2);
    sprite(a, glow, GLOW_SF, { tint: k.glow });
    a.addComp(glow, 'cc.UIOpacity', { _opacity: 0 });
    const icon = a.addNode(cell, 'Icon', { pos: [0, 14] });
    transform(a, icon, ICON, USE_TOKENS ? Math.round(ICON * TOKEN_ASPECT) : ICON);
    sprite(a, icon, uiFrame(USE_TOKENS ? k.token : k.medal));
    const count = a.addNode(cell, "Count", { pos: [0, -34] });
    transform(a, count, CELL_W + 16, 32);
    label(a, count, `0/0`, 30, { tint: color(255, 246, 220), outline: color(74, 38, 8) });
    cells[k.prop] = cell;
}

const counters = a.addComp(row, scriptType('managers/TokenCounters'), {});
for (const k of KINDS) a.arr[counters][k.prop] = ref(cells[k.prop]);

const gmIdx = a.arr.findIndex((o, i) => o?.__type__ === scriptType('managers/GameManager') && !a.dead.has(i));
if (gmIdx < 0) throw new Error('GameManager component not found');
const gm = a.arr[gmIdx];
gm.tokenCounters = ref(counters);
const frameRef = name => ({ __uuid__: uiFrame(name), __expectedType__: 'cc.SpriteFrame' });
gm.tokenFaces = USE_TOKENS ? KINDS.map(k => frameRef(k.token)) : [];
delete gm.tokenEdge;
a.save();
