# SUPER OUTRIDE — M9.22 Repository-only Continuation

Navigation only, not a second design authority. Last navigation review: 2026-09-07.
The filename retains the milestone's original date. Repository source, scoped numbered documents,
tests and freshly fetched Git/CI take precedence over this summary. No earlier conversation,
session download, external workspace or remembered parameter is needed to resume.

## 1. Start here and establish the actual checkout

Read [AGENTS](../AGENTS.md), [project README](../README.md), [authority index](README.md), then this
handoff. Use the ownership map below to read the relevant numbered authority, implementation and
causal tests completely before changing behavior. Do not reread every historical milestone by default.

From a repository checkout, inspect before creating the next feature branch:

```sh
git status --short
git fetch origin
git rev-parse HEAD origin/main
git log -5 --oneline origin/main
gh pr list --repo sayaborg/superoutride --state open
gh run list --repo sayaborg/superoutride --branch main --limit 5
```

Record dirty files and HEAD/origin/main differences; do not discard another worker's changes.
Use GitHub repository/PR/workflow reads when local networking is unavailable. A former source ZIP
is not a substitute for the current source. Some connector commit-workflow queries list PR runs
only: inspect the main-branch PUSH workflow separately. Match its head SHA, not just its run number.
The release contract remains AGENTS section 8; this navigation does not change it.

## 2. Published implementation baseline — already released, not a pending PR

These are checked historical facts about the M9.22 behavior release, NOT a self-updating latest-main
pointer. This documentation cleanup and subsequent changes may advance main beyond this SHA.
Re-fetch first; do not reset a newer checkout to this baseline or reopen the completed HUD task.

| Evidence | Checked result |
|---|---|
| M9.22 behavior release | `628b3bed6ade4992a05ce3f453e0a2d904a8c1bd` |
| PR | [#142](https://github.com/sayaborg/superoutride/pull/142), merged by pure non-force fast-forward |
| Identity | main at release = PR head = PR merge SHA |
| Implementation/doc/test CI | #852, run `34035234036`, build `101491970171`, pre-record head `c8c5ccac17d59f77632e239f0e1e699b9c2c8820`, 828/828 |
| Record-inclusive PR CI | #853, run `34035413365`, build `101492454662`, release SHA, 828/828 |
| Same-SHA main CI | #854, run `34036493516`, build `101495406632`, 828/828 |
| Pages deployment | job `101495723441`, artifact `9990355882`, release SHA; success at 2026-09-06T13:36:43Z |

All three full suites used Node 24.20.0/npm 11.19.0 and had zero failed/cancelled/skipped/todo tests.
The [immutable validation record](validation/M9_22_PEDAL_TORQUE_HUD_VALIDATION.txt) deliberately
names the pre-record head; the later green runs above close that release, not an unfinished step.
The PR retains final release evidence. [Validation policy](validation/README.md) explains why the
immutable record must not be rewritten to refer to its own subsequently created commit.

The actual Pages ZIP was verified as 1,263,611 bytes with SHA-256
`0df93500e20053b4da86a5d14a9837718f575fc1c6640c1707bee1931699d256`.
Its version.txt and complete versioned build matched the release. Of 168 compiled files, only
browser/vehicle-debug-hud.js differed from the prior behavior release; CSS was unchanged and HTML
changed only milestone labels. Artifact retention is finite: expiration later is not deployment
failure. Use the newly published artifact for a new release; do not depend on this ZIP being retained.

The release check did NOT establish a successful live-browser input/layout test or fresh public-CDN
fetch: local browser loading was blocked and public access failed DNS. Drawing reconstruction and
CI are not interactive usability evidence. Preserve that distinction when resuming.

## 3. Scope ownership and exact implementation/test entry points

Read newest explicit supersession within each scope. Document 116 does not replace 115 mechanics,
and document 98's historical tire/steering/launch descriptions must not revive superseded laws.

| Scope | Authority | Source and causal regression entry points |
|---|---|---|
| Pedal graphics | [116](116_m9_22_pedal_torque_hud.md) | [shared HUD](../src/browser/vehicle-debug-hud.ts), [HUD tests](../tests/m9-22-pedal-torque-hud.test.mjs) |
| TCS / ABS / bike support | [115](115_m9_21_torque_protection.md) | [torque protection](../src/physics/torque-protection.ts), [integration and telemetry](../src/physics/arcade-vehicle-physics.ts), [control tests](../tests/m9-21-torque-protection.test.mjs) |
| Tire / wheel law | [114](114_m9_20_five_axis_tire.md), retained [112](112_m9_18_load_proportional_one_k_tire.md) | [tire and wheel](../src/physics/tire-wheel.ts), [calibration compiler](../src/physics/tire-friction-calibration.ts), [browser choices](../src/browser/tire-friction-selection.ts) |
| Contact / load / wrench / recovery | 115 and 112 within retained [87](87_m9_0_two_station_arcade_vehicle_dynamics.md) | [contact](../src/physics/vehicle-dynamics.ts), [shared wrench](../src/physics/vehicle-wrench.ts), [recovery](../src/gameplay/recovery.ts) |
| Vehicle identity / brake capacity / drive split | [98](98_m9_8_selectable_production_vehicle_catalog.md), with 115's delivered-torque boundary | [profiles and compiler](../src/physics/vehicle-profiles.ts), [catalog and protection composition](../src/vehicle/vehicle-catalog.ts) |
| Engine / gearbox / ENG | [111](111_m9_17_direct_robotized_mt.md), [110](110_m9_16_engine_power_diagnostic_selector.md) | [automatic powertrain](../src/physics/automatic-powertrain.ts) |
| Steering / input response | [101](101_m9_11_simplified_travel_direction_steering.md), [107](107_m9_13_full_screen_analog_touch.md), [108](108_m9_14_compact_touch_expanded_diagnostic_ranges.md) | [canonical input](../src/input/driving-input.ts), [actuators](../src/physics/driving-actuator.ts), [touch](../src/input/touch-input.ts) |
| Integration / publication | [AGENTS](../AGENTS.md), [validation policy](validation/README.md) | [boot](../src/boot.ts), [LINEAR](../src/main-linear.ts), [BRANCHING](../src/main.ts), [CIRCUIT](../src/main-circuit.ts), [Pages workflow](../.github/workflows/pages.yml) |

Frozen rendering/metric/topology remains indexed in [README](README.md). General mechanics is the
current common two-station model, not a historical separate motorcycle/quaternion implementation.
Cars' F/R channels are aggregate axle stations, not four independently modeled wheels.

## 4. Decisions to retain

**HUD is RELEASED.** Both ACCEL and BRAKE show canonical analog INPUT plus delivered F and R.
Cyan is delivered; red is requested minus delivered; their combined length is the pre-protection
request; the remainder is empty. Capacity ticks are profile-derived. INPUT/actuator lag is not red.
Read 116 for normalization and zero-reference rules: no delivered-total renormalization, no per-axle
100% rescaling, no powertrain call from drawing. Percentages are torque-equivalent, not tire force,
hydraulic pressure, actual throttle-valve opening or the percentage of available road grip.

**Protection is RELEASED, handling is DEV_UNCALIBRATED.** TCS is independent at driven stations;
ABS is independent at front/rear stations. Bike-only support prevention is separate from slip
protection, with one delivered-torque owner. AWD first distributes requests, then independent TCS
may change the actual split. Removed torque is not redistributed; the shafts are not locked.
No ESC, target beta or direct body/wheel-state correction was introduced.

**Brake capacity/bias is OPEN, not silently calibrated by ABS.** In vehicle-profiles.ts, front and
rear maximum brake torques are direct provisional engineering seeds (98 section 6), not identified
factory/hydraulic values. One brake actuator multiplies each maximum before protection; the ratio
of maxima is the basic requested torque split. ABS/support may change delivered amounts. The HUD
uses their fixed SUM as 100%; it does not select a new braking policy. Capacity derivation and bias
review are separate work, not a prerequisite to republishing the completed UI.

For an up-to-date inventory after building, derive values from the catalog rather than maintaining
a second hand-entered table. Run this from the repository root:

```sh
node --input-type=module <<'JS'
import { VEHICLE_CATALOG } from './dist/vehicle/vehicle-catalog.js';
console.table(VEHICLE_CATALOG.map(({ profile: p }) => {
  const total = p.frontBrakeTorqueMax + p.rearBrakeTorqueMax;
  return {
    id: p.id, frontNm: p.frontBrakeTorqueMax, rearNm: p.rearBrakeTorqueMax,
    frontPercent: total > 0 ? 100 * p.frontBrakeTorqueMax / total : null,
    rearPercent: total > 0 ? 100 * p.rearBrakeTorqueMax / total : null,
    driveFrontPercent: 100 * p.frontDriveTorqueFraction,
  };
}));
JS
```

A torque split is not generally the road-force split: radii and wheel dynamics also matter.
Do not infer real-brake provenance or suitable vehicle balance merely from the bars or ABS success.

**Tire calibration and front/rear tire specialization are PAUSED.** Retain browser defaults from
114 and source; do not promote exploratory candidates or the 4:1 research reference into defaults.
No current conclusion establishes that P=8% is optimal or that lateral grip must exceed longitudinal
grip. Front/rear equality is provisional composition, not a permanent lower-law requirement.

**High-speed drift acceptance is inertia-driven entry / useful sliding / correction / exit.**
Power-over and indefinitely sustained high-speed, high-angle circles are not product goals.
Deceleration is not itself failure; do not create missing power or force through protection.
These decisions do not imply that all lateral motion should be removed.

## 5. Open work — resume from evidence, not from an already completed investigation

This is a work queue, not authorization for a new controller or altered physical parameters.
Choose the next requested scope and pass AGENTS' Architecture Decision Gate before implementation.

| Status / task | Evidence already available | Next meaningful check |
|---|---|---|
| OPEN: interactive HUD acceptance | 116 and its 23 added regressions; publication checked above | Real supported browser, portrait/landscape and keyboard/touch: visibility, vehicle replacement, partial input, drive/brake transitions, cyan/red interpretation. Record browser/viewport/observed build SHA. |
| OPEN: brake capacity and basic split | 98, profile/compiler, live HUD; current maxima have no identified factory derivation | Audit provenance and choose an explicit sizing/bias criterion before retuning; compare useful braking, longitudinal slip and dynamic front/rear load, not only absence of lock. |
| OPEN: combined steering/braking controllability | [matched-state causal report](research/M9_21_BRAKING_YAW_CAUSALITY_2026-09-06.md), [180-row inventory](research/M9_21_BRAKING_YAW_120HZ.csv), [tests](../tests/m9-21-braking-yaw.test.mjs) | Matched coasting/partial/full brake and delayed correction are ALREADY implemented. Extend to requested curvature, road width, stopping/progress and correction margin before selecting a different braking/steering policy. |
| OPEN: terrain/support envelope | [terrain report](research/M9_21_TERRAIN_FALSIFICATION_2026-09-06.md), [90-row inventory](research/M9_21_TERRAIN_120HZ.csv), [tests](../tests/m9-21-terrain-protection.test.mjs) | Separate natural flight and inherited momentum from torque-caused lift; retain explicit qTravel/overturn/infeasible observations and existing recovery boundaries. |
| PAUSED: tire handling / station differences | [decision history](research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md) and 114 | Do not restart a parameter sweep merely to hide a braking/control problem. |

The matched-state report already shows early VFR braking-yaw growth with severe rear unloading,
before wheel lock or automatic-steering saturation. Removing bike support does not cure it and can
restore rear lift. Immediate steering-request release can reduce yaw, but delay matters and the
path/stopping distance changes. This is not a universal root-cause proof or a validated same-corner
solution. Read the report's limits before proposing rear-grip changes, larger M, ESC or brake cuts.

The terrain report retains both completed 45 m/s crest cases and failed 70 m/s stress cases. The
latter include qTravel exceptions and VFR overturn; a test that detects such a failure is not a
handling pass. Zero delivered torque cannot erase acquired pitch/vertical momentum. Do not hide
these results with recovery inside diagnostic runs, road adhesion clamps or relaxed limits.

The [research index](research/README.md) locates every retained report, inventory and reproduction
entry. Original M9.20 reports remain byte-preserved historical evidence, not current force/control
law. CSV summaries and runnable probes do not mean every former full-precision trace is stored.

## 6. Build, targeted checks and reproduction

Use Node >=24 <25 and the lockfile; do not update dependencies for a documentation task.
From the repository root:

```sh
npm ci
npm test
node --test tests/repository-hygiene.test.mjs tests/m9-22-pedal-torque-hud.test.mjs
node tools/torque-protection-probe.mjs --hz 120 --out protection.json
node tools/torque-protection-terrain-probe.mjs --hz 120 --out terrain.json
node tools/braking-yaw-probe.mjs --id VFR750R --capture --out vfr-braking.json
python3 -m http.server 8000
```

The first full test command cleans/rebuilds dist. Targeted tests require that build and do not replace
complete exact-head CI. The server serves the root page; follow [README controls](../README.md).
The terrain/braking tools receive explicit catalog protection. The older drift tool is unprotected
unless a policy is explicitly supplied; it does not certify protected product handling. Calibration,
material multiplier, initial speed, input path and sampling cadence must be named in comparisons.
Generated JSON above is local output, not a required missing repository input; do not overwrite
archived CSV/JSON to reflect a later experiment. Preserve new evidence separately when needed.

## 7. Maintenance and next release

Keep this current handoff as the single active continuation map already referenced by AGENTS and
the root README. Update its navigation/status with source-backed changes, not a second normative
parameter ledger. Keep earlier handoffs, numbered historical prose, validation records, original
research reports and their manifest bytes unchanged. No file move or compatibility stub is needed.

This cleanup changes documentation/navigation and their checks only, under unchanged 116/115/114.
It is not a new milestone or normative boundary, and does not require a new standalone validation
record under the existing policy. Its exact-head full CI and eventual main/Pages checks belong to
its own PR. The checked implementation baseline in section 2 remains historical after that release.

For future work: feature branch from freshly verified main, causal tests, complete exact-head CI,
apply the standalone-record rule, then non-force fast-forward only when merge base=current main
and behind=0. Verify main=PR head=PR merge SHA, same-SHA main PUSH CI, Pages deployment and actual
artifact/versioned build. Never report a live-browser pass from CI or an artifact alone. Report an
actual access restriction without bypassing it or treating a stale checkout as current.
