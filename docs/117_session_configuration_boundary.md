# Session configuration / course structure boundary

Status: normative ownership clarification. Supersedes document 61 only where
CourseModeAuthoring.rivalCount owns cardinality. No gameplay rule, roster default or physics changes.

## Contract

CourseModeAuthoring/Profile own route structure and its retained route/finish/field-choice rules.
SessionConfiguration owns rivalCount, excluding the player, and is compiled separately. The current
0..16 integer validation envelope moves intact to that boundary. Its constant does not enter
physics, renderer, route ticks or roster iteration. A future envelope revision changes this upper
validation authority, not a lower engine branch.

createRivalRoster consumes only the compiled session configuration. The same course profile can
be paired with zero, one or sixteen rivals without being recompiled or modified. A session has no
route-kind copy; course profiles have no rivalCount compatibility field or forwarding getter.

All historical/current DEV counts are preserved in separate named session fixtures beside their
existing course fixtures. Public LINEAR/BRANCHING remain zero rivals; TSUKUBA/FISCO remain one.
Historical IDs are preserved as opaque fixture identities, not parsed for configuration.
FIRST_PHYSICAL_CROSSING_LOCKS and RECOVER_TO_LOCKED_BRANCH are unchanged. No paused product rule,
Traffic setting, play-mode policy, start rule or handling calibration is introduced here.

## Architecture Decision Gate

1. Session composition owns cardinality; course structure owns topology/physical progression.
2. Reuse the existing roster and variable actor loops, moving only their small configuration input.
3. Delete the course count field; no duplicate state, route-kind copy or compatibility authority.
4. Add no vehicle/mode/course/count branch to physics, camera, renderer or generic route tick.
5. Select session data at composition roots; keep current authored geometry/recovery and tick order.
6. Preserve open Core, finite circuit windows, validated physical gates, world continuity and metric.
7. Exercise every route form with 0/1/16 rivals using one unchanged course object; retain historical
   fixture counts, browser wiring and existing 0/16-actor physical arbitration regressions.

## Evidence policy

This explicitly changes a numbered ownership boundary. Under validation/README.md, a standalone
validation record is required after an initial complete green implementation/doc/test CI; the
validation-inclusive exact head must receive a fresh complete green run before release.

Initial exact-head evidence and the final-release verification contract are preserved in
[SESSION_CONFIGURATION_BOUNDARY_VALIDATION.txt](validation/SESSION_CONFIGURATION_BOUNDARY_VALIDATION.txt).
