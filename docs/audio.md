# Procedural audio

## Authority and scope

Audio is a read-only presentation layer. Physics owns RPM, actuators, wheel motion, load and tire
utilization; audio owns oscillator, envelope and filter state. Audio imports only Core. Vehicle binds
acoustic profiles, and browser composition adapts completed physical observations. Audio never writes
motion, gearing, recovery or race progress, and never repeats contact or tire solves.

The engine is the accepted listening baseline. Tire timbre and final engine/tire mix calibration remain
unfinished. Preserve sample-free synthesis and a small fixed voice count; actual Android performance
and device listening remain open. A structural cleanup must preserve the accepted engine waveform.

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

The [physical evidence note](tire-squeal-research.md) distinguishes self-excited tread vibration from
passively filtered noise. The current [mapping/kernel](../src/audio/tire-synthesis.ts) is an unfinished
Hopf surrogate, not local rubber/contact dynamics. Engine approval does not approve tire timbre.

Telemetry observes accepted final wheel forces: `Px = max(0, fx*sx*referenceSpeed)` and
`Py = max(0, fy*sy*referenceSpeed)` in watts, with slip signs following force direction. Unsupported
contacts supply zero. The map combines `sqrt(P/(P+12000))`, utilization/slip onset, surface susceptibility,
lateral-work preference and high-slip roll-off. Slip onset spans 0.5–2 m/s and roll-off scale is 45 m/s.
Pitch is `650 + 350*vSlip/(vSlip+6) + 220*(1-lateralWorkFraction)` Hz, spanning 650–1220 Hz.

Each axle has independent complex state `z = x + iy`:

```text
z' = (sigma - beta*|z|² + i*omega)*z + small random excitation
sigma = 140*(smoothedExcitation - 0.12) / s; beta = 150 / s
```

A rational radial step `(1 + sigma*dt)/(1 + beta*|z|²*dt)` and rotation advance the states. Rotation
refreshes every 32 samples independently of render-block boundaries. Seed-derived detuning is within
±0.6%. Pickup is `y + 0.32*(2xy) + 0.12*y*(3x²-y²)`; each axle has bounded ±0.35 output. Random
perturbations seed/roughen the oscillator but are never mixed directly into the output. Ordinary rolling
and broadband scrub stay silent by user preference. Low-susceptibility surfaces may not reach the present
onset; onset dynamics, material contrast, release, gain and engine masking remain tire-design work.

The [voice](../src/audio/tire-voice.ts) sends front/rear records per presented frame. One
[processor](../src/audio/tire-processor.ts) holds both kernels, allocates nothing in its sample loop,
fades invalid controls to silence and stops on disposal. Engine replacements do not rebuild tire nodes.
The [shared module entry](../src/audio/vehicle-processor.ts) loads both processors in one transaction.
Tire coefficient ownership and parameter transport are pending the tire stage, not silently changed by
engine cleanup. Rival tires, wind, events and music remain unimplemented.

### Contact-model listening trial (not gameplay)

The user restarted tire design and selected a minimal contact-vibration plus friction-vibration trial.
The released Hopf sound above is unchanged; its silence preference and tuning are not constraints on
this explicitly audible rolling/rubbing experiment. No production import selects the trial. The
[trial settings](../src/dev/diagnostics/tire-contact-settings.ts) own all coefficients and input limits;
the [kernel](../src/dev/diagnostics/tire-contact-model.ts) is a diagnostic, not another vehicle force law.

The user accepted the rolling rumble and the contrast between the two texture sketches as a listening
baseline. Preserve the road tap and its gain; this does not approve friction timbre or full gameplay
adoption. Both sounds already share the same force-driven vibration primitive: external roughness
excites the passive mode, while friction can supply energy to the tangential mode. They are distinct
excitation mechanisms, not one identical physical process.

Each axle has one passive road mode and one nonlinear tangential mode, with independent roughness
histories but identical coefficients. Effective contact load (0–8 N) and local slip (0–4 m/s) are
**representative inputs, not axle load or a validated macro-to-local conversion**. Road travel is
separate, 0–100 m/s. The two texture sketches are not a complete SurfaceType mapping. No temperature,
contact patch discretization, tread passing, wheel RPM model or physical axle adapter is implemented.

Both modes use `m*x'' + c*x' + k*x = F(V-x',N) + e`, with `k=m*(2*pi*f0)^2` and
`c=2*zeta*m*2*pi*f0`. Passive road stepping sets friction load to zero. The trial friction is
`F(u,N)=N*(muD+drop/(1+(u/vc)^2))*u/sqrt(u^2+ve^2)`: bounded, odd and dissipative
(`F*u>=0`), with velocity weakening but no exact sticking. The friction sketch uses 800 Hz,
0.5 g and damping ratio 0.03. Mass sets the mechanical impedance: stiffness and damping are
derived from the unchanged free frequency and damping ratio. Stronger friction relative to that
impedance produces slip-dependent cycles and harmonics in the same equation, not a pitch map. The
free-mode frequency is not the frequency of the nonlinear sliding cycle. These are uncalibrated
representative properties, not a measured tread mass or a whole-tire model.
Removing weakening suppresses sustained squeal in tested steady conditions without removing roughness.
The [research note](tire-squeal-research.md) supplies physical motivation, not calibration for this law.

For each native sample `h`, solve midpoint velocity `w`:

```text
A = 2m/h + c + kh/2
A*w - F(V-w,N) = 2m*v_old/h - k*x_old + e
x_new = x_old + h*w; v_new = 2*w - v_old
```

The constructor checks `A > Nmax*9*drop/(8*sqrt(3)*vc)`, a sufficient unique-root condition.
The force bound supplies the bracket; safeguarded Newton has a fixed iteration ceiling and explicit
failure, not a state clamp. The discrete energy identity is
`E_new-E_old = h*((F+e)*w - c*w^2)` up to solve/roundoff error. This is local acoustic bookkeeping,
not acoustic watts or energy-conserving coupling to the game's tire forces.

Road/slip distances independently advance smooth quintic random fields, with analytic interval means
and at most one cell crossing per sample in the declared domain. Seeds advance at spatial cell crossings,
not on an audio-rate clock. Rough forces vanish at rest and are bounded by representative load times
texture coefficients; no raw noise is mixed into the output. Input following is 10 ms, but zero support
immediately removes forcing and leaves free decay. Setting a speed to zero stops that roughness drive.
Road/friction velocity pickups pass separate 6 kHz one-pole filters and fixed gains. The road pickup
stays 0.5; the friction pickup is 0.16 to retain headroom for larger mechanical velocities. This is a
fixed velocity-to-output scale, not RMS matching or a change to the friction force. There is no clipper,
RMS matching, separate squeal gate or imposed output envelope. Sample averaging and final filtering do
not constitute complete nonlinear antialiasing; residual aliasing and device cost remain unqualified.

The [trial worklet](../src/dev/diagnostics/tire-contact-processor.ts) has six k-rate AudioParams and
four mono taps (front road/friction, rear road/friction). Its port accepts stop only. The
[interactive page](../tools/tire-contact-browser.html), served over HTTP after building, mixes these
taps at fixed gain and can solo either axle or component without changing the model. Texture changes
require stop/start. No trial assets, method selector or nodes are added to gameplay or its worklet entry.

Run `node --test tests/tire-contact-trial.test.mjs` after building. Tests cover energy/passivity,
weakening ablation, convergence, roughness integration, independent histories, finite domain corners,
transport partitions and release. `node tools/tire-contact-render.mjs OUTPUT_DIRECTORY [RATE]` writes
fixed-gain mix/road/friction/front/rear WAVs and measurements using [shared scenarios](../tools/tire-contact-scenarios.mjs).
Generated sound is review output, never a production PCM asset. Listen before adopting this model;
short natural release, full aliasing checks, physical observation mapping and final mix remain open.
Independent equal-coefficient axles can still interfere: richer harmonics reduce near-total cancellation
in the published replay, but do not guarantee incoherence or a lower bound on mixed loudness. Do not
add fixed front/rear detuning, phase resets, stereo separation or automatic gain to conceal cancellation.
Run `node tools/tire-contact-characterize.mjs [BUILD_DIRECTORY]` on current and reference builds for
steady pitch/harmonic measurements and every one-second interference window. It uses identical
scenarios; neither a single cancellation window nor a fundamental-frequency match certifies the whole
domain. [Calibration regressions](../tests/tire-contact-calibration.test.mjs) pin the accepted road taps
and exercise the nonlinear response. The damping ablation retains the original 4 g fixture; at the new
mass, sufficient damping is derived from the friction slope bound rather than reusing a ratio that no
longer overcomes that bound. The trial does not authorize changing the accepted engine waveform.

## Mixing and lifetime

The graph has fixed player/rival engine slots and one player tire worklet: three worklets and no
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

Keep one waveguide and one delay primitive, with no method flags, alternative models or vehicle branches.
For a sound-preserving change, run `node tools/exhaust-equivalence.mjs /absolute/previous/exhaust-waveguide.js`
after building, also with `--zero-variation`. The reference must share the profile/pulse contract;
[exact comparison](../tools/exhaust-equivalence.mjs) covers rates, vehicles, overrides and RPM/load transitions.
Do not use equivalence language for an intentional synthesis change. Past experiments and run results
belong in Git and PR/CI evidence, not an accumulating documentation archive.
