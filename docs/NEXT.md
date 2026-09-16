# Next task checkpoint

## Restart

1. Inspect the working tree, fetch exact main from the [repository](https://github.com/sayaborg/superoutride),
   and check open PRs, CI and Pages. Preserve unrelated changes; start a `codex/` branch from the inspected
   main. [AGENTS](../AGENTS.md) owns validation and exact-head release gates, including documentation work.
2. Read the [index](README.md), [architecture](architecture.md), this checkpoint and
   [audio](audio.md#spectral-game-synthesis). The [tuning map](calibration.md#tire-audio-tuning) identifies
   parameter owners; [development](development.md#tire-comparison-tools) owns commands and tool scopes.
3. Use Node.js 24, `npm ci`, a fresh build and HTTP serving. CI supplies the unchanged immutable
   mechanics/render reference. A local run without that reference is not historical equivalence evidence.
4. Reproduce the current sound before editing. Use `http://localhost:8000/?mode=circuit`, start sound,
   and cycle TIRES twice from CURRENT to SPECTRAL. R/S/Q begin ON. Prior WAVs, chat attachments,
   former machine paths and old feature branches are not prerequisites.
5. Keep source/build, kernel replays, native browser playback and published artifact/version evidence
   separate. Do not diagnose stale deployment as a timbre defect or infer phone performance from CI.

## Next work: SPECTRAL tuning

The next thread is for **tuning the implemented SPECTRAL model**, not selecting or wiring a fourth
method. Repository organization is complete; do not repeat migration or add another handoff file.
The current R/S/Q implementation, component switches and numerical settings are the starting point.
No further timbre change was made as part of the cleanup.

### Feedback and acceptance

| Area                | User feedback and present status                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q timbre            | The earlier SPECTRAL WAVs and in-game squeal sounded realistic. Preserve that useful character.                                                                                    |
| Q response          | CURRENT conveyed handling changes and grip recovery better; SPECTRAL sounded too much like one sound with changing volume.                                                         |
| R                   | Asphalt sounded white-noise-like, too high, and insufficiently linked to rotation. The latest implementation lowers R and links it to accepted wheel angular speed.                |
| S                   | The user could not readily identify the scrub component. It remains a separate, unchanged reference to assess in isolation.                                                        |
| Latest R/Q revision | Implemented with R/S/Q ON/OFF controls, but no subsequent user listening acceptance is recorded. Earlier Q approval does not approve these revised transients or the complete mix. |

[Audio](audio.md#spectral-game-synthesis) describes the actual model and boundaries. CURRENT and CONTACT
remain audible references; CURRENT is still the reload default. The accepted engine and vehicle
mechanics are unchanged. R/S/Q switches isolate output without stopping state or boosting other layers;
OFF is not a CPU-saving mode. There are no live numeric tire-timbre sliders yet: edit the named source
settings, rebuild and reload. The engine's tuning panel is not the tire calibration panel.

### Tuning order

1. **R alone:** accelerate and decelerate, then test locked translation and supported stationary spin.
   Judge low rolling character and audible rotation dependence separately from overall level. Use the
   accepted angular observation, never infer wheel RPM from vehicle speed or a guessed game radius.
2. **S alone, then S+Q:** establish what the broad scrub adds. Keep S fixed while isolating Q changes;
   do not erase S merely because its contribution was previously masked by R/Q or the engine.
3. **Q alone:** compare growing slip, steady slip and recovery against CURRENT on the same observations.
   Assess harmonic balance separately from common loudness, pitch and bandwidth. Current Q uses its
   existing smoothed excitation, not the full CURRENT Hopf dynamics or a new hysteresis state.
4. **Combined game mix:** restore R/S/Q, then check engine masking, both axles, loose surfaces, transitions,
   loss of support/recontact, mute/retry and target phones. Record vehicle/course, physical calibration,
   speed/input sequence, model/component selection and volume so comparisons are reproducible.

Change one acoustic group at a time using the [tuning map](calibration.md#tire-audio-tuning). In particular,
shared S/Q work and smoothing, and shared R/S material texture values, are not isolated component knobs.
Do not retune physical friction, steering or engine loudness to compensate for an acoustic mismatch.
Same local tire observations need not produce different sounds just because the car is described as
understeering or oversteering; evaluate real front/rear trajectories before inventing labeled effects.

### Decision gate and evidence

Retain the finite-width band mechanism and strong Q palette as the current working baseline, not a
claim of calibrated tire acoustics. No extra oscillators, fixed axle detuning, AGC, phase reset or
recovery chirp is pre-authorized by this checkpoint. If tuning cannot give a useful response without
such patches, report the specific failed comparison and discuss a new method instead of silently
expanding this one.

Unchanged S has independent waveform coverage. Q's old joint S/Q transient hash was explicitly
superseded by the response revision; keep its harmonic/strong-palette/release coverage. A pure cleanup
must pass the exact pre-edit R/S/Q comparison; an intentional tune may change PCM but must identify
and explain those differences, not silently regenerate expectations or weaken causal tests. Preserve
valid observation, component/lifecycle, mechanics/render and immutable-oracle coverage in either case.
Run full validation; keep listening, spectrum/transients, host timing and real device playback separate.
Historical results and release evidence belong in Git/PR/CI, not copied into this checkpoint.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
