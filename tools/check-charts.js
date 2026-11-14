#!/usr/bin/env node
// Chart sanity check for index.html, using the app's own range reader (checkAction).
//
//   node tools/check-charts.js            check, print widths, exit 1 on problems
//   node tools/check-charts.js --hook     quiet on success; on problems print to stderr, exit 2
//                                         (used by the Claude Code hook in .claude/settings.json)
//
// Problems it reports:
//   - a range token that matches no hand (e.g. a typo, or a reversed range the reader can't parse)
//   - a Vs 3-Bet spot the drill can deal that has no chart
//   - a "backwards" cell: a hand is played while a clearly stronger hand of the same kind is folded
//     (same top card with a higher kicker, or same kicker and same-or-smaller gap,
//      or one step wider for J-high-or-better non-connectors like J8s vs Q8s; suited A2-A5 exempt)
//   - the code can't be parsed at all (the chart block or checkAction moved or broke)
const fs = require('fs');
const path = require('path');

const hookMode = process.argv.includes('--hook');
const file = path.join(__dirname, '..', 'index.html');

function fail(lines) {
  const msg = ['Chart check failed (tools/check-charts.js):', ...lines.map(l => '  - ' + l)].join('\n');
  if (hookMode) { process.stderr.write(msg + '\n'); process.exit(2); }
  console.error(msg); process.exit(1);
}

let src;
try { src = fs.readFileSync(file, 'utf8'); } catch (e) { fail([`cannot read ${file}: ${e.message}`]); }

const a = src.indexOf('const RANKS'), b = src.indexOf('const LEVELS');
const m = src.match(/checkAction\(genericHand, range, actionType\) \{.*?return false; \}/);
if (a < 0 || b < 0 || b < a || !m) fail(['could not find the RANGES block or checkAction() in index.html']);

let RANGES, RANKS, o;
try {
  ({ RANGES, RANKS, o } = new Function(src.slice(a, b) + '\nconst o={' + m[0] + '};\nreturn {RANGES, RANKS, o};')());
} catch (e) { fail([`chart code does not run: ${e.message}`]); }

const R = '23456789TJQKA';
const hands = [];
for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
  const r1 = RANKS[12 - i], r2 = RANKS[12 - j];
  if (i === j) hands.push([r1 + r2, 6]); else if (i < j) hands.push([r1 + r2 + 's', 4]); else hands.push([r2 + r1 + 'o', 12]);
}
const has = (list, h) => !!(list && o.checkAction(h, list, 'x'));
const pct = list => (100 * hands.reduce((s, [h, n]) => s + (has(list, h) ? n : 0), 0) / 1326).toFixed(1);
const played = (v, h) => has(v.raise, h) || has(v.call, h);

const problems = [], widths = [];
const walk = (obj, p) => {
  if (obj && (obj.raise || obj.call)) {
    for (const t of [...(obj.raise || []), ...(obj.call || [])])
      if (!hands.some(([h]) => has([t], h))) problems.push(`${p}: "${t}" matches no hand`);
    if (!(obj.raise || []).length && !(obj.call || []).length) return;
    const back = [];
    for (const [h] of hands) {
      if (!played(obj, h)) continue;
      for (const [g] of hands) {
        if (g === h || played(obj, g)) continue;
        if (h.length === 2) { if (g.length === 2 && R.indexOf(g[0]) > R.indexOf(h[0])) { back.push(`${h} played but ${g} folded`); break; } continue; }
        if (g.length !== 3 || g[2] !== h[2]) continue;
        const x = R.indexOf(h[0]), y = R.indexOf(h[1]), u = R.indexOf(g[0]), w = R.indexOf(g[1]);
        const sameTop = u === x && w > y && !(h[0] === 'A' && h[2] === 's' && y <= 3);
        const gapH = x - y, gapG = u - w;
        // Same kicker, higher top card: flag if the folded hand is no less connected, or, for a wide
        // non-connector led by a Jack or better (e.g. J8s played, Q8s folded), at most one step wider.
        const sameKick = w === y && u > x && (gapG <= gapH || (gapH >= 3 && x >= R.indexOf('J') && gapG <= gapH + 1));
        if (sameTop || sameKick) { back.push(`${h} played but ${g} folded`); break; }
      }
    }
    if (back.length) problems.push(`${p}: ${back.join('; ')}`);
    widths.push(`${p.padEnd(30)} raise ${pct(obj.raise).padStart(5)}%` + (obj.call ? `  call ${pct(obj.call).padStart(5)}%` : ''));
    return;
  }
  for (const k of Object.keys(obj)) walk(obj[k], p ? p + '.' + k : k);
};
walk(RANGES, '');

// Every Vs 3-Bet spot the drill can deal: hero UTG..SB, villain any later seat.
const SEATS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
for (let h = 0; h < 5; h++) for (let v = h + 1; v < 6; v++) {
  const key = `${SEATS[h]}_vs_${SEATS[v]}`;
  if (!RANGES.CASH_6MAX.VS_3BET[key]) problems.push(`VS_3BET.${key}: no chart (every hand would be graded Fold)`);
}

if (problems.length) fail(problems);
if (!hookMode) console.log(widths.join('\n') + '\n\nAll charts OK.');
