# SUPER OUTRIDE — M9.22 Pedal Torque HUD

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core.
> Repository is project authority. Handling remains **DEV_UNCALIBRATED**.

## Current milestone

M9.22 makes pedal protection visible in the shared DEV HUD. Each ACCEL/BRAKE column has an
analog INPUT meter and separate F/R delivered-torque meters. Cyan is delivered output; red extends
from delivered to the pre-protection request (RED=CUT). Unrequested capacity stays empty. Thin
markers show the authored front/rear capacity/share. Numbers are percentages, not throttle-valve
angles, brake pressure, tire force, measured deceleration, or grip utilization.

ACCEL uses a common currently available full-throttle scale: a 45:55 requested split reaches
45%/55%, not 100%/100%; half throttle reaches22.5%/27.5%. Removing front torque does not stretch the
remaining bars back to100%. BRAKE uses the fixed sum of front/rear maximum brake torques as100%.
Input-actuator lag is not red. Red combines all M9.21 protection, not separate cause indicators.
A zero engine torque request, including full rev cut, shows zero drive output and no invented cut.

This changes presentation only. Profile brake capacities/ratios are retained provisional engineering
seeds; their factory derivation and handling calibration remain open. Tire calibration remains paused.
HUD authority: `docs/116_m9_22_pedal_torque_hud.md`.

M9.21 adds independent TCS on driven stations and independent front/rear ABS. Motorcycle catalog
entries additionally prevent acceleration/braking-induced support loss through the same delivered-
torque boundary. AWD's authored split is a REQUEST split; independent protection may change actual
split, without transferring removed torque to the other station. No shaft lock or yaw correction.
Every browser player/rival/replacement is protected; raw mechanics construction remains explicitly
unprotected for historical diagnostic comparisons. Handling remains DEV_UNCALIBRATED.

Current control authority: `docs/115_m9_21_torque_protection.md`.
Latest continuation: `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_22.md`.
Power-over drifting is no longer a product goal. Inertia-driven entry/correction/exit remain goals.
Tire calibration and front/rear differentiation are paused. The following tire settings are unchanged.


M9.20 replaces the old G/P/S postpeak tire with one load-proportional, monotone two-axis
capacity law. Five independent live controls select longitudinal/lateral capacity and onset
slip plus a shared knee. There is no extra S falloff, drift state, target beta or hidden force.
M9.21 protection surrounds this unchanged tire law; it is not a new tire curve or drift mode.

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
Historical M9.20 continuation: `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_20.md`.
Preserved research: [eight original reports and their status](docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md).
[Preservation repair and verification scope](docs/research/M9_20_PRESERVATION_REPAIR_2026-09-06.md)
distinguish archived reports from a complete historical experiment/data archive.

## Read before changing behavior

1. `AGENTS.md` — design/release contract.
2. `docs/README.md` — authority classes and supersession.
3. `docs/116_m9_22_pedal_torque_hud.md` for HUD; `docs/115_m9_21_torque_protection.md` for protection;
   `docs/114_m9_20_five_axis_tire.md` for the retained tire law and selectors.
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
node tools/torque-protection-probe.mjs --hz 120 --out protection.json
node tools/drift-control-probe.mjs --mode transient --speed 200 --out transient.json
node tools/drift-control-probe.mjs --mode sweep --speed 150 --out sweep.json
node tools/drift-control-probe.mjs --mode reference --hz 120 --mirror --out reference.json
```

The protection probe explicitly compares raw/protected catalog actors. The drift probe remains raw
mechanics unless a policy is passed programmatically; it does not certify protected product handling.
`transient` uses current tire defaults and logs entry/exit, actual speed loss and displacement without
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
2m=80px at player depth, one far-to-near Painter. Road bank is absent from raster geometry and
camera roll is zero (Core section 18); topology does not change projection. Motorcycle bank
sprite variants remain a separate presentation mechanism.

Do not claim the new law establishes all-speed/all-vehicle/human drifting. Strong-brake spin,
repeat wheel lift, real-course useful travel, broad transient margins and human protected handling remain
open. TCS/ABS are not ESC: severe lateral spins can still occur. Support prevention is a bounded
local prediction, not a guarantee for arbitrary inherited pitch momentum or every terrain event. Steady circles are diagnostic; product evaluation centers on entry/correction/exit and
quantified deceleration. Nothing secretly preserves speed or torque beyond the existing engine.
