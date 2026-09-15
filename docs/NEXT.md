# Next task checkpoint

## Restart

1. Inspect the working tree and fetch exact main from the [repository](https://github.com/sayaborg/superoutride).
   Check active PRs, CI and Pages. Preserve unrelated local changes; start a `codex/` branch from the
   inspected main. Follow [AGENTS](../AGENTS.md) for release gates, including documentation-only work.
2. Read the [specification index](README.md), [architecture](architecture.md), this checkpoint and
   [audio](audio.md). Audio owns current runtime behavior; this file owns the next decision.
   The [tire evidence note](tire-squeal-research.md) supplies research and its limits, not a chosen algorithm.
3. Use Node.js 24 and the [development workflow](development.md). Run `npm ci` and `npm test`.
   CI builds the immutable physics/render reference pinned in the existing workflow. A local run
   without that reference checks determinism, not historical equivalence. Do not change the oracle.
4. Serve the built checkout over HTTP, for example `python3 -m http.server 8000`.
   Use `http://localhost:8000/?mode=circuit` for in-game CURRENT/CONTACT/SPECTRAL comparison. Audition and
   regeneration commands are in [development](development.md#tire-comparison-tools).
   Prior chat attachments, generated WAVs and former machine paths are not required.
5. Verify any release through exact Git/PR refs, CI and the Pages artifact/version. Local listening,
   source tests, deployment evidence and actual device playback are separate claims.

## Next decision: a third tire-sound method

The user judged SPECTRAL's squeal realistic, but found CURRENT more expressive through handling changes
and recovery. Asphalt rolling sounded like white noise and not sufficiently tied to rotation; the S
component was hard to identify. The user authorized improvements and independent R/S/Q buttons.

[Audio](audio.md#spectral-game-synthesis) owns the revised implementation: accepted wheel angular telemetry
now drives lower rolling bands/texture, while Q's harmonic balance depends on its existing smoothed
excitation. S is retained as an independent reference. This deliberately supersedes joint S/Q waveform
identity for weak/transient Q; the strong palette, band mechanism and engine baseline are retained.
No artificial front/rear timbres or labeled understeer/oversteer effects were introduced.

### Next action: component listening in the game

Select SPECTRAL with two TIRES presses from CURRENT. R/S/Q buttons initially read ON, apply to both axles,
and fade only their own output without resetting synthesis. They are disabled in the other models;
choices persist for the session without altering the CURRENT reload default.

Listen to R alone through acceleration, deceleration, wheel lock and supported wheelspin. It should be
lower and respond to rotation; locked sliding belongs to S/Q, not R. Compare S alone, Q alone and S+Q
through growing slip and grip recovery. Q should change harmonic balance rather than only loudness,
while its strong squeal remains recognizable. Then restore all three and check engine masking,
pavement/loose transitions, front/rear combination, mute/retry and actual phone play.

This is a candidate improvement, not listening acceptance or a measured whole-tire acoustic model.
Same local observations need not have different sounds just because the car is called understeering
or oversteering. Keep the observations, dynamics, timbre and output mix diagnoses separate. The low-cost
mapping does not reproduce CURRENT's entire Hopf dynamics; do not silently transplant its old thresholds
or add arbitrary recovery chirps to force recognition.

### Decision gate

Retain CURRENT/CONTACT and the default, accepted engine, read-only mechanics and immutable physics/render
oracle. Use unchanged S, stationary strong Q and dynamic spectral-response regressions instead of
freezing an obsolete transient PCM requirement. Do not grow a parallel legacy SPECTRAL mode or a new
history directory. Run complete validation on every candidate; target-device playback and user listening
remain distinct from synthetic replays, host metrics, CI and deployment evidence.

## Accepted engine baseline

Preserve the adopted native-rate waveguide, integrated fractional pulses, authored profiles, shared
tuning and permission/failure lifecycle. The [audio specification](audio.md) owns their details; this
checkpoint does not restate their coefficients. Engine sound is approved as a listening baseline,
not a universal device or absolute-loudness calibration. Vehicle-level differences and final tire/engine
balance remain open; do not silently normalize the engine while changing tires.

## Other implementation areas

Rendering, camera, sprites, tunnel content and race/session rules retain their existing owners in the
[specification index](README.md). Do not reopen them as part of tire method selection.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
