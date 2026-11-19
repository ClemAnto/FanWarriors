#!/usr/bin/env node
// NEXT preview (2026-11-19): out of every trajectory of the launched warrior and out of the dragging
// thumb's way: low on the left wall, next to the bottom of the track (GameManager mirrors it onto the
// right wall when Settings › Left-handed is on). Idempotent.
import { CocosAsset, LEFT, BOT } from './cocos-edit.mjs';

const a = new CocosAsset('assets/scenes/Game.scene');
const n = a.node('Track/NextPreview');
const w = a.c(n, 'cc.Widget');
w._alignFlags = LEFT | BOT;
w._left = 0.06; w._isAbsLeft = false;      // 6 % of the track width from its left edge: over the left wall
w._bottom = 165; w._isAbsBottom = true;    // a little above the bottom of the screen
a.save();