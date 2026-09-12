# Procedural audio

## Authority and scope

Audio is a read-only presentation layer. Physics owns RPM, wheel motion, actuator output,
contact load and tire utilization. Audio owns oscillator phase, envelopes and filter state,
never vehicle motion, gearing, race progress or a second engine simulation.

The [consumer contract](../src/audio/vehicle-audio-observation.ts) contains only acoustic
inputs. The [browser adapter](../src/browser/vehicle-audio.ts) copies the latest completed
observations into two reusable slots once per presented frame, not once per catch-up tick.
Physics publishes final wheel-solve rolling speed, slip speed and surface alongside its
existing control observations. Recovery clears those caches. Audio does not sample course
surfaces or repeat contact/tire solves.

## Synthesis

There are no recordings, audio assets or PCM loops. The
[combustion compiler](../src/audio/combustion-pulse.ts) constructs 96 Fourier harmonics
from a cycle length in crank revolutions, ordered firing phases and finite pulse width.
The DC coefficient is zero and the sum of harmonic magnitudes is normalized to one.
Web Audio PeriodicWave/OscillatorNode owns band-limited periodic playback. Coefficients
and waves are prepared on profile selection and cached for the life of each voice.

The [engine voice](../src/audio/engine-voice.ts) uses one oscillator, a peaking resonator,
a low-pass filter and a gain. Cycle frequency is RPM / (60 * cycle revolutions).
The idle floor and redline ceiling affect acoustic pitch only: physical RPM can be zero.
Throttle and delivered/requested drive-torque fraction control gain and brightness.
No shift timer or artificial torque interruption is added. Profile changes fade down
before replacing the waveform; continuous values use short AudioParam smoothing.

The [nine authored profiles](../src/vehicle/sound-profiles.ts) are acoustic sketches,
not calibrated replicas of real exhaust systems. The vehicle catalog binds profiles;
the audio engine contains no vehicle IDs or car/bike branches. A single combined pulse
train does not simulate separate exhaust banks, turbo machinery or irregular combustion.

The [tire voice](../src/audio/tire-voice.ts) aggregates front/rear observations into
rolling noise, friction noise and a weak resonant squeal tone. Rolling sound depends on
load, rolling speed and physical surface. Friction/squeal additionally require actual
slip speed and tire utilization. Unsupported stations and stationary, nonslipping tires
are silent. Loose surfaces reduce tonal squeal and increase rolling noise. These are
presentation mappings, not another friction law or a new interpretation of grip.

One [noise worklet](../src/audio/noise-processor.ts) continuously generates three
independent deterministic pseudorandom streams for rolling, friction and wind. Its
render loop allocates no objects and accepts the browser's actual block length. Wind
is low-pass noise with squared speed-dependent gain; it remains audible in flight.

## Mixing and lifetime

The [audio engine](../src/audio/audio-engine.ts) has fixed player and rival engine slots,
one aggregate tire voice and wind. This means three oscillators and one noise worklet,
regardless of the number of game actors. Voices feed one master gain and a protective
compressor. The compressor is not a guaranteed hard peak limiter; gains retain headroom.
No spatial reflection, occlusion, Doppler, event sounds or music is implemented.

Only the nearest rival within 100 world meters is selected. Attenuation uses physical
3D distance; stereo pan uses displacement in the player's yaw frame. Local stage
chainage and raster depth do not enter this calculation. Rival changes fade the old
slot before reusing it. Other actors have no active sound nodes, and rivals have no
tire or wind voices.

The [browser lifecycle](../src/browser/audio-lifecycle.ts) constructs AudioContext only
on a user gesture. The SOUND button mutes/unmutes and VOL controls master volume.
Hidden tabs and stopped shells suspend audio; mute fades before suspension. Resume,
module-loading failure, late initialization, page cache restoration and disposal are
handled without preventing gameplay. Browsers without AudioWorklet remain playable
with SOUND UNAVAILABLE. No fallback sample player is installed.

The worklet is resolved relative to import.meta.url, preserving complete commit-versioned
ESM delivery. Static worker URLs are production reachability edges in the repository
hygiene check. Audio imports only Core; vehicle may bind audio profile types/data;
browser composes audio and physical observations. Physics never imports audio.

## Verification and limits

[Audio tests](../tests/audio.test.mjs) cover firing spectra, authoring validation,
RPM/load causality, stationary/airborne/loose-surface tire behavior, actual wheel-solve
observation and recovery, nearest-rival selection and continuous worklet output.
[Lifecycle tests](../tests/audio-lifecycle.test.mjs) cover single-flight gesture startup,
late loading, failure cleanup/retry, hidden/muted states, disposal and bounded node count.
The [browser probe](../tools/audio-browser.html) renders all nine engine profiles at
44.1/48 kHz using the real Web Audio graph and reports finite output/headroom and RPM
response. Its PCM buffers are test output, never game sound assets.

Chrome integration checks can verify all four course modes, sound controls and vehicle
switching. Desktop rendering is not phone performance certification. Actual speaker
listening, Safari/iOS acceptance and target-device CPU profiling remain calibration work.
