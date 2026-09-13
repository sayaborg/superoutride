# Procedural audio

## Authority and scope

Audio is a read-only presentation layer. Physics owns RPM, wheel motion, actuator output,
contact load and tire utilization. Audio owns oscillator phase, envelopes and filter state,
never vehicle motion, gearing, race progress or a second engine simulation.

The [consumer contract](../src/audio/vehicle-audio-observation.ts) contains only acoustic
inputs. The [browser adapter](../src/browser/vehicle-audio.ts) copies observations into two reusable
slots once per presented frame, not once per catch-up tick. The player uses `readVehicleAudio`;
rivals use `readEngineAudio` without subscribing to tire telemetry.
Physics publishes final wheel-solve rolling speed, slip speed, directional slip power and surface through an
[optional read-only observation channel](../src/physics/vehicle-tire-observation.ts).
The first reader subscribes; the next completed tick supplies data. A WeakMap owns these
output caches outside the unchanged vehicle/control snapshot. Recovery clears them.
Unobserved vehicles skip the additional telemetry calculations. Audio does not sample course
surfaces or repeat contact/tire solves.

## Source ownership

| Responsibility                                                          | Owner                                                                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Shared sample kernel, delays and both temporary topologies              | [exhaust-waveguide](../src/audio/exhaust-waveguide.ts)                                                                                    |
| Shared tuning defaults, reference conditions and fixed output constants | [exhaust-acoustics](../src/audio/exhaust-acoustics.ts)                                                                                    |
| Firing, pipe and pulse contract/validation                              | [vehicle-audio-profile](../src/audio/vehicle-audio-profile.ts); authored bindings in [vehicle catalog](../src/vehicle/vehicle-catalog.ts) |
| Worklet transport and two acoustic steps per output sample              | [exhaust-processor](../src/audio/exhaust-processor.ts)                                                                                    |
| Reusable voice and faded profile/method/tuning replacement              | [engine-voice](../src/audio/engine-voice.ts)                                                                                              |
| Two engine slots, one player tire worklet and master output graph       | [audio-engine](../src/audio/audio-engine.ts)                                                                                              |
| Observation adaptation and browser lifetime                             | [vehicle-audio](../src/browser/vehicle-audio.ts), [audio-lifecycle](../src/browser/audio-lifecycle.ts)                                    |
| Shared game/audition sliders, labels, ranges and reset                  | [audio-tuning-controls](../src/browser/audio-tuning-controls.ts)                                                                          |

The [restart checkpoint](NEXT.md) owns continuation priorities. This document owns current behavior;
past experiments and validation run results remain in Git and PR/CI evidence.

## Synthesis

There are no recordings, audio assets or PCM loops. The [engine voice](../src/audio/engine-voice.ts)
uses the same exhaust kernel for both methods and every vehicle, with no inactive legacy oscillators or vehicle-ID branches.
The [profile](../src/audio/vehicle-audio-profile.ts) has three concepts:

- Firing: cycle revolutions (1 or 2) and ordered firing phases; the phase count is the cylinder count.
- Pipes: collector membership, primary lengths and a common outlet length for each collector.
- Pulse: relative strength, full-excitation rise time and decay time in seconds.

Firing intervals represent engine configuration. Pipe lengths, grouping details and pulse values
are acoustic sketches, not manufacturer measurements. Pulse amplitude is dimensionless, not Pa;
there is no calculated cylinder pressure, gas mass flow, torque or temperature.
The compiler validates resource bounds and freezes private copies of all authored arrays/objects.
At fixed RPM and excitation, firing and pulse generation are deterministic; there is no
event-to-event strength variation or timing jitter.

The coupled [exhaust model](../src/audio/exhaust-waveguide.ts) uses bidirectional primary and outlet delays.
Propagation delay is rounded to the nearest internal sample using a fixed effective wave speed.
Each traversal applies amplitude transmission `exp(-alpha * length)`. The shared alpha is a
phenomenological frequency-independent loss per meter, not a measured thermoviscous coefficient.
This replaces arbitrary loss per junction: subdivision preserves the analytic transmission law.
Collector scattering uses `p = 2 * sum(incoming) / portCount`, then `outgoing = p - incoming`.
This is the [lossless equal-admittance junction](https://www.dsprelated.com/freebooks/pasp/Lossless_Scattering.html),
assuming identical characteristic admittance for all ports; no actual pipe diameters are modeled.

The source boundary has a periodic, bounded reflection envelope. Its window and endpoint
coefficients are explicitly shared approximations, NOT measured valve timing, valve lift or
impedance. Phase zero denotes acoustic excitation. The negative, filtered outlet reflection is also an approximation.
These boundary filters and coefficients remain named common constants, not per-vehicle knobs.
The sum of outgoing and low-passed outgoing waves is a fixed listening pickup, not a physical
microphone position or computed far-field radiation. Bank normalization is an output mixing choice.

One smoothed excitation proxy controls only pulse amplitude and rise time: closed excitation
retains a shared nonzero floor, and increasing excitation makes the pulse stronger and faster.
Decay time is authored and fixed. Catalog pulse rise/decay now differ between vehicles: sharper, shorter
pulses for the high-revving multi-cylinder and two-stroke sketches; longer envelopes for the
large twins and V8. These are provisional listening choices, not measured combustion durations. No extra load-dependent output filter or saturation drive is
applied, and no direct combustion bypass or stochastic noise is mixed into the engine output.
The gameplay adapter supplies delivered-drive fraction times actuator throttle (`drive`); this is
an acoustic control proxy, not `engineTorque / maxTorque(RPM)` or measured cylinder load.
Audio observes RPM and clamps to idle/redline without writing to physics. Each voice uses
the [shared output conditioning](#output-conditioning) after bank mixing.
Constant filter/decay coefficients and pipe transmission are prepared once per profile.
Two acoustic steps per output sample remain; averaging is a simple decimator, not complete antialiasing.

The Porsche six alternates banks, with 120-degree global and 240-degree per-bank intervals;
see [Porsche's firing-order illustration](https://newsroom.porsche.com/christophorus/en/2017/383/model-kit-refinement-boxer-911.html).
Separate banks do not imply uneven firing. Downstream bank merging and turbo behavior are absent.
RC30/BMW collector groupings are sketches. The Vespa uses a 360-degree firing cycle but shares the
empirical boundary model; there is no tuned expansion chamber or port-flow simulation.
Intake waveguides, full muffler chambers, fuel cut and backfire are not implemented.

The [processor](../src/audio/exhaust-processor.ts) is registered directly by the audio engine and audition page. It allocates no objects in the render loop. Profile messages prepare delay storage;
invalid profiles silence the processor, inactive slots output zero, and stop releases the model.
Voice replacement fades before acoustic state reset. Simple reflection uses a fixed
source reflection at each outlet and omits primary return buffers, source-boundary filter state,
collector-pressure state/calculation and the second cylinder pass;
it is a comparison model, not an equivalent version of the coupled waveguide.

## Output conditioning

Both methods use this order per voice, before voice/master gain and the master compressor:

```text
Bank mixing → 18 Hz DC removal → soft clipping → adjustable final one-pole LPF
```

After DC removal, the kernel applies `y = 0.65 * x / (1 + abs(x))` independently to each
sample. It approaches the bounds ±0.65, with small-signal gain 0.65 and progressively
stronger compression at larger amplitudes. The denominator's 1 sets the input amplitude
scale; it is not a hard clipping threshold. There is no attack/release envelope or separate
load-dependent drive in this stage. Its generated harmonics are filtered by the final LPF.
The master compressor is a separate stage with its own attack/release.

The final filter is `tone += a * (y - tone)`, where
`a = 1 - exp(-2 * pi * outputCutoffHz / internalSampleRate)`. It approximates a one-pole
low-pass (about -6 dB/oct); it is outside the pipe feedback. The separate `returnCutoffHz`
filters reflected waves and also participates in the fixed listening pickup.

The soft-clip amplitude scale/ceiling and final LPF are provisional output conventions,
not derived cylinder pressure, muffler transmission loss or nonlinear gas dynamics.
"Muffler" in the slider label describes its listening purpose; no muffler chamber is modeled.

## Player tire synthesis

Production tire audio replaces the deferred single-sine prototype. The former aggregated
prototype assertions are superseded by independent front/rear mapping, spectral, transport,
continuity and lifecycle tests; physical observation/recovery/invariance coverage remains.

[Physics telemetry](../src/physics/vehicle-tire-observation.ts) publishes longitudinal and lateral
slip power from the accepted wheel solve: `Px = max(0, fx * sx * referenceSpeed)` and
`Py = max(0, fy * sy * referenceSpeed)`, in watts. The solver's slip signs follow the force direction,
so both products are dissipative. Unsupported contacts publish zero. This observes final forces;
it does not rerun the tire law, change snapshots or approximate force from utilization.

The [mapping and sample kernel](../src/audio/tire-synthesis.ts) own all acoustic conventions.
Each axle independently combines rolling noise, broad scrub and two fixed narrow bandpass modes
at 1050/1630 Hz with Q 18/24. No sinusoidal oscillator, PCM asset or delay loop is used.
Increasing the narrow-band mix raises perceived tonality without sweeping filter poles.
The fixed compensation gains are listening choices, not an exact equal-loudness model.

- Rolling uses load, rolling speed and a physical-surface coefficient.
- Friction uses `sqrt(P / (P + 12000 W))`; this is a bounded acoustic intensity proxy, not acoustic watts.
- Squeal also uses a smooth utilization onset from 0.5 to 1.15 and surface susceptibility.
- Lateral work moderately favors squeal; longitudinal work favors scrub but still squeals.
- Loose surfaces favor rolling/scrub and reduce squeal. A stopped nonslipping or unsupported axle is silent after its short release.

Independent fixed-seed random streams excite each axle. Scrub is band-limited with a 5500 Hz
one-pole low-pass and the rolling-band subtraction to reduce brittle high-frequency hiss. A low-passed noise envelope adds slight
roughness. Gains use 25 ms attack and 65 ms release; the rolling cutoff is smoothed. Each axle
has a bounded soft output at ±0.35, mixed mono at the player. This does not claim front/rear
spatial localization, material measurements, stick-slip mechanics or a tire vibration simulation.

The [voice](../src/audio/tire-voice.ts) sends two small parameter records per presented frame.
The [processor](../src/audio/tire-processor.ts) owns two axle kernels, allocates nothing in its
sample loop, fades invalid controls to silence and stops on disposal. Engine and tire processors
are registered through one [module entry](../src/audio/vehicle-processor.ts), so module loading
remains one lifecycle transaction. Engine topology/profile fades do not rebuild tire nodes.

The independent [noise prototype](../src/dev/diagnostics/noise-processor.ts) and wind prototype
remain deferred and disconnected. No wind graph runs.

The [tire audition](../tools/tire-browser.html) exercises front, rear and both axles through
rolling, lateral slide, wheel lock, loose surface and release using the production worklet.
These are authored acoustic test inputs, not a second driving simulation. It also renders
both output rates and checks finite output and silent release. Listen in the game for calibration.

## Mixing and lifetime

The [audio engine](../src/audio/audio-engine.ts) has fixed player and rival engine slots plus one player tire worklet:
three worklets and no oscillators, regardless of the number of game actors;
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
handled without preventing gameplay. The game's ENGINE A/B selector uses the same `coupled` choice
as the audition. It changes both engine slots, preserves node counts and passes through the existing
90 ms fade before resetting acoustic state. Profile, topology and committed coefficient changes share one pending target;
rapid superseding choices cannot apply a stale target. Selection made while loading, muted or
suspended applies when rendering resumes. Native selector and tuning-slider keys do not reach driving-key handlers.
No vehicle state, route progress or recovery transaction is changed. Browsers without AudioWorklet remain playable
with SOUND UNAVAILABLE. No fallback sample player is installed.

The worklet module entry is resolved relative to import.meta.url, preserving complete commit-versioned
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
load, deterministic rendering, sustained feedback stability, the post-clip low-pass transient bound
and independence of final-cutoff changes from the underlying reflected/clipped signal.
The [browser probe](../tools/audio-browser.html) renders all nine engine profiles at
44.1/48 kHz using the real Web Audio graph and reports finite output/headroom and RPM
response at open and closed throttle. It also offers a three-second
comparison of optimized simple reflection and the optimized coupled waveguide
at the same selected RPM/throttle, plus an acceleration/coast sequence. Settled-cycle regressions cover every vehicle and five excitation levels.
Fixed gain is the default for load evaluation; optional RMS matching compares timbre
between methods. Quarter-throttle settings allow intermediate load evaluation.
The comparison is diagnostic only; its PCM buffers are test output, never game sound assets.

Chrome integration checks can verify all four course modes, sound controls and vehicle
switching. Desktop rendering is not phone performance certification. Actual speaker
listening, Safari/iOS acceptance and target-device CPU profiling remain calibration work.

[Host timing probe](../tools/exhaust-performance.mjs) warms the coupled waveguide and measures five
runs for one and two voices, including 2x acoustic stepping, plus the two-axle tire kernel at the native output rate. It is a CPU kernel diagnostic,
not a paired method benchmark or browser scheduling, end-to-end graph or mobile performance certification.

## Temporary method selection and shared tuning

The game and audition selectors offer exactly `reflection` and `waveguide`. Both are temporary candidates;
only one will be adopted. The selector maps to the core's `coupled` topology choice at voice
construction or a faded replacement. That choice remains fixed for the lifetime of the kernel;
the sample method branches on it. Switching stops the current
audition; Play creates one selected voice. The game starts with waveguide and switches its two
existing slots without reconstruction of the audio graph. No permanent method is adopted yet.

Both choices use the same production voice/worklet, observations, authoring and validated tuning.
There is no separate audition DSP wrapper, old-waveguide reference or generated-waveform bank.
Those retired experiments and their experiment-only tests remain retrievable in Git; the live
DSP's causal/periodic/stability tests remain in force.

Game and audition use one tuning control for five combinable sliders. The values below describe
`DEFAULT_EXHAUST_TUNING` in the acoustic settings; code owns the defaults and validation, and
the shared control owns UI ranges/steps. Reset reads those defaults directly.

| Slider                                | Key                   | Default   | UI range     | Step      |
| ------------------------------------- | --------------------- | --------- | ------------ | --------- |
| Outlet pressure reflection            | `outletReflection`    | -1        | -1–0         | 0.01      |
| Reflection-wave high-frequency cutoff | `returnCutoffHz`      | 3100 Hz   | 500–10000 Hz | 100 Hz    |
| Propagation amplitude loss            | `attenuationPerMeter` | 0.03 Np/m | 0–0.30 Np/m  | 0.01 Np/m |
| Closed-throttle excitation floor      | `closedExcitation`    | 0.22      | 0.01–1       | 0.01      |
| Final LPF (muffler approximation)     | `outputCutoffHz`      | 7300 Hz   | 100–12000 Hz | 100 Hz    |

Outlet reflection includes zero at the right endpoint; the readout explicitly labels no
outlet reflection. This changes the coefficient, not the DSP algorithm or allocation strategy.
Input updates the readout; release (or a keyboard step) commits a coefficient snapshot. In the
game it uses the same 90 ms fade as method/profile replacement and affects both fixed engine
slots. No acoustic buffers are rebuilt while dragging. A selection made before initialization
or while muted is retained. Method and vehicle changes preserve tuning, and reset restores
the shared defaults. The audition uses the committed values on its next playback, not during
an already rendered clip. Settings are session-local; a page/course reload restores defaults.
The selected setting can be checked across all nine vehicles and both output rates.
[Single-factor candidate data](../tools/reflection-candidates.mjs) remains a regression fixture.
The production worklet accepts validated optional coefficient overrides in initial options and
profile-replacement messages. Both paths preserve the chosen topology and tuning. Tuning does not
change vehicle geometry or add noise.

Read-only vehicle data is generated directly from the selected catalog profile: cycle, cylinder
count, idle/redline, firing phases and intervals, collector membership, primary/outlet/total path
lengths, and pulse settings. Rows identify firing events, not manufacturer cylinder numbers.
Collector labels do not assert physical left/right bank names. Lengths and topology include
acoustic sketches and are explicitly not presented as measured manufacturer pipework.

## Reference conditions for default coefficients

The [acoustic settings](../src/audio/exhaust-acoustics.ts) own all shared provisional coefficients,
reference conditions and output conditioning separately from the sample kernel.
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
shared; only the collector/source-return coupling differs between the two models.
Simple reflection writes each primary immediately after reading it, in the pulse pass. Coupled
primaries wait for collector scattering before writing. Read/write order preserves each delay's
sample latency. No mode strategies, graph framework or per-vehicle branches are needed.

Validated tuning contains only the five adjustable coefficients; fixed source constants are not
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
Use it for waveform-preserving refactors; an intentional output-order change is not expected
to match a reference with a different order.

## Provisional boundary and output interpretation

For linear pressure waves at a termination,
[the impedance relation](https://www.dsprelated.com/freebooks/pasp/Reflectance_Impedance.html)
is R = (Z - Z0)/(Z + Z0). The shared source endpoint
coefficients +0.94 and -0.3 therefore correspond to positive, real effective impedance ratios
Z/Z0 of about 32.3 and 0.538. This motivates nearly rigid and pressure-release-like endpoints;
these numbers are not measured valve impedances. The sinusoidal transition over 0.23 firing
cycles is an empirical aperture envelope, not valve timing, area or a gas-flow solution.
Simple reflection uses +0.94 as a fixed effective upstream termination; it omits primary
return interaction. The waveguide uses the periodic envelope on each primary return.
The same boundary low-pass is reused at the outlet and source for economy, not because their
real frequency responses are identical. These are explicitly provisional approximations.

The 25 ms control response, square-root bank mixing normalization and
[output conditioning](#output-conditioning) are presentation conventions. Pulse strength
is relative; rise/decay values are time constants of the excitation envelope. None is presented
as combustion pressure, engine inertia or a measured exhaust property. Read-only UI text separates
these controls from reference-derived propagation and outlet coefficients. Pipe lengths may
remain sketches during comparison.

## Removing the rejected method

The temporary branch is confined to `coupled` in the exhaust constructor/sample kernel and
its voice/worklet options. Keep the shared delay, pulse, outlet, tuning and output implementation;
do not maintain two copies or add a permanent method/plugin framework.

- Adopt waveguide: remove the simple primary write and fixed-return collector branch; allocate
  primary returns, source filter and collector pressure unconditionally.
- Adopt reflection: remove primary returns, source filter, collector pressure and the second
  cylinder pass; keep the single-pass primary write and fixed-return collector branch. Remove
  source-open/window coefficients, which are then unused.
- In either case, remove `coupled` options/setters and both selectors/descriptions, specialize the
  remaining kernel, and remove only rejected-method comparison assertions. Retain remaining
  geometry, RPM/load, tuning, stability and lifecycle coverage. No physics or vehicle authoring
  migration is needed. Revalidate the chosen waveform before adoption.
