# Next task checkpoint

## Restart

Read [AGENTS](../AGENTS.md), the [index](README.md), [architecture](architecture.md) and
[content and gameplay](content-and-gameplay.md). Inspect exact main, active PRs, CI and Pages
before changing source. Preserve unrelated work and use a `codex/` branch. Current repository
evidence is the continuation authority; no prior chat attachment or generated audio file is needed.
[Development](development.md) owns commands and evidence scopes.

## Next work: visual presentation

The user has moved the active work to visual presentation. The first visual feature and art direction
are not yet specified. Inspect the existing presentation and define that feature before implementing
it; this checkpoint does not authorize an invented visual redesign or renewed sound/handling tuning.

| Concern                                 | Existing owner / entry point                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene rendering and Painter composition | [renderer](../src/render/renderer.ts), [Painter merge](../src/graphics/painter-merge.ts)                                                                                                                            |
| Vehicle and scenery assets              | [sprite assets](../src/visual/sprite-assets.ts), [course sprites](../src/render/course-sprite.ts), [dynamic vehicle sprites](../src/render/dynamic-vehicle-sprite.ts)                                               |
| Far background and visual sections      | [background](../src/visual/far-background.ts), [visual profile](../src/visual/visual-profile.ts)                                                                                                                    |
| Road appearance and ground sampling     | [TerrainLine](../src/road/terrain-line.ts), [GroundMap](../src/groundmap/ground-map.ts), [concrete course authoring](../src/dev/courses/)                                                                           |
| Camera and physical-pose presentation   | [camera](../src/camera/camera.ts), [camera profile](../src/camera/current-camera-profile.ts), [vehicle presentation](../src/render/vehicle-presentation.ts), [height mapping](../src/render/render-height-space.ts) |
| Browser display and composition         | [driving shell](../src/browser/), [composition roots](../README.md#structure)                                                                                                                                       |

[Architecture](architecture.md) remains the sole rendering contract: 320×240 framebuffer,
chainage-based pseudo depth, far-to-near Painter order, fixed player metric (2 m = 80 px),
zero camera roll and no lateral terrain banking. GroundMap appearance and SurfaceMap mechanics
remain independent. Presentation reads physical state without correcting vehicle motion.
Course topology belongs above Core. Shared road/shoulder geometry and independent material/visual
profiles follow the [ground authoring boundary](architecture.md#ground-authoring-boundaries). Preserve these boundaries while choosing a visual feature.

The immutable CI reference checks both mechanics and rendered pixels. A visual feature may
intentionally change pixels; identify its affected contract and causal regression explicitly before
changing that expectation. Do not silently advance the reference or mask output differences.
Use the existing [browser performance tool](development.md#validation-contracts) for device
measurements; full-suite duration is not a frame budget.

## Deferred tuning

All three areas below remain undecided and are paused, not approved as final defaults. Resume only
when the user returns to that area. Current numeric defaults remain available for reproducible play.

| Area                             | Preserved state                                                                                     | Decision still open                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Physical tire parameters         | Common mechanics, DEV calibration controls and current provisional values                           | Per-vehicle/front/rear calibration and handling acceptance                |
| Engine sound parameters          | Native-rate sample-free waveguide, eight DEV controls and independent ENG level                     | Timbre, parameter values and final mix                                    |
| Tire-noise method and parameters | HOPF / CONTACT / SPECTRAL / HYBRID / MODAL / UNIFIED; HYBRID reload default; independent TIRE level | Final synthesis method, onset, pitch, roughness, parameter values and mix |

UNIFIED must remain available alongside MODAL. UNIFIED retains R+Q, its listener-selected 1,000 Hz
high mode and work-fraction onset; MODAL retains its Q-only mechanism. Their DEV panels keep separate
settings and resets. All session tuning resets on reload. HYBRID's squeal received favorable feedback,
but this does not settle the final tire-noise method. R/S remain in the retained comparison methods;
wind sound is deferred. [Tire audio](tire-audio.md) owns mechanisms and limits,
[calibration](calibration.md) owns parameter maps, and the [research note](tire-squeal-research.md)
records physical evidence without claiming measured calibration of game coefficients.

When tire-noise work resumes, compare Q alone at equal physical calibration and playback levels:
HYBRID with R/S off, UNIFIED with R off, and MODAL. Recheck mild turns around 20 km/h, increasing
slip, strong cornering/recovery, locked sliding, stationary wheelspin, loose surfaces, reverse and
loss/recovery of contact. Check phone panel scrolling, mute, reset, model switching and sound retry.
[Comparison tools](development.md#tire-comparison-tools) regenerate references and low-speed probes.
Synthetic RMS, spectrum and host timing do not establish audible realism or phone performance.
SPECTRAL rolling still reuses its texture length as an authored numeric ratio, explicitly marked
in source; reconsider that retained waveform mapping with final method selection, not visual cleanup.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Combined-control and changing-terrain acceptance, and real smartphone
performance/input checks remain open. Suspension travel recovery is not proof of physical stability
on arbitrary terrain. These limits are separate from tire sound.

Keep this single checkpoint and current specifications. Historical experiments, superseded files and
release records remain in Git/PR/CI, not a new report or handoff archive.
