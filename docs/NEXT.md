# Next task checkpoint

## Restart

Read [AGENTS](../AGENTS.md), the [index](README.md), [architecture](architecture.md),
[audio](audio.md#hybrid-game-synthesis) and [calibration](calibration.md#tire-audio-tuning).
Inspect exact main, active PRs, CI and Pages before changing source. Preserve unrelated work and
use a `codex/` branch. Current repository evidence is the continuation authority.

Use Node.js 24, install dependencies, build and serve over HTTP. In `?mode=circuit`, start audio
with the default HYBRID selected. Compare at the same vehicle, physical calibration,
inputs and volume. [Development](development.md#tire-comparison-tools) owns commands and evidence scopes.

## Next work: HYBRID listening

The user adopts HYBRID's squeal method as the primary implementation, asks for still less frequent
squeal and a low/mid sliding sound leading into it, and authorizes an architectural revision with modest
output changes. The revision prioritizes simple ownership, physical honesty and explicitly named authored
constants. HYBRID is now the reload default. This supersedes the previous comparison-only, shared-CURRENT
controller, exact-shared-R and no-S requirements; the three reference models remain available.

| Component | Current acceptance and next listening question                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q         | The finite-width squeal method is accepted. Confirm that the later onset and scalar energy response retain useful pitch/transient feedback during strong slip and recovery.                 |
| S         | New low/mid sliding friction fills the approach to squeal. Assess its level/color below onset and the continuous additive S+Q transition; this new sound is not yet listening-approved.     |
| R         | Rotation-driven rolling remains the method. Its texture traversal now has consistent distance/time units. Assess low-frequency balance and audible rotation dependence in the complete mix. |

First compare S alone, Q alone and S+Q through mild slip, sustained strong slip and gradual recovery.
Then compare R alone and the complete R+S+Q mix at fixed playback volume. Include braking/locked sliding,
supported stationary spin, reverse travel, loose surfaces, support loss/recontact, independent axles
and model changes/mute/retry. Do not equate a numerical growth threshold or output RMS with audible onset
or perceived loudness. There is no arbitrary S/Q ducking or automatic loudness compensation.

R/S/Q output switches fade without resetting the running states. Choices survive model/vehicle changes
and retry, but reload restores HYBRID with all components on. Numeric tire controls remain source-owned
acoustic settings, separate from both the physical calibration and engine tuning panel.

[Audio](audio.md#hybrid-game-synthesis) owns the revised equations and boundaries;
[calibration](calibration.md#tire-audio-tuning) identifies settings and coupling. Change one group at a time
and distinguish method acceptance, transition/mix listening, spectrum/transient checks, host timing and
actual phone performance. Keep the fixed mechanics/rendering reference and valid lifecycle/observation
coverage. CURRENT/CONTACT/SPECTRAL remain waveform-preserving comparison references; changing them
requires an explicit contract revision. Keep this single checkpoint, not new handoff archives.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
