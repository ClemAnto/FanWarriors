// Small editor for Cocos Creator 3.8 .scene / .prefab JSON, used by the UI mounting scripts.
// It edits the serialized object array in place: find nodes by name/path, add nodes and
// components (with the prefab bookkeeping when the file is a prefab asset), remove components
// or whole subtrees (indices are compacted and every {__id__} reference remapped on save).
//
// Only plain scene nodes and prefab ASSETS are edited: nodes that belong to a prefab instance
// inside a scene are left alone (change the prefab asset instead).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const UI_LAYER = 33554432;

// Widget align flags (cc.Widget.AlignFlags)
export const TOP = 1, MID = 2, BOT = 4, LEFT = 8, CENTER = 16, RIGHT = 32;
export const ALL = TOP | BOT | LEFT | RIGHT;
// Widget align modes
export const ONCE = 0, ALWAYS = 1, ON_RESIZE = 2;

const vec3 = (x = 0, y = 0, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
export const color = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
const ref = i => ({ __id__: i });

/** "<uuid>@f9941" of assets/ui/<name>.png (sprite frame sub-asset). */
export function uiFrame(name) {
    const meta = path.join(ROOT, 'assets', 'ui', `${name}.png.meta`);
    if (!fs.existsSync(meta)) throw new Error(`missing ${meta}: run npm run ui:export first`);
    return `${JSON.parse(fs.readFileSync(meta, 'utf8')).uuid}@f9941`;
}
/** Sprite frame uuid of any image asset, by path under assets/. */
export function frameOf(rel) {
    const meta = path.join(ROOT, 'assets', `${rel}.meta`);
    return `${JSON.parse(fs.readFileSync(meta, 'utf8')).uuid}@f9941`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Script uuid → the compressed __type__ used in scenes/prefabs. */
export function scriptType(scriptRel) {
    const meta = path.join(ROOT, 'assets', 'scripts', `${scriptRel}.ts.meta`);
    const hex = JSON.parse(fs.readFileSync(meta, 'utf8')).uuid.replace(/-/g, '');
    let out = hex.slice(0, 5);
    for (let i = 5; i < hex.length; i += 3) {
        const h1 = parseInt(hex[i], 16), h2 = parseInt(hex[i + 1], 16), h3 = parseInt(hex[i + 2], 16);
        out += B64[(h1 << 2) | (h2 >> 2)] + B64[((h2 & 3) << 4) | h3];
    }
    return out;
}

const randomId = () => crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 22);

export class CocosAsset {
    constructor(rel) {
        this.rel = rel;
        this.file = path.join(ROOT, rel);
        this.arr = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.isPrefab = this.arr[0]?.__type__ === 'cc.Prefab';
        this.dead = new Set();
    }

    // ---------------------------------------------------------------- lookup
    isNode(i) { return this.arr[i]?.__type__ === 'cc.Node' && !this.dead.has(i); }
    name(i) { return this.arr[i]._name; }
    kids(i) { return (this.arr[i]._children || []).map(r => r.__id__).filter(c => !this.dead.has(c)); }
    /** Every live node index named `name` (optionally inside the subtree of `under`). */
    all(name, under = null) {
        const out = [];
        const walk = i => { if (this.arr[i]._name === name) out.push(i); for (const c of this.kids(i)) walk(c); };
        if (under !== null) walk(under);
        else this.arr.forEach((o, i) => { if (this.isNode(i) && o._name === name) out.push(i); });
        return out;
    }
    /** The single node at `path` ("A/B/C"): the first segment may match anywhere, the rest are children. */
    node(p, under = null) {
        const [first, ...rest] = p.split('/');
        const starts = this.all(first, under);
        const hits = [];
        for (const s of starts) {
            let cur = s;
            for (const seg of rest) {
                const next = this.kids(cur).filter(c => this.arr[c]._name === seg);
                if (next.length !== 1) { cur = -1; break; }
                cur = next[0];
            }
            if (cur >= 0) hits.push(cur);
        }
        if (hits.length !== 1) throw new Error(`${this.rel}: "${p}" matches ${hits.length} nodes`);
        return hits[0];
    }
    has(p, under = null) { try { this.node(p, under); return true; } catch { return false; } }
    comp(i, type) {
        const r = (this.arr[i]._components || []).find(c => !this.dead.has(c.__id__) && this.arr[c.__id__].__type__ === type);
        return r ? r.__id__ : -1;
    }
    c(i, type) {
        const k = this.comp(i, type);
        if (k < 0) throw new Error(`${this.rel}: node "${this.name(i)}" has no ${type}`);
        return this.arr[k];
    }

    // ---------------------------------------------------------------- creation
    _push(o) { this.arr.push(o); return this.arr.length - 1; }
    _prefabRoot() { return 1; }

    addNode(parent, name, { pos = [0, 0], scale = 1, active = true, at = null } = {}) {
        const n = {
            __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
            _parent: ref(parent), _children: [], _active: active, _components: [], _prefab: null,
            _lpos: vec3(pos[0], pos[1], 0), _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: vec3(scale, scale, 1), _mobility: 0, _layer: UI_LAYER, _euler: vec3(), _id: '',
        };
        const i = this._push(n);
        if (this.isPrefab) {
            n._prefab = ref(this._push({ __type__: 'cc.PrefabInfo', root: ref(this._prefabRoot()), asset: ref(0), fileId: randomId(), instance: null, targetOverrides: null }));
        } else n._id = randomId();
        const list = this.arr[parent]._children;
        if (at === null) list.push(ref(i)); else list.splice(at, 0, ref(i));
        return i;
    }
    addComp(node, type, props = {}) {
        const c = { __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: ref(node), _enabled: true, __prefab: null, ...props, _id: '' };
        const i = this._push(c);
        if (this.isPrefab) c.__prefab = ref(this._push({ __type__: 'cc.CompPrefabInfo', fileId: randomId() }));
        else c._id = randomId();
        this.arr[node]._components.push(ref(i));
        return i;
    }

    // ---------------------------------------------------------------- removal
    removeComp(node, type) {
        const k = this.comp(node, type);
        if (k < 0) return false;
        this.arr[node]._components = this.arr[node]._components.filter(r => r.__id__ !== k);
        this._kill(k);
        return true;
    }
    _kill(i) {
        this.dead.add(i);
        const p = this.arr[i].__prefab || (this.arr[i].__type__ === 'cc.Node' ? this.arr[i]._prefab : null);
        if (p && this.arr[p.__id__]?.__type__ !== 'cc.PrefabInstance') this.dead.add(p.__id__);
    }
    removeNode(i) {
        const parent = this.arr[i]._parent?.__id__;
        if (parent !== undefined) this.arr[parent]._children = this.arr[parent]._children.filter(r => r.__id__ !== i);
        const walk = n => {
            for (const c of this.kids(n)) walk(c);
            for (const r of this.arr[n]._components || []) this._kill(r.__id__);
            this._kill(n);
        };
        walk(i);
    }
    removeChildren(i) { for (const c of this.kids(i)) this.removeNode(c); }
    setParent(i, parent, at = null) {
        const old = this.arr[i]._parent.__id__;
        this.arr[old]._children = this.arr[old]._children.filter(r => r.__id__ !== i);
        this.arr[i]._parent = ref(parent);
        const list = this.arr[parent]._children;
        if (at === null) list.push(ref(i)); else list.splice(at, 0, ref(i));
    }

    // ---------------------------------------------------------------- node props
    pos(i, x, y) { this.arr[i]._lpos = vec3(x, y, 0); }
    scale(i, s) { this.arr[i]._lscale = vec3(s, s, 1); }
    active(i, on) { this.arr[i]._active = on; }
    rename(i, name) { this.arr[i]._name = name; }
    size(i, w, h) { this.c(i, 'cc.UITransform')._contentSize = { __type__: 'cc.Size', width: w, height: h }; }
    anchor(i, x, y) { this.c(i, 'cc.UITransform')._anchorPoint = { __type__: 'cc.Vec2', x, y }; }

    // ---------------------------------------------------------------- save
    save() {
        const keep = [], map = new Map();
        this.arr.forEach((o, i) => { if (!this.dead.has(i)) { map.set(i, keep.length); keep.push(o); } });
        const fix = (v, where) => {
            if (Array.isArray(v)) return v.map(x => fix(x, where));
            if (v && typeof v === 'object') {
                if (Object.keys(v).length === 1 && typeof v.__id__ === 'number') {
                    if (!map.has(v.__id__)) throw new Error(`${this.rel}: dangling reference to removed #${v.__id__} in ${where}`);
                    return { __id__: map.get(v.__id__) };
                }
                const o = {};
                for (const [k, x] of Object.entries(v)) o[k] = fix(x, where);
                return o;
            }
            return v;
        };
        const out = keep.map((o, i) => fix(o, `#${i} ${o.__type__} ${o._name ?? ''}`));
        fs.writeFileSync(this.file, JSON.stringify(out, null, 2));
        this.arr = out; this.dead = new Set();
        console.log(`saved ${this.rel} (${out.length} objects)`);
    }
}

// ==================================================================== component presets

export function transform(a, n, w, h, ax = 0.5, ay = 0.5) {
    return a.addComp(n, 'cc.UITransform', { _contentSize: { __type__: 'cc.Size', width: w, height: h }, _anchorPoint: { __type__: 'cc.Vec2', x: ax, y: ay } });
}
export function widget(a, n, flags, { left = 0, right = 0, top = 0, bottom = 0, h = 0, v = 0, mode = ON_RESIZE } = {}) {
    return a.addComp(n, 'cc.Widget', {
        _alignFlags: flags, _target: null, _left: left, _right: right, _top: top, _bottom: bottom,
        _horizontalCenter: h, _verticalCenter: v,
        _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true, _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
        _originalWidth: 0, _originalHeight: 0, _alignMode: mode, _lockFlags: 0,
    });
}
/** type: 0 SIMPLE, 1 SLICED, 3 FILLED. sizeMode 0 = CUSTOM. */
export function sprite(a, n, frame, { type = 0, tint = color(255, 255, 255) } = {}) {
    return a.addComp(n, 'cc.Sprite', {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: tint,
        _spriteFrame: frame ? { __uuid__: frame, __expectedType__: 'cc.SpriteFrame' } : null,
        _type: type, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
        _isTrimmedMode: false, _useGrayscale: false, _atlas: null,
    });
}
export const FONT = '993e10ce-345b-464f-9b7d-bd534dcd6e0b';   // Lilita One (game font)
export const INK = color(74, 38, 8);                           // dark brown text on parchment
export const CREAM = color(255, 246, 220);
export function label(a, n, text, size, { tint = INK, h = 1, v = 1, overflow = 2, outline = null, wrap = false, lineHeight = null } = {}) {
    return a.addComp(n, 'cc.Label', {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: tint, _string: text,
        _horizontalAlign: h, _verticalAlign: v, _actualFontSize: size, _fontSize: size, _fontFamily: 'Arial',
        _lineHeight: lineHeight ?? Math.round(size * 1.15), _overflow: overflow, _enableWrapText: wrap,
        _font: { __uuid__: FONT, __expectedType__: 'cc.TTFFont' }, _isSystemFontUsed: false, _spacingX: 0,
        _isItalic: false, _isBold: false, _isUnderline: false, _underlineHeight: 2, _cacheMode: 0,
        _enableOutline: !!outline, _outlineColor: outline ?? color(0, 0, 0, 255), _outlineWidth: 3,
        _enableShadow: false, _shadowColor: color(0, 0, 0, 255), _shadowOffset: { __type__: 'cc.Vec2', x: 0, y: -2 }, _shadowBlur: 2,
    });
}

/** Restyle an existing Label component in place (font, colours, size). */
export function restyleLabel(a, n, { size, tint = INK, outline = null, text, overflow, h, v, wrap } = {}) {
    const l = a.c(n, 'cc.Label');
    if (size) { l._fontSize = size; l._actualFontSize = size; l._lineHeight = Math.round(size * 1.15); }
    l._color = tint;
    l._enableOutline = !!outline;
    if (outline) { l._outlineColor = outline; l._outlineWidth = 3; }
    if (text !== undefined) l._string = text;
    if (overflow !== undefined) l._overflow = overflow;
    if (h !== undefined) l._horizontalAlign = h;
    if (v !== undefined) l._verticalAlign = v;
    if (wrap !== undefined) l._enableWrapText = wrap;
    l._font = { __uuid__: FONT, __expectedType__: 'cc.TTFFont' };
    l._isSystemFontUsed = false;
    l._isBold = false;
    return l;
}

/**
 * @2x SLICED art on a child "skin" (first sibling, scale 0.5, content ×2, Widget stretched on
 * the parent, ALWAYS so it follows runtime resizes). Removes the node's own Sprite.
 * Returns the skin node index.
 */
export function skin(a, n, frame, { tint } = {}) {
    a.removeComp(n, 'cc.Sprite');
    for (const old of a.all('skin', n).filter(k => a.arr[k]._parent.__id__ === n)) a.removeNode(old);
    const ut = a.c(n, 'cc.UITransform')._contentSize;
    const s = a.addNode(n, 'skin', { scale: 0.5, at: 0 });
    transform(a, s, ut.width * 2, ut.height * 2);
    sprite(a, s, frame, { type: 1, tint });
    widget(a, s, ALL, { mode: ALWAYS });
    return s;
}

/** Button with SPRITE transition on its skin: normal / pressed (hover = normal, disabled = button-disabled). */
export function spriteButton(a, n, skinNode, base) {
    const b = a.c(n, 'cc.Button');
    const f = name => ({ __uuid__: uiFrame(name), __expectedType__: 'cc.SpriteFrame' });
    b._transition = 2;
    b._target = ref(skinNode);
    b._normalSprite = f(base);
    b._hoverSprite = f(base);
    b._pressedSprite = f(`${base}-pressed`);
    b._disabledSprite = base === 'button-square' || base === 'button-hero' ? f(base) : f('button-disabled');
    b._zoomScale = 1;
    return b;
}
export function ensureButton(a, n) {
    if (a.comp(n, 'cc.Button') >= 0) return;
    a.addComp(n, 'cc.Button', {
        clickEvents: [], _interactable: true, _transition: 0,
        _normalColor: color(255, 255, 255), _hoverColor: color(255, 255, 255), _pressedColor: color(211, 211, 211), _disabledColor: color(124, 124, 124),
        _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null, _duration: 0.1, _zoomScale: 1, _target: ref(n),
    });
}

/** Simple icon child (SIMPLE sprite, CUSTOM size). */
export function icon(a, parent, name, frameName, w, h, pos = [0, 0], at = null) {
    const i = a.addNode(parent, name, { pos, at });
    transform(a, i, w, h);
    sprite(a, i, uiFrame(frameName));
    return i;
}
