# Simplification audit implementation ledger

Working queue, not normative game design. Scope is the 2026-09-07 V2 external audit,
checked against repository authority; do not require that external download to resume.
No provisional game-mode/roster design is recorded here. Handling remains DEV_UNCALIBRATED.

## Disposition of every finding

| Finding | Status / evidence or next action |
|---|---|
| P0 known-coordinate initialization | RELEASED: PR #144, b70f245; known-guide-coordinate tests and immutable hotfix record. |
| P1 checked tire/wheel core | RELEASED #145: private checked-once root core; public boundaries retained; exact reference traces. |
| P1 Guide candidate arrays / duplicate sampling | RELEASED #145: same ordered contiguous candidates; one plan sample per surface observation. |
| P1 duplicate placement segment scans | RELEASED #145: existing Core Guide sample owns segment selection. |
| P1 common browser/player shell | RELEASED: PR #146, 8ee9fedd; 840 tests, main CI 34156117814, inspected Pages artifact/public version. |
| P2 compiled profile normalization | RELEASED #148: explicit runtime shape, station-only wheel/brake/suspension/tire fields; authored seeds and causal regression. |
| P2 renderer workload opt-in | RELEASED #147: optional observation, single-pass road-view filtering; exact reference pixels/metrics and browser probe. See RENDER_DIAGNOSTICS_DECISION.md. |
| P2 body basis reuse | RELEASED #145: same substep body used before/after rack update. |
| P2 final-substep telemetry | RELEASED #145: output-only publication once, exact observed outer result. |
| P2 delivered total arithmetic | RETAIN: mathematically equivalent sum may change floating-point rounding; no need to alter it for cleanup. |
| P2 no-op torque copies | RELEASED #145: unchanged immutable request returned directly. |
| P3 open-domain validation | RELEASED #149: four identical profile checks share one helper; strict SurfaceMap and Raster/Guide tolerances retained. See OPEN_PROFILE_DOMAIN_DECISION.md. |
| Runtime local-search failure policy | SEPARATE DECISION: do not silently change moving-vehicle fallback in a behavior-identical refactor. |
| Course identity / runner mapping / optional bindings | RELEASED #150: validated extensible catalog, route-kind runner map and root-only CIRCUIT factories; unbound extra-course mobile regression. #151 additionally preserves the explicit default when catalog order grows. |
| Course vs session rival cardinality | IMPLEMENTED #151: 117 moves count alone to SessionConfiguration, preserving public/historical counts and all physical gate rules; exact release identity is established by PR #151 and its validation-inclusive CI, not a self-reference here. |
| Rival identity/presentation | RELEASED #150: retained catalog choice; sprites derive its explicit metadata and shared output-only bank primitive, not hard-coded CAR. |
| Vehicle content vs mechanical compiler / open ID | RELEASED #148: product data above compiler, opaque validated ID and synthetic tenth-identity ordinary driving test. See VEHICLE_PROFILE_BOUNDARY_DECISION.md. |
| Vehicle presentation and optional bindings | RELEASED #150: catalog alone owns family, optional shortcuts with duplicate rejection; actual unbound tenth-vehicle mobile selection regression. |
| Multi-actor browser performance | MEASURED local 1/4/8/17 actors with full solver and Painter; target-device/all-course acceptance still OPEN. Reproducible browser-performance tool and scope in RENDER_DIAGNOSTICS_DECISION.md. |
| Course/vehicle/session extensibility and import-boundary checks | IMPLEMENTED with owning changes: unbound extra course/vehicle controls, synthetic profile, 0/1/16 sessions on each unchanged route form, mechanical import/ownership checks. |
| Wheel bisection 60 -> 40 | HOLD: separate numerical experiment, not required for exact cleanup; retain 60. |
| Branching final rival route-choice policy | HOLD: preserve current explicit FIRST_PHYSICAL_CROSSING_LOCKS; do not enable a new product rule. |
| Brake capacity/bias acceptance | OPEN prerequisite to core-complete claim; profile values remain provisional, no retuning in cleanup. |
| Combined steering/braking acceptance | OPEN prerequisite to core-complete claim; existing causal report/tests are not all-course acceptance. |
| Terrain/support envelope | OPEN prerequisite to core-complete claim; retain existing failure evidence, no clamps/fake support. |
| Core freeze/completion declaration | NOT CLAIMED: depends on explicit acceptance of brake, combined handling, terrain/support and target-browser performance envelopes. |
| Tire calibration / station differentiation | Player calibration resumed under120; bike CG calibration under123. Station differentiation remains deferred. |
| Lazy course loading | RETAIN current static module loading; root factories instantiate only selected content. No demonstrated loading problem justifies another loader/cache abstraction. |
| Historical fixtures/evidence, explicit cyclic adapters, support search and real trial physics | RETAIN intentionally: not dead code or duplicate authority. |
| Tiny validators / deploy-tree pruning | RETAIN: no demonstrated architectural/value benefit. |

## Hot-path Architecture Decision Gate

1. Guide owns candidate/segment selection; surface observation owns sampling; tire-wheel owns
   the unique force/root formula; torque-protection owns delivered torque; integrator owns body basis.
2. Reuse existing range ordering, GuideSample, shared force demand and substep body. No cache or solver fork.
3. Remove repeated work, not physical state. Effective tire characteristics remain immutable station data.
4. No course, vehicle, mode, actor or stage branch is added to lower layers.
5. No authoring/configuration change is needed to eliminate repeated computations.
6. Preserve world/free motion, open geometry, depth/metric, passivity/capacity, signed roots,
   60 wheel iterations, 12 support iterations, contact and physical progress/recovery contracts.
7. Exact deterministic trace comparison against released b70f245 at all nine / 60-120-240 Hz,
   randomized signed roots, malformed public inputs, causal Guide tests and complete suite.

This exact cleanup leaves numbered authority unchanged: PR exact-head CI is the release evidence;
no new standalone archive record is required under validation/README.md. Later structural changes
must apply their own Decision Gates and record policy. Never mark a held acceptance item completed
merely because it has been classified in this ledger.

## Structural closure and remaining acceptance

The authorized structural implementation queue is complete in PRs #144 through #151. The last
normative ownership change is backed by
[SESSION_CONFIGURATION_BOUNDARY_VALIDATION.txt](../validation/SESSION_CONFIGURATION_BOUNDARY_VALIDATION.txt).
Resolve #151's final validation-inclusive SHA, main/PR identity and Pages from GitHub before
describing it as published. No implementation or validation file can name its own final SHA.

Already checked publication evidence for the intervening releases:

| PR | Exact released main/feature SHA | Complete main/Pages run | Tests |
|---|---|---|---|
| #145 | b4d30c111f23622548206d7e6c354612952a9d21 | 34155115473 | 838 |
| #146 | 8ee9fedd472722a5a88af690bac93fa8abda52ef | 34156117814 | 840 |
| #147 | 566ae31ccf622a6ffa6fad59a40b6f1baf916d35 | 34157064705 | 842 |
| #148 | 9826a8851f3985501fdf9132e573fea3f5be9f5f | 34157560140 | 845 |
| #149 | 665347cc178aae582c2488086e280c48a02be94b | 34158162455 | 848 |
| #150 | 5283c8f0971b9a296b47bbfb4011e73675aba4a3 | 34158818831 | 851 |

Each listed Pages artifact and public version endpoint was inspected at the same SHA. These are
publication checks, not target-device handling/performance certification.

Remaining OPEN items are acceptance work, not cleanup silently declared finished: approved brake
capacity/bias criteria; combined braking/steering on the required course/speed envelope; supported
terrain/contact envelope; and required target devices/browsers/frame budget. Existing diagnostic
failures and DEV_UNCALIBRATED status remain visible. No arbitrary pass threshold, tire retuning,
new control policy or physics fidelity reduction is authorized by this cleanup. Establish the
required acceptance scope before declaring Core complete or changing those mechanics.

### Measured hot-path evidence

`node tools/hot-path-probe.mjs [build-directory]` compares reproducible complete outer-state/output
hashes plus 1,152 signed wheel-root cases across all nine profiles at 60/120/240 Hz. The baseline
was the verified published b70f245 artifact. Both builds produce
`f5fea70723004e8fbf754dd05fafb2fc07976a9b2f915009fad72009c66978c9`.
Node 24.18.0, same local host, one warmup and five alternating-order paired measurements:
baseline median 3151.37 ms; candidate median 2817.14 ms (about 10.6% less elapsed time).
This is a host/Node probe, not browser or 17-actor certification. No CI wall-time threshold.
Complete local suite: 838/838. Published status must be verified from exact-head CI/PR/Pages.

Hot-path release: PR #145, exact head/main b4d30c111f23622548206d7e6c354612952a9d21.
Feature CI 34154814613 and main/Pages CI 34155115473 passed all 838 tests.
The deployed artifact and public version endpoint were inspected at that SHA. The hot-path
candidate entries above are RELEASED; browser/structural work remains separate.

### Browser shell verification

The shared shell replaces duplicated browser wiring, not the three topology runners. DOM-event
regression exercises calibration, engine power, vehicle replacement, same-ID no-op, input
arbitration, camera and recovery callbacks. Existing source assertions now inspect the shared
owner; physical/integration assertions are unchanged. Local browser inspection confirmed LINEAR
rendering and Ferrari-to-RC30 replacement retaining GX 2.55 / ENG 1.5, movement-yaw selection and
manual recovery, with no captured console errors. This is wiring verification, not handling or
performance acceptance. See BROWSER_SHELL_DECISION.md for the seven-point gate.

CI attempt 34154460898 exposed the invalid assumption that the local Mac/Node hash would also be
the Linux/Node hash (837/838). The workflow now builds immutable b70f245 beside the candidate and
compares both on the same engine/host; no tolerance or replacement expected hash is introduced.
Set HOT_PATH_BASELINE_BUILD to a built b70f245 checkout for local cross-build comparison. Without
it the local test verifies repeatability; CI requires the explicit pinned reference. The baseline
checkout is test evidence only, never a shipped compatibility implementation.

Validation is eliminated inside root iterations, not by exporting an unchecked force/solver API.
Independent public calls (including protection trials) still validate their boundary inputs. An
additional prepared-context/cache abstraction is not justified by this measured gain; retain that
boundary unless later profiling demonstrates a reason to reopen it. Slip/demand/force equations
have one implementation, and malformed public inputs remain rejected.
