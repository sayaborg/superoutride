# Content and gameplay

## Composition and data ownership

[Boot](../src/boot.ts) selects one course query using the [course selector](../src/browser/course-mode-selection.ts). The catalog owns query-to-root membership; its typed content dispatcher requires the builders for that route kind. All roots use that dispatcher, and only the composition roots assemble concrete DEV content:

- [LINEAR](../src/main-linear.ts): finite highway trial.
- [BRANCHING](../src/main.ts): default open branching highway, field route choice and rivals.
- [CIRCUIT](../src/main-circuit.ts): Tsukuba or FISCO selection, finite runtime window and lap race.

The [driving shell](../src/browser/driving-shell.ts) owns common browser input, fixed-step scheduling, player replacement, selectors, HUD and presentation. Its [driving lifecycle](../src/browser/driving-lifecycle.ts) owns manual recovery or safe-spawn replacement, observer resynchronization and immediate camera reconstruction, in that order. Roots supply the current world, recovery profile and optional resync callback. [Frame loop](../src/browser/frame-loop.ts) owns the accumulator and the 0.25 s catch-up limit; roots supply tick/render callbacks. [Route driving](../src/runtime/route-driving-tick.ts) completes every actor's physics before shared arbitration, then applies recovery, chart rebinding and progress observation once per actor. [Circuit driving](../src/runtime/circuit-driving-tick.ts) shares recovery/race/session updates between player and rivals. Root code chooses content and input policy. Results are keyed by actor ID, independent of roster positions. General rendering/physics/camera layers consume ordinary data, not course-mode switches.

The [vehicle catalog](../src/vehicle/vehicle-catalog.ts) owns nine selectable production identities and references nine distinct [compiled profiles](../src/vehicle/production-vehicle-profiles.ts). Manufacturer/model, identifier, specification and period are separate fields. Presentation uses explicit car/bike metadata. Browser [key bindings](../src/browser/key-bindings.ts) map opaque profile IDs to shortcuts; the catalog contains no keyboard codes. Driving aliases belong to [keyboard input](../src/input/keyboard-input.ts), and one regression checks collisions across driving and product controls. Testarossa is the default player and fixed rival profile. Shared initial player tire settings do not imply that all finished vehicles must share tires.

[Stage authoring](../src/runtime/stage-authoring-compiler.ts) compiles open geometry, height, visuals, GroundMap, surfaces, sprites and background into a [runtime package](../src/runtime/stage-runtime-content.ts). A [road view](../src/course/stage-road-view.ts) describes stage-local lateral/longitudinal presentation. Physical and visual surface views share explicit coordinate transforms but retain independent semantics. Stage environment authoring must specify all four road/ground half-widths; the general compiler supplies no content dimensions. The same terrain-profile factory compiles all source and stage presentation: widths come from the responsible GroundMap or explicit stage terrain authoring, while height and visual readers are supplied independently. Screen height comes from the fixed logical display metric. Changes of material/visual sections do not split geometry unnecessarily.

`src/dev/courses`, `src/dev/fixtures` and `src/dev/diagnostics` separate shipped course composition, focused regression inputs and read-only telemetry. Fixtures are executable input data, not a second set of engine implementations. Shared [Raster authoring](../src/course/raster-turtle.ts) owns straight/arc subdivision and preserves authored radius provenance; course files own shapes and explicit topology. Focused and multi-step fork fixtures consume the same [second-fork data](../src/dev/courses/second-fork-authoring.ts). [DEV boundary](../src/dev/README.md) explains the allowed dependency direction.

General APIs use role-based names. Vehicle creation, updates and recovery consume `VehicleWorld`; camera updates consume its guide/height readers. Rendering consumes a target, scene and options. General runtime composition modules remain separate where they validate distinct contracts: source geometry, environment, continuation overlap, route graph and physical handoff. Module size alone is not a reason to merge those authorities.

## Point-to-point route transaction

An acyclic [RouteDag](../src/gameplay/route-dag.ts) owns legal stage successors. Physical position crosses an oriented gate; steering intent, AI target, screen X or guessed centerline never chooses route progress.

Compiled stages, choices and gate geometry are immutable. The shared oriented-gate primitive detects an actual sign change: negative to zero/positive is forward, positive to zero/negative is reverse. Arrival at the plane counts once; departing from the plane does not repeat it. There is no dead band that can lose a slow crossing; finite lateral gate-width tolerance remains separate.

1. A forward physical route-gate crossing validates the legal transition and enters PENDING.
2. The old chart/content remains authoritative during the shared overlap.
3. A forward physical handoff-seam crossing commits the target chart/content.
4. COMMIT re-expresses observations only; world X/Y/Z, yaw and velocity remain continuous.

[World gates](../src/gameplay/world-crossing-gate.ts), [handoff](../src/gameplay/route-stage-handoff.ts) and [live route tick](../src/runtime/live-route-multi-actor-tick.ts) implement this ordering. Authoring compiles actual overlap and runout; no implicit closure or post-handoff pose repair is allowed. An actor's finite local projection seed must follow the committed chart explicitly.

[Continuation compilation](../src/runtime/stage-continuation-link.ts) partitions the overlap at both charts' straight/arc boundaries and checks endpoints and interval interiors, so a complete local bend cannot fall between fixed probes. Copied Raster vertices retain circular-source radius provenance. Gameplay Guide charts delegate coordinate arithmetic to the same Core frame primitive.

The field uses `FIRST_PHYSICAL_CROSSING_LOCKS` and `RECOVER_TO_LOCKED_BRANCH`. The first valid physical crossing locks a sibling choice for the field. A losing crossing records a violation and recovers through the legal physical gate's geography without awarding illegal progress. An AI desired branch is never authority. Each actor's chart/content and route progress remain separate; shared route choice is owned once by the field.

Entering a terminal stage is not finishing. A validated physical FINISH is still required.

## Circuit and race progress

[Circuit topology](../src/gameplay/circuit-topology.ts) explicitly authors one closed lap above Core. [Runtime unfolding](../src/runtime/circuit-runtime-window.ts) supplies finite ordinary open geometry/source readers for at least N+1 copies when scoring N laps, including runout after the final scored finish. No core modulo or circuit renderer is introduced.

[Race progress](../src/gameplay/circuit-race-progress.ts) accepts ordered forward physical checkpoints and FINISH crossings. Topological copy/winding is not an awarded lap. Skipping checkpoints, crossing backwards, swapping vehicles or recovering cannot manufacture a lap. Route and race progress use physical gate history, separate from current projected chainage. Resynchronization replaces observation baselines while preserving all validated progress.

[Session configuration](../src/gameplay/session-configuration.ts), [race session](../src/gameplay/race-session.ts) and [run objective](../src/gameplay/run-objective.ts) are the existing extension points for game rules. Avoid placing race-start, scoring, finish or route logic in rendering or vehicle integration.

The current Tsukuba and FISCO authoring lives in [Tsukuba](../src/dev/courses/tsukuba-circuit.ts) and [FISCO](../src/dev/courses/fisco-circuit.ts). They are functional simplified courses, not survey-grade reconstructions. Source comments identify published dimensions versus simplified connectors. Course selection does not change the common solver.

Circuit visual sections are unfolded into an ordinary `VisualProfile`. Both boundary lists and sampled section starts use window chainage; a second-lap sample must not report a first-lap start.

## Recovery

[Recovery](../src/gameplay/recovery.ts) is an explicit gameplay discontinuity, not ordinary integration. It observes support, falling, penetration, chart excursion and overturning. The common `advanceVehicleWithRecovery` catches only the typed suspension-travel domain exit from physics; unrelated errors are not swallowed.

Recovery reconstructs complete pose, velocity, wheel state, actuators, powertrain and observations at a supported known Guide coordinate. It retains selected steering/tire calibration. Ordinary same-chart recovery derives a backed-off target from the farther of last-safe and current causal chainage; it cannot loop forever onto the same launch face solely because last-safe did not advance in air. Explicit wrong-route recovery supplies the legal gate-derived target.

Route composition passes each actor’s recovery profile to both ordinary and locked-branch recovery. The explicit legal-gate approach owns the target coordinate; the same profile owns backtracking and retained speed.

Route and circuit driving ticks resync their route/race observer after automatic recovery, suppressing ordinary physical crossing observation for that reset. The browser lifecycle resets and updates the player's camera after the tick reports that discontinuity; it does not resync progress a second time. Recovery never awards gates, checkpoints or laps and never erases accepted progress. Known coordinates preserve the correct overlapping circuit copy. Global nearest geometry is not a substitute for that knowledge.

Vehicle replacement completes camera reconstruction in the same selector callback. A render frame may arrive before the next fixed physics tick; it must already have the new player's camera anchor.

## Rivals and future game systems

[Rival driver](../src/gameplay/rival-driver.ts) publishes ordinary input using physical world travel and a Guide lookahead. Its contiguous braking-distance envelope is a general speed-planning policy, separate from the player. Rival behavior does not change tire forces or route authority.

Next work can add visual assets, sound and game flow above these contracts. Read immutable vehicle/telemetry state for engine/skid/lean presentation. Add scoring and race state under gameplay, and compose at the roots. Do not use sound/UI state to control mechanics, or add a second notion of progress to presentation. Collisions, richer rival behavior and game-specific effects require explicit new design and causal tests; they are not presumed implemented by the current physics core.

## Concrete visual content

The [tunnel content](../src/dev/courses/tunnel.ts) owns portal/rib assets, placements and the camera-offset background interval. The browser composition assembles it with ordinary course sprites and Far Background. General rendering contains no tunnel location or special projection. Branching child authoring continues forward from the shared finite overlap; it has no alternate return-to-start shape.
