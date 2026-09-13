# Next task checkpoint

## Restart

1. Inspect the canonical workspace, worktrees and local changes. Fetch main and inspect active PRs and exact-main CI/Pages evidence. The engine comparison continuation is `codex/procedural-audio`, tracked by [PR #168](https://github.com/sayaborg/superoutride/pull/168). Resolve its current head and merge status before choosing a checkout: while unmerged, continue that branch rather than starting from main without its sound changes.
2. Read [AGENTS](../AGENTS.md), the [specification index](README.md) and the relevant topic/source/tests. Preserve existing work. For new work after integration, create a `codex/` branch from the inspected main SHA.
3. Follow [development](development.md). PR refs, workflow logs and deployed version.txt establish exact release state; do not infer it from this file or prior conversations.

## Engine sound continuation

The native-rate waveguide (formerly LITE) is adopted. The 2x reference path and method selector,
transport flags and comparison-only controls are removed. Eight tuning controls remain provisional.
Every pipe, return filter and per-sample control update is retained. Firing now resolves fractional
sample timing with exactly integrated, sample-averaged pulse envelopes. A smooth quartic aperture
replaces the half-sine source boundary, without per-cylinder trigonometry. The clipper and final
LPF remain in their original order. Use the spectral and paired timing diagnostics linked from
the audio specification to evaluate further changes. A 32-sample
attack-coefficient cadence was evaluated but not adopted; prefer the simpler exact native-rate sound.
The [audio specification](audio.md) owns current behavior. Android gameplay/audio acceptance remains open.

- Build and serve the repository over HTTP using [development](development.md). Use `/?mode=circuit` for tuning while driving; `/tools/audio-browser.html` is the separate audition/verification page. A file URL or public main deployment does not establish that the feature branch is running.
- Game sliders commit on release through the existing fade. The final LPF follows soft clipping and is independent of the reflection-wave LPF. Vehicle changes preserve tuning; page/course reload resets it. Browser trial values are not saved repository defaults.
- Player and nearest-rival engines and independent front/rear player tires are connected. Recordings, generated-waveform playback and engine noise are absent. Wind remains disconnected. D/M/ACT retain their minus/value/plus controls.
- Pulse variation defaults to ±20% of full-excitation strength, adjustable from 0 to 40%. The absolute offset remains at closed throttle and clips at zero strength. Zero disables event-strength variation in the current pulse model; firing phases and RPM remain unchanged.
- Tire squeal uses directional friction work and one bounded self-excited acoustic oscillator per axle in a single worklet. Use `/tools/tire-browser.html` to audition each axle and both together. Pulse strength is fixed at 1 for every vehicle; rise and decay use the shared sliders (0.20 ms and 5.0 ms provisional defaults). The [physical evidence note](tire-squeal-research.md) motivates the new self-excitation mechanism and separates its authored pitch/onset controls from material physics. The fixed noise-band squeal has been replaced; rolling and scrub noise are removed. Continue in-game listening and target-device calibration before adding wind. Do not reconnect the deferred prototypes as part of engine cleanup. Speaker calibration, Safari/iOS and target-phone performance acceptance remain open.

## Other implementation areas

Visual work belongs in [rendering](../src/render/renderer.ts), [sprite assets](../src/visual/sprite-assets.ts), [camera](../src/camera/camera.ts) and [browser presentation](../src/browser/driving-shell.ts). [Tunnel content](../src/dev/courses/tunnel.ts) owns concrete placements and materials. Presentation consumes vehicle/course observations without adding another physical state or depth rule.

Game-event sounds and music are not implemented. Start/end/scoring rules belong in [sessions](../src/gameplay/race-session.ts), [objectives](../src/gameplay/run-objective.ts) and their composition.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and supported-envelope checks do not certify a new course's complete band geometry. Preserve the [validity requirement](architecture.md#raster-and-guide) and distinguish intentional coincident circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear tire calibration, coast/turn oscillation, combined controls and changing-terrain acceptance, and actual smartphone performance/input checks remain open. Exiting finite suspension travel invokes gameplay recovery; this does not establish physical stability over arbitrary terrain.

The executable checks cover their stated scenarios and boundaries, not every possible state. Correct a future structural defect with a causal regression and explicit specification revision; never conceal it through parameter tuning.
