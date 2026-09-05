# SUPER OUTRIDE — M9.20 Five-Parameter Tire

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core.
> Repository is project authority. Handling remains **DEV_UNCALIBRATED**.

## Current milestone

M9.20 replaces the old G/P/S postpeak tire with one load-proportional, monotone two-axis
capacity law. Five independent live controls select longitudinal/lateral capacity and onset
slip plus a shared knee. There is no extra S falloff, drift state, target beta or hidden force.
**TCS is not active**; shared slip kinematics and explicit drive-torque boundaries prepare later work.

| Control | Default | Range and step | Keyboard forward-cycle |
|---|---:|---|---|
| GX: longitudinal capacity | 2.50 | .50..4.00, .05 | H |
| PX: longitudinal capacity-onset slip | 8% | 1..60%, 1 point | J |
| GY: lateral capacity | 2.20 | .50..4.00, .05 | G |
| PY: lateral capacity-onset slip | 10% | 1..60%, 1 point | L |
| KN: common X/Y knee | .74 | .10...95, .01 | N |

Each value has compact +/- controls. Endpoints wrap. G/P/KN changes preserve the other four
shown values, atomically recompiling kX=(2-KN)GX/PX and kY=(2-KN)GY/PY. PY is dimensionless slip,
not vehicle drift angle; its high-speed pure-lateral angle equivalent is shown as supplementary
information. **kx=ky is not imposed.** Front/rear are intentionally linked for this milestone;
the underlying station model permits later distinct data without a branch in the force law.

Defaults are approved diagnostic values, not an identified real-tire measurement or a guarantee
of easy drift. ENG remains1, D12/M60/ACT.25 unchanged. All nine stock construction/rival tires
retain the previous non-dropping isotropic reference; selected browser calibration applies to
the player and survives recovery/vehicle replacement. Reload/course navigation resets it.

Normative scope: `docs/114_m9_20_five_axis_tire.md`.
Discussion and rejected hypotheses: `docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md`.
Latest continuation: `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_20.md`.

## Read before changing behavior

1. `AGENTS.md` — design/release contract.
2. `docs/README.md` — authority classes and supersession.
3. `docs/114_m9_20_five_axis_tire.md` — current tire law, five selectors, regression migration.
4. `docs/112_m9_18_load_proportional_one_k_tire.md` — retained load/contact/recovery contract.
5. `docs/111_m9_17_direct_robotized_mt.md` and `docs/110_m9_16_engine_power_diagnostic_selector.md`.
6. `docs/101_m9_11_simplified_travel_direction_steering.md`, `docs/107_m9_13_full_screen_analog_touch.md`,
   `docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md` — retained steering and driving input.
7. Relevant implementation, compiler and tests. Frozen Core and addenda before any metric/render change.

Earlier numbered milestones and released validation records remain immutable historical evidence.
The handoff is navigation, not a second authority. Resolve current SHA/PR/CI/Pages from GitHub.

## Run and diagnose

Use the repository Node24 toolchain and locked dependencies:

```bash
npm ci
npm test
python3 -m http.server 8000
```

Open the root page on that local server. Tests clean/rebuild dist before execution.

Production-solver diagnostics, not an injected drift controller:

```bash
node tools/drift-control-probe.mjs --mode transient --speed 200 --out transient.json
node tools/drift-control-probe.mjs --mode sweep --speed 150 --out sweep.json
node tools/drift-control-probe.mjs --mode reference --hz 120 --mirror --out reference.json
```

`transient` uses current defaults and logs entry/exit, actual speed loss and displacement without
promising drift. `sweep` uses increasing then decreasing throttle, recording finite-time windows
and hysteresis, not claiming equilibria from averages. `reference` explicitly selects the former
research tire GX.75/PX2%/GY3/PY8%/KN.74 and ENG3 to replay a no-TCS capability case. It does NOT
change defaults. `--tire` accepts a JSON authoring object for non-reference comparisons; `--engine`
is explicit. All runs preserve real wheel/gear evolution; no beta/speed correction or gear lock.
Distances on the flat fixture are trajectory/displacement diagnostics, not useful drift length
on an actual course. Evaluate real corners, input errors, acceleration/braking and human feel next.

## Retained controls and modes

| Function | Control |
|---|---|
| Course | 1 LINEAR / 2 BRANCHING / 3 TSUKUBA / 4 FISCO |
| Vehicle | Q/W/E/R/A/S/D/F/V = F110/930/C4/GTI/Delta/RC30/R80/FXRT/PX200 |
| Camera | P = body-fixed / movement-follow |
| Steering | Left / Right |
| Throttle | Up or X |
| Brake | Down or Z |
| ENG | K: 1 / 1.5 / 2 / 3 / 4 |
| D / M / ACT | Y / U / T, retained choices |
| Recovery | Backspace |

Touch uses full-viewport relative origin: start left for steering, right for mutually exclusive
accelerator/brake. 64 CSS px is full scale; held touch is DIRECT, release uses the existing
actuator. Keyboard remains digital/rate-limited. New selectors do not alter driving gestures.

`/` and `?mode=branching` select BRANCHING; `?mode=linear` is LINEAR;
`?mode=circuit` and `?mode=fisco` use the CIRCUIT composition.

## Architecture and limits

One common two-station vehicle solver, current-load suspension, wheel dynamics and direct robotized
MT remain. Compiled tire fields are muX/muY/kX/kY/rhoKnee; current effective values live only in the
vehicle-owned immutable station pair. Tire slip is observed from contact velocity and wheel speed.
Contact/recovery does not suppress permitted wheelies/stoppies or hide suspension overtravel.

Camera defaults BODY_FIXED with retained MOVEMENT_FOLLOW alternative; physical pitch follow remains.
World X/Y/Z is physical truth. d=s_render-s_camera is the only renderer depth, same depth same scale,
2m=80px at player depth, one far-to-near Painter, no band�roll renderer or topology-dependent projection.

Do not claim the new law establishes all-speed/all-vehicle/human drifting. Strong-brake spin,
repeat wheel lift, real-course useful travel, broad transient margins and TCS/AWD design remain
open. Steady circles are diagnostic; product evaluation centers on entry/correction/exit and
quantified deceleration. Nothing secretly preserves speed or torque beyond the existing engine.
