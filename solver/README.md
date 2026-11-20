# RSDP preflop solver

A small preflop solver for no-limit hold'em: 6-max and 9-max, 100bb. It has no dependencies beyond Node.

It is a **calculated model, not commercial solver output**. The betting game before the flop is solved properly; play after the flop is replaced by an estimate. Read "What is assumed" before relying on a borderline hand.

## Run it

```bash
node solver/equity.js      # once, about 4 minutes: builds solver/data/equity.json
```

```bash
node solver/solve.js       # about 4 minutes: writes solver/out/results.json
```

```bash
node solver/report.js      # compares with the trainer's charts, writes solver/viewer.html
```

Open `solver/viewer.html` in a browser to explore the ranges. `solver/out/compare.txt` lists every hand where the trainer's chart and the solver disagree.

`solve.js` options: `--iters 2000` (faster, rougher), `--only 6max`, and any model setting, for example `--open 2.2` or `--rakePct 0.05 --rakeCap 0.6`.

## What is calculated

- **Equities.** The all-in equity of each of the 169 starting hands against each other, from 800,000 random boards. Each board scores every pair of hole cards at once, so the error is about 0.1 points.
- **Card removal** between the two players in a pot (holding an ace makes it less likely your opponent has one).
- **The betting game.** When everyone has folded to a seat, that seat opens or folds. Each player behind may fold, call or 3-bet. Against a 3-bet the opener folds, calls or 4-bets. Against a 4-bet the 3-bettor folds, calls or shoves. Against a shove the opener calls or folds.
- **The balanced strategy** for every seat, found with CFR+ (counterfactual regret minimisation), the family of methods commercial solvers use. Hands can mix between actions.

## What is assumed

Play after the flop is not simulated. When a pot goes to the flop, each player gets a share of it:

> share = equity, stretched away from 50% by a leverage factor, plus adjustments for position, initiative and playability

- **Leverage:** with money behind, the better hand wins more than its raw equity.
- **Position** and **initiative:** the player in position and the last raiser do better.
- **Playability:** suited and connected hands and pairs do better than their raw equity; weak offsuit hands do worse.

These settings (`DEFAULTS` in `solve.js`) were tuned by hand so that overall widths land near typical published 100bb ranges, recalled from memory. They are judgement, not measurement. All-in pots use exact equity with no adjustment.

## Simplifications

- Every pot is heads-up. A cold-caller pays a fixed "squeeze" risk, and a 3-bettor a fixed "wake-up" risk, for the players still to act.
- The SB raises or folds; there is no limping.
- One size per decision: open 2.5bb (SB 3bb), 3-bet 3x in position or 4x out of position, 4-bet 2.3x or 2.7x, then all-in.
- No rake and no ante by default.
- Earlier folds are assumed to tell you nothing about the remaining cards.

## How far to trust it

- **Solid:** the top and bottom of each range, the order of hands of the same type, and how ranges widen by seat.
- **Soft:** the exact borderline hands, and the mix between calling and 3-betting. These move when the postflop settings move.
- The solve reports how much each opening range changed over its last 20% of iterations. Hands that are close to break-even keep drifting between actions; treat them as close decisions.
