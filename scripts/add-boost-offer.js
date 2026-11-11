#!/usr/bin/env node
'use strict';

/**
 * Injects the round-up BOOST offer (rewarded ad → Aura) into Game.scene. Aborts if 'BoostOffer'
 * already exists.
 *
 *   node scripts/add-boost-offer.js
 *
 * Adds, as PLAIN scene nodes (_prefab:null), under UILayer right after HUD (so Dialog/Modals stay on top):
 *   BoostOffer (Widget fullscreen + BoostOffer component)
 *     ├─ BoostButton  (INACTIVE) button.png + cc.Button + Label "BOOST"   — under the round-up banner
 *     └─ BoostPanel   (INACTIVE) modal: Widget fullscreen + UIOpacity + BlockInputEvents
 *          ├─ Dim     black backdrop
 *          └─ Card    wood: Title "WATCH AN AD TO GET YOUR BOOST", Info, WATCH, NO THANKS
 * Then wires BoostOffer.boostButton/panel/watchButton/noThanksButton and GameManager.boostOffer.
 * Both BoostButton and BoostPanel are authored INACTIVE (modal pattern, see COCOS.md).
 *
 * A timestamped .bak of the scene is written first. Layout stays editable in the editor.
 * NOTE: if Cocos has Game.scene open, reload it after running.
 * Layout tuned afterwards directly in Game.scene (2026-11-11): BoostButton 200x80 top-right under the
 * ROUND HUD (child of HUD, Widget TOP|RIGHT, right 40, top 180 — outside the track), Card 640x620, no "!".
 */

const fs = require('fs');
const path = require('path');

const SCENE = path.resolve(__dirname, '..', 'assets', 'scenes', 'Game.scene');

const FONT      = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';        // game font TTF (Lilita One, uuid kept from MedievalSharp)
const SF_WOOD   = '57db0246-f3c2-41d8-b6e0-b8cb92486df7@f9941';  // hud/wood.png
const SF_BUTTON = '86b1400e-1472-4464-86e9-be88f5124ab5@f9941';  // hud/button.png
const SF_WHITE  = '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941';  // builtin white
const UUID_BOOST_OFFER = '9408d66a-ace0-484f-a827-f7a586e3b9ab'; // BoostOffer.ts
const UUID_GAMEMANAGER = '87d2520b-1b40-48b8-a1eb-d104c989fafc'; // GameManager.ts
const UI_LAYER = 33554432;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    let out = hex.slice(0, 5);
    const rest = hex.slice(5);
    for (let i = 0; i < rest.length; i += 3) {
        const h1 = parseInt(rest[i], 16), h2 = parseInt(rest[i + 1], 16), h3 = parseInt(rest[i + 2], 16);
        out += B64[(h1 << 2) | (h2 >> 2)];
        out += B64[((h2 & 3) << 4) | h3];
    }
    return out;
}
const BOOST_TYPE = compressUuid(UUID_BOOST_OFFER);
const GAMEMANAGER_TYPE = compressUuid(UUID_GAMEMANAGER);

const arr = JSON.parse(fs.readFileSync(SCENE, 'utf8'));
if (arr.some(o => o && o.__type__ === 'cc.Node' && o._name === 'BoostOffer')) {
    console.error("'BoostOffer' node already present — revert the scene first to re-run. Aborting.");
    process.exit(1);
}
const findNode = (name) => arr.findIndex(o => o && o.__type__ === 'cc.Node' && o._name === name);
const uiLayerId = findNode('UILayer');
if (uiLayerId < 0) { console.error('UILayer node not found'); process.exit(1); }
const gmCompId = arr.findIndex(o => o && o.__type__ === GAMEMANAGER_TYPE);
if (gmCompId < 0) { console.error('GameManager component not found in scene'); process.exit(1); }

let _idc = 0;
const sid = (tag) => (tag + '0'.repeat(22)).slice(0, 20) + (_idc++).toString(36);
const col = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
const ref = (i) => ({ __id__: i });

function pushNode(name, parentIdx, pos = [0, 0, 0], active = true) {
    const idx = arr.length;
    arr.push({
        __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
        _parent: ref(parentIdx), _children: [], _active: active, _components: [],
        _prefab: null,
        _lpos: { __type__: 'cc.Vec3', x: pos[0], y: pos[1], z: 0 },
        _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
        _mobility: 0, _layer: UI_LAYER,
        _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
        _id: sid('BoN'),
    });
    arr[parentIdx]._children.push(ref(idx));
    return idx;
}
function pushComp(type, ownerIdx, props) {
    const idx = arr.length;
    arr.push({
        __type__: type, _name: '', _objFlags: 0, __editorExtras__: {},
        node: ref(ownerIdx), _enabled: true, __prefab: null,
        ...props, _id: sid('BoC'),
    });
    arr[ownerIdx]._components.push(ref(idx));
    return idx;
}
function uiTransform(nodeIdx, w, h) {
    return pushComp('cc.UITransform', nodeIdx, {
        _contentSize: { __type__: 'cc.Size', width: w, height: h },
        _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
    });
}
function widgetFullscreen(nodeIdx) {
    return pushComp('cc.Widget', nodeIdx, {
        _alignFlags: 45, _target: null,
        _left: 0, _right: 0, _top: 0, _bottom: 0, _horizontalCenter: 0, _verticalCenter: 0,
        _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
        _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
        _originalWidth: 0, _originalHeight: 0, _alignMode: 2, _lockFlags: 0,
    });
}
function sprite(nodeIdx, sf, c = col(255, 255, 255), type = 1 /* SLICED */) {
    return pushComp('cc.Sprite', nodeIdx, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c,
        _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
        _type: type, _fillType: 0, _sizeMode: 0,
        _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
        _isTrimmedMode: true, _useGrayscale: false, _atlas: null,
    });
}
function label(nodeIdx, str, fontSize, c, o = {}) {
    return pushComp('cc.Label', nodeIdx, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c, _string: str,
        _horizontalAlign: 1, _verticalAlign: 1,
        _actualFontSize: fontSize, _fontSize: fontSize, _fontFamily: 'Arial',
        _lineHeight: Math.round(fontSize * 1.25),
        _overflow: o.wrap ? 3 /* RESIZE_HEIGHT */ : 0, _enableWrapText: !!o.wrap,
        _font: { __uuid__: FONT, __expectedType__: 'cc.TTFFont' }, _isSystemFontUsed: false,
        _spacingX: 0, _isItalic: false, _isBold: false /* Lilita One is already heavy */, _isUnderline: false,
        _underlineHeight: 2, _cacheMode: 0, _enableOutline: !!o.outline,
        _outlineColor: col(0, 0, 0, 220), _outlineWidth: 3,
        _enableShadow: false, _shadowColor: col(0, 0, 0, 255),
        _shadowOffset: { __type__: 'cc.Vec2', x: 0, y: -2 }, _shadowBlur: 4,
    });
}
function button(nodeIdx) {
    return pushComp('cc.Button', nodeIdx, {
        clickEvents: [], _interactable: true, _transition: 3,
        _normalColor: col(255, 255, 255), _hoverColor: col(240, 240, 240),
        _pressedColor: col(211, 211, 211), _disabledColor: col(124, 124, 124),
        _normalSprite: { __uuid__: SF_BUTTON, __expectedType__: 'cc.SpriteFrame' },
        _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
        _duration: 0.1, _zoomScale: 1.1, _target: ref(nodeIdx),
    });
}
function buttonWithLabel(parentIdx, name, w, h, pos, text, fontSize, active = true) {
    const nodeIdx = pushNode(name, parentIdx, pos, active);
    uiTransform(nodeIdx, w, h);
    sprite(nodeIdx, SF_BUTTON);
    const buttonId = button(nodeIdx);
    const labelNode = pushNode('Label', nodeIdx);
    uiTransform(labelNode, w, h);
    label(labelNode, text, fontSize, col(60, 40, 20));
    return { nodeIdx, buttonId };
}

// ── Container right after HUD inside UILayer (Dialog / Modals keep drawing above it) ──
const containerIdx = pushNode('BoostOffer', uiLayerId);
const uiChildren = arr[uiLayerId]._children;
uiChildren.pop();                                   // re-insert at index 1 (after HUD)
uiChildren.splice(Math.min(1, uiChildren.length), 0, ref(containerIdx));
uiTransform(containerIdx, 720, 1280);
widgetFullscreen(containerIdx);

// BOOST button — under the round-up banner (banner spans y≈+50…-65).
const boost = buttonWithLabel(containerIdx, 'BoostButton', 260, 100, [0, -230, 0], 'BOOST', 48, false);
pushComp('cc.UIOpacity', boost.nodeIdx, { _opacity: 255 });

// Confirm modal.
const panelIdx = pushNode('BoostPanel', containerIdx, [0, 0, 0], false);
uiTransform(panelIdx, 720, 1280);
widgetFullscreen(panelIdx);
pushComp('cc.UIOpacity', panelIdx, { _opacity: 255 });
pushComp('cc.BlockInputEvents', panelIdx, {});

const dimIdx = pushNode('Dim', panelIdx);
uiTransform(dimIdx, 720, 1280);
sprite(dimIdx, SF_WHITE, col(0, 0, 0, 190), 0 /* SIMPLE */);
widgetFullscreen(dimIdx);

const cardIdx = pushNode('Card', panelIdx);
uiTransform(cardIdx, 600, 560);
sprite(cardIdx, SF_WOOD);

const titleIdx = pushNode('Title', cardIdx, [0, 150, 0]);
uiTransform(titleIdx, 500, 120);
label(titleIdx, 'WATCH AN AD TO GET YOUR BOOST', 40, col(255, 220, 50), { wrap: true, outline: true });

const infoIdx = pushNode('Info', cardIdx, [0, 50, 0]);
uiTransform(infoIdx, 500, 60);
label(infoIdx, 'Your next warrior gets the AURA', 28, col(255, 255, 255), { wrap: true, outline: true });

const watch    = buttonWithLabel(cardIdx, 'Watch',    360, 100, [0,  -70, 0], 'WATCH',     42);
const noThanks = buttonWithLabel(cardIdx, 'NoThanks', 300,  80, [0, -185, 0], 'NO THANKS', 30);

const boostCompId = pushComp(BOOST_TYPE, containerIdx, {
    boostButton: ref(boost.buttonId),
    panel: ref(panelIdx),
    watchButton: ref(watch.buttonId),
    noThanksButton: ref(noThanks.buttonId),
});
arr[gmCompId].boostOffer = ref(boostCompId);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(path.resolve(__dirname, '..', `Game.scene.${stamp}.bak`), fs.readFileSync(SCENE));
fs.writeFileSync(SCENE, JSON.stringify(arr, null, 2));
console.log(`BoostOffer injected into Game.scene (backup written): container #${containerIdx}, component #${boostCompId}; GameManager #${gmCompId}.boostOffer wired.`);
