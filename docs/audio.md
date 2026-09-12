# Procedural audio

## Authority and scope

Audio is a read-only presentation layer. Physics owns RPM, wheel motion, actuator output,
contact load and tire utilization. Audio owns oscillator phase, envelopes and filter state,
never vehicle motion, gearing, race progress or a second engine simulation.

The [consumer contract](../src/audio/vehicle-audio-observation.ts) contains only acoustic
inputs. The [browser adapter](../src/browser/vehicle-audio.ts) copies the latest completed
observations into two reusable slots once per presented frame, not once per catch-up tick.
Physics publishes final wheel-solve rolling speed, slip speed and surface through an
[optional read-only observation channel](../src/physics/vehicle-tire-observation.ts).
The first reader subscribes; the next completed tick supplies data. A WeakMap owns these
output caches outside the unchanged vehicle/control snapshot. Recovery clears them.
Unobserved vehicles skip the additional telemetry calculations. Audio does not sample course
surfaces or repeat contact/tire solves.

## Synthesis

There are no recordings, audio assets or PCM loops. The [engine voice](../src/audio/engine-voice.ts)
selects synthesis from authored exhaust topology, never vehicle IDs. All nine catalog engines have experimental topology; the previous
[periodic body/crack voice](../src/audio/periodic-engine-voice.ts) remains a listening
reference and fallback for profiles without topology. These are listening candidates,
not calibrated replicas. Authored primary/outlet lengths
and effective hot-gas wave speed are acoustic approximations, not measured dimensions.

The Porsche six uses alternating banks, with 120-degree global firing intervals and
240-degree intervals within each bank. Its 1-6-2-4-3-5 firing order is also illustrated
in [Porsche’s engine model article](https://newsroom.porsche.com/christophorus/en/2017/383/model-kit-refinement-boxer-911.html).
Separate banks do not by themselves produce uneven firing. The current independent
outlets omit downstream bank merging and turbo behavior; the RC30 and BMW collector
groupings are also acoustic sketches. The Vespa retains its 360-degree firing cycle,
but uses the common excitation/reflection model, not a tuned expansion-chamber model.

The [exhaust model](../src/audio/exhaust-waveguide.ts) owns one forward and backward delay
per cylinder and one outlet/return pair per exhaust bank. Equal-admittance scattering
at the collector sends returning pressure toward other ports. Valve opening changes
cylinder-end reflection; outlet reflection is negative and filtered. Loss at boundaries
keeps the feedback network dissipative. This is an acoustic network, not gas-flow or
thermodynamic simulation. The optional simple-reflection comparison removes the
valve/junction return coupling while preserving excitation and pipe delay.

Authored firing intervals drive exhaust blowdown with a common 0.2-cycle offset.
Each firing excites a smoothed decaying pulse with load-dependent amplitude and decay.
A small direct combustion pulse is mixed with the reflected exhaust. This pulse-only
evaluation removes flow/intake noise and random firing-strength variation; there is no full intake waveguide, muffler chamber
network, turbo, fuel-cut or backfire model. DC removal, low-pass filtering and bounded
soft saturation follow the pipe output. Two acoustic steps per output sample reduce
firing quantization; averaging is a simple decimator, not a complete antialiasing solution.

The [processor](../src/audio/exhaust-processor.ts) is registered by the existing noise
module's static import. Its audio-rate loop allocates no objects. Profile messages
prepare delay storage; every block reads RPM/load AudioParams. Invalid profiles silence
the processor, stop releases its model, and inactive slots render zero. Switching topology
fades down before resetting acoustic state. The periodic fallback keeps its own tested
waveform fade. No allocations are made per firing and no source nodes are created per tick.

Physics remains authoritative for RPM. Idle/redline bounds affect sound only. Load is
still a presentation proxy combining actuator throttle and delivered/requested torque,
not cylinder pressure. Audio smooths these inputs without writing to physics. No separate
crank acceleration, gearing or torque simulation is introduced.

The prior [combustion compiler](../src/audio/combustion-pulse.ts) remains in use by the
periodic fallback and listening reference. It prepares bounded, DC-free Fourier pulse
coefficients; Web Audio owns band-limited playback. That model's exact periodicity
requirement applies only to the periodic voice. The pulse-only exhaust also has
causal topology, load, determinism and bounded-feedback tests. Firing phases are unchanged.

The design is informed by [Baldan et al.](https://doi.org/10.1109/SIVE.2015.7361287)
and the openly inspectable [enginesound implementation](https://github.com/DasEtwas/enginesound).
The compact implementation here uses no imported audio assets or third-party source code.

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
one aggregate tire voice and wind. This means five fallback/tire oscillators, two exhaust worklets and one noise worklet,
regardless of the number of game actors. Inactive fallback oscillators remain allocated;
unused exhaust processors render zero. Voices feed one master gain and a protective
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
[Exhaust regressions](../tests/exhaust-waveguide.test.mjs) cover geometry/bank causality,
load, deterministic rendering and sustained feedback stability.
The [browser probe](../tools/audio-browser.html) renders all nine engine profiles at
44.1/48 kHz using the real Web Audio graph and reports finite output/headroom and RPM
response at open and closed throttle. It also offers a three-second
comparison of the prior body/crack graph, simple pipe reflection and coupled waveguides
at the same selected RPM/throttle, plus an acceleration/coast sequence. Exact-period tests apply only to the periodic fallback.
Fixed gain is the default for load evaluation; optional RMS matching compares timbre
between methods. Quarter-throttle settings allow intermediate load evaluation.
The comparison is diagnostic only; its PCM buffers are test output, never game sound assets.

Chrome integration checks can verify all four course modes, sound controls and vehicle
switching. Desktop rendering is not phone performance certification. Actual speaker
listening, Safari/iOS acceptance and target-device CPU profiling remain calibration work.

[Host timing probe](../tools/exhaust-performance.mjs) warms the DSP and measures five
runs for one and two voices, including 2x acoustic stepping. It is a CPU kernel diagnostic,
not a browser scheduling, end-to-end graph or mobile performance certification.
