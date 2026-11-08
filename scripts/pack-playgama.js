#!/usr/bin/env node
// Build + zip a Playgama submission package (see PLAYGAMA.md / PLAYGAMA_PLAYBOOK.md).
//
//   1. flips PORTAL to 'playgama' in PortalConfig.ts (temporarily),
//   2. runs the same headless web-mobile build as scripts/build.js,
//   3. ALWAYS restores PortalConfig.ts (even if the build fails),
//   4. patches build/web-mobile/index.html:
//        - Playgama Bridge <script> as the FIRST tag in <head> (required: not async, not injected by code)
//        - boot shim: bridge.initialize() + preload of the Bridge save blob BEFORE the engine is imported
//          (Playgama rejects games that start loading before the Bridge; SafeStorage reads stay sync)
//        - version/cache-bust (patch-html). No rotate overlay: both orientations are supported.
//   5. copies playgama-bridge-config.json next to index.html,
//   6. zips build/web-mobile -> dist/funwarriors-playgama.zip with PowerShell 7.
//
// The standalone GitHub Pages flow is untouched: PORTAL stays 'none' in git and the build template
// is not modified. NB: this overwrites build/web-mobile → run `npm run build` before `npm run deploy`.

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { patchHtml } = require('./patch-html');

const CC_EXE   = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe';
const PROJECT  = path.resolve(__dirname, '..');
const CONFIG   = path.join(PROJECT, 'assets', 'scripts', 'config', 'PortalConfig.ts');
const BUILD    = path.join(PROJECT, 'build', 'web-mobile');
const DIST     = path.join(PROJECT, 'dist');
// Versioned name: the Playgama portal keeps builds by file name — re-uploading the same name doesn't replace it.
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'), 'utf8')).version ?? '0';
const ZIP      = path.join(DIST, `funwarriors-playgama-v${PKG_VERSION}.zip`);
const BRIDGE_CONFIG = path.join(__dirname, 'playgama', 'playgama-bridge-config.json');

const BRIDGE_URL = 'https://bridge.playgama.com/v2/stable/playgama-bridge.js';
/** Must match PLAYGAMA_SAVE_KEY in PortalConfig.ts. */
const SAVE_KEY   = 'fw_save';

const FLAG_RE = /export const PORTAL: PortalKind = '[^']*';/;

function setPortal(value) {
    const src = fs.readFileSync(CONFIG, 'utf8');
    if (!FLAG_RE.test(src)) throw new Error('PORTAL flag line not found in PortalConfig.ts');
    fs.writeFileSync(CONFIG, src.replace(FLAG_RE, `export const PORTAL: PortalKind = '${value}';`));
}

// Boot shim (ES5, runs synchronously right after the Bridge script). Exposes:
//   window.__fwBridgeBoot  — Promise: Bridge initialised + save blob preloaded (never rejects)
//   window.__fwBridgeReady — true once bridge.initialize() resolved
//   window.__fwStore       — {key: value} map consumed by SafeStorage (only if storage was read)
const BOOT_SHIM = `
<script>
window.__fwBridgeBoot = (function () {
  var b = window.bridge;
  if (!b) { console.warn('[Portal] Playgama Bridge script missing - booting without it'); return Promise.resolve(); }
  try { b.engine = 'cocos'; } catch (e) {}
  function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout ' + ms + 'ms')); }, ms); }); }
  return Promise.race([b.initialize(), timeout(10000)])
    .then(function () {
      window.__fwBridgeReady = true;
      return Promise.race([b.storage.get(['${SAVE_KEY}']), timeout(5000)]);
    })
    .then(function (values) {
      var raw = values && values[0], store = {};
      if (raw) {
        try { store = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { store = {}; }
        if (!store || typeof store !== 'object') store = {};
      }
      window.__fwStore = store;
    })
    .catch(function (e) { console.warn('[Portal] Playgama Bridge boot failed (continuing):', e); });
})();
</script>`;

/** Bridge script first in <head>, boot shim right after it. Idempotent. */
function injectBridge(html) {
    if (html.includes(BRIDGE_URL)) return html;
    const tag = `<script src="${BRIDGE_URL}"></script>${BOOT_SHIM}`;
    // Right after <meta charset> (keeps the charset declaration first), before any other script.
    const charset = /<meta charset="[^"]*">/i;
    if (charset.test(html)) return html.replace(charset, m => `${m}\n  ${tag}`);
    if (!/<head>/i.test(html)) throw new Error('<head> not found in index.html');
    return html.replace(/<head>/i, `<head>\n  ${tag}`);
}

/** Gate the engine import on the Bridge boot promise. */
function gateEngineImport(html) {
    const re = /System\.import\(([^)]+)\)\.catch\(/;
    if (!re.test(html)) throw new Error("System.import('./index.js') not found in index.html");
    return html.replace(re,
        (_, arg) => `(window.__fwBridgeBoot || Promise.resolve()).then(function () { return System.import(${arg}); }).catch(`);
}

const original = fs.readFileSync(CONFIG, 'utf8');

try {
    console.log("Setting PORTAL = 'playgama'...");
    setPortal('playgama');

    console.log('Building web-mobile (headless)...');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(CC_EXE, [
        '--project', PROJECT,
        '--build', 'outputName=web-mobile;platform=web-mobile;debug=false;md5Cache=true;nativeCodeBundleMode=wasm;useSplashScreen=false',
    ], { env, stdio: 'inherit' });

    const code = result.status ?? -1;
    if (code !== 0 && code !== 36) throw new Error(`Build FAILED (exit ${code})`);
    console.log(`Build OK (exit ${code})`);
} finally {
    // Restore the committed flag no matter what, so git never carries 'playgama'.
    fs.writeFileSync(CONFIG, original);
    console.log('PortalConfig.ts restored.');
}

const INDEX = path.join(BUILD, 'index.html');
if (!fs.existsSync(INDEX)) {
    console.error(`Build output not found at ${INDEX}`);
    process.exit(1);
}

const pkg     = JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));
const version = pkg.version ?? '?';
let html = fs.readFileSync(INDEX, 'utf8');
html = patchHtml(html, version);
html = gateEngineImport(html);
html = injectBridge(html);
// NO rotate overlay: the game supports BOTH orientations (landscape = centred track + full-bleed
// background) and is declared portrait+landscape on Playgama. Playgama 1.4 only requires a rotate
// placeholder for an UNSUPPORTED orientation.
fs.writeFileSync(INDEX, html, 'utf8');
console.log(`index.html patched: v${version}, Bridge first in <head>, engine import gated`);

fs.copyFileSync(BRIDGE_CONFIG, path.join(BUILD, 'playgama-bridge-config.json'));
console.log('playgama-bridge-config.json copied.');

// Sanity: Playgama 1.3.2 — Latin-only file/folder names.
const nonLatin = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!/^[\x20-\x7E]+$/.test(e.name)) nonLatin.push(path.relative(BUILD, path.join(dir, e.name)));
        if (e.isDirectory()) walk(path.join(dir, e.name));
    }
})(BUILD);
if (nonLatin.length) console.warn('WARNING: non-Latin file names (Playgama 1.3.2):', nonLatin);

fs.mkdirSync(DIST, { recursive: true });
if (fs.existsSync(ZIP)) fs.rmSync(ZIP);

console.log('Zipping build output...');
// pwsh 7, NOT powershell 5.1: 5.1's Compress-Archive writes backslash entry paths (invalid ZIP for
// Linux servers — same issue found with GameDistribution).
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const zipExe = fs.existsSync(PWSH) ? PWSH : 'powershell';
if (zipExe === 'powershell') console.warn('WARNING: pwsh 7 not found — falling back to powershell 5.1 (backslash ZIP paths).');
const zipResult = spawnSync(zipExe, [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${BUILD}\\*' -DestinationPath '${ZIP}' -Force`,
], { stdio: 'inherit' });
if ((zipResult.status ?? -1) !== 0) {
    console.error('Zip FAILED');
    process.exit(1);
}

const mb = (fs.statSync(ZIP).size / 1024 / 1024).toFixed(1);
console.log(`\nPlaygama package ready: ${ZIP} (${mb} MB)`);
console.log('Upload it at https://developer.playgama.com → Add Game (engine: cocos-creator).');
