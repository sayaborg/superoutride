# Next task checkpoint

## Restart

Read [AGENTS](../AGENTS.md), the [index](README.md), [architecture](architecture.md),
[audio](audio.md#hybrid-game-synthesis) and [calibration](calibration.md#tire-audio-tuning).
Inspect exact main, active PRs, CI and Pages before changing source. Preserve unrelated work and
use a `codex/` branch. Current repository evidence is the continuation authority.

Use Node.js 24, install dependencies, build and serve over HTTP. In `?mode=circuit`, start audio
and cycle TIRES three times from CURRENT to HYBRID. Compare at the same vehicle, physical calibration,
inputs and volume. [Development](development.md#tire-comparison-tools) owns commands and evidence scopes.

## Next work: HYBRID listening

The user authorized a fourth comparison generator: CURRENT's growth/release and pitch control with
SPECTRAL's finite-width squeal character, plus SPECTRAL rolling. This explicitly supersedes the earlier
SPECTRAL-only tuning decision gate. CURRENT remains the reload default; existing references remain.

| Component | Latest feedback and implemented starting point                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q         | The user found HYBRID promising but squeal too frequent. Its shared Hopf controller now has a higher HYBRID-only excitation threshold. Confirm that mild slip is quieter while strong slip remains responsive; listening acceptance is open. |
| R         | Use the present rotation-driven SPECTRAL rolling layer, shared without changing its waveform. Earlier feedback about excessive hiss/weak rotation dependence still needs final listening acceptance.                                         |
| S         | The user questioned its usefulness. HYBRID constructs no scrub bands and offers R/Q only. Original SPECTRAL retains R/S/Q as a comparison. This is a deliberate omission, not proof that sliding has no broadband sound.                     |

First compare Q alone through mild slip, sustained strong slip and recovery to mild slip. The existing
Hopf onset is tuned through HYBRID's own setting; CURRENT keeps its original threshold. This deliberate
calibration supersedes exact equality of the two controllers' amplitudes, while preserving their shared
equation, excitation following and pitch response. There is no additional gate or envelope.
HYBRID shifts CURRENT's pitch upward by a fixed offset while retaining its Hz excursions. There is no
second Q amplitude or pitch envelope. Finite-width bands still add their own short response and random
variation, so shared control dynamics do not imply identical perceived loudness or audible onset.

Then assess R alone and R+Q. Include locked translation, supported stationary spin, reverse travel,
loose surfaces, support loss/recontact, independent axles and model changes/mute/retry. Without S, locked
subthreshold sliding can be silent; assess this consequence before deciding whether an S layer is needed.
Do not add a fallback noise, recovery chirp or automatic loudness compensation to hide it.

R/Q output switches fade without resetting the running states. S choice remains stored for SPECTRAL;
its button is hidden/disabled in HYBRID. Choices survive model/vehicle changes and retry, but reload resets
all choices. Numeric tire controls remain source settings, not the engine tuning panel.

[Audio](audio.md) owns equations and boundaries; [calibration](calibration.md) identifies tuning owners.
Change one group at a time, and distinguish listening acceptance, spectrum/transient checks, host timing
and actual phone performance. Keep the fixed mechanics/rendering reference and valid lifecycle/observation
coverage. Existing CURRENT/CONTACT/SPECTRAL remain waveform-preserving comparison references; a deliberate
change to them requires an explicit contract revision. Keep only this checkpoint, not new handoff archives.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
