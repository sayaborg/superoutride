# M9.5 — Three Debug Tire Characteristic Presets

Status: normative tire-calibration and browser-debug composition authority.

## 1. Scope and supersession

M9.5 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, compiled vehicle profiles,
one-k radial combined-slip law, wheel solve, SurfaceMap, input, steering calibration, camera,
renderer, route and topology. It replaces the M9.4 browser comparison table with three numbered
DEV tire-characteristic presets.

M9.5 supersedes only M9.4's exact `SEMI / 1.5x / 2.0x / 2.5x` browser choices and its prohibition
on calibrating linear tire demand. One explicit vehicle-instance tire-calibration state now owns a
positive finite reference-friction multiplier and a positive finite linear-stiffness multiplier.
It does not authorize hidden grip intervention, ABS/TCS, a second tire law, course-dependent boosts
or SurfaceMap absolute friction.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 2. Architecture decision gate

1. Debug tire-characteristic comparison belongs to the existing common vehicle-instance tire
   calibration owner.
2. The existing one-k demand and radial C1 law already express the requested slope and saturation;
   no new force primitive or alternate tire curve is required.
3. The two calibration values form one state and change atomically. Browser preset identity is
   derived from those values and is never a second mechanics state.
4. The common solver does not branch on preset, vehicle identity, course, route, topology, camera
   or input source.
5. The compiled six-profile tire packages, `rhoKnee` and SurfaceMap materials remain unchanged.
6. World-space physics, contact/wheel causality and every frozen renderer, metric and topology
   invariant remain unchanged.
7. Regression proves exact initial slope, exact reference-car plateau points, preserved one-k and
   SurfaceMap behavior, common-solver causality, atomic state persistence and shared browser
   selection authority.

## 3. Tire law

The selected one-k demand and capacity are:

```text
Cselected = C * linearStiffnessMultiplier
Dx        = Cselected * sx
Dy        = Cselected * sy

muSelected = muRef * referenceFrictionMultiplier
muEff      = muSelected * surface.gripFactor
Fmax       = muEff * normalLoad
rho        = hypot(Dx,Dy) / Fmax
```

The existing `rhoKnee`, radial C1 transition, constant plateau after `rho=2-rhoKnee`, combined-slip
allocation, low-speed regularization, rolling resistance and implicit wheel solve are unchanged.
The selector does not change compiled profiles, wheel torque, brake torque or surface data.

The preset calibration target uses the current car front-tire reference values:

```text
normalized stiffness = 9.0
muRef                 = 1.35
rhoKnee               = 0.74
plateau rho            = 2 - rhoKnee = 1.26
```

The exact debug presets are:

| Preset | Linear stiffness multiplier | Reference-friction multiplier | Car-front effective C | Car asphalt peak mu | Car-front plateau begins |
|---|---:|---:|---:|---:|---:|
| `1` | `1` | `1` | `9.0` | `1.35` | `10.7026574942 deg` |
| `2` | `10.3 / 9` | `(10.3*tan(12 deg)/1.26)/1.35` | `10.3` | `1.7375655438` | `12 deg` |
| `3` | `10.3 / 9` | `(10.3*tan(15 deg)/1.26)/1.35` | `10.3` | `2.1903783191` | `15 deg` |

Preset `1` is exactly the previous current tire. Presets `2` and `3` have exactly the same initial
linear slope. Preset `3` delays saturation beyond preset `2` by increasing peak capacity without
reducing that slope. The `15 deg` preset-3 target is the current provisional debug proposal and is
not a final product-tire specification.

The common multipliers apply ordinarily to FR, MR, RR, AWD, BIKE1 and BIKE2. The stated plateau
angles are specifically the current car front-tire reference, not a vehicle-kind branch and not a
claim about a real commercial tire.

## 4. Browser debug selection

The browser player begins with preset `1`. Keyboard `G` cycles:

```text
1 -> 2 -> 3 -> 1
```

Touch exposes `1`, `2` and `3` directly. The common HUD derives the displayed number from the
current vehicle-owned pair of calibration values. It owns no duplicate active preset state.

Selections apply immediately, survive ordinary recovery and pass through DEV safe-spawn vehicle
profile reconstruction. Ordinary construction and rivals retain the unit/unit calibration unless
an explicit caller supplies another value. There is no automatic selection and no product-mode
behavior attached to these presets.

## 5. Explicit non-goals

M9.5 adds no:

- alternate tire-force equation, post-peak drop or force memory;
- `rhoKnee`, low-speed regularization, compiled profile or wheel-solve change;
- temperature, pressure, wear, compound or load-sensitivity model;
- automatic grip selection, ABS, TCS, steering assist or front-slip steering limiter;
- absolute friction in SurfaceMap or change to its relative material factors;
- vehicle-kind, course, route, topology, camera or renderer branch;
- product tire-selection screen or permanent vehicle specification.

## 6. Acceptance

Executable acceptance must prove:

1. Exact numbered choices `1 / 2 / 3`, default `1`, and the `G` cycle.
2. Preset `1` reproduces the existing current tire exactly.
3. Presets `2` and `3` share normalized initial slope `10.3` for the car front-tire reference.
4. The unchanged radial law reaches its plateau at exactly `12 deg` and `15 deg` respectively for
   that reference, with preset `3` retaining the same slope and increasing peak capacity.
5. `muRef`, compiled stiffness, `rhoKnee`, SurfaceMap ratios and the wheel law remain unchanged.
6. Both positive finite values are validated before either vehicle-state field mutates.
7. The ordinary common wheel/contact path consumes both values and produces causal trajectory
   differences.
8. One state survives recovery and profile reconstruction without shared mutable state.
9. Keyboard, touch and HUD derive from one browser table and all three composition roots use one
   adapter.
10. Rivals and ordinary construction retain unit/unit calibration; input, steering, camera,
    renderer, route and topology boundaries remain green.

The standalone-record rule requires a new validation record because this milestone explicitly
changes the M9.4 tire-calibration authority boundary.
