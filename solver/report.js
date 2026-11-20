#!/usr/bin/env node
// Compares the solver's output with the trainer's charts and builds solver/viewer.html.
//
//   node solver/report.js
//
// Needs solver/out/results.json (node solver/solve.js).
const fs = require('fs');
const path = require('path');
const { N, handName, handCombos, freq } = require('./solve.js');

const root = path.join(__dirname, '..');
const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'results.json'), 'utf8'));

// ---- the trainer's charts, read with the app's own range reader -----------------------------------
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = src.match(/checkAction\(genericHand, range, actionType\) \{.*?return false; \}/);
const { RANGES, o } = new Function(src.slice(src.indexOf('const RANKS'), src.indexOf('const LEVELS')) + '\nconst o={' + m[0] + '};\nreturn {RANGES, o};')();
const chart = (c) => Array.from({ length: N }, (_, i) => {
  const h = handName(i);
  return c.raise && o.checkAction(h, c.raise, 'x') ? 'r' : c.call && o.checkAction(h, c.call, 'x') ? 'c' : 'f';
});

// ---- line the trainer's spots up with the solver's ------------------------------------------------
// rows: per hand [fold, call, raise]; reach: how often each hand gets to this decision
const g6 = results.games['6max'].openers, g9 = results.games['9max'].openers;
const openRows = (r) => r.open.map(x => [1 - x, 0, x]);
const spots = [];
for (const s of ['UTG', 'HJ', 'CO', 'BTN', 'SB'])
  spots.push({ id: `6-max open: ${s}`, trainer: chart(RANGES.CASH_6MAX.RFI[s]), rows: openRows(g6[s]) });
for (const s of ['UTG', 'HJ', 'CO', 'BTN', 'SB'])
  spots.push({ id: `BB vs ${s} open`, trainer: chart(RANGES.CASH_6MAX.DEFENSE[`BB_vs_${s}`]), rows: g6[s].vs.BB.resp });
for (const [key, c] of Object.entries(RANGES.CASH_6MAX.VS_3BET)) {
  const [h, v] = key.split('_vs_');
  // the trainer only deals hands from its own opening range here, so only those are compared
  const dealt = chart(RANGES.CASH_6MAX.RFI[h]).map(x => x === 'r' ? 1 : 0);
  spots.push({ id: `${h} vs ${v} 3-bet`, trainer: chart(c), rows: g6[h].vs[v].oVs3, reach: dealt });
}
for (const s of Object.keys(g9))
  if (RANGES.MTT_9MAX.RFI[s]) spots.push({ id: `9-max open: ${s}`, trainer: chart(RANGES.MTT_9MAX.RFI[s]), rows: openRows(g9[s]) });

const IDX = { f: 0, c: 1, r: 2 }, WORD = { f: 'fold', c: 'call', r: 'raise' };
let totalW = 0, totalAgree = 0, totalClear = 0;
const lines = [];
for (const s of spots) {
  let w = 0, agree = 0; const clear = [], close = [];
  for (let i = 0; i < N; i++) {
    const wt = handCombos(i) * (s.reach ? s.reach[i] : 1); if (!wt) continue;
    const row = s.rows[i], best = row.indexOf(Math.max(...row)), t = IDX[s.trainer[i]];
    w += wt;
    if (best === t) { agree += wt; continue; }
    const txt = `${handName(i)} (trainer ${WORD[s.trainer[i]]}, solver ${'fcr'.split('').map((a, k) => row[k] >= 0.05 ? `${WORD[a]} ${Math.round(100 * row[k])}%` : '').filter(Boolean).join(' / ')})`;
    // "clear" = the solver plays the trainer's answer less than a quarter of the time
    if (row[t] < 0.25) { clear.push(txt); totalClear += wt; } else close.push(txt);
  }
  totalW += w; totalAgree += agree;
  s.agree = agree / w; s.clear = clear; s.close = close;
  lines.push(`${s.id.padEnd(22)} agree ${(100 * s.agree).toFixed(0).padStart(3)}%   clear differences ${String(clear.length).padStart(2)}, close calls ${String(close.length).padStart(2)}`);
}
const header = `Trainer charts vs solver: ${(100 * totalAgree / totalW).toFixed(1)}% of dealt hands get the same answer; ${(100 * totalClear / totalW).toFixed(1)}% differ clearly.`;
const detail = spots.filter(s => s.clear.length).map(s => `\n${s.id}\n  ` + s.clear.join('\n  ')).join('\n');
const text = [header, '', ...lines, '', 'Clear differences (solver plays the trainer\'s answer under 25% of the time):', detail].join('\n');
fs.writeFileSync(path.join(__dirname, 'out', 'compare.txt'), text + '\n');
console.log(text);

// ---- viewer ------------------------------------------------------------------------------------
const r2 = (x) => Array.isArray(x) ? x.map(r2) : typeof x === 'number' ? Math.round(x * 100) / 100 : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, r2(v)])) : x;
const data = { config: results.config, games: r2(Object.fromEntries(Object.entries(results.games).map(([g, v]) => [g, { seats: v.seats, openers: Object.fromEntries(Object.entries(v.openers).map(([s, r]) => [s, { open: r.open, vs: r.vs }])) }]))), trainer: Object.fromEntries(spots.map(s => [s.id, s.trainer.join('')])) };
const html = fs.readFileSync(path.join(__dirname, 'viewer.template.html'), 'utf8').replace('/*DATA*/null', () => JSON.stringify(data));
fs.writeFileSync(path.join(__dirname, 'viewer.html'), html);
console.log(`\nWrote solver/viewer.html (${(html.length / 1024).toFixed(0)} KB) and solver/out/compare.txt`);
