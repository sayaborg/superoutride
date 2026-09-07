# Simplification audit implementation ledger

Working queue, not normative game design. Scope is the 2026-09-07 V2 external audit,
checked against repository authority; do not require that external download to resume.
No provisional game-mode/roster design is recorded here. Handling remains DEV_UNCALIBRATED.

## Disposition of every finding

| Finding | Status / evidence or next action |
|---|---|
| P0 known-coordinate initialization | RELEASED: PR #144, b70f245; known-guide-coordinate tests and immutable hotfix record. |
| P1 checked tire/wheel core | IMPLEMENTED candidate: private force path shared by forward/inverse roots; retain checked public call boundaries and exact root algorithm. |
| P1 Guide candidate arrays / duplicate sampling | IMPLEMENTED candidate: same ordered contiguous candidates; one plan sample per surface observation. |
| P1 duplicate placement segment scans | IMPLEMENTED candidate: use existing Core Guide sampling's segment ownership. |
| P1 common browser/player shell | RELEASED: PR #146, 8ee9fedd; 840 tests, main CI 34156117814, inspected Pages artifact/public version. |
| P2 compiled profile normalization | TODO: resolved stations own wheel/brake/suspension data; unchanged authored numbers. |
| P2 renderer workload opt-in | IMPLEMENTED candidate: optional workload observation, single-pass road-view filtering; exact reference pixels/metrics and browser probe. See RENDER_DIAGNOSTICS_DECISION.md. |
| P2 body basis reuse | IMPLEMENTED candidate: same substep body used before/after rack update. |
| P2 final-substep telemetry | IMPLEMENTED candidate: output-only publication once, exact observed outer result. |
| P2 delivered total arithmetic | RETAIN: mathematically equivalent sum may change floating-point rounding; no need to alter it for cleanup. |
| P2 no-op torque copies | IMPLEMENTED candidate: unchanged immutable request returned directly. |
| P3 open-domain validation | TODO: inventory tolerance/endpoint semantics before centralizing; no generic helper campaign. |
| Runtime local-search failure policy | SEPARATE DECISION: do not silently change moving-vehicle fallback in a behavior-identical refactor. |
| Course identity / runner mapping / optional bindings | TODO: one lightweight catalog, route-kind runner mapping; test additional entries without new mechanics. |
| Course vs session rival cardinality | TODO: move cardinality to session composition, preserve existing defaults and physical gate policy. |
| Rival identity/presentation | TODO: composition data owns catalog choice, same solver; no new roster product policy. |
| Vehicle content vs mechanical compiler / open ID | TODO: product data above compiler, synthetic additional ID regression. |
| Vehicle presentation and optional bindings | TODO: catalog/binding authority, not mechanical identity. |
| Multi-actor browser performance | MEASURED local 1/4/8/17 actors with full solver and Painter; target-device/all-course acceptance still OPEN. Reproducible browser-performance tool and scope in RENDER_DIAGNOSTICS_DECISION.md. |
| Course/vehicle/session extensibility and import-boundary checks | TODO with owning structural changes. |
| Wheel bisection 60 -> 40 | HOLD: separate numerical experiment, not required for exact cleanup; retain 60. |
| Branching final rival route-choice policy | HOLD: preserve current explicit FIRST_PHYSICAL_CROSSING_LOCKS; do not enable a new product rule. |
| Brake capacity/bias acceptance | OPEN prerequisite to core-complete claim; profile values remain provisional, no retuning in cleanup. |
| Combined steering/braking acceptance | OPEN prerequisite to core-complete claim; existing causal report/tests are not all-course acceptance. |
| Terrain/support envelope | OPEN prerequisite to core-complete claim; retain existing failure evidence, no clamps/fake support. |
| Core freeze/completion declaration | NOT CLAIMED: depends on explicit acceptance of the three preceding envelopes. |
| Tire calibration / station differentiation | PAUSED in current authority, unchanged. |
| Lazy course loading | CONDITIONAL: only if content-loading cost justifies it; not a mandatory abstraction. |
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
