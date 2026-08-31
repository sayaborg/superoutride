# M9.4 — Selectable Tire Reference Friction

Status: normative tire-calibration and browser-debug composition authority.

## 1. Scope and supersession

M9.4 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, compiled vehicle profiles,
one-k radial combined-slip law, wheel solve, SurfaceMap, input, steering calibration, camera,
renderer, route and topology. It adds one controlled DEV selector for the tire reference-friction
multiplier.

This milestone supersedes only the M9.0 statement that no control path may alter `mu`. Browser
selection may now change one vehicle-instance reference-friction multiplier through the explicit
calibration path defined here. It does not authorize hidden grip intervention, ABS/TCS, a second
tire law, course-dependent boosts or SurfaceMap absolute friction.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 2. Architecture decision gate

1. Selectable reference friction belongs to tire calibration on the common vehicle instance.
2. The existing `muRef`, relative SurfaceMap `gripFactor`, normal load and radial tire law express
   the complete behavior; no new force primitive is required.
3. Each vehicle owns exactly one multiplier. Browser presentation owns no duplicate active value.
4. The common solver does not branch on vehicle identity, course, route, topology, camera or input
   source.
5. The compiled six-profile tire packages and SurfaceMap materials remain unchanged.
6. World-space physics, contact/wheel causality and every frozen renderer, metric and topology
   invariant remain unchanged.
7. Regression proves exact capacity scaling, preserved surface ratios, common-solver causality,
   state persistence, browser authority sharing and unchanged tire/profile parameters.

## 3. Tire law

The sole capacity change is:

```text
muSelected = muRef * referenceFrictionMultiplier
muEff      = muSelected * surface.gripFactor
Fmax       = muEff * normalLoad
```

The existing linear demand, `rhoKnee`, radial C1 transition, constant plateau, combined-slip
allocation, rolling resistance and implicit wheel solve are unchanged. The selector does not scale
corner stiffness, normalized stiffness, slip demand, wheel torque, brake torque or surface data.

For the current car `muRef=1.35`, asphalt peak coefficients are:

```text
SEMI  1.0x -> 1.350
      1.5x -> 2.025
      2.0x -> 2.700
      2.5x -> 3.375
```

For the current bike `muRef=1.25`, the same selections produce `1.25`, `1.875`, `2.50` and `3.125`.
These are controlled handling comparisons, not claims about real tire products.

## 4. Browser selection

The browser player begins with the current semi-slick baseline:

```text
SEMI = 1.0x
```

The exact choices are:

```text
SEMI  1.5x  2.0x  2.5x
```

Keyboard `G` cycles the table in that order and wraps to `SEMI`. Touch exposes every value
directly. The common HUD reads and formats only the current vehicle-owned value.

Selections apply immediately, survive ordinary recovery and pass through DEV safe-spawn vehicle
profile reconstruction. FR, MR, RR, AWD, BIKE1 and BIKE2 use the same path. Ordinary construction
and rivals retain the default multiplier `1.0` unless an explicit caller supplies another value.

## 5. Explicit non-goals

M9.4 adds no:

- alternate tire-force equation or post-peak behavior;
- stiffness, `rhoKnee`, low-speed regularization or wheel change;
- temperature, pressure, wear, compound or load-sensitivity model;
- automatic grip selection, ABS, TCS or steering assist;
- absolute friction in SurfaceMap or change to its relative material factors;
- vehicle-kind, course, route, topology, camera or renderer branch;
- new input state or force-producing HUD behavior.

## 6. Acceptance

Executable acceptance must prove:

1. The exact `1.0 / 1.5 / 2.0 / 2.5` table, `SEMI` default and `G` cycle.
2. Tire `Fmax` scales exactly by the selected multiplier while `muRef`, stiffness and `rhoKnee`
   remain unchanged.
3. Surface material ratios remain multiplicative and unchanged for every selection.
4. The ordinary common wheel/contact path consumes the multiplier and produces a causal trajectory
   difference under saturation.
5. Invalid/non-positive/non-finite values are rejected before state mutation.
6. One vehicle-instance state survives recovery and profile reconstruction without shared mutable
   state.
7. Keyboard, touch and HUD derive from one browser choice authority and all three composition roots
   use one adapter.
8. Rivals and ordinary construction retain `1.0`.
9. Tire, SurfaceMap, input, steering, camera, renderer, route and topology boundaries remain green.

The standalone-record rule requires a new validation record because this milestone explicitly
changes the M9.0 tire-calibration authority boundary.
