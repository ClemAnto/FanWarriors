#!/usr/bin/env node
// Arenas + round picker (2026-11-19). Idempotent: re-running replaces the nodes it made.
//  Game.scene:     Canvas/BackgroundNext (cross-fade), TrackSprite/ArenaWipe/TrackNext (track wipe),
//                  UILayer/ArenaBanner ("NEW ARENA..." + name), ArenaManager on the GameManager node.
//  MainMenu.scene: Center/StartRound (◀ ROUND N ▶ above PLAY), new POWERUPS button icon.
import { CocosAsset, transform, sprite, label, widget, skin, spriteButton, ensureButton, icon, uiFrame, scriptType, color, ALL, ALWAYS } from './cocos-edit.mjs';

const ref = i => ({ __id__: i });
const GOLD = color(255, 226, 90), BROWN = color(92, 10, 0), CREAM = color(255, 240, 210), DARK = color(74, 30, 8);

// ------------------------------------------------------------------ Game.scene
{
    const a = new CocosAsset('assets/scenes/Game.scene');
    const canvas = a.node('Canvas');
    for (const p of ['Canvas/BackgroundNext', 'TrackSprite/ArenaWipe', 'UILayer/ArenaBanner']) if (a.has(p)) a.removeNode(a.node(p));

    // background cross-fade layer, right above Background
    const bg = a.node('Canvas/Background');
    const bgUt = a.c(bg, 'cc.UITransform');
    const at = a.kids(canvas).indexOf(bg) + 1;
    const bgn = a.addNode(canvas, 'BackgroundNext', { pos: [a.arr[bg]._lpos.x, a.arr[bg]._lpos.y], at });
    transform(a, bgn, bgUt._contentSize.width, bgUt._contentSize.height, bgUt._anchorPoint.x, bgUt._anchorPoint.y);
    sprite(a, bgn, null);
    a.addComp(bgn, scriptType('entities/BgFill'));
    a.addComp(bgn, 'cc.UIOpacity', { _opacity: 0 });

    // track wipe: Mask growing down from the top of TrackSprite, holding the new skin
    const ts = a.node('TrackSprite');
    const tsUt = a.c(ts, 'cc.UITransform')._contentSize;
    const wipe = a.addNode(ts, 'ArenaWipe', { at: 0, active: false });
    transform(a, wipe, tsUt.width, 0, 0.5, 1);
    a.addComp(wipe, 'cc.Mask', { _visFlags: 0, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: color(255, 255, 255), _type: 0, _inverted: false, _segments: 64, _alphaThreshold: 0.1 });
    const next = a.addNode(wipe, 'TrackNext');
    transform(a, next, tsUt.width, tsUt.height, 0.5, 1);
    sprite(a, next, null);

    // "NEW ARENA..." banner (inactive), above the ROUND banner
    const ui = a.node('Canvas/UILayer');
    const ban = a.addNode(ui, 'ArenaBanner', { pos: [0, 230], active: false });
    transform(a, ban, 640, 160);
    a.addComp(ban, 'cc.UIOpacity', { _opacity: 255 });
    const title = a.addNode(ban, 'Title', { pos: [0, 34] });
    transform(a, title, 640, 72);
    const tl = label(a, title, 'NEW ARENA...', 56, { tint: GOLD, outline: BROWN, overflow: 0 });
    a.arr[tl]._outlineWidth = 4;
    a.addComp(title, 'cc.UIOpacity', { _opacity: 255 });
    const name = a.addNode(ban, 'Name', { pos: [0, -36] });
    transform(a, name, 640, 60);
    const nl = label(a, name, 'FROZEN LAKE', 44, { tint: color(255, 255, 255), outline: BROWN, overflow: 0 });
    a.arr[nl]._outlineWidth = 4;
    a.addComp(name, 'cc.UIOpacity', { _opacity: 255 });
    // the new minimum score multiplier, rising with the name
    const bonus = a.addNode(name, 'Bonus', { pos: [0, -46] });
    transform(a, bonus, 640, 40);
    const bl = label(a, bonus, 'ALL POINTS ×1.5', 30, { tint: GOLD, outline: BROWN, overflow: 0 });
    a.arr[bl]._outlineWidth = 3;

    // HUD: the multiplier under the score (hidden at ×1), like the progress bar under the round
    const scoreSec = a.node('HUD/ScoreSec');
    if (a.has('Multiplier', scoreSec)) for (const k of a.all('Multiplier', scoreSec)) a.removeNode(k);
    const mult = a.addNode(scoreSec, 'Multiplier', { pos: [0, -80], active: false });
    transform(a, mult, 120, 32);
    const ml = label(a, mult, '×1.5', 26, { tint: GOLD, outline: BROWN, overflow: 0 });
    a.arr[ml]._outlineWidth = 3;

    // ArenaManager on the GameManager node, bound to the nodes above
    const gmNode = a.node('Canvas/GameManager');
    const AM = scriptType('managers/ArenaManager');
    const old = a.comp(gmNode, AM);
    if (old >= 0) a.removeComp(gmNode, AM);
    const comp = id => { const k = a.comp(id, 'cc.Sprite'); if (k < 0) throw new Error(`no Sprite on ${a.name(id)}`); return ref(k); };
    const am = a.addComp(gmNode, AM, {
        background: comp(bg), backgroundNext: comp(bgn), trackSprite: comp(ts), trackWipe: ref(wipe), trackNext: comp(next),
        banner: ref(ban), bannerTitle: ref(tl), bannerName: ref(nl), bannerBonus: ref(bl),
    });
    const gm = a.c(gmNode, scriptType('managers/GameManager'));
    gm.arenaMgr = ref(am);
    gm.scoreMultiplierLabel = ref(ml);

    // arena difficulties: floor decals under the tokens and the warriors, ArenaHazards on the GameManager node
    if (a.has('World/HazardLayer')) a.removeNode(a.node('World/HazardLayer'));
    const world = a.node('Canvas/World');
    const tokenLayer = a.node('World/TokenLayer');
    const hl = a.addNode(world, 'HazardLayer', { at: a.kids(world).indexOf(tokenLayer) });
    a.arr[hl]._layer = a.arr[tokenLayer]._layer;
    transform(a, hl, 100, 100);
    const AH = scriptType('managers/ArenaHazards');
    if (a.comp(gmNode, AH) >= 0) a.removeComp(gmNode, AH);
    const ah = a.addComp(gmNode, AH, { floorLayer: ref(hl) });
    gm.arenaHazards = ref(ah);
    a.save();
}

// ------------------------------------------------------------------ MainMenu.scene
{
    const a = new CocosAsset('assets/scenes/MainMenu.scene');
    if (a.has('Center/StartRound')) a.removeNode(a.node('Center/StartRound'));

    // POWERUPS button icon: the dedicated icon instead of the shrunk Aura medallion
    const puIcon = a.node('Powerups/Icon');
    a.c(puIcon, 'cc.Sprite')._spriteFrame = { __uuid__: uiFrame('icon-powerups'), __expectedType__: 'cc.SpriteFrame' };
    a.size(puIcon, 42, 43);

    // ◀ ROUND N ▶ above PLAY (hidden by MainMenu until a game got past round 1)
    const center = a.node('UILayer/Center');
    const root = a.addNode(center, 'StartRound', { pos: [0, -8], active: false });
    transform(a, root, 360, 76);
    const arrow = (nm, x, rot) => {
        const b = a.addNode(root, nm, { pos: [x, 0] });
        transform(a, b, 68, 68);
        ensureButton(a, b);
        const s = skin(a, b, uiFrame('button-square'));
        spriteButton(a, b, s, 'button-square');
        const ic = icon(a, b, 'Icon', 'icon-arrow-up', 36, 39, [0, 2]);
        a.arr[ic]._euler = { __type__: 'cc.Vec3', x: 0, y: 0, z: rot };
        const r = rot * Math.PI / 360;
        a.arr[ic]._lrot = { __type__: 'cc.Quat', x: 0, y: 0, z: Math.sin(r), w: Math.cos(r) };
        return b;
    };
    const prev = arrow('Prev', -138, 90);
    const nextB = arrow('Next', 138, -90);
    const lab = a.addNode(root, 'Label', { pos: [0, 2] });
    transform(a, lab, 200, 60);
    const ll = label(a, lab, 'ROUND 1', 40, { tint: CREAM, outline: DARK, overflow: 0 });
    a.arr[ll]._outlineWidth = 4;

    const mmNode = a.node('MainMenu');
    const mm = a.c(mmNode, scriptType('managers/MainMenu'));
    mm.startRoundRoot = ref(root);
    mm.startRoundLabel = ref(ll);
    mm.startRoundPrev = ref(prev);
    mm.startRoundNext = ref(nextB);
    a.save();
}
