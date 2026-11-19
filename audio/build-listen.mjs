// Builds audio/listen.html and library/<id>/SOURCES.txt for the token sound candidates.
// Run from anywhere: node audio/build-listen.mjs  (reads audio/freesound/sources.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const pk = JSON.parse(fs.readFileSync(path.join(DIR, 'freesound', 'sources.json'), 'utf8'));
const kenneyPack = { maximize_004: 'Interface Sounds', minimize_004: 'Interface Sounds', phaserDown3: 'Digital Audio', powerUp10: 'Digital Audio', powerUp1: 'Digital Audio', handleCoins2: 'RPG Audio', jingles_NES02: 'Music Jingles', jingles_STEEL00: 'Music Jingles', zap1: 'Digital Audio', zapTwoTone: 'Digital Audio', phaserUp3: 'Digital Audio', powerUp4: 'Digital Audio', powerUp2: 'Digital Audio', highUp: 'Digital Audio', phaserDown1: 'Digital Audio', phaserDown2: 'Digital Audio', phaseJump1: 'Digital Audio', zapThreeToneUp: 'Digital Audio', lowDown: 'Digital Audio' };
// Powerup sounds (2026-11-19). The token sounds (token_*, power_ready) were picked on 2026-11-18: their
// library folders and SOURCES.txt stay as they are.
const desc = {
    thunder_strike: 'THUNDER RAIN: un fulmine dal cielo colpisce un warrior isolato (tuono secco, breve; ne cadono fino a 8 di fila)',
    lightning_zap: 'WILD RIVER: il contagio salta da un warrior al successivo con un fulmine (scarica elettrica corta, suona ogni 0,15 s)',
    aura_zap: 'AURA: un warrior respinto si dissolve in una scintilla (sparkle magico)',
    energy_absorb: 'Scintilla / sfera di energia che arriva al warrior lanciato (Aura, Brotherhood, Thunder Rain): chime di assorbimento',
    implode: 'BROTHERHOOD / WILD RIVER: un warrior implode (risucchio magico breve)',
    psycho_force: 'PSYCHO FORCE: la fascia psichica parte e unisce warrior di specie diverse (suono "mentale")',
    shrink_embers: 'Cambio round: tutti i warrior si rimpiccioliscono bruciando scintille (sfrigolio / brillio discendente)',
};
const data = {};
for (const id of Object.keys(desc)) {
    const rows = [], src = [];
    for (const f of fs.readdirSync(path.join(DIR, 'library', id)).filter(f => f.endsWith('.mp3')).sort()) {
        let meta, line;
        if (f.startsWith('fs-')) {
            const n = f.split('-')[1], p = pk[n];
            meta = `Freesound #${n} · ${p.user} · CC0 · "${p.title}"`;
            line = `${f} | CC0 | ${p.user} (Freesound #${n}, "${p.title}") | ${p.url}`;
        } else if (f.startsWith('kenney-')) {
            const n = f.slice(7, -4);
            meta = `Kenney ${kenneyPack[n]} · ${n} · CC0`;
            line = `${f} | CC0 | Kenney, pack "${kenneyPack[n]}" (${n}.ogg) | https://kenney.nl/assets`;
        } else {
            meta = 'FunKoolkan (progetto dell\'utente) · spawn.mp3, già nel gioco come "spawn"';
            line = `${f} | progetto dell'utente | FunKoolkan spawn.mp3 (D:/Projects/ShowroomStar/audio/funkoolkan/spawn.mp3) | -`;
        }
        rows.push({ file: `library/${id}/${f}`, name: f, meta });
        src.push(line);
    }
    fs.writeFileSync(path.join(DIR, 'library', id, 'SOURCES.txt'),
        `# ${id} — ${desc[id]}\n# file | licenza | autore / pacchetto | url\n# Tagliati in locale (ffmpeg): silenzio iniziale/finale rimosso, mono 128 kbps. Originali Freesound in audio/freesound/<id>/.\n${src.join('\n')}\n`);
    data[id] = { desc: desc[id], cands: rows };
}
const refs = ['merge_1', 'explosion_1', 'token_collect', 'power_ready', 'round_up'].map(n => ({ file: `../assets/resources/audio/sfx/${n}.mp3`, name: n }));

const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FunWarriors · Suoni powerup</title>
<style>
:root{--bg:#f6f1e7;--card:#fffaf0;--ink:#3b2f2a;--muted:#8a7b70;--accent:#c8643b;--ok:#4f8a3c;--pick:#e6f1dc;--line:#e3d8c6}
*{box-sizing:border-box}body{background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,sans-serif;padding:16px;max-width:1100px;margin:auto}
h1{font-size:20px;margin:0 0 4px}.hint{color:var(--muted);font-size:13px;margin:0 0 14px}
button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;color:inherit}
button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px}
.card h2{font:600 18px ui-monospace,monospace;margin:0;display:flex;gap:10px;align-items:center}
.status{font:600 12px system-ui;padding:2px 8px;border-radius:10px;background:#eadfcd;color:var(--muted)}.status.ok{background:var(--ok);color:#fff}
.card>p{margin:4px 0 12px;color:var(--muted)}
.grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.cand{display:grid;grid-template-columns:auto 1fr auto;column-gap:10px;align-items:center;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:#fff;min-width:0}
.cand>div{min-width:0}.cand.chosen{background:var(--pick);border-color:#9cc485}.cand.playing{border-color:var(--accent)}
.play{width:36px;height:36px;padding:0;border-radius:50%}.name{font:13px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cand.chosen .choose{background:var(--ok);color:#fff;border-color:var(--ok)}
#out{width:100%;font:12px ui-monospace,monospace;margin-top:8px}
</style></head><body>
<h1>FunWarriors · Suoni dei powerup</h1>
<p class="hint">Ascolta con ▶, scegli un candidato per ogni suono, poi <b>Copia scelte</b> e incolla il JSON in chat. In fondo, per confrontare stile e volume, alcuni suoni già nel gioco. I candidati sono già tagliati e normalizzati (−18 LUFS). Nel gioco ora c'è una scelta provvisoria per ogni suono (vedi <code>assets/resources/audio/sfx/_README.txt</code>): quella che scegli qui la sostituisce.</p>
<div id="ids"></div>
<div class="card"><h2>Riferimento: suoni già nel gioco</h2><p>Per confrontare stile e volume.</p><div class="grid" id="refs"></div></div>
<div class="card"><button class="primary" id="copy">Copia scelte</button> <span id="msg" class="hint"></span><textarea id="out" rows="6" readonly></textarea></div>
<script>
const DATA = ${JSON.stringify(data, null, 1)};
const REFS = ${JSON.stringify(refs)};
const KEY = 'fw-power-sfx-picks';
let picks = {};
try { picks = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { picks = {}; }
const audio = new Audio();
function play(file, el) {
  audio.pause();
  document.querySelectorAll('.playing').forEach(e => e.classList.remove('playing'));
  audio.src = file; audio.currentTime = 0; audio.play();
  if (el) { el.classList.add('playing'); audio.onended = () => el.classList.remove('playing'); }
}
function cand(c, id) {
  const d = document.createElement('div'); d.className = 'cand';
  d.innerHTML = '<button class="play">▶</button><div><div class="name"></div><div class="meta"></div></div>' + (id ? '<button class="choose">Scegli</button>' : '');
  d.querySelector('.name').textContent = c.name;
  d.querySelector('.meta').textContent = c.meta || c.file;
  d.querySelector('.play').onclick = () => play(c.file, d);
  if (id) {
    if (picks[id] === c.file) d.classList.add('chosen');
    d.querySelector('.choose').onclick = () => {
      if (picks[id] === c.file) delete picks[id]; else picks[id] = c.file;
      try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) { /* private mode */ }
      render();
    };
  }
  return d;
}
function render() {
  const root = document.getElementById('ids'); root.innerHTML = '';
  for (const [id, v] of Object.entries(DATA)) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = '<h2></h2><p></p><div class="grid"></div>';
    c.querySelector('h2').innerHTML = id + ' <span class="status' + (picks[id] ? ' ok' : '') + '">' + (picks[id] ? 'scelto' : 'da scegliere') + '</span>';
    c.querySelector('p').textContent = v.desc;
    const g = c.querySelector('.grid'); v.cands.forEach(x => g.appendChild(cand(x, id)));
    root.appendChild(c);
  }
  document.getElementById('out').value = JSON.stringify(picks, null, 1);
}
render();
const rg = document.getElementById('refs'); REFS.forEach(r => rg.appendChild(cand(r, null)));
document.getElementById('copy').onclick = async () => {
  const t = JSON.stringify(picks, null, 1); const out = document.getElementById('out'); out.value = t;
  try { await navigator.clipboard.writeText(t); document.getElementById('msg').textContent = 'Copiato'; }
  catch (e) { out.select(); document.execCommand('copy'); document.getElementById('msg').textContent = 'Copiato dal riquadro'; }
};
</script></body></html>`;
fs.writeFileSync(path.join(DIR, 'listen.html'), html);
console.log('listen.html written');
