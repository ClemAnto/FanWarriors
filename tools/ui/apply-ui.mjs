#!/usr/bin/env node
// Mounts the @2x UI sheets (assets/ui, from graphics/sheets/*) on every screen: modals, HUD,
// main menu, ranking. One-shot restyle of the authored scenes/prefabs (run on a clean tree:
// git is the backup). Layout values below are the editor values from then on.
//
//   node tools/ui/apply-ui.mjs
//
// Conventions (TECH.md "UI a 2×"): SLICED art on a "skin" child (scale 0.5, Widget ALWAYS),
// SIMPLE art with CUSTOM size, buttons with SPRITE transition on the skin, text in Lilita One.

import {
    CocosAsset, uiFrame, scriptType, color, INK, CREAM,
    TOP, MID, BOT, LEFT, CENTER, RIGHT, ALL, ALWAYS, ON_RESIZE,
    transform, widget, sprite, label, restyleLabel, skin, spriteButton, ensureButton, icon,
} from './cocos-edit.mjs';

const WHITE = color(255, 255, 255);
const GREEN_INK = color(26, 72, 8);
const WOOD_INK = color(74, 30, 8);
const RED_INK = color(92, 10, 0);
const VALUE = color(122, 26, 0);
const STYLE = {
    'button-primary': { tint: WHITE, outline: GREEN_INK },
    'button-hero': { tint: WHITE, outline: GREEN_INK },
    'button-secondary': { tint: color(255, 240, 210), outline: WOOD_INK },
    'button-reward': { tint: color(92, 44, 0), outline: null },
};

// ------------------------------------------------------------------------------- helpers

/** Wooden/green/gold button: skin + SPRITE transition + restyled "Label" child + optional icon. */
function button(a, n, base, { w, h, text, size = 38, iconName = null, iconW = 44, iconH = 44 }) {
    a.scale(n, 1);
    a.size(n, w, h);
    a.removeComp(n, 'cc.Widget') || null;
    const s = skin(a, n, uiFrame(base));
    ensureButton(a, n);
    spriteButton(a, n, s, base);
    let lbl = a.kids(n).find(k => a.name(k) === 'Label');
    if (lbl === undefined) { lbl = a.addNode(n, 'Label'); transform(a, lbl, 10, 10); label(a, lbl, '', size); }
    a.scale(lbl, 1);
    const st = STYLE[base];
    let area = w - 40, cx = 0;
    if (iconName) {
        const ix = -w / 2 + 34 + iconW / 2;
        icon(a, n, 'Icon', iconName, iconW, iconH, [ix, 2], 1);
        area = w - (iconW + 70); cx = (iconW + 4) / 2;
    }
    a.pos(lbl, cx, 3);
    a.size(lbl, area, h - 16);
    a.anchor(lbl, 0.5, 0.5);
    restyleLabel(a, lbl, { size, tint: st.tint, outline: st.outline, text, overflow: 2, h: 1, v: 1, wrap: false });
    return { node: n, label: lbl, skin: s };
}
/** Keeps a node's existing Widget (corner anchoring) and only restyles it as a button. */
function buttonKeepWidget(a, n, base, opts) {
    const wIdx = a.comp(n, 'cc.Widget');
    const saved = wIdx >= 0 ? { ...a.arr[wIdx] } : null;
    const r = button(a, n, base, opts);
    if (saved) {
        const k = widget(a, n, saved._alignFlags);
        Object.assign(a.arr[k], { _left: saved._left, _right: saved._right, _top: saved._top, _bottom: saved._bottom, _horizontalCenter: saved._horizontalCenter, _verticalCenter: saved._verticalCenter, _alignMode: saved._alignMode });
    }
    return r;
}
/** Square icon button (settings cog, arrows). */
function squareButton(a, n, iconName, { w = 84, iconW = 52, iconH = 52 } = {}) {
    const wIdx = a.comp(n, 'cc.Widget');
    const saved = wIdx >= 0 ? { ...a.arr[wIdx] } : null;
    a.removeComp(n, 'cc.Widget');
    a.scale(n, 1);
    a.size(n, w, w);
    const s = skin(a, n, uiFrame('button-square'));
    ensureButton(a, n);
    spriteButton(a, n, s, 'button-square');
    for (const k of a.kids(n).filter(k => a.name(k) !== 'skin')) a.removeNode(k);
    icon(a, n, 'Icon', iconName, iconW, iconH, [0, 3]);
    if (saved) {
        const k = widget(a, n, saved._alignFlags);
        Object.assign(a.arr[k], { _left: saved._left, _right: saved._right, _top: saved._top, _bottom: saved._bottom, _horizontalCenter: saved._horizontalCenter, _verticalCenter: saved._verticalCenter, _alignMode: saved._alignMode });
    }
}
/** Title ribbon at the top edge of a panel; moves (or creates) the title label inside it. */
function ribbon(a, panel, y, text, { w = 420, titleNode = null, size = 44 } = {}) {
    const r = a.addNode(panel, 'Ribbon', { pos: [0, y] });
    transform(a, r, w, 98);
    skin(a, r, uiFrame('ribbon'));
    let t = titleNode;
    if (t === null) { t = a.addNode(r, 'Text'); transform(a, t, 10, 10); label(a, t, text, size); }
    else a.setParent(t, r);
    a.scale(t, 1);
    a.pos(t, 0, 14);
    a.size(t, w - 120, 62);
    a.anchor(t, 0.5, 0.5);
    for (const k of ['cc.Widget']) a.removeComp(t, k);
    restyleLabel(a, t, { size, tint: CREAM, outline: RED_INK, text, overflow: 2, h: 1, v: 1, wrap: false });
    return r;
}
/** Parchment panel (9-slice) on an existing node; drops its old sprite. */
function panel(a, n, w, h) {
    a.scale(n, 1);
    a.size(n, w, h);
    return skin(a, n, uiFrame('panel-modal'));
}
/** Stat plate row: caption on the left, value on the right; stretched with the card. */
function statRow(a, parent, name, caption, y, { margin = 50, valueSize = 40 } = {}) {
    const row = a.addNode(parent, name, { pos: [0, y] });
    transform(a, row, 440, 68);
    widget(a, row, LEFT | RIGHT, { left: margin, right: margin, mode: ALWAYS });
    skin(a, row, uiFrame('stat-plate'));
    const cap = a.addNode(row, 'Caption');
    transform(a, cap, 160, 50, 0, 0.5);
    widget(a, cap, LEFT | MID, { left: 34, mode: ALWAYS });
    label(a, cap, caption, 30, { tint: INK, h: 0, overflow: 0 });
    const val = a.addNode(row, 'Value');
    transform(a, val, 200, 56, 1, 0.5);
    widget(a, val, RIGHT | MID, { right: 34, mode: ALWAYS });
    label(a, val, '0', valueSize, { tint: VALUE, h: 2, overflow: 0 });
    return { row, cap, val };
}
function toggleRow(a, toggle, iconName, text) {
    a.size(toggle, 56, 58);
    const sp = a.c(toggle, 'cc.Sprite');
    sp._spriteFrame = { __uuid__: uiFrame('checkbox-off'), __expectedType__: 'cc.SpriteFrame' };
    sp._type = 0; sp._sizeMode = 0;
    const chk = a.node('Checkmark', toggle);
    a.size(chk, 56, 58);
    a.pos(chk, 0, 0);
    const cs = a.c(chk, 'cc.Sprite');
    cs._spriteFrame = { __uuid__: uiFrame('checkbox-on'), __expectedType__: 'cc.SpriteFrame' };
    cs._type = 0; cs._sizeMode = 0;
    const lbl = a.node('Label', toggle);
    icon(a, toggle, 'Icon', iconName, 46, 46, [64, 0]);
    a.pos(lbl, 100, 0);
    a.anchor(lbl, 0, 0.5);
    a.size(lbl, 230, 50);
    restyleLabel(a, lbl, { size: 36, tint: INK, outline: null, text, overflow: 0, h: 0, v: 1 });
}
/** Settings dialog (same structure in Game and MainMenu). Returns the Quit node (Game) or null. */
function settingsDialog(a, withQuit) {
    const dlg = a.node('Dialog');
    const wood = a.node('wood', dlg);
    panel(a, wood, 520, 600);
    ribbon(a, wood, 300, 'SETTINGS', { w: 400 });
    const close = a.node('CloseButton', wood);
    button(a, close, 'button-secondary', { w: 210, h: 80, text: 'Close', size: 34 });
    widget(a, close, BOT | CENTER, { bottom: 48, h: withQuit ? -112 : 0, mode: ON_RESIZE });
    let quit = null;
    if (withQuit) {
        quit = a.addNode(wood, 'QuitButton');
        transform(a, quit, 210, 80);
        const ql = a.addNode(quit, 'Label'); transform(a, ql, 10, 10); label(a, ql, 'Quit', 34);
        button(a, quit, 'button-secondary', { w: 210, h: 80, text: 'Quit', size: 34 });
        widget(a, quit, BOT | CENTER, { bottom: 48, h: 112, mode: ON_RESIZE });
    }
    const lay = a.node('Layout', dlg);
    const L = a.c(lay, 'cc.Layout'); L._spacingY = 26;
    const wg = a.c(lay, 'cc.Widget'); wg._horizontalCenter = -150; wg._verticalCenter = 24;
    toggleRow(a, a.node('Vibrations', lay), 'icon-vibration', 'Vibration');
    toggleRow(a, a.node('Sfx', lay), 'icon-sound-on', 'Sound');
    toggleRow(a, a.node('Music', lay), 'icon-music-on', 'Music');
    toggleRow(a, a.node('Fullscreen', lay), 'icon-fullscreen', 'Fullscreen');
    return quit;
}
/** Drops the _contentSize overrides of the prefab instances in a scene (the asset's sizes rule). */
function dropSizeOverrides(a, assetUuids) {
    for (let i = 0; i < a.arr.length; i++) {
        const o = a.arr[i];
        if (o?.__type__ !== 'cc.PrefabInfo' || !o.instance || !assetUuids.includes(o.asset?.__uuid__)) continue;
        const inst = a.arr[o.instance.__id__];
        inst.propertyOverrides = inst.propertyOverrides.filter(r => {
            const p = a.arr[r.__id__];
            const drop = p.propertyPath[0] === '_contentSize';
            if (drop) a.dead.add(r.__id__);
            return !drop;
        });
    }
}

// ------------------------------------------------------------------------------- prefabs

function pausePanel() {
    const a = new CocosAsset('assets/prefabs/PausePanel.prefab');
    const card = a.node('Card');
    panel(a, card, 520, 500);
    ribbon(a, card, 250, 'PAUSED', { titleNode: a.node('Title', card) });
    button(a, a.node('Resume', card), 'button-primary', { w: 380, h: 92, text: 'Resume', size: 40, iconName: 'icon-play', iconW: 40, iconH: 46 });
    button(a, a.node('Restart', card), 'button-secondary', { w: 380, h: 92, text: 'Restart', size: 38, iconName: 'icon-restart', iconW: 46, iconH: 46 });
    button(a, a.node('Menu', card), 'button-secondary', { w: 380, h: 92, text: 'Menu', size: 38, iconName: 'icon-home', iconW: 48, iconH: 50 });
    a.pos(a.node('Resume', card), 0, 96);
    a.pos(a.node('Restart', card), 0, -14);
    a.pos(a.node('Menu', card), 0, -124);
    a.save();
}

/** GAME OVER / YOU WIN: a centred column (card with illustration + stats, then the buttons). */
function endPanel(file, illustrationName, hasRevive) {
    const a = new CocosAsset(file);
    const root = 1;
    const ep = a.c(root, scriptType('managers/EndPanel'));
    const oldCard = a.node('Card', root);
    const ill = a.node(illustrationName, root);
    const cont = a.node('Continue', root);
    const revive = hasRevive ? a.node('Revive', root) : null;

    // Column: width = min(600, screen − 36), height = its content (Layout), centred vertically.
    const col = a.addNode(root, 'Column', { at: 1 });
    transform(a, col, 600, 1000);
    widget(a, col, LEFT | RIGHT | MID, { left: 18, right: 18, mode: ALWAYS });
    a.addComp(col, scriptType('ui/MaxSize'), { maxWidth: 600, maxHeight: 0 });
    a.addComp(col, 'cc.Layout', {
        _resizeMode: 1, _layoutType: 2, _cellSize: { __type__: 'cc.Size', width: 40, height: 40 }, _startAxis: 0,
        _paddingLeft: 0, _paddingRight: 0, _paddingTop: 0, _paddingBottom: 0, _spacingX: 0, _spacingY: 22,
        _verticalDirection: 1, _horizontalDirection: 0, _constraint: 0, _constraintNum: 2, _affectedByScale: false, _isAlign: false,
    });

    // Card: parchment panel, stretched to the column width, fixed height.
    a.setParent(oldCard, col);
    a.removeChildren(oldCard);
    a.removeComp(oldCard, 'cc.Widget');
    a.pos(oldCard, 0, 0);
    panel(a, oldCard, 600, 800);
    widget(a, oldCard, LEFT | RIGHT, { mode: ALWAYS });
    const card = oldCard;

    // Illustration in a wooden frame (art keeps its printed title).
    const frame = a.addNode(card, 'Frame', { pos: [0, 129] });
    transform(a, frame, 430, 430);
    skin(a, frame, uiFrame('letter-slot'));
    a.setParent(ill, frame);
    for (const t of ['cc.Widget', scriptType('ui/MaxSize'), scriptType('ui/AspectRatioFit')]) a.removeComp(ill, t);
    a.pos(ill, 0, 0);
    a.size(ill, 400, 400);
    const isp = a.c(ill, 'cc.Sprite'); isp._sizeMode = 0; isp._type = 0;

    // Stats.
    const score = statRow(a, card, 'ScoreRow', 'SCORE', -140, { valueSize: 44 });
    const best = statRow(a, card, 'BestRow', 'BEST', -222);
    const round = statRow(a, card, 'RoundRow', 'ROUND', -304);
    const nb = a.addNode(card, 'NewBest', { pos: [0, -222], active: false });
    transform(a, nb, 440, 68);
    widget(a, nb, LEFT | RIGHT, { left: 50, right: 50, mode: ALWAYS });
    skin(a, nb, uiFrame('stat-plate'));
    icon(a, nb, 'Badge', 'badge-best', 52, 67, [0, 4]);
    const badge = a.node('Badge', nb);
    widget(a, badge, LEFT | MID, { left: 22, v: 4, mode: ALWAYS });
    const nbl = a.addNode(nb, 'Label', { pos: [16, 2] });
    transform(a, nbl, 330, 56);
    label(a, nbl, 'NEW BEST SCORE!', 36, { tint: color(184, 50, 10), overflow: 2 });

    // Buttons under the card (Layout order: Card, Revive, Continue).
    if (revive) {
        a.setParent(revive, col);
        a.removeComp(revive, 'cc.Widget');
        a.size(revive, 420, 150);
        const cap = a.node('Caption', revive);
        a.pos(cap, 0, 50);
        a.size(cap, 420, 36);
        restyleLabel(a, cap, { size: 26, tint: color(255, 232, 140), outline: color(40, 18, 4), text: 'Watch an ad to keep playing', overflow: 2 });
        const rb = a.node('ReviveButton', revive);
        button(a, rb, 'button-reward', { w: 380, h: 96, text: 'REVIVE', size: 42, iconName: 'icon-ad', iconW: 54, iconH: 40 });
        a.pos(rb, 0, -22);
    }
    a.setParent(cont, col);
    button(a, cont, 'button-primary', { w: 380, h: 92, text: 'Continue', size: 40 });

    // Bindings.
    const lbl = i => ({ __id__: a.comp(i, 'cc.Label') });
    ep.scoreLabel = lbl(score.val);
    ep.bestLabel = lbl(best.val);
    ep.roundLabel = lbl(round.val);
    ep.bestRow = { __id__: best.row };
    ep.newBestNode = { __id__: nb };
    a.save();
}

function leaderboardRow() {
    const a = new CocosAsset('assets/prefabs/LeaderboardRow.prefab');
    const root = 1;
    a.size(root, 440, 56);
    const s = skin(a, root, uiFrame('row-plate'));
    const medal = icon(a, root, 'Medal', 'medal-gold', 38, 48, [-178, 1], 1);
    a.active(medal, false);
    const rank = a.node('Rank', root), name = a.node('Name', root), round = a.node('Round', root), score = a.node('Score', root);
    a.pos(rank, -178, 2); a.size(rank, 50, 44); a.anchor(rank, 0.5, 0.5);
    restyleLabel(a, rank, { size: 30, tint: INK, overflow: 2, h: 1 });
    a.pos(name, -140, 2); a.size(name, 150, 44); a.anchor(name, 0, 0.5);
    restyleLabel(a, name, { size: 32, tint: INK, overflow: 2, h: 0 });
    a.pos(round, 40, 2); a.size(round, 60, 44); a.anchor(round, 0.5, 0.5);
    restyleLabel(a, round, { size: 28, tint: color(150, 90, 30), overflow: 2, h: 1 });
    a.pos(score, 196, 2); a.size(score, 140, 44); a.anchor(score, 1, 0.5);
    restyleLabel(a, score, { size: 32, tint: VALUE, overflow: 2, h: 2 });
    const f = n => ({ __uuid__: uiFrame(n), __expectedType__: 'cc.SpriteFrame' });
    a.addComp(root, scriptType('ui/LeaderboardRow'), {
        plate: { __id__: a.comp(s, 'cc.Sprite') }, normalFrame: f('row-plate'), mineFrame: f('row-plate-me'),
        medal: { __id__: a.comp(medal, 'cc.Sprite') }, medalFrames: [f('medal-gold'), f('medal-silver'), f('medal-bronze')],
        rankLabel: { __id__: a.comp(rank, 'cc.Label') }, nameLabel: { __id__: a.comp(name, 'cc.Label') },
        roundLabel: { __id__: a.comp(round, 'cc.Label') }, scoreLabel: { __id__: a.comp(score, 'cc.Label') },
    });
    a.save();
}

// ------------------------------------------------------------------------------- scenes

const PREFAB_UUID = rel => JSON.parse(readMeta(rel)).uuid;
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './cocos-edit.mjs';
function readMeta(rel) { return fs.readFileSync(path.join(ROOT, rel + '.meta'), 'utf8'); }

function gameScene() {
    const a = new CocosAsset('assets/scenes/Game.scene');
    dropSizeOverrides(a, ['assets/prefabs/PausePanel.prefab', 'assets/prefabs/GameOverPanel.prefab', 'assets/prefabs/VictoryPanel.prefab'].map(PREFAB_UUID));

    // HUD plaques.
    const hud = a.node('HUD');
    for (const [secName, plaque, capName, valName, side] of [['ScoreSec', 'plaque-score', 'ScoreCaption', 'ScoreValue', LEFT], ['RoundSec', 'plaque-round', 'RoundCaption', 'RoundValue', RIGHT]]) {
        const sec = a.node(secName, hud);
        a.size(sec, 250, 89);
        const wg = a.c(sec, 'cc.Widget');
        wg._alignFlags = TOP | side; wg._top = 14; wg._left = 14; wg._right = 14;
        a.removeNode(a.node('flag_red', sec));
        skin(a, sec, uiFrame(plaque));
        const cap = a.node(capName, sec), val = a.node(valName, sec);
        a.pos(cap, 42, 20); a.size(cap, 150, 30);
        restyleLabel(a, cap, { size: 22, tint: color(255, 236, 196), outline: color(60, 26, 6), overflow: 2 });
        a.pos(val, 42, -12); a.size(val, 160, 46);
        restyleLabel(a, val, { size: 38, tint: secName === 'ScoreSec' ? color(255, 220, 60) : WHITE, outline: color(60, 26, 6), overflow: 2 });
    }
    const pb = a.node('ProgressBar', a.node('RoundSec', hud));
    a.scale(pb, 1); a.pos(pb, 20, -64); a.size(pb, 200, 22);
    const pbs = a.c(pb, 'cc.Sprite'); pbs._spriteFrame = { __uuid__: uiFrame('progress-frame'), __expectedType__: 'cc.SpriteFrame' }; pbs._type = 1; pbs._sizeMode = 0;
    a.c(pb, 'cc.ProgressBar')._totalLength = 190;
    const bar = a.node('Bar', pb);
    a.pos(bar, -95, 0); a.size(bar, 0, 14);
    const bs = a.c(bar, 'cc.Sprite'); bs._spriteFrame = { __uuid__: uiFrame('progress-fill'), __expectedType__: 'cc.SpriteFrame' }; bs._type = 1; bs._sizeMode = 0;

    squareButton(a, a.node('MenuButton', hud), 'icon-settings');

    // BOOST offer (button + confirm modal).
    const bo = a.node('BoostOffer');
    buttonKeepWidget(a, a.node('BoostButton', bo), 'button-reward', { w: 240, h: 88, text: 'BOOST', size: 38, iconName: 'icon-boost', iconW: 34, iconH: 44 });
    const bp = a.node('BoostPanel', bo);
    const card = a.node('Card', bp);
    panel(a, card, 540, 600);
    ribbon(a, card, 300, 'BOOST', { w: 360 });
    icon(a, card, 'BoostIcon', 'icon-boost', 68, 86, [0, 168], 2);
    const title = a.node('Title', card);
    a.pos(title, 0, 72); a.size(title, 420, 90);
    restyleLabel(a, title, { size: 32, tint: INK, outline: null, text: 'WATCH AN AD TO GET YOUR BOOST', overflow: 3, wrap: true });
    const info = a.node('Info', card);
    a.pos(info, 0, 2); a.size(info, 420, 40);
    restyleLabel(a, info, { size: 26, tint: color(122, 70, 20), outline: null, overflow: 3, wrap: true });
    const watch = a.node('Watch', card);
    button(a, watch, 'button-reward', { w: 380, h: 92, text: 'WATCH', size: 40, iconName: 'icon-ad', iconW: 54, iconH: 40 });
    a.pos(watch, 0, -96);
    const nt = a.node('NoThanks', card);
    button(a, nt, 'button-secondary', { w: 300, h: 76, text: 'NO THANKS', size: 30 });
    a.pos(nt, 0, -196);

    // Settings dialog + its dedicated Quit button.
    const quit = settingsDialog(a, true);
    const st = a.arr.find(o => o?.__type__ === scriptType('managers/Settings'));
    st.quitButton = { __id__: quit };
    a.save();
}

function mainMenu() {
    const a = new CocosAsset('assets/scenes/MainMenu.scene');
    const center = a.node('Center');
    buttonKeepWidget(a, a.node('PlayButton', center), 'button-hero', { w: 300, h: 124, text: 'PLAY', size: 60 });
    buttonKeepWidget(a, a.node('Ranking', center), 'button-secondary', { w: 260, h: 84, text: 'Ranking', size: 34, iconName: 'icon-ranking', iconW: 42, iconH: 40 });
    const hud = a.node('HUD');
    squareButton(a, a.node('MenuButton', hud), 'icon-settings');
    // Logo: as wide as the screen allows (max 1240), bottom edge fixed above PLAY, grows upward.
    const title = a.node('Title', center);
    a.setParent(title, a.node('UILayer'), 0);
    a.removeComp(title, 'cc.Widget');
    a.anchor(title, 0.5, 0); a.size(title, 500, 207); a.pos(title, 0, 44);
    widget(a, title, LEFT | RIGHT | BOT, { left: 20, right: 20, bottom: 684, mode: ALWAYS });
    a.addComp(title, scriptType('ui/MaxSize'), { maxWidth: 1240, maxHeight: 0 });
    a.addComp(title, scriptType('ui/AspectRatioFit'), { aspect: 1000 / 414, widthDrivesHeight: true });
    // Best score: scroll centred at the bottom, above the Privacy / version / settings row.
    const best = a.node('BestScore', hud);
    a.size(best, 300, 116);
    Object.assign(a.c(best, 'cc.Widget'), { _alignFlags: BOT | CENTER, _bottom: 140, _horizontalCenter: 0, _alignMode: ON_RESIZE });
    const bg = a.node('best_bg', best);
    a.scale(bg, 0.5); a.size(bg, 600, 232); a.anchor(bg, 0.5, 0.5); a.pos(bg, 0, 0);
    const bgs = a.c(bg, 'cc.Sprite'); bgs._spriteFrame = { __uuid__: uiFrame('scroll-best'), __expectedType__: 'cc.SpriteFrame' }; bgs._type = 1; bgs._sizeMode = 0;
    const bl = a.node('Label', best);
    a.pos(bl, 0, 0); a.size(bl, 200, 90);
    restyleLabel(a, bl, { size: 28, tint: INK, outline: null, overflow: 2 });
    settingsDialog(a, false);

    const pr = a.node('PrivacyPanelRoot');
    const card = a.node('Card', pr);
    panel(a, card, 580, 760);
    ribbon(a, card, 380, 'PRIVACY POLICY', { titleNode: a.node('Title', card), w: 460, size: 36 });
    const content = a.node('content', card);
    restyleLabel(a, content, { size: 26, tint: INK, outline: null });
    const scroll = a.node('PrivacyScroll', card);
    a.pos(scroll, 0, 20);
    const close = a.node('Close', card);
    button(a, close, 'button-secondary', { w: 260, h: 84, text: 'Close', size: 34 });
    a.pos(close, 0, -300);
    a.save();
}

function rankingScene() {
    const a = new CocosAsset('assets/scenes/Ranking.scene');
    dropSizeOverrides(a, [PREFAB_UUID('assets/prefabs/LeaderboardRow.prefab')]);
    const lp = a.node('LeaderboardPanel');

    const board = a.node('Board', lp);
    panel(a, board, 620, 1000);
    widget(a, board, LEFT | RIGHT | MID, { left: 18, right: 18, mode: ALWAYS });
    a.addComp(board, scriptType('ui/MaxSize'), { maxWidth: 620, maxHeight: 0 });
    ribbon(a, board, 500, 'RANKING', { titleNode: a.node('Title', board), w: 420, size: 46 });
    const status = a.node('Status', board);
    restyleLabel(a, status, { size: 40, tint: INK, outline: null });
    const rows = a.node('Rows', board);
    const L = a.c(rows, 'cc.Layout'); L._resizeMode = 1; L._spacingY = 8;
    a.pos(rows, 0, 62);
    const close = a.node('Close', board);
    button(a, close, 'button-secondary', { w: 240, h: 84, text: 'Close', size: 34 });
    a.pos(close, 0, -392);

    const ne = a.node('NameEntry', lp);
    panel(a, ne, 520, 760);
    ribbon(a, ne, 380, 'NEW RECORD', { titleNode: a.node('Title', ne), w: 420, size: 42 });
    const sl = a.node('ScoreLabel', ne);
    a.pos(sl, 0, 262); a.size(sl, 300, 60);
    restyleLabel(a, sl, { size: 48, tint: VALUE, outline: null, overflow: 2 });
    [-140, 0, 140].forEach((x, i) => {
        const slot = a.node(`Slot${i}`, ne);
        a.pos(slot, x, 20); a.size(slot, 110, 300);
        const fr = a.addNode(slot, 'Frame', { scale: 0.5, at: 0 });
        transform(a, fr, 220, 300);
        sprite(a, fr, uiFrame('letter-slot'), { type: 1 });
        for (const [btnName, iconName, y] of [['Up', 'icon-arrow-up', 135], ['Down', 'icon-arrow-down', -135]]) {
            const b = a.node(btnName, slot);
            squareButton(a, b, iconName, { w: 92, iconW: 44, iconH: 48 });
            a.pos(b, 0, y);
        }
        const letter = a.node('Letter', slot);
        a.pos(letter, 0, 0); a.size(letter, 100, 130);
        restyleLabel(a, letter, { size: 90, tint: INK, outline: null, overflow: 2 });
    });
    const ok = a.node('Confirm', ne);
    button(a, ok, 'button-primary', { w: 260, h: 92, text: 'OK', size: 44 });
    a.pos(ok, 0, -284);
    a.save();
}

// ------------------------------------------------------------------------------- run

pausePanel();
endPanel('assets/prefabs/GameOverPanel.prefab', 'game_over', true);
endPanel('assets/prefabs/VictoryPanel.prefab', 'you_win', false);
leaderboardRow();
gameScene();
mainMenu();
rankingScene();
