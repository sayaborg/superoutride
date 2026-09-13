# Next task checkpoint

## Restart

1. Inspect the canonical workspace, worktrees and local changes. Fetch main and inspect active PRs and exact-main CI/Pages evidence. The engine comparison continuation is `codex/procedural-audio`, tracked by [PR #168](https://github.com/sayaborg/superoutride/pull/168). Resolve its current head and merge status before choosing a checkout: while unmerged, continue that branch rather than starting from main without its sound changes.
2. Read [AGENTS](../AGENTS.md), the [specification index](README.md) and the relevant topic/source/tests. Preserve existing work. For new work after integration, create a `codex/` branch from the inspected main SHA.
3. Follow [development](development.md). PR refs, workflow logs and deployed version.txt establish exact release state; do not infer it from this file or prior conversations.

## Engine sound continuation

Keep the current in-game REFLECTION/WAVEGUIDE selector, six tuning sliders and reset intact while comparison continues. Neither method has been adopted. Both use one sample kernel and the same profiles and controls; the [audio specification](audio.md) owns their source map, parameters, physical limits and eventual removal procedure. Simplicity, explicit approximation limits and unchanged physics take priority over extra acoustic machinery.

- Build and serve the repository over HTTP using [development](development.md). Use `/?mode=circuit` for tuning while driving; `/tools/audio-browser.html` is the separate audition/verification page. A file URL or public main deployment does not establish that the feature branch is running.
- Game sliders commit on release through the existing fade. The final LPF follows soft clipping and is independent of the reflection-wave LPF. Method and vehicle changes preserve tuning; page/course reload resets it. Browser trial values are not saved repository defaults.
- Player and nearest-rival engines and independent front/rear player tires are connected. Recordings, generated-waveform playback and engine noise are absent. Wind remains disconnected. D/M/ACT retain their minus/value/plus controls.
- Continue listening and coefficient evaluation before selecting a method. Event-to-event pulse-strength variation is now implemented with a provisional ±6% default and a shared 0–30% slider. Zero restores the exact pre-variation reference. Fixed-seed event draws preserve firing phases and RPM; there is no timing jitter or separate engine noise source. Compare 0, 6% and larger settings before calibrating the default.
- Tire rolling/squeal now uses directional friction work and filtered noise in one two-axle worklet. Use `/tools/tire-browser.html` to audition each axle and both together. Catalog engine pulse shapes are differentiated as provisional acoustic sketches. The [physical evidence note](tire-squeal-research.md) identifies the missing self-excitation mechanism; the current tire DSP is unchanged pending that design decision. Continue in-game listening and target-device calibration before adding wind. Do not reconnect the deferred prototypes as part of engine cleanup. Speaker calibration, Safari/iOS and target-phone performance acceptance remain open.

## Other implementation areas

Visual work belongs in [rendering](../src/render/renderer.ts), [sprite assets](../src/visual/sprite-assets.ts), [camera](../src/camera/camera.ts) and [browser presentation](../src/browser/driving-shell.ts). [Tunnel content](../src/dev/courses/tunnel.ts) owns concrete placements and materials. Presentation consumes vehicle/course observations without adding another physical state or depth rule.

Game-event sounds and music are not implemented. Start/end/scoring rules belong in [sessions](../src/gameplay/race-session.ts), [objectives](../src/gameplay/run-objective.ts) and their composition.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and supported-envelope checks do not certify a new course's complete band geometry. Preserve the [validity requirement](architecture.md#raster-and-guide) and distinguish intentional coincident circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear tire calibration, coast/turn oscillation, combined controls and changing-terrain acceptance, and actual smartphone performance/input checks remain open. Exiting finite suspension travel invokes gameplay recovery; this does not establish physical stability over arbitrary terrain.

The executable checks cover their stated scenarios and boundaries, not every possible state. Correct a future structural defect with a causal regression and explicit specification revision; never conceal it through parameter tuning.
