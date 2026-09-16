# Next task checkpoint

## Restart

Read [AGENTS](../AGENTS.md), the [index](README.md), [architecture](architecture.md),
[audio](audio.md#unified-game-synthesis) and [calibration](calibration.md#tire-audio-tuning).
Inspect exact main, active PRs, CI and Pages before changing source. Preserve unrelated work and
use a `codex/` branch. Current repository evidence is the continuation authority.

Use Node.js 24, install dependencies, build and serve over HTTP. In `?mode=circuit`, start audio
and select UNIFIED. HYBRID remains the reload default. Compare at the same vehicle, physical
calibration, inputs and volume. [Development](development.md#tire-comparison-tools) owns commands
and evidence scopes.

## Next work: UNIFIED listening

The user requests a new method with later squeal onset and a continuous, convincing rubbing-to-squeal
transition from one generation mechanism. Architectural simplicity and the absence of ad hoc patches
are the priority. UNIFIED implements R plus one shared friction system Q; its S button is hidden.
The friction system uses the same vibration states for noise-driven rubbing and self-excited squeal,
without a separate amplitude envelope or an S/Q crossfade. Its parameters are authored acoustic choices.

HYBRID's squeal method remains accepted, and HYBRID remains the default. Its R/S/Q waveforms are
preserved while R is extracted into a shared source. UNIFIED is now the user's basis for further tuning,
with its high-mode default changed from 1,350 to 1,000 Hz by listening preference.
It is not automatically adopted as the reload default. CURRENT/CONTACT/SPECTRAL also remain unchanged comparison references.

| Comparison                               | Listening question                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| UNIFIED Q versus HYBRID S+Q              | Does mild slip remain predominantly rubbing, with a continuous approach to audible squeal?               |
| UNIFIED Q versus HYBRID Q                | Does clear squeal occur later, while strong slip still gives useful tonal texture and recovery feedback? |
| UNIFIED R versus HYBRID R                | The shared source is waveform-preserving; use the same input and seed for exact comparison.              |
| Complete UNIFIED R+Q versus HYBRID R+S+Q | Is the new friction response balanced against rolling and the accepted engine at fixed volume?           |

First compare friction through mild slip, sustained strong slip and gradual recovery, then the complete
mix. Include braking/locked sliding, supported stationary spin, reverse travel, loose surfaces, support
loss/recontact, independent axles and model changes/mute/retry. Distinguish modal instability from the
point where a listener hears squeal; neither an energy diagnostic nor output RMS proves audible onset
or realism. Do not add maneuver gates, onset timers, extra amplitude state, pitch maps or compensating
layers to conceal a failed transition. Revisit the shared mechanism and its authored parameters.

Component switches fade outputs without resetting running states or compensating other components.
Choices survive model/vehicle changes and retry; reload restores HYBRID with all components on.
DEV now opens a scrollable overlay with separate ENG/TIRE volume and eleven UNIFIED friction sliders.
Select UNIFIED to enable its sliders. Validate phone portrait/landscape scrolling, closing, slider
response and touch-driving isolation. The high-frequency slider/reset follows the 1,000 Hz default;
numeric defaults and ranges are unchanged by the Q-onset revision and remain authored, not measured.
Audio tuning remains separate from physical calibration and engine tuning.
[Audio](audio.md#unified-game-synthesis) owns equations and boundaries;
[calibration](calibration.md#tire-audio-tuning) maps settings and coupling. Keep numerical/spectral
checks, synthetic listening, host timing and actual device performance as distinct evidence.

The user requests quieter Q onset after reporting excessive broad rubbing near 20 km/h. The common
work response now uses `P/(P+powerReferenceWatts)` instead of its square root, for both noise forcing
and feedback. Weak work receives the largest reduction; the high-work upper bound, numeric settings,
output gain and 1,000 Hz high mode remain unchanged. No new gate, parameter, state or synthesis layer
is introduced. More work is needed to counter modal loss at the same slip, so the spectral onset
contract is explicitly revised while retaining the continuous rubbing-to-squeal transition.
The [input probe](../tools/tire-unified-input-probe.mjs) separates mechanics work/slip and R/Q RMS for
short coast/steer cases using browser calibration. It is not the user's drive or phone playback,
and equal perceived loudness is not established by RMS. Check mild turns and gradual rubbing-to-squeal
transitions on the user's device; preserve stationary wheelspin/locked-slide sound.

The user is considering removing R in favor of a separate wind source in the future. That is not
implemented or adopted as a default here: shared R and its comparison controls remain unchanged.

Preserve the fixed mechanics/rendering oracle and valid observation/lifecycle coverage. Changing any
existing comparison waveform requires an explicit revision rather than silently retuning its reference.
Keep this single checkpoint, not new handoff archives.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
