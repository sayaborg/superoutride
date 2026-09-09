# Current core cleanup audit

Scope: repository code, tests, build/deployment wiring, active documentation and next-task readiness. This audit starts from released main `fa2a3bfbc73785d1975d1f5b94b3a31b6e98cef8`. It preserves the player's current calibration. Documentation was reduced from 291 files (7,985,247 bytes) to eight current topic/index/checkpoint files (about 45 KB). Previous reports/specification revisions are retained in Git history, not duplicated here.

## Findings and decisions

| Finding | Current resolution / evidence |
| --- | --- |
| Suspension travel exceptions could escape before the browser's recovery step and stop subsequent animation frames | Gameplay catches only `VehicleOutsideModelError`, reconstructs via existing recovery and returns its reason to the existing progress-resync path. A 30 m/s coast into a 2 m rise over 5 m reproduces failure even with the old recovery sequence; car and bike now continue after recovery. |
| Invalid Guide seeds were silently replaced by global nearest projection | Known local coordinates are required. Invalid seeds fail, preventing hidden selection of an overlapping circuit copy. Existing multi-lap/recovery regressions retain physical continuity and progress coverage. |
| Automatic steering, rack coefficient and inverse wheel torque were recomputed unnecessarily | Hoist per-update invariants, share the rack expression and reuse the unchanged TCS torque bound. Exact serialized wheel/turning/pedal traces match the released solver. |
| Vector normalization could silently substitute an arbitrary axis for zero/nonfinite geometry | Invalid vectors and nonfinite world projection now fail explicitly; valid contact degeneracy keeps its existing zero-force rule. |
| Invalid route-choice lookup used exceptions as ordinary control flow | A direct optional lookup rejects unknown transitions; unrelated faults stay visible. |
| Empty input update calls ran every fixed step | Removed the no-op wrapper; input remains event-driven and shared arbiters remain authoritative. |
| Obsolete trial vehicle, three camera variants and two old renderers compiled alongside current mechanics | Removed seven modules. Retained useful terrain/sprite/footprint tests with static poses and the current renderer; removed the superseded camera-lag test. |
| A foundation compiler still imposed a closed-course half-lap draw-distance limit on open paths | Removed the obsolete length relation; draw distance still must be positive finite, while runtime visibility clips to the open endpoint. Added long-view and invalid-distance checks. |
| Current state required navigating chronological design, research, handoff and validation files | Consolidated retained normative contracts into topic documents, one restart file and this current audit. Replaced history-preservation/hash requirements with current link/encoding checks, real behavior tests and exact reference traces. |

## Architecture gate

The changes belong to existing gameplay recovery, physics evaluation, input event wiring, compiler validation and documentation. They reuse the current recovery reconstruction, rack function, inverse wheel equation, renderer and open visibility rules. No new vehicle/mode branch, coordinate authority, feedback state or force clamp is introduced. Raw physics still reports finite-domain exits; only gameplay chooses recovery. Existing root recovery branches suppress route/race observation and preserve validated progress. The retired implementations are replaced by ordinary data fixtures, not compatibility shims.

## Verification

Local full suite: 858 tests passed. Paired Node.js 24 arm64 measurements (one warm-up per build, five alternating measured pairs) gave median 2359 ms for the released reference and 2291 ms for the candidate, about 2.9% less elapsed time for the full exact-trace probe, including serialization. This is a small same-host improvement, not an FPS claim. Rendering pixel/workload comparisons remain exact.

Release additionally requires exact-head CI; see [development](development.md). The same-host immutable reference comparison covers nine profiles, 1,152 signed wheel cases and straight/turning pedal sequences at 60/120/240 Hz with no schema masking or numerical tolerance. Focused crest recovery, error propagation, overlapping-copy, rendering and compiler regressions cover the changed boundaries.

## Limits and next work

Interactive browser inspection was unavailable during this audit because the host Mac was locked. Local renderer pixel tests and browser wiring/input tests passed; deployed version/artifacts are checked separately during release.

The audit is a code/test review, not a proof over every possible state or a target-phone certification. The core remains a two-station game model with finite suspension travel, local tangent-plane support and conservative front-slip steering control. Torque-support infeasibility and recovery are explicit outcomes. Handling remains `DEV_UNCALIBRATED`; [calibration](calibration.md) lists open acceptance work. [NEXT](NEXT.md) is sufficient to start visual, sound and game-system work without earlier chat attachments.
