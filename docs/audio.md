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
uses one waveguide path for every vehicle, with no inactive legacy oscillators or vehicle-ID branches.
The [profile](../src/audio/vehicle-audio-profile.ts) has three concepts:

- Firing: cycle revolutions (1 or 2) and ordered firing phases; the phase count is the cylinder count.
- Pipes: collector membership, primary lengths and a common outlet length for each collector.
- Pulse: relative strength, full-excitation rise time and decay time in seconds.

Firing intervals represent engine configuration. Pipe lengths, grouping details and pulse values
are acoustic sketches, not manufacturer measurements. Pulse amplitude is dimensionless, not Pa;
there is no calculated cylinder pressure, gas mass flow, torque or temperature.
The compiler validates resource bounds and freezes private copies of all authored arrays/objects.
Legacy periodic-body/crack parameters and synthesis have been removed from the production contract.

The [exhaust model](../src/audio/exhaust-waveguide.ts) uses bidirectional primary and outlet delays.
Propagation delay is rounded to the nearest internal sample using a fixed effective wave speed.
Each traversal applies amplitude transmission `exp(-alpha * length)`. The shared alpha is a
phenomenological frequency-independent loss per meter, not a measured thermoviscous coefficient.
This replaces arbitrary loss per junction: subdivision preserves the analytic transmission law.
Collector scattering uses `p = 2 * sum(incoming) / portCount`, then `outgoing = p - incoming`.
This is the [lossless equal-admittance junction](https://www.dsprelated.com/freebooks/pasp/Lossless_Scattering.html),
assuming identical characteristic admittance for all ports; no actual pipe diameters are modeled.

The source boundary has a periodic, bounded reflection envelope. Its window and endpoint
coefficients are explicitly shared approximations, NOT measured valve timing, valve lift or
impedance. Phase zero denotes acoustic excitation; the old arbitrary combustion-to-exhaust phase
shift has been removed. The negative, filtered outlet reflection is also an approximation.
These boundary filters and coefficients remain named common constants, not per-vehicle knobs.
The sum of outgoing and low-passed outgoing waves is a fixed listening pickup, not a physical
microphone position or computed far-field radiation. Bank normalization is an output mixing choice.

One smoothed excitation proxy controls only pulse amplitude and rise time: closed excitation
retains a shared nonzero floor, and increasing excitation makes the pulse stronger and faster.
Decay time is authored and fixed. No extra load-dependent output filter or saturation drive is
applied, and no direct combustion bypass or stochastic noise is mixed into the engine output.
The gameplay adapter supplies delivered-drive fraction times actuator throttle (`drive`); this is
an acoustic control proxy, not `engineTorque / maxTorque(RPM)` or measured cylinder load.
Audio observes RPM and clamps to idle/redline without writing to physics. DC removal, fixed output
low-pass filtering and bounded soft saturation are output conditioning, not engine thermodynamics.
Constant filter/decay coefficients and pipe transmission are prepared once per profile.
Two acoustic steps per output sample remain; averaging is a simple decimator, not complete antialiasing.

The Porsche six alternates banks, with 120-degree global and 240-degree per-bank intervals;
see [Porsche's firing-order illustration](https://newsroom.porsche.com/christophorus/en/2017/383/model-kit-refinement-boxer-911.html).
Separate banks do not imply uneven firing. Downstream bank merging and turbo behavior are absent.
RC30/BMW collector groupings are sketches. The Vespa uses a 360-degree firing cycle but shares the
empirical boundary model; there is no tuned expansion chamber or port-flow simulation.
Intake waveguides, full muffler chambers, fuel cut and backfire are not implemented.

The [processor](../src/audio/exhaust-processor.ts) is registered through the existing noise module's
static import. It allocates no objects in the render loop. Profile messages prepare delay storage;
invalid profiles silence the processor, inactive slots output zero, and stop releases the model.
Voice replacement fades before acoustic state reset. Simple-reflection audition uses a fixed
source reflection at each outlet and omits primary return buffers and their per-cylinder work;
it is a comparison model, not an equivalent version of the coupled waveguide.

The accepted earlier waveguide is retained only as an executable [listening reference](../tools/waveguide-reference.mjs),
loaded by a diagnostic worklet from the comparison page. It preserves the earlier DSP equations
and output gain convention, using the selected current pipe/firing configuration. The game never
imports it. Prior Fourier/body-crack tests are superseded with waveguide pulse/RPM/load,
periodicity, stability and observation-boundary regressions; their implementation-specific
harmonic and fallback-switch requirements no longer apply to the single-path production voice.

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
one aggregate tire voice and wind. This means one tire oscillator, two exhaust worklets and one noise worklet,
regardless of the number of game actors;
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

[Audio tests](../tests/audio.test.mjs) cover authoring validation,
RPM/load causality, stationary/airborne/loose-surface tire behavior, actual wheel-solve
observation and recovery, nearest-rival selection and continuous worklet output.
[Lifecycle tests](../tests/audio-lifecycle.test.mjs) cover single-flight gesture startup,
late loading, failure cleanup/retry, hidden/muted states, disposal and bounded node count.
[Exhaust regressions](../tests/exhaust-waveguide.test.mjs) cover geometry/bank causality,
load, deterministic rendering and sustained feedback stability.
The [browser probe](../tools/audio-browser.html) renders all nine engine profiles at
44.1/48 kHz using the real Web Audio graph and reports finite output/headroom and RPM
response at open and closed throttle. It also offers a three-second
comparison of the accepted earlier waveguide, simple pipe reflection and the revised coupled waveguide
at the same selected RPM/throttle, plus an acceleration/coast sequence. Settled-cycle regressions cover every vehicle and five excitation levels.
Fixed gain is the default for load evaluation; optional RMS matching compares timbre
between methods. Quarter-throttle settings allow intermediate load evaluation.
The comparison is diagnostic only; its PCM buffers are test output, never game sound assets.

Chrome integration checks can verify all four course modes, sound controls and vehicle
switching. Desktop rendering is not phone performance certification. Actual speaker
listening, Safari/iOS acceptance and target-device CPU profiling remain calibration work.

[Host timing probe](../tools/exhaust-performance.mjs) warms the DSP and measures five
runs for one and two voices, including 2x acoustic stepping. It is a CPU kernel diagnostic,
not a browser scheduling, end-to-end graph or mobile performance certification.

## Reflection audition candidates

The browser probe adds five single-factor candidates beside unchanged simple reflection:
weaker/stronger outlet reflection, a lower boundary cutoff, higher propagation loss,
and lower closed-excitation floor. Candidate labels display the old/new values.
[Candidate data](../tools/reflection-candidates.mjs) and its diagnostic worklet are tools-only;
they reuse the production DSP with validated optional coefficient overrides. Default DSP
coefficients and game composition are unchanged. All candidates share the selected vehicle's
firing, pipe geometry and pulse profile. Geometry remains an authored approximation, not newly
verified factory pipework. No noise is added. Fixed gain preserves excitation differences;
RMS matching is available for timbre comparison. The candidate browser check covers six
settings, nine vehicles, two output rates, three RPM settings and open/closed excitation.
