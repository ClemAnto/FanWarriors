#!/usr/bin/env node
// Powerup tutorial modal (PowerupInfoPanel) in Game.scene and MainMenu.scene, plus the POWERUPS
// button under Ranking in the main menu. Re-runnable: an existing PowerupPanel / Powerups button
// is rebuilt. Layout values here are the editor values from then on (same conventions as
// apply-ui.mjs: @2x skins at scale 0.5, Lilita One, SPRITE-transition buttons).
//
//   node tools/ui/add-powerup-panel.mjs

import {
    CocosAsset, uiFrame, scriptType, color, INK, CREAM,
    MID, BOT, LEFT, CENTER, RIGHT, ALL, ALWAYS, ON_RESIZE,
    transform, widget, sprite, label, skin, spriteButton, ensureButton, icon,
} from './cocos-edit.mjs';

const WHITE_SF = '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941';   // builtin white (dim backdrop)
const RED_INK = color(92, 10, 0);
const BROWN = color(122, 70, 20);
const ACCENT = color(184, 50, 10);
const OUTLINE = { 'button-primary': color(26, 72, 8), 'button-secondary': color(74, 30, 8) };
const TINT = { 'button-primary': color(255, 255, 255), 'button-secondary': color(255, 240, 210) };
const frameRef = name => ({ __uuid__: uiFrame(name), __expectedType__: 'cc.SpriteFrame' });
const ref = i => ({ __id__: i });

function textButton(a, parent, name, base, { w, h, text, size, pos = [0, 0], iconName = null, iconW = 40, iconH = 40 }) {
    const n = a.addNode(parent, name, { pos });
    transform(a, n, w, h);
    const s = skin(a, n, uiFrame(base));
    ensureButton(a, n);
    spriteButton(a, n, s, base);
    let area = w - 40, cx = 0;
    if (iconName) {
        icon(a, n, 'Icon', iconName, iconW, iconH, [-w / 2 + 30 + iconW / 2, 2]);
        area = w - (iconW + 66); cx = (iconW + 4) / 2;
    }
    const l = a.addNode(n, 'Label', { pos: [cx, 3] });
    transform(a, l, area, h - 16);
    const lc = a.arr[label(a, l, text, size, { tint: TINT[base], overflow: 2 })];
    lc._enableOutline = true; lc._outlineColor = OUTLINE[base]; lc._outlineWidth = 3;
    return n;
}

function arrowButton(a, parent, name, side) {
    const n = a.addNode(parent, name, { pos: [0, -352] });   // beside "Got it", clear of the illustration
    transform(a, n, 84, 84);
    const s = skin(a, n, uiFrame('button-square'));
    ensureButton(a, n);
    spriteButton(a, n, s, 'button-square');
    const ic = icon(a, n, 'Icon', 'icon-arrow-up', 44, 48, [0, 3]);
    const z = side === LEFT ? 1 : -1;   // up arrow turned 90° → left / right
    a.arr[ic]._lrot = { __type__: 'cc.Quat', x: 0, y: 0, z: z * Math.SQRT1_2, w: Math.SQRT1_2 };
    a.arr[ic]._euler = { __type__: 'cc.Vec3', x: 0, y: 0, z: z * 90 };
    widget(a, n, side, { left: 26, right: 26, mode: ALWAYS });
    return n;
}

/** Builds the modal under `parent` (inactive) and returns the PowerupInfoPanel component index. */
function buildPanel(a, parent, at = null) {
    for (const old of a.all('PowerupPanel')) a.removeNode(old);
    const root = a.addNode(parent, 'PowerupPanel', { active: false, at });
    transform(a, root, 720, 1280);
    widget(a, root, ALL, { mode: ON_RESIZE });
    a.addComp(root, 'cc.UIOpacity', { _opacity: 255 });
    a.addComp(root, 'cc.BlockInputEvents', {});

    const dim = a.addNode(root, 'Dim');
    transform(a, dim, 720, 1280);
    sprite(a, dim, WHITE_SF, { tint: color(0, 0, 0, 200) });
    widget(a, dim, ALL, { mode: ALWAYS });

    // Card: parchment, width = min(600, screen − 36), fixed height.
    const card = a.addNode(root, 'Card');
    transform(a, card, 600, 940);
    widget(a, card, LEFT | RIGHT | MID, { left: 18, right: 18, mode: ALWAYS });
    a.addComp(card, scriptType('ui/MaxSize'), { maxWidth: 600, maxHeight: 0 });
    skin(a, card, uiFrame('panel-modal'));

    const rib = a.addNode(card, 'Ribbon', { pos: [0, 470] });
    transform(a, rib, 460, 98);
    skin(a, rib, uiFrame('ribbon'));
    const title = a.addNode(rib, 'Title', { pos: [0, 14] });
    transform(a, title, 340, 62);
    label(a, title, 'AURA', 40, { tint: CREAM, outline: RED_INK, overflow: 2 });

    const ic = icon(a, card, 'Icon', 'powerup-aura', 120, 123, [0, 357]);

    const frame = a.addNode(card, 'Frame', { pos: [0, 155] });
    transform(a, frame, 500, 262);
    skin(a, frame, uiFrame('letter-slot'));
    const art = a.addNode(frame, 'Art', { active: false });
    transform(a, art, 476, 238);
    sprite(a, art, null);
    ensureButton(a, art);   // tap → zoomed view
    const locked = a.addNode(frame, 'Locked', { active: false });
    transform(a, locked, 200, 200);
    label(a, locked, '?', 150, { tint: color(150, 110, 70), overflow: 0 });

    const lore = a.addNode(card, 'Lore', { pos: [0, -48] });
    transform(a, lore, 470, 110);
    label(a, lore, '', 26, { tint: INK, overflow: 2, wrap: true });

    const cap = a.addNode(card, 'HowCaption', { pos: [0, -122] });
    transform(a, cap, 470, 30);
    label(a, cap, 'WHEN IT APPEARS', 22, { tint: ACCENT, overflow: 2 });
    const how = a.addNode(card, 'How', { pos: [0, -180] });
    transform(a, how, 470, 84);
    label(a, how, '', 23, { tint: BROWN, overflow: 2, wrap: true });

    const row = a.addNode(card, 'DontShow', { pos: [0, -262] });
    transform(a, row, 340, 60);
    ensureButton(a, row);
    const box = a.addNode(row, 'Box', { pos: [-140, 0] });
    transform(a, box, 52, 54);
    sprite(a, box, uiFrame('checkbox-off'));
    const mark = a.addNode(box, 'Checkmark', { active: false });
    transform(a, mark, 52, 54);
    sprite(a, mark, uiFrame('checkbox-on'));
    const dl = a.addNode(row, 'Label', { pos: [-100, 0] });
    transform(a, dl, 270, 50, 0, 0.5);
    label(a, dl, "Don't show again", 28, { tint: INK, h: 0, overflow: 2 });

    const close = textButton(a, card, 'Close', 'button-primary', { w: 300, h: 88, text: 'Got it', size: 40, pos: [0, -352] });

    const page = a.addNode(card, 'Page', { pos: [0, -424], active: false });
    transform(a, page, 160, 34);
    label(a, page, '1 / 2', 24, { tint: BROWN, overflow: 2 });

    const prev = arrowButton(a, card, 'Prev', LEFT);
    const next = arrowButton(a, card, 'Next', RIGHT);
    a.active(prev, false);
    a.active(next, false);

    // Zoomed illustration: fullscreen, tap anywhere to close (size/rotation set when opened).
    const zoom = a.addNode(root, 'Zoom', { active: false });
    transform(a, zoom, 720, 1280);
    widget(a, zoom, ALL, { mode: ALWAYS });
    a.addComp(zoom, 'cc.UIOpacity', { _opacity: 255 });
    a.addComp(zoom, 'cc.BlockInputEvents', {});
    ensureButton(a, zoom);
    const zdim = a.addNode(zoom, 'Dim');
    transform(a, zdim, 720, 1280);
    sprite(a, zdim, WHITE_SF, { tint: color(0, 0, 0, 225) });
    widget(a, zdim, ALL, { mode: ALWAYS });
    const big = a.addNode(zoom, 'Big');
    transform(a, big, 1040, 520);
    sprite(a, big, null);

    const L = i => ref(a.comp(i, 'cc.Label'));
    const S = i => ref(a.comp(i, 'cc.Sprite'));
    return a.addComp(root, scriptType('managers/PowerupInfoPanel'), {
        titleLabel: L(title), iconSprite: S(ic), artSprite: S(art), lockedNode: ref(locked),
        loreLabel: L(lore), howLabel: L(how), checkRow: ref(row), checkMark: ref(mark),
        closeButton: ref(close), prevButton: ref(prev), nextButton: ref(next), pageLabel: L(page),
        iconFrames: ['powerup-aura', 'powerup-wildriver', 'powerup-brotherhood', 'powerup-psychoforce'].map(frameRef),
        lockedFrame: frameRef('powerup-locked'),
        zoomNode: ref(zoom), zoomSprite: S(big),
    });
}

function compOfType(a, type) {
    const i = a.arr.findIndex((o, k) => o?.__type__ === type && !a.dead.has(k));
    if (i < 0) throw new Error(`${a.rel}: no ${type}`);
    return a.arr[i];
}

// ------------------------------------------------------------------------------- Game

{
    const a = new CocosAsset('assets/scenes/Game.scene');
    const comp = buildPanel(a, a.node('UILayer'));
    compOfType(a, scriptType('managers/GameManager')).powerupPanel = ref(comp);
    a.save();
}

// ------------------------------------------------------------------------------- MainMenu

{
    const a = new CocosAsset('assets/scenes/MainMenu.scene');
    const canvas = a.node('Canvas');
    const fade = a.kids(canvas).indexOf(a.node('FadeOverlay'));
    const comp = buildPanel(a, canvas, fade);

    // POWERUPS under Ranking: same width, a little shorter, 10 px gap (Ranking: bottom −40, h 84).
    const center = a.node('Center');
    for (const old of a.all('Powerups', center)) a.removeNode(old);
    const btn = textButton(a, center, 'Powerups', 'button-secondary', { w: 260, h: 76, text: 'Powerups', size: 32, pos: [0, -338], iconName: 'powerup-aura', iconW: 40, iconH: 41 });
    widget(a, btn, BOT | CENTER, { bottom: -126, mode: ON_RESIZE });

    const mm = compOfType(a, scriptType('managers/MainMenu'));
    mm.powerupPanel = ref(comp);
    mm.powerupsButton = ref(btn);
    a.save();
}
