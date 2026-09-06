# SUPER OUTRIDE — Agent Development Contract

This is the persistent working contract for coding agents in this repository. It is deliberately
compact: normative mathematics live in the numbered authority documents and frozen Core files;
chronological history and evidence remain in `docs/` and `docs/validation/`.

## 1. Project identity and source of truth

SUPER OUTRIDE is a browser-based 320×240 raster pseudo-3D high-speed driving game inspired by
Out Run, Super Hang-On, OutRunners and the Super Scaler era. Product route forms are LINEAR,
BRANCHING and CIRCUIT. Cars and motorcycles share one world-space vehicle architecture.
Handling remains `DEV_UNCALIBRATED` unless a later numbered authority explicitly changes it.

The repository is the sole continuing project authority. Conversation history and dated handoffs
are context only. Before changing anything, re-fetch current `main`, open PRs, exact-head CI and
Pages state; never trust an embedded historical SHA as current.

## 2. Authority map

Frozen renderer/metric/topology authority:

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

Current HUD/tire/vehicle-physics lineage, newest first:

```text
docs/116_m9_22_pedal_torque_hud.md
docs/115_m9_21_torque_protection.md
docs/114_m9_20_five_axis_tire.md
docs/113_m9_19_progressive_drift_calibration.md
docs/112_m9_18_load_proportional_one_k_tire.md
docs/111_m9_17_direct_robotized_mt.md
docs/110_m9_16_engine_power_diagnostic_selector.md
docs/109_m9_15_absolute_slide_one_k_tire.md
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/107_m9_13_full_screen_analog_touch.md
docs/106_m9_12c_extended_peak_diagnostic.md
docs/105_m9_12b_upward_tire_range_expansion.md
docs/104_m9_12a_centered_handling_comparison_ranges.md
docs/103_m9_12_independent_tire_calibration_axes.md
docs/102_m9_11a_steering_selector_test_range.md
docs/101_m9_11_simplified_travel_direction_steering.md
docs/100_m9_10_post_peak_sliding_tire.md
docs/99_m9_9_controllable_drift_foundation.md
docs/98_m9_8_selectable_production_vehicle_catalog.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
```

M9.22 document 116 owns read-only pedal torque graphics: canonical analog INPUT plus F/R output,
common full-throttle/summed-brake-capacity percent scales, and red for requested minus delivered.
No actuator lag is painted as protection; no delivered-total renormalization or mechanics change.
Brake capacities remain provisional profile data, not identified factory values.

M9.21 document 115 owns independent station TCS/ABS and bike-only support protection.
AWD requested split precedes independent TCS; delivered split may change, with no redistribution
and no shaft lock. All browser actors/replacements receive catalog protection. The lower constructor
remains explicitly unprotected by default for raw mechanics/diagnostics. Protection acts only through
actual wheel torque; support uses fresh geometry and the shared physical wrench, never pose clamps.

M9.20 document 114 remains current for tire law and browser tire calibration. It replaces the old G/P/S state and
P→2P lateral post-peak falloff with five authoring characteristics:

```text
GX .50..4.00 step .05 default 2.50    key H forward-cycles
PX 1..60% step 1 point default 8%     key J forward-cycles
GY .50..4.00 step .05 default 2.20    key G forward-cycles
PY 1..60% step 1 point default 10%    key L forward-cycles
KNEE .10.. .95 step .01 default .74   key N forward-cycles
```

Each selector also has explicit `− / value / +` UI controls. One axis change preserves the other
four displayed characteristics. Authoring compiles to `muX/muY/kX/kY/rhoKnee` with
`k=(2-knee)*G/P`. Runtime force code consumes only the resolved station characteristics. `kx=ky`
is not imposed. Front/rear equality is provisional composition, not a tire-law restriction.

The tire uses one current-load-proportional demand and one monotone C1 capacity ellipse. No S,
post-peak drop, tire memory, drift phase, target beta, hidden force, speed correction, vehicle-kind
branch or drive-layout branch exists. M9.18 load proportionality and contact/recovery boundaries
remain retained. Document 115 supersedes only the inactive-TCS control boundary, not the tire law.
Power-over drift is no longer a product goal; inertia entry/correction/exit remain. Tire calibration
and front/rear tire differences are paused, not certified complete.

Current steering law remains M9.11:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only. Browser steering comparison remains D=10..20° default12°, M=50/55/60/65/70°
default60°, ACT=.20/.225/.25/.275/.30s default.25s. M9.13/M9.14 retain full-viewport relative
analog touch and exactly 64 CSS px full-scale travel. Held analog touch may apply DIRECT; release
uses the existing actuator rate. Keyboard driving remains digital/rate-limited.

M9.17 owns direct wheel-derived RPM, instantaneous robotized-MT ratio selection and one rev limiter.
M9.16 retains the instance-owned ENG selector 1/1.5/2/3/4, default1. Do not turn ENG into direct body
force or speed preservation.

M9.9 retains the product principle: **uncontrollable slide is forbidden; controllable drift is
allowed**. Product handling acceptance emphasizes ordinary entry, correction, useful transient
travel, quantified speed loss and exit. Steady circles are diagnostics, not a requirement for
perpetual high-speed drift.

Current continuation context:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_22.md
```

Reasoning and rejected hypotheses:

```text
docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md
```

These are navigation/research context and never override numbered authority, source, tests or Git.

## 3. Design priority and mandatory Architecture Decision Gate

Optimize in this order:

1. architectural simplicity;
2. one clear authority per concept;
3. mathematical consistency with frozen pseudo-3D/vehicle invariants;
4. implementation simplicity and period-plausible computation;
5. feature convenience.

Do not add an ad hoc patch merely because a symptom disappears. Before any non-trivial change,
answer:

1. Which existing layer owns the decision?
2. Can an existing primitive express it without a new abstraction?
3. Would it duplicate state, coordinate truth or authority?
4. Would it add product/mode/vehicle/route/stage special-casing to a lower layer?
5. Can authoring, compilation or composition express it more cleanly?
6. Which frozen/current invariants must remain true?
7. Which causal regression prevents the boundary from drifting later?

Prefer deleting duplicate authority or generalizing an existing primitive over adding another
controller, compatibility shim or hidden exception.

## 4. Frozen renderer / world invariants

Do not change these without a new explicit normative addendum:

- World X/Y/Z is authoritative for vehicle physics; motion is free in world space.
- Renderer depth is exactly `d = s_render - s_camera`; no course modulo, Euclidean distance,
  camera-space-Z replacement or lateral contribution.
- Same `d` means same scale; same `d` plus same height means same screen Y.
- Raster Segment road geometry and the <=10° interior Raster turn limit remain.
- Guide is coordinate/camera support, not a replacement polygon road renderer.
- Terrain and World Sprites share one far-to-near Painter; no z-buffer.
- No perspective-correct road textures, arbitrary runtime sprite rotation or alpha blending.
- Camera roll remains zero.
- GroundMap visual semantics and SurfaceMap physical support remain independent.
- Open is the general runtime model; cyclic behavior requires explicit upper-level topology.
- Player metric presentation remains 2.0m=80px, 1m=40px, f=200px, D_cam=5m.

## 5. Vehicle / tire invariants

- One common two-station vehicle solver serves all nine profiles.
- Current authoritative motion is world position/velocity, body orientation/rates, wheel Ω,
  steering actuator/front steer and powertrain state.
- Tire force is algebraic and state-free. Wheel Ω remains wheel state; do not add tire memory merely
  to improve feel.
- Current normal load is the sole load input to tire demand/capacity. Zero valid load means zero
  tire force; no positive stiffness or friction floor.
- Tire contact force must be dissipative with respect to contact slip and remain within its authored
  capacity ellipse.
- The scalar implicit wheel solve must retain finite bracketing and a unique monotone residual.
- Front/rear current equality is authoring/composition, not a lower-law branch. Genuine future
  station-specific tire data must be explicit data, not a hidden drive-layout compensator.
- Permitted wheelies/stoppies remain physical. Inverted support is rejected and gameplay recovery
  handles overturn. Do not hide qTravel failures with clamps.
- M9.21 TCS/ABS and support protection act only through reduced real drive/brake torque. They must
  not write beta, yaw rate, pitch, body velocity, tire force or load directly. Preserve independent
  station control and the requested-vs-delivered distinction; no removed torque redistribution.

## 6. Source-boundary rules

General `src/**` must not depend on `src/dev/**`. Only these explicit browser composition roots may
assemble DEV fixtures:

```text
src/main-linear.ts
src/main.ts
src/main-circuit.ts
```

Keep route/topology decisions out of renderer and tire mechanics. Keep camera/presentation out of
physics authority. Do not recreate retired source paths as compatibility re-export shims.

GitHub Pages uses one commit-versioned complete ESM build path. Do not weaken that cache-coherency
mechanism. Visible milestone labels must remain synchronized with package metadata.

## 7. Testing rules

Run the complete repository suite for every implementation milestone and release candidate:

```bash
npm ci
npm test
```

A bug fix must test the causal failure, not merely the desired final picture. Do not weaken valid
regressions to make a new design pass. When a later numbered authority explicitly supersedes an
old-law contract, document that supersession and replace it with tests for the retained causal
invariants; never silently skip it.

For M9.20, preserve tests for five-axis independence, pure-axis capacity onset, capacity ellipse,
dissipation, load homogeneity, zero contact, signed wheel roots/brake atom, station independence,
calibration lifecycle, UI/HUD/selector behavior, finite transient probes and all-nine integration.
Do not convert a diagnostic steady circle into proof of human handling or useful course distance.

## 8. Git / PR / release contract

Never implement directly on `main`.

For each milestone/hotfix:

1. Re-fetch `main` and record exact SHA.
2. Create a feature branch from that exact SHA.
3. Implement the smallest coherent change and causal regressions.
4. Open a PR to `main`.
5. Obtain a complete green CI on the exact feature-head SHA.
6. Apply `docs/validation/README.md` standalone-record policy. Normative authority changes require
   an immutable validation record after the implementation/doc/test head is green.
7. Run the complete suite again on the validation-inclusive exact head.
8. Re-fetch `main`; release only when `ahead_by>0`, `behind_by=0`, merge base=current main.
9. Move `main` to the validated exact SHA with `force=false`; do not create an extra merge commit.
10. Verify `main SHA == PR head SHA == PR merge SHA`.
11. Verify the main-push workflow on the same SHA, including Pages build/deploy when applicable.
12. Verify the Pages artifact carries the same SHA/versioned build before claiming deployment.

Never release an unvalidated SHA, force-update main as normal procedure, or rewrite historical
validation evidence to describe a later release.

## 9. Takeover procedure

A fresh agent must:

1. Read this file completely.
2. Read `README.md` and `docs/README.md`.
3. Read the current handoff `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_22.md` as navigation.
4. Read 116 for the HUD; for control/handling start at 115 then 114 and retained
   112/111/110/101/108/107 and relevant historical lineage only as needed.
5. Read current implementation/types/compiler and causal tests.
6. Re-fetch current main/open PR/CI/Pages before work.
7. Preserve current repository evidence over any stale handoff statement.

Older M9.21/M9.20/M9.19/M9.18/M9.12C/M9.6/M8.0/migration handoffs are historical after M9.22. Do not repeat
migration cleanup ceremonies unless migration itself is the task.
