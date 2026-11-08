'use strict';

// "Rotate your device to portrait" overlay for portal builds (GameDistribution §3.4, Playgama 1.4).
// A real screen.orientation.lock() is unreliable inside portal iframes (needs fullscreen, often
// blocked), so we inject a CSS-gated overlay — the standard web approach. It shows ONLY on touch
// devices in landscape:
//   (hover: none) and (pointer: coarse)  → phones/tablets, never desktop (hover:hover/pointer:fine)
//   (orientation: landscape)             → iframe wider than tall = device held sideways
// Self-contained (no external assets), so it never trips "no external resources" rules.
const ROTATE_STYLE = `
<style id="fw-rotate-style">
#fw-rotate{display:none;}
@media (orientation:landscape) and (hover:none) and (pointer:coarse){
  #fw-rotate{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:24px;background:#0e1116;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px;}
  #fw-rotate .fw-phone{width:64px;height:104px;border:5px solid #fff;border-radius:12px;
    animation:fw-rot 1.6s ease-in-out infinite;}
  #fw-rotate p{margin:0;font-size:20px;font-weight:600;letter-spacing:.3px;max-width:320px;line-height:1.4;}
  @keyframes fw-rot{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
}
</style>`;
const ROTATE_NODE = `
<div id="fw-rotate"><div class="fw-phone"></div><p>Please rotate your device to portrait</p></div>`;

/** Inject the rotate-to-portrait overlay into a build's index.html (idempotent). */
function injectRotateOverlay(html) {
    if (html.includes('id="fw-rotate"')) return html;
    if (html.includes('</head>')) html = html.replace('</head>', `${ROTATE_STYLE}\n</head>`);
    if (html.includes('</body>')) html = html.replace('</body>', `${ROTATE_NODE}\n</body>`);
    return html;
}

module.exports = { injectRotateOverlay };
