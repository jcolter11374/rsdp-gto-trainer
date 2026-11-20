#!/usr/bin/env node
// Preflop solver for no-limit hold'em (6-max and 9-max, 100bb).
//
//   node solver/solve.js [--iters 8000] [--only 6max|9max]
//
// Finds an equilibrium of a preflop betting game with CFR+ (counterfactual regret minimisation),
// working on the 169 starting-hand classes with pairwise card removal. See solver/README.md for the
// model and its assumptions. Needs solver/data/equity.json (node solver/equity.js).
const fs = require('fs');
const path = require('path');

const N = 169, RANKS = 'AKQJT98765432';
const handName = (i) => { const r = Math.floor(i / 13), c = i % 13; return r === c ? RANKS[r] + RANKS[c] : r < c ? RANKS[r] + RANKS[c] + 's' : RANKS[c] + RANKS[r] + 'o'; };
const handCombos = (i) => { const r = Math.floor(i / 13), c = i % 13; return r === c ? 6 : r < c ? 4 : 12; };

const DEFAULTS = {
  stack: 100,          // effective stack, bb
  open: 2.5,           // open-raise size (total), every seat but the SB
  openSB: 3,           // SB open size (total)
  threeIP: 3,          // 3-bet = this x the open when the 3-bettor has position
  threeOOP: 4,         // ... when the 3-bettor is out of position
  fourIP: 2.3,         // 4-bet = this x the 3-bet when the opener has position
  fourOOP: 2.7,        // ... when the opener is out of position
  callers: 'all',      // seats allowed to call an open ('all' or a list such as ['BB'])
  squeeze: 0.06,       // chance that each player still to act behind a cold-caller raises and takes the caller's money
  deadShare: 0.5,      // part of the blinds a cold-caller and the opener actually fight for (the blinds still defend)
  rakePct: 0, rakeCap: 0, // rake taken from pots that see a flop (none by default)
  wake: 0.035,         // chance that each player still to act behind a 3-bettor wakes up with a hand that ends the pot for both
  wakeCost: 0.7,       // share of the 3-bet the 3-bettor loses when that happens
  // Postflop model: a hand's share of the pot = its all-in equity + an adjustment for position,
  // initiative and playability, scaled down as stacks get shallower relative to the pot.
  // Per pot type [single-raised, 3-bet, 4-bet]:
  lev: [0.15, 0.4, 0.2],   // leverage: the better hand wins more than its raw equity share
  pos: [0.05, 0.07, 0.03], // share gained by the player in position
  init: 0.012,             // share gained by the last aggressor
  // Playability, as pot share relative to an average hand: [suited, suited straight potential,
  // suited ace, offsuit, offsuit straight potential, pair]
  play: [0.06, 0.06, 0.01, -0.06, 0.05, 0.045],
  sprRef: 12,              // stack-to-pot ratio at which playability counts in full
  iters: 8000,
};

// ---- playability: how much better or worse a hand does than its raw equity ------------------------
function playability(cfg) {
  const p = new Float64Array(N);
  let sum = 0, tot = 0;
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / 13), c = i % 13;
    const hi = 12 - Math.min(r, c), lo = 12 - Math.max(r, c);
    const [kS, kSC, kA, kO, kOC, kP] = cfg.play;
    if (r === c) p[i] = kP;
    else {
      // number of the 10 possible straights that use both cards (0..4)
      let w = 0;
      for (let s = -1; s <= 8; s++) {
        const has = (x) => (x >= s && x <= s + 4) || (x === 12 && s === -1);
        if (has(hi) && has(lo)) w++;
      }
      p[i] = r < c ? kS + kSC * w / 4 + (hi === 12 ? kA : 0) : kO + kOC * w / 4;
    }
    sum += p[i] * handCombos(i); tot += handCombos(i);
  }
  for (let i = 0; i < N; i++) p[i] -= sum / tot;
  return p;
}

// ---- matrix helpers ----------------------------------------------------------------------------
function mv(M, x, out) { // out[i] = sum_j M[i][j] x[j]
  for (let i = 0; i < N; i++) { let s = 0; const o = i * N; for (let j = 0; j < N; j++) s += M[o + j] * x[j]; out[i] = s; }
  return out;
}
function mvT(M, y, out) { // out[j] = sum_i M[i][j] y[i]
  out.fill(0);
  for (let i = 0; i < N; i++) { const yi = y[i]; if (yi === 0) continue; const o = i * N; for (let j = 0; j < N; j++) out[j] += M[o + j] * yi; }
  return out;
}
const vec = () => new Float64Array(N);

class InfoSet {
  constructor(nA, mask) {
    this.nA = nA; this.mask = mask || new Array(nA).fill(true);
    this.reg = new Float64Array(N * nA); this.sum = new Float64Array(N * nA); this.cur = new Float64Array(N * nA);
    this.a = []; for (let k = 0; k < nA; k++) this.a.push(vec());
  }
  update() { // regret matching -> this.cur and per-action vectors this.a[k]
    const nA = this.nA, allowed = this.mask.filter(Boolean).length;
    for (let h = 0; h < N; h++) {
      let s = 0;
      for (let k = 0; k < nA; k++) if (this.mask[k]) s += this.reg[h * nA + k];
      for (let k = 0; k < nA; k++) {
        const v = !this.mask[k] ? 0 : s > 0 ? this.reg[h * nA + k] / s : 1 / allowed;
        this.cur[h * nA + k] = v; this.a[k][h] = v;
      }
    }
  }
  learn(h, vals, v, weight) { // CFR+: regrets never go below zero
    for (let k = 0; k < this.nA; k++) if (this.mask[k]) {
      const x = this.reg[h * this.nA + k] + weight * (vals[k] - v);
      this.reg[h * this.nA + k] = x > 0 ? x : 0;
    }
  }
  accumulate(h, weight) { for (let k = 0; k < this.nA; k++) this.sum[h * this.nA + k] += weight * this.cur[h * this.nA + k]; }
  average() {
    const out = [];
    for (let h = 0; h < N; h++) {
      let s = 0; for (let k = 0; k < this.nA; k++) s += this.sum[h * this.nA + k];
      const row = [];
      for (let k = 0; k < this.nA; k++) row.push(s > 0 ? this.sum[h * this.nA + k] / s : (this.mask[k] ? 1 / this.mask.filter(Boolean).length : 0));
      out.push(row);
    }
    return out;
  }
}

// ---- one opener against one responder: sizes and payoff matrices -----------------------------------
function buildPair(seats, o, k, eq, C, play, cfg) {
  const n = seats.length, blind = (s) => s === n - 2 ? 0.5 : s === n - 1 ? 1 : 0;
  // postflop order: SB, BB, then the other seats in order; later = in position
  const post = (s) => s === n - 2 ? 0 : s === n - 1 ? 1 : s + 2;
  const openerIP = post(o) > post(k);
  const bO = blind(o), bK = blind(k), D = 1.5 - bO - bK;
  const S = o === n - 2 ? cfg.openSB : cfg.open;
  const T = S * (openerIP ? cfg.threeOOP : cfg.threeIP);
  const Q = T * (openerIP ? cfg.fourIP : cfg.fourOOP);
  const A = cfg.stack;
  const canCall = cfg.callers === 'all' || cfg.callers.includes(seats[k]);
  // a cold-caller who does not close the action can still be squeezed by the players behind
  const sq = canCall && k !== n - 1 ? 1 - Math.pow(1 - cfg.squeeze, n - 1 - k) : 0;
  const term = (X, aggIsOpener, kind, dead = 1) => {
    const raw = kind < 0, lev = raw ? 0 : cfg.lev[kind], pos = raw ? 0 : cfg.pos[kind];
    const pot = 2 * X + D * dead;
    const potAfter = pot - Math.min(cfg.rakeCap || Infinity, pot * cfg.rakePct);
    const spr = (A - X) / pot;
    const alpha = raw ? 0 : Math.min(1, Math.sqrt(spr / cfg.sprRef));
    const aggIsIP = aggIsOpener === openerIP;
    const M = new Float64Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const c = C[i * N + j]; if (c === 0) continue;
      const e = eq[i][j]; // opener's equity
      const eIP = openerIP ? e : 1 - e;
      const pIP = openerIP ? play[i] : play[j], pOOP = openerIP ? play[j] : play[i];
      let sIP = raw ? eIP : 0.5 + (1 + lev) * (eIP - 0.5) + 4 * eIP * (1 - eIP) * (pos + (aggIsIP ? cfg.init : -cfg.init) + alpha * (pIP - pOOP));
      sIP = sIP < 0 ? 0 : sIP > 1 ? 1 : sIP;
      const sO = openerIP ? sIP : 1 - sIP;
      M[i * N + j] = c * (sO * potAfter - X);
    }
    return { M, G: potAfter - 2 * X }; // responder's net = c*G - M
  };
  return {
    name: seats[k], openerIP, bK, D, S, T, Q, A,
    wake: 1 - Math.pow(1 - cfg.wake, n - 1 - k),
    canCall, sq,
    t1: term(S, true, 0, sq > 0 ? cfg.deadShare : 1), t3: term(T, false, 1), t4: term(Q, true, 2), tA: term(A, false, -1),
  };
}

// ---- solve the game that starts when everyone has folded to seat o --------------------------------
function solveOpener(seats, o, eq, C, play, cfg, log) {
  const n = seats.length, bO = o === n - 2 ? 0.5 : 0;
  const pairs = [];
  for (let k = o + 1; k < n; k++) pairs.push(buildPair(seats, o, k, eq, C, play, cfg));
  const nrm = vec(); for (let i = 0; i < N; i++) nrm[i] = handCombos(i) * 1225;
  const open = new InfoSet(2);
  for (const p of pairs) {
    p.R = new InfoSet(3, [true, p.canCall, true]); // fold, call, 3-bet
    p.O3 = new InfoSet(3);                          // opener vs 3-bet: fold, call, 4-bet
    p.R4 = new InfoSet(3);                          // 3-bettor vs 4-bet: fold, call, shove
    p.O5 = new InfoSet(2);                          // opener vs shove: fold, call
    p.pre = vec();
  }
  const v1 = vec(), v2 = vec(), v3 = vec(), v4 = vec(), v5 = vec(), v6 = vec(), v7 = vec(), v8 = vec(), v9 = vec(), v10 = vec();
  const x1 = vec(), x2 = vec(), x3 = vec(), x4 = vec(), x5 = vec(), P = vec(), Vopen = vec();
  const iters = cfg.iters; let snap = null;
  for (let t = 1; t <= iters; t++) {
    open.update(); for (const p of pairs) { p.R.update(); p.O3.update(); p.R4.update(); p.O5.update(); }
    const op = open.a[1];
    // ---------- opener's side ----------
    P.fill(1); Vopen.fill(0);
    for (const p of pairs) {
      p.pre.set(P);
      const [fR, cR, tR] = p.R.a, [f3, c3, b4] = p.O3.a, [f4, c4, s4] = p.R4.a, [f5, c5] = p.O5.a;
      for (let j = 0; j < N; j++) { x1[j] = tR[j] * f4[j]; x2[j] = tR[j] * c4[j]; x3[j] = tR[j] * s4[j]; }
      mv(C, fR, v1); mv(C, tR, v2); mv(C, x1, v3); mv(C, x3, v4);
      mv(p.t1.M, cR, v5); mv(p.t3.M, tR, v6); mv(p.t4.M, x2, v7); mv(p.tA.M, x3, v8);
      for (let i = 0; i < N; i++) {
        const w = P[i] / nrm[i];
        const a5 = [-p.Q * v4[i], v8[i]], u5 = f5[i] * a5[0] + c5[i] * a5[1];
        const a3 = [-p.S * v2[i], v6[i], (p.T + p.D) * v3[i] + v7[i] + u5], u3 = f3[i] * a3[0] + c3[i] * a3[1] + b4[i] * a3[2];
        p.O3.learn(i, a3, u3, w); p.O5.learn(i, a5, u5, w);
        p.O3.accumulate(i, t * op[i]); p.O5.accumulate(i, t * op[i] * b4[i]);
        Vopen[i] += w * ((1 - p.sq) * v5[i] + (1 - p.wake) * u3 - p.wake * p.S * v2[i]);
        P[i] *= v1[i] / nrm[i];
      }
    }
    for (let i = 0; i < N; i++) {
      const vo = Vopen[i] + P[i] * (1.5 - bO), vf = -bO;
      open.learn(i, [vf, vo], op[i] * vo + (1 - op[i]) * vf, 1);
      open.accumulate(i, t);
    }
    // ---------- each responder's side ----------
    for (const p of pairs) {
      const [fR, cR, tR] = p.R.a, [f3, c3, b4] = p.O3.a, [f4, c4, s4] = p.R4.a, [f5, c5] = p.O5.a;
      for (let i = 0; i < N; i++) {
        const a = op[i] * p.pre[i];
        x1[i] = a; x2[i] = a * f3[i]; x3[i] = a * c3[i]; x4[i] = a * b4[i]; x5[i] = x4[i] * c5[i];
      }
      mv(C, x1, v1); mv(C, x2, v2); mv(C, x3, v3); mv(C, x4, v4); mv(C, x5, v5); // C is symmetric
      mvT(p.t1.M, x1, v6); mvT(p.t3.M, x3, v7); mvT(p.t4.M, x4, v8); mvT(p.tA.M, x5, v9);
      for (let j = 0; j < N; j++) {
        const w = 1 / nrm[j];
        const yF5 = v4[j] - v5[j]; // opener 4-bets then folds to the shove
        const a4 = [-p.T * v4[j], p.t4.G * v4[j] - v8[j], (p.Q + p.D) * yF5 + p.tA.G * v5[j] - v9[j]];
        const u4 = f4[j] * a4[0] + c4[j] * a4[1] + s4[j] * a4[2];
        const aR = [-p.bK * v1[j], (1 - p.sq) * (p.t1.G * v1[j] - v6[j]) - p.sq * p.S * v1[j], (1 - p.wake) * ((p.S + p.D) * v2[j] + p.t3.G * v3[j] - v7[j] + u4) - p.wake * cfg.wakeCost * p.T * v1[j]];
        const uR = fR[j] * aR[0] + cR[j] * aR[1] + tR[j] * aR[2];
        p.R.learn(j, aR, uR, w); p.R4.learn(j, a4, u4, w);
        p.R.accumulate(j, t); p.R4.accumulate(j, t * tR[j]);
      }
    }
    if (t === Math.floor(iters * 0.8)) snap = open.average().map(r => r[1]);
  }
  const res = { open: open.average().map(r => r[1]), ev: Array.from(Vopen, (v, i) => v + P[i] * (1.5 - bO)), vs: {} };
  let drift = 0; for (let i = 0; i < N; i++) drift = Math.max(drift, Math.abs(res.open[i] - snap[i]));
  res.drift = drift;
  for (const p of pairs) res.vs[p.name] = {
    sizes: { open: p.S, threeBet: p.T, fourBet: +p.Q.toFixed(2) }, openerInPosition: p.openerIP,
    resp: p.R.average(), oVs3: p.O3.average(), rVs4: p.R4.average(), oVs5: p.O5.average(),
  };
  if (log) log(`${seats[o]} done (largest change in the last 20% of iterations: ${(100 * drift).toFixed(2)} points)`);
  return res;
}

function loadEquity() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'equity.json'), 'utf8'));
  return { eq: d.eq, C: Float64Array.from(d.combos) };
}

const SEATS = {
  '6max': ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  '9max': ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

function solveGame(name, cfg, log) {
  const { eq, C } = loadEquity(), play = playability(cfg), seats = SEATS[name];
  const out = { seats, openers: {} };
  for (let o = 0; o < seats.length - 1; o++) out.openers[seats[o]] = solveOpener(seats, o, eq, C, play, cfg, log);
  return out;
}

// combo-weighted frequency of each action; `reach` optionally weights hands by how often they get here
function freq(rows, reach) {
  const nA = rows[0].length, f = new Array(nA).fill(0); let tot = 0;
  for (let i = 0; i < N; i++) { const w = handCombos(i) * (reach ? reach[i] : 1); tot += w; for (let k = 0; k < nA; k++) f[k] += w * rows[i][k]; }
  return f.map(x => tot > 0 ? x / tot : 0);
}

module.exports = { N, RANKS, handName, handCombos, DEFAULTS, SEATS, solveGame, freq, playability };

if (require.main === module) {
  const args = process.argv.slice(2), cfg = { ...DEFAULTS };
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (arg('--iters')) cfg.iters = parseInt(arg('--iters'), 10);
  for (const k of ['squeeze', 'deadShare', 'wake', 'wakeCost', 'init', 'sprRef', 'rakePct', 'rakeCap', 'open', 'openSB']) if (arg('--' + k)) cfg[k] = parseFloat(arg('--' + k));
  for (const k of ['lev', 'pos', 'play']) if (arg('--' + k)) cfg[k] = arg('--' + k).split(',').map(Number);
  const only = arg('--only'), t0 = Date.now(), results = { config: cfg, games: {} };
  const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';
  for (const g of Object.keys(SEATS)) {
    if (only && only !== g) continue;
    console.log(`\n== ${g} ==`);
    const game = solveGame(g, cfg, (m) => console.error('  ' + m));
    results.games[g] = game;
    for (const [o, r] of Object.entries(game.openers)) {
      console.log(`${o.padEnd(6)} opens ${pct(freq(r.open.map(x => [x]))[0])}`);
      for (const [k, v] of Object.entries(r.vs)) {
        const a = freq(v.resp), b = freq(v.oVs3, r.open), c = freq(v.rVs4, v.resp.map(x => x[2]));
        console.log(`   vs ${k.padEnd(6)} call ${pct(a[1])} 3-bet ${pct(a[2])} | opener vs 3-bet: fold ${pct(b[0])} call ${pct(b[1])} 4-bet ${pct(b[2])} | vs 4-bet: fold ${pct(c[0])} call ${pct(c[1])} shove ${pct(c[2])}`);
      }
    }
  }
  const round = (x) => Array.isArray(x) ? x.map(round) : typeof x === 'number' ? +x.toFixed(4) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)])) : x;
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(round(results)));
  console.log(`\nSolved in ${((Date.now() - t0) / 1000).toFixed(0)}s -> solver/out/results.json`);
}
