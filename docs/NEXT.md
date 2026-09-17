# Next task checkpoint

## Restart

Read [AGENTS](../AGENTS.md), the [index](README.md), [architecture](architecture.md) and
[content and gameplay](content-and-gameplay.md). Inspect exact main, active PRs, CI and Pages
before changing source. Preserve unrelated work and use a `codex/` branch. Current repository
evidence is the continuation authority; no prior chat attachment or generated audio file is needed.
[Development](development.md) owns commands and evidence scopes.

## Next work: authoring foundations

The accepted direction is Sprite Tool and Course Editor, with precompiled GroundMap and octave
sprite LOD. [Architecture](architecture.md#accepted-authoring-target-pending-implementation) and
[content](content-and-gameplay.md#accepted-authoring-workflow-pending-implementation) own the target
contracts and distinguish them from deployed implementation. Cleanup preserves existing road
shoulder dimensions, boundary priorities, pixels, mechanics and acoustic waveforms.

1. The bounded file-backed GroundMap compiler and complete stage-local color inputs are implemented.
   Ordinary source v1 bytes remain unchanged; all eleven branching-stage domains are baked at test
   density with local shoulders/forks included. Next add versioned payload delivery and shared paged
   residency, following the [migration gates](development.md#groundmap-migration-gates), then
   integrate a real handoff/circuit fixture. General compilation has no Node dependency.
2. The [integration design](architecture.md#groundmap-integration-design-compiler-implemented-runtime-pending) separates the completed compiler from pending runtime work. Product cutover requires the new loading lifecycle, explicit pixel revision,
   complete assets for all shipped courses and target-device capacity acceptance. Numeric budgets
   remain open. Use the [capacity probe](development.md#groundmap-capacity-measurement) for host
   evidence; product-density child-stage capacity and target-device transition measurements remain required.
3. Resolve sprite LOD logical extent, crop/padding, anchors, odd dimensions and level selection.
   Verify synthetic fixtures before changing asset production or the product blitter contract.
4. Resolve image color/filter/coverage rules and Ground composition ordering; build deterministic
   core/compiler functions, then the smallest end-to-end Sprite Tool / Course Editor workflow.

Ground and sprite cutovers are separate rendering revisions. Preserve the immutable mechanics
reference; revise affected pixel expectations explicitly with independent causal coverage. No
source-camera projection, yaw/bank count, Material palette rule or layer proposal is implicitly frozen.
3D capture experiments may precede production integration without adding unaccepted runtime variants.

The shared road cross-section owns dimensions; visual ground extent and physical support extent
remain independent. Parent/child coordinate transforms and physical gate -> PENDING -> seam -> COMMIT
remain unchanged. Source geometry is available to route intent independently of GroundMap storage.
Use the existing [browser diagnostics](development.md#validation-contracts) for device evidence;
full-suite duration and host probe timings are not target frame budgets.

## Deferred tuning

All three areas below remain undecided and are paused, not approved as final defaults. Resume only
when the user returns to that area. Current numeric defaults remain available for reproducible play.

| Area                     | Preserved state                                                         | Decision still open                              |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| Physical tire parameters | Common mechanics and provisional calibration                            | Vehicle/axle calibration and handling acceptance |
| Engine sound             | Current synthesis and controls                                          | Timbre, parameter values and mix                 |
| Tire sound               | All methods and session behavior defined by [tire audio](tire-audio.md) | Final mechanism, onset, pitch, roughness and mix |

UNIFIED and MODAL remain available. Their coexistence is not a final method selection. The user
favored HYBRID squeal; listening feedback does not settle physical calibration. Wind remains deferred.
Audio model registry/seed consolidation, `audio/tire/` organization and HOPF/tool renaming belong to
sound-preserving cleanup when audio work resumes, not the authoring foundations above.

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
