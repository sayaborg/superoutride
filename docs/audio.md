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
source reflection at each outlet and omits primary return buffers, source-boundary filter state,
collector-pressure state/calculation and the second cylinder pass;
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

## Reflection audition controls

The audition UI exposes four combinable sliders for outlet reflection, boundary cutoff,
propagation attenuation and closed-excitation floor. Displayed values and reset come directly
from the DSP's shared defaults (-1, 3100 Hz, 0.03 Np/m and 0.22). Outlet reflection includes
zero at the right endpoint and a dedicated zero button; the readout explicitly labels no outlet
reflection. This changes the coefficient, not the DSP algorithm or allocation strategy.
Slider changes take effect on the next playback, not during an already rendered clip.
The selected setting can be checked across all nine vehicles and both output rates.
[Single-factor candidate data](../tools/reflection-candidates.mjs) remains a regression fixture.
The diagnostic worklet reuses the production DSP with validated optional coefficient overrides;
production defaults and vehicle geometry are unchanged. No noise is added.

Read-only vehicle data is generated directly from the selected catalog profile: cycle, cylinder
count, idle/redline, firing phases and intervals, collector membership, primary/outlet/total path
lengths, and pulse settings. Rows identify firing events, not manufacturer cylinder numbers.
Collector labels do not assert physical left/right bank names. Lengths and topology include
acoustic sketches and are explicitly not presented as measured manufacturer pipework.

## Reference conditions for default coefficients

The defaults use an explicit **assumed reference**, not measured vehicle pipework: a 50 mm
internal-diameter unflanged circular pipe, 573.15 K (300 C) air at 101325 Pa, gamma 1.4,
R = 287 J/(kg K), Pr = 0.71, and 500 Hz for the constant propagation-loss surrogate.
These are not universal exhaust conditions; composition, temperature gradients, mean flow,
large-amplitude waves, mufflers and true pipe radii remain outside this model.

- [NASA's ideal-gas sound-speed relation](https://www.grc.nasa.gov/www/k-12/VirtualAero/BottleRocket/airplane/sound.html)
  gives c = sqrt(gamma R T), rounded to 480 m/s (the existing propagation speed).
- [Silva et al., Eq. 10](https://arxiv.org/abs/0811.3625) gives the unflanged low-frequency
  magnitude |R| = 1 - (ka)^2/2 + higher terms; the open-end pressure sign is negative.
  Set the DC reflection to -1, then the existing one-pole boundary filter rolls off its magnitude.
  Matching the analog one-pole magnitude expansion gives fc = c/(2 pi a), rounded to 3100 Hz.
  The discrete filter approximates that analog response. This does NOT match the full radiation
  impedance or its end-correction phase (0.6133a in the low-frequency unflanged case).
- [The circular-duct attenuation relation](https://doi.org/10.1186/s13362-018-0057-0)
  gives alpha = sqrt(pi f nu)/(a c) * (1 + (gamma-1)/sqrt(Pr)).
  Air viscosity uses [Sutherland coefficients](https://doc.comsol.com/6.4/doc/com.comsol.help.cfd/cfd_ug_fluidflow_high_mach.08.46.html)
  mu0 = 1.716e-5 Pa s, T0 = 273 K, S = 111 K; density is p/(R T), and nu = mu/rho.
  This gives approximately 0.034 Np/m at 500 Hz, rounded to 0.03 Np/m for the slider.
  Actual boundary-layer loss varies with frequency; the production delay retains constant alpha.
- Closed excitation 0.22 and the source reflection envelope remain authored sound controls.
  Pipe acoustics cannot determine fuel delivery, engine load or valve impedance. They are not
  described as measured or physically derived defaults.

Allowing -1 does not remove the rest of the network's losses: propagation, boundary filtering
and the fixed source termination still dissipate energy. Positive pressure reflection is not
introduced; it would represent a different termination. The UI now reaches -1 exactly.

## Minimal implementation boundary

Keep one sample kernel and one fixed-delay primitive. Pulse generation and outlet filtering are
shared; only the collector/source-return coupling differs between the two audition models.
Simple reflection writes each primary immediately after reading it, in the pulse pass. Coupled
primaries wait for collector scattering before writing. Read/write order preserves each delay's
sample latency. No mode strategies, graph framework or per-vehicle branches are needed.

Validated tuning contains only the four adjustable coefficients; fixed source constants are not
copied into each instance. Compiled immutable firing phases are read directly. Bank normalization
is prepared once. Each remaining mutable buffer represents a pulse envelope, filter memory,
traveling wave or current collector sum/pressure; coupled-only memory is absent in simple mode.

The provisional coefficients and approximation limits above remain unchanged. Removing the
second pulse state changes pulse shape; collapsing the two outlet delays changes filter/propagation
ordering; dropping source coupling makes a different acoustic model. These are sound-design changes,
not behavior-preserving simplifications. Further abstraction would add indirection without removing
an independent acoustic responsibility.

For exact sample comparison with a supplied pre-change compiled module, run
`node tools/exhaust-equivalence.mjs /absolute/path/to/exhaust-waveguide.mjs` after building.
The diagnostic covers both modes, all catalog profiles, both internal rates, coefficient overrides,
RPM/load transitions and stopping. It compares raw samples without tolerances or output normalization.

## Generated-waveform audition

The comparison page can bake the selected simple-reflection settings into a single cached bank
of 17 RPM points (idle through redline) by five excitation levels (0 through 1). Each table holds
4096 Float32 values over one complete firing cycle: 85 tables, 1.328125 MiB per cached bank.
The worklet receives its own copy while playing. Changing vehicle or tuning replaces the cache
on the next generated-waveform request; these are synthesized waves, not recordings or game assets.

The [baker/player](../tools/exhaust-wavetable.mjs) uses the existing DSP at 96 kHz, warms each
point for two seconds, and captures a phase-aligned cycle using a read-only acoustic phase getter.
Capture yields between tables and can be cancelled by Stop or another audition. Phase alignment
keeps different RPM/load tables on the same firing reference. Capture duration, grid density and
table length are approximation budgets, not physical constants or convergence guarantees.

Playback advances one common phase, interpolates within each cycle and blends the four adjacent
RPM/load tables. It keeps 25 ms control smoothing and two internal samples per output sample,
but runs no pipe network. The captured output already includes DC removal, tone shaping and
saturation. Interpolation of those finished waves is deliberately NOT equivalent to interpolating
physical pressures before nonlinear processing. Resonance positions between RPM grid points,
rapid control transients, lingering pipe energy, residual capture transients and spectral aliasing
are approximation limits. No claim of exact waveform equivalence or complete antialiasing is made.
The game keeps its procedural voices while this tools-only alternative is auditioned.

Run `node tools/exhaust-table-performance.mjs GOLF_GTI_16V` for generation time, table bytes and
alternating seven-run warmed medians of simple-reflection versus table playback on the same host.
This is a kernel timing diagnostic, not target-device performance certification.
