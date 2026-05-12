#!/usr/bin/env node
// Starts a static server + ngrok tunnel for remote mobile testing.
// Usage: npm run serve  (or: node scripts/serve-remote.js [build-dir])
//        node scripts/serve-remote.js build3/web-mobile

const { spawn } = require('child_process');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');

const PORT     = 8080;
const ROOT     = path.resolve(__dirname, '..');
const buildArg = process.argv[2];

function findBuildDir() {
    if (buildArg) return path.join(ROOT, buildArg);
    // Pick the most recently modified build*/web-mobile with an index.html
    const candidates = fs.readdirSync(ROOT)
        .filter(n => /^build\d*$/.test(n))
        .map(n => path.join(ROOT, n, 'web-mobile'))
        .filter(p => fs.existsSync(path.join(p, 'index.html')));
    if (!candidates.length) { console.error('No build*/web-mobile/index.html found.'); process.exit(1); }
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0];
}

const buildDir = findBuildDir();
console.log(`Serving: ${buildDir}`);

// Inject version into loading screen
(function injectVersion() {
    const pkg     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const version = pkg.version ?? '?';
    const indexPath = path.join(buildDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const patched = html.replace(/__VERSION__/g, version);
    if (patched !== html) fs.writeFileSync(indexPath, patched, 'utf8');
})();

const procs = [];

function start(cmd, args, opts = {}) {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    procs.push(p);
    return p;
}

function cleanup() {
    procs.forEach(p => { try { p.kill(); } catch (_) {} });
}
process.on('SIGINT',  cleanup);
process.on('SIGTERM', cleanup);
process.on('exit',    cleanup);

// Static server
start('python', ['-m', 'http.server', String(PORT)], { cwd: buildDir });

// Small delay so the server is up before ngrok connects
setTimeout(() => {
    start('ngrok', ['http', String(PORT)]);

    // Poll ngrok API until the tunnel URL appears
    let attempts = 0;
    const poll = setInterval(() => {
        const req = http.get('http://localhost:4040/api/tunnels', res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const url = JSON.parse(body).tunnels[0]?.public_url;
                    if (url) {
                        clearInterval(poll);
                        console.log('\n──────────────────────────────────────');
                        console.log(`  ${url}`);
                        console.log('──────────────────────────────────────\n');
                    }
                } catch (_) {}
            });
        });
        req.on('error', () => {});
        if (++attempts > 30) clearInterval(poll);
    }, 500);
}, 1500);
