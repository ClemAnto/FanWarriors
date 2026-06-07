#!/usr/bin/env node
'use strict';

// Seed the Firestore leaderboard with default entries.
//
// Reads apiKey / projectId / collection straight from
// assets/scripts/config/LeaderboardConfig.ts so it never drifts out of sync.
// Writes go through the Firestore REST :commit endpoint with a REQUEST_TIME
// transform on `createdAt`, which is exactly what the security rules require
// (createdAt == request.time). Each default uses a deterministic document id,
// so a second run is rejected as an "update" (rules forbid it) instead of
// silently creating duplicates.
//
// Usage:
//   node scripts/seed-leaderboard.js          # seed defaults (refuses if board not empty)
//   node scripts/seed-leaderboard.js --force   # seed even if entries already exist
//   node scripts/seed-leaderboard.js --list     # just print the current top, write nothing

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ---- Default entries to seed -------------------------------------------------
// Name must match the rules' shape: exactly NAME_LEN uppercase letters ([A-Z]).
// Scores: 100000 down to 10000, step 10000.
const DEFAULT_ENTRIES = Array.from({ length: 10 }, (_, i) => ({
    name: 'FAN',
    score: 100000 - i * 10000,
}));

// ---- Pull config from LeaderboardConfig.ts ----------------------------------
const CONFIG_PATH = path.resolve(__dirname, '..', 'assets', 'scripts', 'config', 'LeaderboardConfig.ts');

function readConfig() {
    const src = fs.readFileSync(CONFIG_PATH, 'utf8');
    const pick = (re, label) => {
        const m = src.match(re);
        if (!m) throw new Error(`Could not find ${label} in ${CONFIG_PATH}`);
        return m[1];
    };
    return {
        apiKey:     pick(/apiKey:\s*'([^']+)'/, 'apiKey'),
        projectId:  pick(/projectId:\s*'([^']+)'/, 'projectId'),
        collection: pick(/COLLECTION\s*=\s*'([^']+)'/, 'COLLECTION'),
    };
}

// ---- Minimal HTTPS JSON helper ----------------------------------------------
function request(method, urlPath, bodyObj) {
    return new Promise((resolve, reject) => {
        const body = bodyObj ? JSON.stringify(bodyObj) : null;
        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: urlPath,
            method,
            headers: body
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
                : {},
        }, res => {
            let data = '';
            res.on('data', c => (data += c));
            res.on('end', () => {
                let json = {};
                try { json = data ? JSON.parse(data) : {}; } catch { /* leave {} */ }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function listTop(cfg, limit) {
    const base = `projects/${cfg.projectId}/databases/(default)/documents`;
    const query = {
        structuredQuery: {
            from: [{ collectionId: cfg.collection }],
            orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
            limit,
        },
    };
    const { status, json } = await request('POST', `/v1/${base}:runQuery?key=${cfg.apiKey}`, query);
    if (status !== 200) throw new Error(`runQuery failed (HTTP ${status}): ${JSON.stringify(json)}`);
    return (Array.isArray(json) ? json : [])
        .filter(r => r.document)
        .map(r => ({
            name: r.document.fields.name?.stringValue ?? '???',
            score: Number(r.document.fields.score?.integerValue ?? 0),
        }));
}

async function seed(cfg, entries) {
    const base = `projects/${cfg.projectId}/databases/(default)/documents`;
    const writes = entries.map((e, i) => ({
        update: {
            name: `${base}/${cfg.collection}/default-${String(i + 1).padStart(2, '0')}`,
            fields: { name: { stringValue: e.name }, score: { integerValue: String(e.score) } },
        },
        // REQUEST_TIME satisfies the rule `createdAt == request.time`.
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    }));
    const { status, json } = await request('POST', `/v1/${base}:commit?key=${cfg.apiKey}`, { writes });
    if (status !== 200) throw new Error(`commit failed (HTTP ${status}): ${JSON.stringify(json)}`);
    return json.writeResults?.length ?? 0;
}

(async function main() {
    const args  = process.argv.slice(2);
    const force = args.includes('--force');
    const list  = args.includes('--list');

    const cfg = readConfig();
    console.log(`Project: ${cfg.projectId}  Collection: ${cfg.collection}`);

    const current = await listTop(cfg, 10);
    console.log(`Current entries: ${current.length}`);
    current.forEach((e, i) => console.log(`  ${String(i + 1).padStart(2)}. ${e.name}  ${e.score}`));

    if (list) return;

    if (current.length > 0 && !force) {
        console.log('\nBoard is not empty — nothing written. Re-run with --force to seed anyway.');
        return;
    }

    console.log(`\nSeeding ${DEFAULT_ENTRIES.length} default entries...`);
    const n = await seed(cfg, DEFAULT_ENTRIES);
    console.log(`Wrote ${n} entries.`);
    console.log('NOTE: rules forbid update/delete, so default-NN ids are write-once. ' +
                'To re-seed, delete them in the Firebase console first.');
})().catch(err => {
    console.error('seed-leaderboard failed:', err.message);
    process.exit(1);
});
