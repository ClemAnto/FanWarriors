#!/usr/bin/env node
'use strict';

/**
 * Injects a START button + the Tutorial component into Tutorial.scene (plain scene nodes,
 * _prefab:null). Idempotent-ish: aborts if a 'StartButton' node already exists.
 *   node scripts/add-tutorial-start.js
 *
 * Adds under Canvas/UILayer: a centred START button (button + label), and the Tutorial component
 * on the Canvas wired to it (startButton). A timestamped .bak is written to the project root.
 */

const fs = require('fs');
const path = require('path');

const SCENE = path.resolve(__dirname, '..', 'assets', 'scenes', 'Tutorial.scene');
const FONT      = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';        // MedievalSharp TTF
const SF_BUTTON = '86b1400e-1472-4464-86e9-be88f5124ab5@f9941';  // hud/button.png
const UUID_TUTORIAL = '677de09f-a06d-43cf-807a-e99badde914a';    // Tutorial.ts
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
const TUT_TYPE = compressUuid(UUID_TUTORIAL);

const arr = JSON.parse(fs.readFileSync(SCENE, 'utf8'));
if (arr.some(o => o && o.__type__ === 'cc.Node' && o._name === 'StartButton')) {
    console.error('StartButton already present — revert the scene first. Aborting.');
    process.exit(1);
}
const findNode = (name) => arr.findIndex(o => o && o.__type__ === 'cc.Node' && o._name === name);
const canvasId = findNode('Canvas');
const hostId   = findNode('UILayer') >= 0 ? findNode('UILayer') : canvasId;
if (canvasId < 0) { console.error('Canvas not found'); process.exit(1); }

let _idc = 0;
const sid = (t) => (t + '0'.repeat(22)).slice(0, 20) + (_idc++).toString(36);
const col = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
const ref = (i) => ({ __id__: i });

function pushNode(name, parentIdx, pos = [0, 0, 0]) {
    const idx = arr.length;
    arr.push({
        __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
        _parent: ref(parentIdx), _children: [], _active: true, _components: [], _prefab: null,
        _lpos: { __type__: 'cc.Vec3', x: pos[0], y: pos[1], z: pos[2] || 0 },
        _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
        _mobility: 0, _layer: UI_LAYER, _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: sid('TutN'),
    });
    arr[parentIdx]._children.push(ref(idx));
    return idx;
}
function pushComp(type, ownerIdx, props) {
    const idx = arr.length;
    arr.push({ __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: ref(ownerIdx), _enabled: true, __prefab: null, ...props, _id: sid('TutC') });
    arr[ownerIdx]._components.push(ref(idx));
    return idx;
}
function uiTransform(n, w, h, anchor = [0.5, 0.5]) {
    return pushComp('cc.UITransform', n, { _contentSize: { __type__: 'cc.Size', width: w, height: h }, _anchorPoint: { __type__: 'cc.Vec2', x: anchor[0], y: anchor[1] } });
}
function sprite(n, sf) {
    return pushComp('cc.Sprite', n, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: col(255, 255, 255),
        _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' }, _type: 1, _fillType: 0, _sizeMode: 0,
        _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null,
    });
}
function label(n, str, fontSize, c) {
    return pushComp('cc.Label', n, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c, _string: str,
        _horizontalAlign: 1, _verticalAlign: 1, _actualFontSize: fontSize, _fontSize: fontSize, _fontFamily: 'Arial',
        _lineHeight: Math.round(fontSize * 1.1), _overflow: 0, _enableWrapText: false,
        _font: { __uuid__: FONT, __expectedType__: 'cc.TTFFont' }, _isSystemFontUsed: false,
        _spacingX: 0, _isItalic: false, _isBold: true, _isUnderline: false, _underlineHeight: 2, _cacheMode: 0,
        _enableOutline: true, _outlineColor: col(0, 0, 0, 220), _outlineWidth: 3,
        _enableShadow: false, _shadowColor: col(0, 0, 0, 255), _shadowOffset: { __type__: 'cc.Vec2', x: 0, y: -2 }, _shadowBlur: 4,
    });
}
function button(n) {
    return pushComp('cc.Button', n, {
        clickEvents: [], _interactable: true, _transition: 3,
        _normalColor: col(255, 255, 255), _hoverColor: col(240, 240, 240), _pressedColor: col(211, 211, 211), _disabledColor: col(124, 124, 124),
        _normalSprite: { __uuid__: SF_BUTTON, __expectedType__: 'cc.SpriteFrame' }, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null,
        _duration: 0.1, _zoomScale: 1.1, _target: ref(n),
    });
}

// START button (under UILayer), centred a bit low.
const btnIdx = pushNode('StartButton', hostId, [0, -360, 0]);
uiTransform(btnIdx, 360, 120);
sprite(btnIdx, SF_BUTTON);
button(btnIdx);
const lblIdx = pushNode('Label', btnIdx);
uiTransform(lblIdx, 360, 120);
label(lblIdx, 'START', 48, col(60, 40, 20));

// Tutorial component on Canvas, wired to the button.
pushComp(TUT_TYPE, canvasId, { startButton: ref(btnIdx), spinner: null });

fs.writeFileSync(path.resolve(__dirname, '..', 'Tutorial.scene.bak'), fs.readFileSync(SCENE));
fs.writeFileSync(SCENE, JSON.stringify(arr, null, 2));
console.log(`START button #${btnIdx} + Tutorial component injected (backup at Tutorial.scene.bak).`);
