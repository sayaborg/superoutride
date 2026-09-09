# Current repository and vehicle-freeze audit

Scope: repository-wide consistency and ownership review, with detailed examination of the common vehicle model before freezing mechanics/control structure. Parameter calibration remains open. The audit started from the fetched, CI-green main and used a feature branch; the repository is the only restart authority.

## Coverage and method

The starting inventory contained 324 tracked files: root/configuration, the release workflow, eight topic documents, 162 source-tree files, 133 test-tree files and 12 diagnostic/build tools. All tracked text was decoded, TypeScript/JavaScript parsed, JSON read and function duplication scanned. Source/type/compiler review followed the dependency layers; the complete executable suite covers the maintained DEV fixtures and integration scenarios. Generated dependencies, dist and local reports are derived work products, not additional project authorities.

Manual scrutiny concentrated on force/contact equations, signed wheel balance, steering and torque constraints, profile ownership, route transactions, recovery, geometry/source boundaries, and actual browser composition. This is a broad engineering audit with causal tests, not a proof that every possible state is defect-free.

## Architecture decisions

- Mechanics owns force and integration; compilation owns valid immutable parameters. Copy nested profile data after validation. Do not alter force laws, parameter values, wheel/body velocity or position to hide defects.
- Core owns Raster/Guide geometry and coordinate arithmetic. Gameplay Guide charts delegate to that primitive. Preserve circular provenance in copied overlap vertices; keep numerical join tolerance local to adjacent segments.
- One oriented world-gate primitive owns crossing geometry. Race and route layers attach their semantics to it. A sign change must not disappear inside an epsilon dead band; width tolerance is independent.
- Stage continuation compilation examines every participating straight/arc interval, rather than five fixed points. It owns geometric rejection before a handoff can be assembled.
- Composition roots own recovery/replacement and camera synchronization. No new vehicle, route or mode branch enters the general solver/renderer.
- Shared fixed regression content belongs in a test helper. Consolidating identical fixture constructors changes no authored values or assertions.

The frozen world pose, chainage depth, metric, single Painter, open source domains, DEV dependency direction and physical progress authority remain intact.

## Findings resolved

| Failure or duplication | Correction and executable coverage |
| --- | --- |
| Vehicle selection recovered the player but left the branching/circuit camera at its prior position until a fixed tick; an intervening frame threw in projection and stopped animation | Reconstruct camera in the selector callback. [Actual root lifecycle tests](../tests/browser-player-replacement.test.mjs) exercise all four course queries with no elapsed physics time |
| Three gate detectors could miss a complete forward/reverse crossing composed of tiny steps | Share the oriented world-gate detector; exact sign-side test with once-only plane arrival. [Gate regressions](../tests/physical-gate-boundary.test.mjs) |
| Validated profiles still referenced mutable nested actuator/powertrain authoring | Frozen snapshots of rates, gear ratios and torque points. Missing actuator channels rejected explicitly. [Profile boundary tests](../tests/vehicle-profile-boundary.test.mjs) |
| DIRECT input bypassed finite steering/time validation; invalid pedal mode could partially mutate actuators | Validate canonical requests/modes before writing actuator state. [Actuator tests](../tests/m9-0-driving-actuator.test.mjs) |
| Straight Guide compilation skipped metric-option checks; Raster accepted nonfinite coordinates/radii and exposed mutable nested geometry | Validate the common boundary independent of curvature and freeze compiled geometry. [Geometry tests](../tests/compiled-geometry-boundary.test.mjs) |
| A roundoff-size fillet gap made binary lookup fall through to the final Guide segment | Retain the adjacent segment under the existing sample tolerance. [Curve-boundary test](../tests/raster-successor-boundary.test.mjs) |
| Five-point overlap checks skipped local mismatches; successor copying discarded circular-source radius; nonfinite generation dimensions could reach loops | Partition by both charts' primitive boundaries, preserve radius provenance and validate finite generation data. [Overlap](../tests/stage-continuation-boundary.test.mjs) and [successor](../tests/raster-successor-boundary.test.mjs) regressions |
| Route observations could mutate graph entries; color coercion hid invalid GroundBase authoring | Freeze compiled stage/choice entries; share GroundBase validation/copying before any coercion. [Content tests](../tests/compiled-content-boundary.test.mjs) |
| Wheel bisection recomputed an unchanged contact reference speed every trial | Compute it once per scalar solve. Reject negative rolling resistance, which invalidates the torque bracket. [Exact trace tests](../tests/hot-path-equivalence.test.mjs) |
| Fourteen identical parent-content constructors and duplicated DEV transition-gate authoring | One [fixed test fixture](../tests/helpers/stage-parent-fixture.mjs), one shared DEV gate factory; existing route assertions retained |

The obsolete M8.3 reference-identity assertion is explicitly superseded in [vehicle physics](vehicle-physics.md): equal settings require equal values, not a shared mutable source object. Its common-value/common-solver checks remain. No historical physical behavior test was weakened to accommodate a different law.

## Vehicle freeze assessment

The two-station solver, unilateral spring/damper contact, elliptical dissipative tire map, implicit signed wheel root, direct automatic gearing, input-only torque protection, automatic steering and analytic driver-offset limiter agree with the responsible specification. Wheel reaction and force/moment assembly have one shared implementation. CAR/BIKE distinctions stay in profiles/presentation; HUD and lean remain observations.

Existing coverage includes 20,000 tire-characteristic samples for boundedness, symmetry and nonpositive slip work; signed wheel roots and static braking; flat/grade/crest/recontact and zero-grip cases; drive/brake envelopes for all nine vehicles; time-step refinement; recovery without awarded progress; and structural dependency checks. Local-plane support protection retains its stated limitations: its bounded search does not establish global monotonicity, global optimality or arbitrary-terrain stability.

Mechanics/control structure is now explicitly frozen in the current specification and restart documents. All physical formulas and current handling parameters remain unchanged by this audit. Structural defects found later require a documented causal correction, never a disguised parameter/force patch.

## Verification and performance

- `npm install` and complete `npm test`: **884 passed** (861 starting tests plus 23 new regressions). Reproduced the principal failures before their fixes, including three actual browser-root crashes, tiny gate crossings, mutable compiled data, skipped overlap bends, radius loss and Guide join fallthrough.
- With an immutable pre-change build supplied as `HOT_PATH_BASELINE_BUILD`, complete serialized traces are identical for all nine profiles at 60/120/240 Hz, including 1,152 signed wheel cases. CI retains the previously pinned immutable baseline.
- Renderer geometry, metric, pixel-equivalence and workload tests pass. Baked GroundMap JSON and binary compare byte-for-byte with the starting build.
- Local in-app browser: all four course selectors, RC30 replacement and displayed road/player/HUD inspected; no console errors observed. Deterministic no-tick scheduling is covered separately by the actual-root tests.
- Node.js 24.18 arm64: one warm-up per build, five alternating measured pairs using [hot-path probe](../tools/hot-path-probe.mjs). Median reference **2326 ms**, candidate **2089 ms**, about **10.2% shorter**. Every run produced the same complete-trace hash. This includes simulation and serialization; it is not browser FPS or a target-phone promise.

To reproduce, build a separate immutable reference checkout, supply its complete dist directory via `HOT_PATH_BASELINE_BUILD` for the full suite, then call `runHotPathProbe(referenceDist)` and `runHotPathProbe('dist')` once each to warm up and five times each in alternating order. Compare hashes before interpreting median timings. Keep generated logs outside the source tree.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. The earlier specification wording overstated current automated coverage; [architecture](architecture.md) now distinguishes the unchanged validity requirement from this compiler gap. New content must not be certified from vertex/fillet checks alone; intentional unfolded circuit overlap needs topology-aware classification above Core.

Per-vehicle/front-rear calibration, coast/turn oscillation acceptance, combined-input/changing-terrain acceptance and real-phone performance/input testing remain open in [NEXT](NEXT.md). These are not claims of completed physical accuracy or device acceptance.

Exact-head PR/main/Pages release evidence is recorded by GitHub Actions and refs under [development](development.md). No source file embeds its own commit SHA or becomes a release-history archive.
