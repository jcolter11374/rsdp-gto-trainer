#!/usr/bin/env node
// Builds solver/data/equity.json: all-in preflop equity of every starting-hand class against every
// other (169 x 169), plus the number of non-conflicting combo pairs for each matchup.
//
//   node solver/equity.js [boards=200000] [threads=4]
//
// Method: Monte Carlo over boards. For each random 5-card board, every one of the 1,081 possible
// hole-card combos is ranked once; then every non-conflicting pair of combos is scored by walking
// the combos in rank order with running per-class and per-card counts (so a board costs ~1081 x 169
// steps instead of 1081 x 1081). Each board therefore samples every matchup at once.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const N = 169;

// card = rank * 4 + suit, rank 0 (deuce) .. 12 (ace).
// class index = row * 13 + col on the usual grid (A top-left): pairs on the diagonal,
// suited above it (row < col), offsuit below.
function classOf(c1, c2) {
  const r1 = c1 >> 2, r2 = c2 >> 2;
  const hi = r1 > r2 ? r1 : r2, lo = r1 > r2 ? r2 : r1;
  const row = 12 - hi, col = 12 - lo;
  if (hi === lo) return row * 13 + row;
  return (c1 & 3) === (c2 & 3) ? row * 13 + col : col * 13 + row;
}

// ---- 7-card evaluator -------------------------------------------------------------------------
const STRAIGHT = new Int8Array(8192).fill(-1); // rank mask -> high card of best straight, or -1
const TOP5 = new Int32Array(8192);             // rank mask -> its top five ranks packed 4 bits each
for (let m = 0; m < 8192; m++) {
  for (let hi = 12; hi >= 4; hi--) { if (((m >> (hi - 4)) & 31) === 31) { STRAIGHT[m] = hi; break; } }
  if (STRAIGHT[m] < 0 && (m & 0x100f) === 0x100f) STRAIGHT[m] = 3; // wheel A-5
  let v = 0, n = 0;
  for (let r = 12; r >= 0 && n < 5; r--) if (m & (1 << r)) { v = (v << 4) | r; n++; }
  TOP5[m] = v << (4 * (5 - n));
}
const cnt = new Int8Array(13), suitCnt = new Int8Array(4), suitMask = new Int32Array(4);
function eval7(cards) {
  cnt.fill(0); suitCnt.fill(0); suitMask.fill(0);
  let mask = 0;
  for (let k = 0; k < 7; k++) {
    const c = cards[k], r = c >> 2, s = c & 3;
    cnt[r]++; suitCnt[s]++; suitMask[s] |= 1 << r; mask |= 1 << r;
  }
  for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) {
    const sf = STRAIGHT[suitMask[s]];
    if (sf >= 0) return (8 << 20) | sf;
    return (5 << 20) | TOP5[suitMask[s]];
  }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = cnt[r];
    if (n === 4) quad = r;
    else if (n === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (quad >= 0) { const k = TOP5[mask & ~(1 << quad)] >> 16; return (7 << 20) | (quad << 4) | k; }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 4) | (t2 > p1 ? t2 : p1);
  const st = STRAIGHT[mask];
  if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 8) | (TOP5[mask & ~(1 << t1)] >> 12);
  if (p1 >= 0 && p2 >= 0) return (2 << 20) | (p1 << 8) | (p2 << 4) | (TOP5[mask & ~(1 << p1) & ~(1 << p2)] >> 16);
  if (p1 >= 0) return (1 << 20) | (p1 << 12) | (TOP5[mask & ~(1 << p1)] >> 8);
  return TOP5[mask];
}

// ---- worker: accumulate wins and ties per class pair ---------------------------------------------
function runBoards(boards, seed) {
  let s = seed >>> 0 || 1;
  const rnd = (n) => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s % n; };
  const win = new Float64Array(N * N), tie = new Float64Array(N * N);
  const deck = new Int32Array(52), hand = new Int32Array(7);
  const H = 1081, h1 = new Int32Array(H), h2 = new Int32Array(H), hc = new Int32Array(H);
  const key = new Float64Array(H);
  const seenClass = new Float64Array(N), seenCard = new Float64Array(52 * N);
  const gClass = new Float64Array(N), gCard = new Float64Array(52 * N);
  for (let b = 0; b < boards; b++) {
    for (let i = 0; i < 52; i++) deck[i] = i;
    for (let i = 0; i < 5; i++) { const j = i + rnd(52 - i); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; hand[i] = deck[i]; }
    let n = 0;
    for (let x = 5; x < 52; x++) for (let y = x + 1; y < 52; y++) {
      hand[5] = deck[x]; hand[6] = deck[y];
      h1[n] = deck[x]; h2[n] = deck[y]; hc[n] = classOf(deck[x], deck[y]);
      key[n] = eval7(hand) * 2048 + n; n++;
    }
    key.sort();
    seenClass.fill(0); seenCard.fill(0);
    let g0 = 0;
    while (g0 < H) {
      const val = Math.floor(key[g0] / 2048);
      let g1 = g0 + 1;
      while (g1 < H && Math.floor(key[g1] / 2048) === val) g1++;
      // hands g0..g1-1 tie with each other and beat everything seen so far (ascending order)
      gClass.fill(0);
      for (let g = g0; g < g1; g++) {
        const idx = key[g] % 2048, a = hc[idx], o1 = h1[idx] * N, o2 = h2[idx] * N, base = a * N;
        for (let c = 0; c < N; c++) win[base + c] += seenClass[c] - seenCard[o1 + c] - seenCard[o2 + c];
        gClass[a]++; gCard[o1 + a]++; gCard[o2 + a]++;
      }
      if (g1 - g0 > 1) {
        for (let g = g0; g < g1; g++) {
          const idx = key[g] % 2048, a = hc[idx], o1 = h1[idx] * N, o2 = h2[idx] * N, base = a * N;
          for (let c = 0; c < N; c++) tie[base + c] += gClass[c] - gCard[o1 + c] - gCard[o2 + c];
          tie[base + a] += 1; // the hand itself was subtracted twice and counted once
        }
      }
      for (let g = g0; g < g1; g++) {
        const idx = key[g] % 2048, a = hc[idx], o1 = h1[idx] * N, o2 = h2[idx] * N;
        seenClass[a]++; seenCard[o1 + a]++; seenCard[o2 + a]++;
        gCard[o1 + a] = 0; gCard[o2 + a] = 0;
      }
      g0 = g1;
    }
  }
  return { win, tie };
}

if (!isMainThread) {
  const { win, tie } = runBoards(workerData.boards, workerData.seed);
  parentPort.postMessage({ win, tie });
} else if (require.main === module) {
  const boards = parseInt(process.argv[2] || '200000', 10), threads = parseInt(process.argv[3] || '4', 10);
  const per = Math.ceil(boards / threads);
  const t0 = Date.now();
  const jobs = [];
  for (let t = 0; t < threads; t++) jobs.push(new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { boards: per, seed: 0x9e3779b9 ^ (t * 7919 + 12345) } });
    w.on('message', res); w.on('error', rej);
  }));
  Promise.all(jobs).then(parts => {
    const win = new Float64Array(N * N), tie = new Float64Array(N * N);
    for (const p of parts) for (let i = 0; i < N * N; i++) { win[i] += p.win[i]; tie[i] += p.tie[i]; }
    // exact number of non-conflicting combo pairs for each class matchup
    const combos = new Float64Array(N * N);
    const all = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) all.push([a, b, classOf(a, b)]);
    for (const [a, b, ca] of all) for (const [c, d, cb] of all) if (a !== c && a !== d && b !== c && b !== d) combos[ca * N + cb]++;
    const eq = [];
    for (let a = 0; a < N; a++) {
      const row = [];
      for (let b = 0; b < N; b++) {
        if (a === b) { row.push(0.5); continue; }
        const w = win[a * N + b], l = win[b * N + a], t = tie[a * N + b];
        row.push(+((w + t / 2) / (w + l + t)).toFixed(5));
      }
      eq.push(row);
    }
    const out = path.join(__dirname, 'data');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'equity.json'), JSON.stringify({ boards: per * threads, eq, combos: Array.from(combos) }));
    const R = 'AKQJT98765432';
    const name = (i) => { const r = Math.floor(i / 13), c = i % 13; return r === c ? R[r] + R[c] : r < c ? R[r] + R[c] + 's' : R[c] + R[r] + 'o'; };
    const idx = (s) => { for (let i = 0; i < N; i++) if (name(i) === s) return i; };
    const show = (x, y) => `${x} vs ${y}: ${(100 * eq[idx(x)][idx(y)]).toFixed(2)}%`;
    console.log(`${per * threads} boards in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log([show('AA', 'KK'), show('AKs', 'QQ'), show('22', 'AKo'), show('AKo', '72o'), show('JTs', 'AA'), show('AKs', 'AKo')].join('\n'));
  });
}

module.exports = { classOf, eval7 };
