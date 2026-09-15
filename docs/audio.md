# Procedural audio

## Authority and scope

Audio is a read-only presentation layer. Physics owns RPM, actuators, wheel motion, load and tire
utilization; audio owns oscillator, envelope and filter state. Audio imports only Core. Vehicle binds
acoustic profiles, and browser composition adapts completed physical observations. Audio never writes
motion, gearing, recovery or race progress, and never repeats the authoritative vehicle contact or tire solves.

The engine is the accepted sample-free listening baseline. CURRENT and CONTACT remain tire comparison
references, not calibrated real-tire models or final adoption. CURRENT is the reload default.
[The checkpoint](NEXT.md#next-decision-a-third-tire-sound-method) owns the requested third-method
investigation; this specification describes the retained runtime, not the future method selection.
Both current tire implementations generate sound without recordings. That fact does not prohibit a
prepared-sound or hybrid tire candidate. Keep the engine waveform and fixed voice/lifecycle boundaries
unchanged; actual Android performance, tire timbre and final mix acceptance remain open.

**Interpretation rule:** reference-derived coefficients use the explicit assumptions below; authored
coefficients, pipe geometry and acoustic output are listening conventions. Neither category represents
measured vehicle acoustics. Pulse strength is dimensionless, not pressure or acoustic power. This rule
applies to every profile, coefficient and UI readout unless a measurement is explicitly identified.

## Source ownership

- [Acoustic settings](../src/audio/exhaust-acoustics.ts): `ExhaustTuning`, defaults, kernel domains,
  narrower UI domains, steps, validation, reference conditions and fixed exhaust coefficients.
- [Waveguide](../src/audio/exhaust-waveguide.ts): pulse integration, delay storage, scattering and output.
  [Profile compiler](../src/audio/vehicle-audio-profile.ts) validates/freezes bounded firing and pipe data;
  the [vehicle catalog](../src/vehicle/vehicle-catalog.ts) owns authored bindings.
- [Engine voice](../src/audio/engine-voice.ts) and [processor](../src/audio/exhaust-processor.ts): faded
  replacement, k-rate RPM/load transport and native-rate rendering. Changes use explicit tuning-value
  equality; returning to the active values cancels a pending replacement without resetting the kernel.
- [Tire controls/mapping](../src/audio/tire-sound-controls.ts): model identity, transport domains and
  the provisional macro-to-representative contact adapter. [Contact acoustics](../src/audio/tire-contact-acoustics.ts)
  and [kernel](../src/audio/tire-contact-model.ts) are shared by game and audition, never copied from DEV.
- [Presentation policy](../src/audio/audio-presentation.ts): shared timing, audible radius and rival mix.
  [Audio engine](../src/audio/audio-engine.ts): fixed voices and master graph.
- [Browser adapter](../src/browser/vehicle-audio.ts), [lifecycle](../src/browser/audio-lifecycle.ts) and
  [controls](../src/browser/audio-tuning-controls.ts): observation copies, permission/failure boundary,
  labels and interaction. Numeric tuning ranges are not redefined by the UI.

The [consumer contract](../src/audio/vehicle-audio-observation.ts) has acoustic inputs only. The adapter
reuses two observation slots once per presented frame, not per catch-up tick. Player observation
subscribes to [optional tire telemetry](../src/physics/vehicle-tire-observation.ts); rivals read engines
only. The next completed physics tick populates the subscription. A WeakMap holds output caches outside
the unchanged physical snapshot; recovery clears them and unobserved vehicles skip telemetry work.
The [restart checkpoint](NEXT.md) owns continuation priorities, not another sound specification.

## Synthesis

Every vehicle uses one kernel. A profile contains cycle revolutions (1 or 2), ordered firing phases,
collector membership, primary lengths and one common outlet length per collector. Cylinder count is
the phase count. There are no recordings, PCM loops, vehicle-ID branches or per-vehicle pulse multipliers.

Base pulse strength is 1. Smoothed excitation controls amplitude and rise time: the closed-throttle
floor remains nonzero, while stronger excitation rises faster. Decay is load-independent. The adapter
supplies actuator throttle times delivered-drive/output-drive torque fraction; this is a control proxy,
not cylinder load or `engineTorque / maxTorque(RPM)`. The voice clamps observed RPM to idle/redline.

At each firing, `strength = max(0, excitation + pulseVariation * r)`, with seeded xorshift32 `r` in
[-1, 1). Variation is an absolute fraction of full excitation, including at closed throttle. Default
variation is 0.20 and default closed excitation is 0.22. Below the variation amount, zero clipping raises
the mean strength. Variation never changes firing times, RPM, geometry or time constants. Zero variation
restores settled periodic tests; otherwise determinism means the same seed and input history. Reset
owns one seed; random draws occur only at firing events.

The pulse solves `p' = -p / decayTime` and `r' = (p - r) / riseTime`. Firing resets `p` and preserves
continuous `r`. Exact exponential evolution resolves both parts of a fractional firing sample; the
pipe receives the sample average of `r`, not a rounded event or point sample. Full-sample coefficients
are shared across cylinders; a short Taylor limit handles nearly equal rates. Two extra exponentials
are evaluated at a firing, and one preallocated array holds emission averages. Rise/decay are independent
positive time constants, not ordered start/end timestamps.

Primary and outlet pipes are bidirectional delays, rounded to the nearest sample at the fixed reference
wave speed. Each traversal applies `exp(-attenuationPerMeter * length)`. Collector scattering is
`p = 2 * sum(incoming) / portCount`, then `outgoing = p - incoming`: the
[equal-admittance junction](https://www.dsprelated.com/freebooks/pasp/Lossless_Scattering.html).
The source uses a bounded periodic reflection envelope; the outlet uses negative filtered reflection.
Both boundary LPFs remain inside their return paths. The listening pickup sums outgoing and low-passed
outgoing waves and divides the bank sum by `sqrt(bankCount)`.

Porsche's six alternates banks: 120-degree global and 240-degree per-bank intervals, as shown in
[its firing-order illustration](https://newsroom.porsche.com/christophorus/en/2017/383/model-kit-refinement-boxer-911.html).
Separate banks do not imply uneven firing. RC30/BMW grouping and pipe lengths are sketches. Vespa uses
one revolution per cycle without a tuned expansion chamber. Intake, full muffler chambers, turbo flow,
fuel cut, backfire, temperature/pressure simulation and timing jitter are absent.

### Adopted native-rate waveguide

One acoustic step runs per output sample, normally 44.1 or 48 kHz. All cylinders retain full primary
paths, pulse states, return LPFs and phase-dependent reflection; all collectors retain both outlet
paths. There is no forced device rate, quality selector, alternate topology or inactive legacy model.
Controls update every sample inside the kernel; k-rate worklet parameters supply their targets.
Sample averaging reduces source aliasing but is not brick-wall bandlimiting. Integer delays, very short
pulses and nonlinear stages retain approximation/aliasing limits. The render loop allocates no objects.
Inactive processors output zero; invalid replacement profiles silence them; stop releases the model.

## Output conditioning

```text
Bank mixing -> 18 Hz DC removal -> soft clipping -> final one-pole LPF -> voice/master gain -> compressor
```

Soft clipping is `y = 0.65 * x / (1 + abs(x))`: small-signal gain 0.65, asymptotic bounds ±0.65 and
increasing compression. It has no envelope, load-dependent drive or hard threshold. The final filter
uses `tone += a * (y - tone)`, `a = 1 - exp(-2*pi*outputCutoffHz/sampleRate)`, approximately -6 dB/oct.
It is outside feedback and independent of `returnCutoffHz`. It cannot remove already folded aliases;
clip oversampling and antiderivative antialiasing are not active. The master compressor has separate
attack/release and is not a guaranteed hard peak limiter; fixed gains retain headroom.

Bank normalization does not equalize vehicle loudness or ensure monotonic RMS with RPM. Do not add
per-vehicle gains or automatic normalization merely to hide that difference: those would intentionally
revise the listening baseline. Use the fixed-gain level diagnostic below before final mix calibration;
kernel dBFS is not perceptual loudness or the level after the complete game graph.

## Player tire synthesis

Two comparison models remain in the game. The isolated SPECTRAL trial below is not in that graph. The
[evidence note](tire-squeal-research.md) motivates mechanisms without calibrating either implementation.
[Observations](../src/audio/vehicle-audio-observation.ts) contain per-axle load, static reference load,
tangential travel speed, slip-speed magnitude, directional dissipated slip power, utilization and
surface identity. These are not local rubber properties. Audio state never feeds vehicle mechanics.

### CURRENT baseline

The [CURRENT mapping/kernel](../src/audio/tire-synthesis.ts) uses a Hopf surrogate, not local contact
dynamics. Final accepted wheel forces give `Px=max(0,fx*sx*referenceSpeed)` and
`Py=max(0,fy*sy*referenceSpeed)` in watts; unsupported contacts supply zero. Mapping combines
`sqrt(P/(P+12000))`, utilization/slip onset, surface susceptibility, lateral-work preference and
high-slip roll-off. Slip onset spans 0.5–2 m/s; roll-off scale is 45 m/s. Pitch is
`650+350*vSlip/(vSlip+6)+220*(1-lateralWorkFraction)` Hz, spanning 650–1220 Hz.

Each axle owns independent complex state `z=x+iy`:

```text
z' = (sigma - beta*|z|² + i*omega)*z + small random excitation
sigma = 140*(smoothedExcitation - 0.12) / s; beta = 150 / s
```

A rational radial step and phase rotation advance the state. Rotation coefficients refresh every
32 samples, independently of host blocks. Seed-derived detuning stays within ±0.6%; the pickup adds
phase-locked harmonics and soft compression, bounded by ±0.35 per axle. Noise seeds/roughens vibration
but is not mixed directly into output. Rolling/broadband scrub remains silent in this retained version;
that earlier preference is not a restriction on CONTACT or the next method. Low-susceptibility surfaces
may never reach its onset. Material contrast, dynamics and masking are limitations, not desired behavior
for a successor.

### Shared comparison and transport

The [voice](../src/audio/tire-voice.ts) publishes scalar k-rate AudioParams once per presented frame;
[controls](../src/audio/tire-sound-controls.ts) own transport domains and model identity. CURRENT's
400–2400 Hz safety pitch domain is wider than its generated range. Invalid controls release forcing.
The [processor](../src/audio/tire-processor.ts) computes only the selected pair of axle kernels.

TIRES: CURRENT / TIRES: CONTACT is available in every course via mouse, touch and native keyboard
activation. CURRENT is the reload default. Choice survives mute, delayed startup, vehicle replacement,
engine tuning/reset and sound retry. Only tire output fades down for the shared 90 ms transition
(10 ms decay constant) before replacement, then rises at the shared control rate. Rapid choices
supersede pending ones; returning to the active choice cancels replacement. One tire worklet remains;
inactive models do no sample processing. The port carries model replacement and stop only. Engine
slots, master gain, physical calibration and context lifetime are unaffected. Processor errors reach
the existing SOUND RETRY boundary on presentation update. The
[shared module entry](../src/audio/vehicle-processor.ts) loads engine and tire processors together.
Rival tires, wind, events and music remain unimplemented.

### Contact model and game comparison

CONTACT retains the auditioned rolling rumble and nonlinear friction experiment. Road and friction use
the same force-driven vibration primitive, but different excitation: roughness drives the passive mode;
friction can sustain the tangential mode. Each axle has one of each, identical coefficients and separate
oscillator/spatial histories. The [kernel](../src/audio/tire-contact-model.ts) and
[settings](../src/audio/tire-contact-acoustics.ts) belong to audio and are shared by game and audition.

The [game adapter](../src/audio/tire-sound-controls.ts) maps observations into the kernel's representative
domain. This is an authored listening convention, not a derivation of microscopic contact:

| Input               | Current mapping                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Road travel         | Magnitude of completed longitudinal/lateral contact velocity, capped at 100 m/s; not wheel speed |
| Representative load | `min(8,5*axleLoad/staticAxleLoad)` N; static reference is compiled `springRate*qStatic`          |
| Representative slip | `4*axleSlip/(axleSlip+20)` m/s, within 0–4 m/s                                                   |
| Surface             | Discrete catalog identity; fractional/nonfinite identities release forcing                       |

Both axles use this map without vehicle/maneuver branches. Zero load or VOID stops new forcing;
existing vibration decays. Directional slip power still drives CURRENT, but CONTACT does not treat
it as acoustic watts. No contact patch, exact sticking, thermal field or tread-passing model is present.

Contact acoustics owns one authored surface catalog: asphalt, rough shoulder, grass, dirt and sand.
The accepted paved/dirt rolling taps are retained. Sand has finer spatial forcing and more scrub;
grass is softer/coarser; shoulder is intermediate in tonal drive. Grass/dirt/sand have zero weakening
but retain rolling/rubbing vibration. On surface changes, resolved roughness strengths, spatial rates
and weakening are smoothed; the index, stored states, mass, stiffness and output gains are not blended
or reset. These textures are not measured material data.

The common mode and friction law are:

```text
m*x'' + c*x' + k*x = F(V-x',N) + e
k = m*(2*pi*f0)^2; c = 2*zeta*m*2*pi*f0
F(u,N) = N*(muD + drop/(1+(u/vc)^2))*u/sqrt(u^2+ve^2)
```

Passive road stepping sets friction load to zero. The friction is bounded, odd and dissipative
(`F*u>=0`), with smooth velocity weakening rather than exact sticking. Its free resonance is 1200 Hz,
effective mass 1/3 g and damping ratio 0.03; these are representative acoustic coefficients.
The higher pitch follows the time scaling `m'=m/a, k'=a*k, c'=c`, with `a=1.5` and unchanged force law.
For steady controls without roughness, `x_new(t)=x(a*t)/a` preserves the continuous velocity-cycle shape.
Discrete stepping, input following, roughness and filters prevent exact time-scaled game PCM. Free
resonance is not the nonlinear sliding frequency. Numerical consistency does not establish real-tire fidelity.

For native sample interval `h`, the kernel solves midpoint velocity `w`:

```text
A = 2m/h + c + kh/2
A*w - F(V-w,N) = 2m*v_old/h - k*x_old + e
x_new = x_old + h*w; v_new = 2*w - v_old
```

Construction checks `A > Nmax*9*drop/(8*sqrt(3)*vc)`, a sufficient unique-root bound. Runtime weakening
stays within that maximum. A friction-force bracket and safeguarded Newton solve the root with a
finite iteration ceiling and explicit failure, not state clipping. The local energy identity is
`E_new-E_old = h*((F+e)*w-c*w^2)` up to solve/roundoff error. It describes the acoustic surrogate,
not acoustic watts or energy-conserving coupling to the vehicle solver.

Travel/slip distances advance separate quintic random fields using analytic interval means, with
at most one cell crossing per sample throughout the declared surface/input domain. Seeds advance at
cell crossings, not every audio-clock tick. Rough forces vanish at rest and are bounded by load and
texture. Input following is 10 ms; zero support removes forcing immediately, and zero speed stops
that roughness drive. Road/friction velocity pickups use separate 6 kHz one-pole filters, gains
0.5/0.16 and common listening gain 0.5. No raw-noise feedthrough, clipper, AGC, RMS matching, imposed
pitch map, separate squeal gate or post-hoc envelope is added.

The [diagnostic worklet](../src/dev/diagnostics/tire-contact-processor.ts) exposes six k-rate controls,
four mono road/friction/front/rear taps and stop-only messaging. It reuses this kernel; gameplay does
not import it. [Development](development.md#tire-comparison-tools) lists audition/render/characterization
commands. Generated WAVs are review outputs, not runtime dependencies. Existing tests retain road
reference hashes, energy/weakening/convergence checks, finite transitions, transport and independent
histories. An intentional future replacement must revise model-specific expectations explicitly,
not weaken the still-valid observation, lifetime or physical/rendering contracts.

### SPECTRAL isolated asphalt trial

The user authorized the first third-method experiment, not gameplay adoption. The
[DEV kernel/settings](../src/dev/diagnostics/tire-spectral-model.ts) and
[two-tap worklet](../src/dev/diagnostics/tire-spectral-processor.ts) synthesize one asphalt contact:
two broad scrub bands plus four finite-width harmonic bands. No rolling layer, loose-surface catalog,
recordings, tire selector entry, physical telemetry expansion or production import is added.
The [checkpoint](NEXT.md#next-decision-a-third-tire-sound-method) owns the listening decision.

`SPECTRAL_INPUTS` owns seven scalar controls: signed longitudinal/lateral contact velocity, signed
wheel peripheral speed, normal load, accepted longitudinal/lateral slip work and demand rho. Domains,
defaults and units are shared by UI, processor and validation. Controls are independent synthetic
observations in this audition, not a reconstructed tire solve. The game currently lacks the signed
velocity/peripheral-speed consumer fields; adding them is deferred until gameplay integration.
Zero load cuts excitation even with nonzero work. Zero slip also has zero new excitation. Otherwise,
work level is `sqrt(P/(P+8000))`, without multiplying load twice; squeal additionally uses
`rho^2/(1+rho^2)`. These are authored acoustic controls, not sound power or remaining physical grip.

Every band updates two real states as `z_next = r*R(theta)*z + A*sqrt(1-r^2)*xi`, where
`r=exp(-pi*B/rate)`, `theta=2*pi*f/rate`, and xi has independent unit-variance components.
Seeded bounded uniform draws are scaled analytically. Seed splitting permutes the parent stream
before constructing bands; adjacent xorshift states must not create short-lag shared excitation. Constant coefficients give variance A^2 in
each state in the ideal white-input model. This is source normalization, not measured-output AGC.
B is a nominal pole bandwidth, not an exact broad-band FWHM. B stays positive; changing frequency
rotates stored state rather than resetting phase or generating additional spring energy.

Four bands are centered on multiples of a shared authored fundamental, with independent states and
random streams. Nominal bandwidth grows with harmonic order. Shared C1 pitch wander has bounded
1.5% depth; independent scrub modulation has 8% depth. The kernel settings and mapping own all numeric
values. The trial tests the finite-coherence hypothesis; it does not assert that real tread modes are
independent or that more partials are intrinsically realistic.

An internal rational 1 kHz control clock updates band coefficients independently of host block splits;
all six bands run at the native output rate. Supported rates are integer 44.1–192 kHz. Work and demand
follow separate 15/10 ms rise/fall constants; tone follows 20 ms. Loss of support immediately zeros
excitation and freezes frequency/bandwidth, but retains the decaying band/filter state. The 50 Hz
minimum pole bandwidth gives about 44 ms to -60 dB in state amplitude; that is not a guarantee for the
complete filtered output. Separate 18 Hz DC removal and 8 kHz one-pole LPFs preserve S/Q solo taps.
Output is their fixed-gain sum, with no clipping, waveform reset, output RMS matching or axle detuning.

The worklet has two mono outputs, seven k-rate AudioParams and stop-only messaging. Invalid inputs cut
excitation without poisoning the state; a valid later frame can resume it. START/retry is gesture-driven;
STOP, hidden pages and stale asynchronous initialization close the diagnostic context. Solo/volume
change only output gain. The standalone page and offline renderer reuse this kernel, never copied DSP.
[Development](development.md#tire-comparison-tools) lists their commands.

Tests cover analytic decay/variance, finite-domain corners, independent streams, deterministic block
partitions, caller immutability, stationary spin, lock/spin contrast, support release/recontact and
worklet-processor equivalence under a host stub. Generated WAVs replay common authored observations at 60 Hz through the
three adapters; CONTACT is friction-only with its existing listening gain, CURRENT uses its existing
kernel output. No level matching is applied. This is not a full-tire comparison or real gameplay capture.
The renderer's combined elapsed time is not a paired kernel benchmark. Speaker quality, smartphone
performance, broad aliasing qualification and perceptual acceptance remain open.

### Interpretation and cost limits

Neither CURRENT nor CONTACT is a validated whole-tire acoustic approximation. CONTACT's effective
mass, friction law, macro-to-local conversion, velocity pickup and surface data are authored surrogates.
Similar listening impressions from the two methods do not validate those assumptions. A richer tone
in one replay does not establish the correct harmonic/inharmonic structure. Short release, broad
front/rear interference, nonlinear aliasing and final mix remain unresolved. Independent axle states
do not guarantee incoherence. Preserve these references without adding corrective gains, fixed axle
detuning or phase resets to conceal their limitations.

Source-level work is known, but comparative device cost is not: at 48 kHz, two CONTACT axles call the
friction step 96,000 times per second, with **up to** 24 iterations per nonzero-bound solve, not 24 on
every sample. Zero friction bound has a direct linear path. The initial guess already uses previous
endpoint velocity clipped to the new bracket. Road vibration, spatial fields, input/texture following
and filters also run per sample. CURRENT uses a direct oscillator update instead of a root search;
the A/B selector does not run both models simultaneously.

No warmed paired CONTACT/CURRENT benchmark or complete phone audio/game budget is established here.
Offline renderer `elapsedMs` and `maxIterations` are diagnostics, not average iterations, pure kernel
cost or target-device certification. Do not infer a measured speed ratio from operation counts.
Lower-rate stepping or one/two Newton iterations are unvalidated proposals: they require convergence,
root-domain, spectrum/aliasing and transient checks, not an argument from fundamental pitch alone.
Current construction accepts 44.1–192 kHz. The [next decision](NEXT.md#next-decision-a-third-tire-sound-method)
is method selection, not presumed adoption of those optimization proposals.

## Mixing and lifetime

The graph has fixed player/rival engine slots and one player tire worklet: three worklets (including just one switchable tire worklet) and no
AudioNode oscillators regardless of actor count. Only the nearest rival inside 100 physical world meters
is selected. Gain uses 3D distance and pan uses lateral displacement in the player's yaw frame; raster
depth and local stage chainage never enter the policy. Rival changes fade before slot reuse. Other actors
have no audio nodes. There is no Doppler, occlusion or spatial reflection model.

Construction does not create an AudioContext. Mouse press, touch/pen release, touchend or a keyboard
gesture starts/resumes it; touch pointerdown alone is not activation. See
[WebKit activation](https://webkit.org/blog/13862/the-user-activation-api/). SOUND START starts or resumes;
SOUND ON/OFF then toggles mute. Hidden/stopped shells suspend audio, mute fades before suspension, and
page-cache restoration follows current visibility. Pending resume and module load are independent;
disposal closes the context and releases any late graph without waiting for permission.

The lifecycle is the failure boundary for presentation updates and gain/tuning synchronization. On an
audio exception it retires the graph, closes the context even if node cleanup fails, and shows SOUND RETRY.
The driving frame continues; a later gesture retries. Retired initialization promises cannot clear or
close a newer graph. [Parameter following](../src/audio/audio-parameter.ts) detects native
`cancelAndHoldAtTime` once per parameter. Where absent, it reads the evaluated value before
`cancelScheduledValues` and anchors it with `setValueAtTime`, then retargets. This fallback is for
**currentTime retargeting**, not arbitrary future-time holds; see
[API availability](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/cancelAndHoldAtTime).

Shared presentation timing owns the 25 ms control constant and 90 ms transition duration. Profile/tuning
replacements, rival handoff and mute suspension retain their existing fades. Rapid tuning changes
supersede pending values; muted/loading changes apply when resumed. Unsupported AudioWorklet browsers
remain playable with SOUND UNAVAILABLE and no sample fallback.

Retain the platform audio session. iPhone silent mode may suppress output while context state says
running. Disable silent mode, raise media volume and tap SOUND START for device checks; do not bypass
this with session overrides or silent media assets. See [WebKit's report](https://bugs.webkit.org/show_bug.cgi?id=237322).
Module URLs remain relative to import.meta.url inside complete commit-versioned ESM builds.

## Shared tuning

[Acoustic settings](../src/audio/exhaust-acoustics.ts) own defaults, validated kernel domains and optional
narrower UI bounds in `EXHAUST_TUNING_RANGES`. The controls read these values directly. Their presentation
summary is below; the source table, not this summary or tests, is the numeric authority.

| Key                   | Default   | UI interval / step | Provenance                                 |
| --------------------- | --------- | ------------------ | ------------------------------------------ |
| `outletReflection`    | -1        | -1–0 / 0.01        | Reference: open-end pressure limit         |
| `returnCutoffHz`      | 3100 Hz   | 500–10000 / 100 Hz | Reference: low-frequency magnitude match   |
| `attenuationPerMeter` | 0.03 Np/m | 0–0.30 / 0.01 Np/m | Reference: rounded constant-loss surrogate |
| `closedExcitation`    | 0.22      | 0.01–1 / 0.01      | Authored                                   |
| `outputCutoffHz`      | 7300 Hz   | 100–12000 / 100 Hz | Authored final listening filter            |
| `pulseVariation`      | ±20%      | ±0–40% / 1%        | Authored absolute event variation          |
| `pulseRiseMs`         | 0.20 ms   | 0.01–2 / 0.01 ms   | Authored full-excitation rise              |
| `pulseDecayMs`        | 5 ms      | 0.1–30 / 0.1 ms    | Authored decay                             |

The kernel deliberately also accepts return cutoff down to 100 Hz, attenuation up to 1 and any positive
closed excitation up to 1. Explicit undefined overrides retain defaults; all values must be finite and
inside their domain. Validation returns a frozen copy. Tests exercise boundaries and UI inclusion without
repeating a separate bounds table.

Game and audition share eight minus/plus controls and reset. Integer step indices avoid decimal drift;
buttons stop at limits without wrapping/repeat timers. Vehicle changes preserve tuning; page/course
reload restores defaults. Each game step uses the shared replacement fade; audition applies committed
settings to the next playback. VOL spans 0–100% in 1% steps, initially 35%, with normal gain smoothing.
Native keyboard activation does not leak into driving controls; disposal removes listeners. Read-only
profile rows report cycle, cylinder count, idle/redline, firing phases/intervals, grouping and path lengths.
Rows identify firing events, not manufacturer cylinder numbers or verified left/right banks.

## Reference conditions for default coefficients

Assume a 50 mm internal-diameter unflanged circular pipe, 573.15 K air, 101325 Pa, gamma 1.4,
R = 287 J/(kg K), Pr = 0.71 and a 500 Hz reference for constant loss. Gas composition, thermal gradients,
mean flow, real pipe diameters and large-amplitude gas dynamics are outside this surrogate.

- [Ideal-gas sound speed](https://www.grc.nasa.gov/www/k-12/VirtualAero/BottleRocket/airplane/sound.html):
  `c = sqrt(gamma*R*T)`, rounded to 480 m/s.
- [Silva et al., Eq. 10](https://arxiv.org/abs/0811.3625): unflanged `|R| = 1 - (ka)²/2 + ...`.
  Negative DC reflection and a one-pole magnitude match give `fc = c/(2*pi*a)`, rounded to 3100 Hz.
  This does not match full radiation impedance or end-correction phase (low-frequency 0.6133a).
- [Circular-duct attenuation](https://doi.org/10.1186/s13362-018-0057-0):
  `alpha = sqrt(pi*f*nu)/(a*c) * (1 + (gamma-1)/sqrt(Pr))`.
  [Sutherland air coefficients](https://doc.comsol.com/6.4/doc/com.comsol.help.cfd/cfd_ug_fluidflow_high_mach.08.46.html)
  use mu0 = 1.716e-5 Pa s, T0 = 273 K and S = 111 K; density is `p/(R*T)` and `nu = mu/density`.
  Alpha is about 0.034 Np/m at 500 Hz, rounded to 0.03. Real frequency dependence is not simulated.

Allowing outlet reflection -1 retains propagation, boundary-filter and source-termination losses.
Positive outlet reflection would define a different termination and is not allowed.

## Provisional boundary and output interpretation

[Reflectance](https://www.dsprelated.com/freebooks/pasp/Reflectance_Impedance.html) is
`R = (Z-Z0)/(Z+Z0)`. Authored source endpoints +0.94 and -0.3 correspond to positive real impedance
ratios near 32.3 and 0.538. Over 0.23 firing cycles, the aperture is `16*u²*(1-u)²`, then zero;
it has continuous value/slope, peak 1 and window mean 8/15, using arithmetic without cylinder trigonometry.
This is an acoustic boundary envelope, not valve timing, lift or flow. Reusing one LPF coefficient for
both boundaries is an economy. Bank normalization, control response and output conditioning are authored
presentation choices; none changes mechanical inertia or establishes calibrated loudness.

## Verification and limits

Run the full [development workflow](development.md), including the unchanged historical physics/render
oracle. [Audio tests](../tests/audio.test.mjs), [lifetime tests](../tests/audio-lifecycle.test.mjs),
[audit regressions](../tests/audio-audit.test.mjs) and [waveguide tests](../tests/exhaust-waveguide.test.mjs)
cover read-only observation, native/fallback control paths, frame survival, retry races, bounded voices,
profile/tuning replacement, finite sustained feedback and output conditioning. They are not listening
acceptance or universal device support claims.

Use [engine audition](../tools/audio-browser.html) for all nine profiles at 44.1/48 kHz, steady RPM/load
and acceleration/coast. Fixed gain evaluates load; optional RMS matching compares timbre only.
[Level diagnostics](../tools/exhaust-levels.mjs) report kernel RMS/peak with one-second settling and
measurement, reset seed and default tuning. `node tools/exhaust-levels.mjs [build-directory]` writes JSON;
compare vehicle/RPM/load rows before intentionally revising mix levels. Out-of-profile RPMs are omitted.

[Tire audition](../tools/tire-browser.html), [shared scenarios](../tools/tire-scenarios.mjs) and
[offline rendering](../tools/tire-render.mjs) compare independent axles, rolling, cornering, wheel lock,
loose surfaces and release. Generated WAVs are review outputs, never production assets.
`node tools/tire-render.mjs /absolute/output.wav` optionally accepts a prior kernel for comparison.

[Host timing](../tools/exhaust-performance.mjs) uses warmed paired runs, not phone certification.
[Spectral diagnostics](../tools/exhaust-quality.mjs) inspect coherent source/clip-input/output signals
with zero variation. Energy outside true harmonics detects inharmonic aliasing, not folded components
coincident with genuine harmonics or total aliasing. FFT and independent pulse-integration regressions
retain their own causal coverage. Actual speaker listening, Safari/iOS/Android behavior and simultaneous
gameplay CPU budget remain separate checks.

## Minimal implementation boundary

Keep one exhaust waveguide and one delay primitive, with no exhaust method flags or vehicle branches.
The explicitly requested tire A/B selector belongs to voice/worklet composition, not either sample kernel.
For a sound-preserving change, run `node tools/exhaust-equivalence.mjs /absolute/previous/exhaust-waveguide.js`
after building, also with `--zero-variation`. The reference must share the profile/pulse contract;
[exact comparison](../tools/exhaust-equivalence.mjs) covers rates, vehicles, overrides and RPM/load transitions.
Do not use equivalence language for an intentional synthesis change. Past experiments and run results
belong in Git and PR/CI evidence, not an accumulating documentation archive.
