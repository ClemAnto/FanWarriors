#!/usr/bin/env node
'use strict';

/**
 * Injects the (English) story text into Tutorial.scene inside a scrolling panel:
 *   StoryPanel (dark translucent backdrop) → ScrollView → view (Mask) → content (Label, RESIZE_HEIGHT).
 * Plain scene nodes (_prefab:null). Idempotent-ish: aborts if 'StoryPanel' already exists.
 *   node scripts/add-tutorial-text.js
 * Structure/props for ScrollView+Mask copied from D:\Projects\DemoUI. Backup → Tutorial.scene.bak (root).
 */

const fs = require('fs');
const path = require('path');

const SCENE = path.resolve(__dirname, '..', 'assets', 'scenes', 'Tutorial.scene');
const FONT     = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';        // MedievalSharp TTF
const SF_WHITE = '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941';  // builtin white (tinted backdrop)
const UI_LAYER = 33554432;

const STORY = [
    'In the heart of the night, the great Black Dragon has awakened. Summoned by a dark wizard hungry for power, it now soars over the kingdom, spreading fear and destruction.',
    'The only one who could stop it is the old white wizard… but the years have left him weak, forgetful, and unable to cast the ancient spells of old. Yet, thanks to your courage, he agrees to try one last time.',
    'From his hands come only small warrior creatures, too fragile to face the darkness. But soon you discover a forgotten secret: when two identical creatures meet, they can merge into a stronger one. And the energy released by their union slowly restores the wizard’s power, letting him summon ever mightier beings.',
    'Perhaps, by uniting strength and hope, these unlikely heroes will awaken the Legendary Dragon… the only creature able to face the Black Dragon and save the kingdom.',
].join('\n\n');

const arr = JSON.parse(fs.readFileSync(SCENE, 'utf8'));
if (arr.some(o => o && o.__type__ === 'cc.Node' && o._name === 'StoryPanel')) {
    console.error('StoryPanel already present — revert the scene first. Aborting.');
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

function pushNode(name, parentIdx, pos = [0, 0, 0], anchor) {
    const idx = arr.length;
    arr.push({
        __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
        _parent: ref(parentIdx), _children: [], _active: true, _components: [], _prefab: null,
        _lpos: { __type__: 'cc.Vec3', x: pos[0], y: pos[1], z: pos[2] || 0 },
        _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
        _mobility: 0, _layer: UI_LAYER, _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: sid('StoN'),
    });
    arr[parentIdx]._children.push(ref(idx));
    return idx;
}
function pushComp(type, ownerIdx, props) {
    const idx = arr.length;
    arr.push({ __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: ref(ownerIdx), _enabled: true, __prefab: null, ...props, _id: sid('StoC') });
    arr[ownerIdx]._components.push(ref(idx));
    return idx;
}
function uiTransform(n, w, h, anchor = [0.5, 0.5]) {
    return pushComp('cc.UITransform', n, { _contentSize: { __type__: 'cc.Size', width: w, height: h }, _anchorPoint: { __type__: 'cc.Vec2', x: anchor[0], y: anchor[1] } });
}
function sprite(n, sf, c, type = 1) {
    return pushComp('cc.Sprite', n, {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: c,
        _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' }, _type: type, _fillType: 0, _sizeMode: 0,
        _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null,
    });
}

// ── StoryPanel (dark translucent backdrop) ─────────────────────────────────────
const PW = 640, PH = 880;
const panelIdx = pushNode('StoryPanel', hostId, [0, 120, 0]);
uiTransform(panelIdx, PW, PH);
sprite(panelIdx, SF_WHITE, col(20, 14, 8, 200), 0 /* SIMPLE stretched */);

// ── ScrollView → view (Mask) → content (Label) ─────────────────────────────────
const SVW = 600, SVH = 840;
const scrollIdx = pushNode('ScrollView', panelIdx, [0, 0, 0]);
uiTransform(scrollIdx, SVW, SVH);

const viewIdx = pushNode('view', scrollIdx, [0, 0, 0]);
uiTransform(viewIdx, SVW, SVH);
pushComp('cc.Mask', viewIdx, {
    _visFlags: 0, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
    _color: col(255, 255, 255), _type: 0 /* RECT */, _inverted: false, _segments: 64, _alphaThreshold: 0.1,
});

const contentIdx = pushNode('content', viewIdx, [0, SVH / 2, 0]); // anchor top → top edge at view top
uiTransform(contentIdx, SVW, SVH, [0.5, 1]);
pushComp('cc.Label', contentIdx, {
    _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: col(255, 245, 225), _string: STORY,
    _horizontalAlign: 1, _verticalAlign: 0 /* top */, _actualFontSize: 30, _fontSize: 30, _fontFamily: 'Arial',
    _lineHeight: 42, _overflow: 3 /* RESIZE_HEIGHT */, _enableWrapText: true,
    _font: { __uuid__: FONT, __expectedType__: 'cc.TTFFont' }, _isSystemFontUsed: false,
    _spacingX: 0, _isItalic: false, _isBold: false, _isUnderline: false, _underlineHeight: 2, _cacheMode: 0,
    _enableOutline: true, _outlineColor: col(0, 0, 0, 220), _outlineWidth: 3,
    _enableShadow: false, _shadowColor: col(0, 0, 0, 255), _shadowOffset: { __type__: 'cc.Vec2', x: 0, y: -2 }, _shadowBlur: 4,
});

pushComp('cc.ScrollView', scrollIdx, {
    bounceDuration: 0.23, brake: 0.75, elastic: true, inertia: true,
    horizontal: false, vertical: true, cancelInnerEvents: true, scrollEvents: [],
    _content: ref(contentIdx), _horizontalScrollBar: null, _verticalScrollBar: null,
});

fs.writeFileSync(path.resolve(__dirname, '..', 'Tutorial.scene.bak'), fs.readFileSync(SCENE));
fs.writeFileSync(SCENE, JSON.stringify(arr, null, 2));
console.log(`StoryPanel + ScrollView (#${scrollIdx}) injected into Tutorial.scene (backup at Tutorial.scene.bak).`);
