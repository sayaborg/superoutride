# Tire audio

This document owns player tire synthesis mechanisms and their numerical/physical limits.
[Audio](audio.md) owns the observation, mixing, voice lifetime and shared tuning contracts.
All retained models remain provisional comparisons; numerical sound-design choices are not measured
whole-tire acoustics.

## Source ownership

- [Tire controls/mapping](../src/audio/tire-sound-controls.ts): model/component identity,
  `tireSoundParameters` and reference adapters. [Tire observation](../src/audio/tire-sound-observation.ts)
  owns the model-neutral bounded raw observation. [Contact acoustics](../src/audio/tire-contact-acoustics.ts)
  and [kernel](../src/audio/tire-contact-model.ts) are shared by game and audition.
  [Spectral settings](../src/audio/tire-spectral-acoustics.ts) and
  [kernel](../src/audio/tire-spectral-model.ts) likewise have one shared audio owner, not a DEV copy.
- [Hybrid generator](../src/audio/tire-hybrid-model.ts) and
  [acoustics](../src/audio/tire-hybrid-acoustics.ts): primary R/S/Q composition, energy-state response and
  explicitly authored friction settings/materials.
- [Shared rolling source](../src/audio/tire-rolling-model.ts) and
  [settings](../src/audio/tire-rolling-acoustics.ts): waveform-preserving R for HYBRID and UNIFIED.
- [Unified generator](../src/audio/tire-unified-model.ts) and [settings](../src/audio/tire-unified-acoustics.ts):
  shared R plus a coupled [friction resonator](../src/audio/friction-resonator.ts), retained without retuning.
- [Modal generator](../src/audio/tire-modal-model.ts) and
  [acoustics](../src/audio/tire-modal-acoustics.ts): Q-only composition and authored work/slip/pitch mapping.
  [Stochastic resonator](../src/audio/stochastic-resonator.ts) owns each band's forced/self-excited vibration state. [Spectral noise](../src/audio/spectral-noise.ts) owns generic
  finite-width bands and seeded noise primitives. The SPECTRAL reference retains its own
  [material/pitch mapping](../src/audio/tire-spectral-primitives.ts) and
  [rolling](../src/audio/tire-spectral-rolling.ts).

## Player tire synthesis

The game offers the methods listed under [shared comparison and transport](#shared-comparison-and-transport). The
[evidence note](tire-squeal-research.md) motivates mechanisms without calibrating any implementation.
[Observations](../src/audio/vehicle-audio-observation.ts) contain per-axle load, static reference load,
signed contact longitudinal/lateral velocity, effective wheel peripheral and angular speed, tangential travel,
slip magnitude, directional dissipated slip power, demand rho and surface identity. These are not local rubber properties. Audio state never feeds vehicle mechanics.

### HOPF baseline

The [HOPF mapping/kernel](../src/audio/tire-synthesis.ts) uses a Hopf surrogate, not local contact
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

The [voice](../src/audio/tire-voice.ts) publishes scalar k-rate AudioParams once per presented frame.
[Tire observation](../src/audio/tire-sound-observation.ts) owns the common raw input domain used by
HYBRID, MODAL, UNIFIED and SPECTRAL; [controls](../src/audio/tire-sound-controls.ts) owns model identity and the retained
reference adapters. HOPF's 400–2400 Hz safety pitch domain is wider than its generated range.
Invalid controls release forcing for the affected axle.
The [processor](../src/audio/tire-processor.ts) computes only the selected pair of axle kernels.

TIRES: HOPF / CONTACT / SPECTRAL / HYBRID / MODAL / UNIFIED is available in every course via mouse, touch
and native keyboard activation. HYBRID is the reload default. Choice survives mute, delayed startup, vehicle replacement,
engine tuning/reset and sound retry. Only tire output fades down for the shared 90 ms transition
(10 ms decay constant) before replacement, then rises at the shared control rate. Rapid choices
supersede pending ones; returning to the active choice cancels replacement. One tire worklet remains;
inactive models do no sample processing. The port carries model/tuning replacement and stop only. Engine
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
existing vibration decays. Directional slip power still drives HOPF, but CONTACT does not treat
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

### SPECTRAL game synthesis

The [shared kernel](../src/audio/tire-spectral-model.ts) and
[settings/catalog](../src/audio/tire-spectral-acoustics.ts) belong to audio; the DEV worklet only auditions
that same kernel. Every axle has eight fixed two-state noise-driven bands: two R rolling, two S scrub
and four Q finite-width harmonic bands. No PCM playback, microscopic contact solve or vehicle/maneuver
branch exists inside the kernel. [NEXT](NEXT.md#current-state) owns listening acceptance;
[calibration](calibration.md#tire-audio-tuning) maps named settings without redefining their values.

The common `TIRE_SOUND_INPUTS` owns eight controls: signed longitudinal/lateral contact velocity and effective wheel
peripheral speed (m/s), accepted wheel angular speed (rad/s), normal load (N), accepted longitudinal/lateral
slip work (W), and dimensionless demand rho. Physics publishes accepted omega and
`effectiveRollingRadius * omega` only for force-transmitting contact with a valid tire frame. The browser
copies them; audio never infers rotation from car speed, guesses a game radius or re-solves mechanics.
Unsupported/reset observations clear these output-only values without changing the physical snapshot.

[Observation mapping](../src/audio/tire-sound-controls.ts) rejects nonfinite/negative load, work and demand;
finite over-range observations are bounded for acoustic transport only. The same raw AudioParams feed
HYBRID, MODAL, UNIFIED or SPECTRAL; they never reuse CONTACT's representative units. Zero load/VOID or invalid controls release only the affected
axle, retain finite tails and permit recovery. Surface identities are discrete, not interpolated.

Current boundaries: R is rotation-driven, not the retired travel-driven contact layer; Q has an
excitation-dependent palette, not the retired fixed-palette transient contract. Unchanged S remains
pinned independently. Q uses harmonic-response, strong-palette, release and transport coverage instead
of the superseded joint S/Q replay hash. No understeer/oversteer labels select different effects.
A structural cleanup preserves all current taps; deliberate tuning must explain waveform changes
without weakening the immutable mechanics/render oracle or valid lifecycle/observation coverage.

#### Band primitive and Q response

Each of eight fixed bands updates two states as `z_next=r*R(theta)*z+A*sqrt(1-r^2)*xi`, with
`r=exp(-pi*B/rate)` and independent unit-variance excitation components. Bounded uniform draws are scaled
analytically, never by measured-output AGC. Seed splitting prevents short-lag shared excitation. Nominal
positive pole bandwidth contracts unforced state; parameter changes do not reset stored waveforms.
Generic `SPECTRAL_BAND_DOMAIN` owns numerical support bounds; `SPECTRAL_SETTINGS` owns this reference's authored mapping
coefficients. Four independent Q bands use the shared pitch/width/wander mapping. Two independent S
bands read `scrubBands` data. Band count, random-stream order and integration math are not tuning knobs.

With `s=hypot(wheelSpeed-vx,vy)` and `P=Px+Py`, work level follows `sqrt(P/(P+8000))` (zero for zero slip),
and squeal demand follows `rho^2/(1+rho^2)`. Work already includes force, so S/Q do not multiply by load
again. Let `e=smoothedWork*smoothedDemand`, `c=min(1,e/harmonicShapeReference)`. Q band h has excitation
`e * squealGain * harmonicWeights[h-1] * surfaceSqueal * c^(h-1)`. The settings owner defines the reference
and full palette. Above the reference the accepted strong palette is unchanged; below it higher bands
weaken progressively, so onset/recovery changes spectral balance, not only common volume. No extra
oscillator, recovery event sound, phase reset, fixed axle detuning, velocity correction or extra
hysteresis state is added. This is an authored perceptual mapping, not measured tire physics.

#### Rotation-driven R

R is now the **rolling** component, not a proxy for every kind of road contact. Its excitation follows
`sqrt(N/(N+2000)) * [abs(wheelSpeed)/(abs(wheelSpeed)+15)]^1.5`, provided accepted angular speed is nonzero.
A translating locked tire therefore stops R excitation but retains S/Q from accepted slip work. A
stationary supported spinning wheel can emit R and friction sound; an airborne wheel cannot.

R's two broad center frequencies are wheel orders times `abs(omega)/(2*pi)`, with a positive low-frequency
floor. Bandwidth scales with center frequency, with the primitive's positive minimum. The settings owner
provides orders/floors/width ratio; these are an authored coarse spectral envelope, not literal tread
counts, a physical cavity model or discrete impact events. R's independent random amplitude texture
advances with wheel rotation and material scale, not vehicle translation. At zero angular speed its
texture stops. The maximum domain/finest material must remain within one interpolation cell per control
step. Pavement weights emphasize the low band. Two road-only 900 Hz low-pass stages reduce hiss without
filtering S/Q. Road center frequency and amplitude are separate controls, not a universal speed law.

`SPECTRAL_TEXTURES` is this reference's authored material catalog: pavement, shoulder, grass, dirt and sand.
Its `scaleMeters` is an authored S slip-traversal length and a shared divisor in R's wheel-texture rate;
it is not a measured road grain size, tread pitch or wheel radius. Texture depth is also shared by R/S.
Resolved weights/texture scales follow continuously without resetting state. Grass/dirt/sand have zero
steady Q but retain rolling and friction textures. No pressure/temperature/stiffness is inferred.

Eight bands per axle run at native rate, supported integer 44.1–192 kHz. The rational 1 kHz coefficient
clock is independent of host blocks. Existing 15/10 ms excitation rise/fall and 20 ms tone following
remain. Loss of support immediately cuts excitation and freezes tone, preserving a short free tail.
S/Q retain separate 18 Hz DC removal and 8 kHz output filtering; R has its own state and lower filtering.
Output gains are fixed. Numerical tests and host timings do not establish phone performance or realism.

#### Component output controls

The game exposes `R: ON/OFF`, `S: ON/OFF`, `Q: ON/OFF` for HYBRID and SPECTRAL, initially all on. R is rolling,
S sliding friction (broad scrub in the SPECTRAL reference), Q tonal squeal. MODAL exposes only Q:
Q includes forced rubbing and self-excited squeal. R/S are absent; their buttons are hidden without changing saved comparison choices.
UNIFIED retains R/Q controls with S hidden.
Buttons apply to both independent axles and are disabled for
HOPF/CONTACT and unsupported audio, have descriptive labels/ARIA pressed state, and stop keyboard
propagation to driving controls. Choice survives model changes, loading/retry, engine tuning/reset,
vehicle replacement and mute; page reload resets it. The browser lifecycle owns session choices.

The voice transports three separate k-rate `mix_*` values to the existing tire worklet. Output gains
follow a shared 5 ms constant, independently of host block partitions. OFF suppresses only that tap;
all vibration/band/random/filter state continues, so solo comparison does not restart the sound. There is no
level compensation when a component is disabled. Switching models still fades tires alone; the port
continues to carry model/tuning replacement and stop only. Engine nodes and master lifetime do not change.

The separate two-tap audition still isolates S/Q; its synthetic replays use an explicitly authored
0.3 m radius solely to supply angular speed. Live gameplay reads the true accepted angular observation.
Use the in-game buttons for each model's components and [development](development.md#tire-comparison-tools)
for reproducible render/probe commands. HOPF and CONTACT remain unmodified audible references.

### HYBRID game synthesis

HYBRID remains the R/S/Q waveform reference
for evaluating MODAL. The shared R extraction preserves its sound; this new comparison does not
retune HYBRID or HOPF/CONTACT/SPECTRAL. The frozen mechanics/rendering oracle and read-only
observation/lifecycle boundaries remain binding.

The [kernel](../src/audio/tire-hybrid-model.ts) receives one `TireSoundObservation` and surface identity.
It neither instantiates HOPF nor receives a second, precomputed HOPF excitation/pitch stream.
[Hybrid acoustics](../src/audio/tire-hybrid-acoustics.ts) owns friction mappings and material settings;
[rolling acoustics](../src/audio/tire-rolling-acoustics.ts) owns shared R. Generic
[spectral noise primitives](../src/audio/spectral-noise.ts) are also shared with the SPECTRAL reference.
Each axle has two rolling bands R, two low/mid sliding bands S and four finite-width harmonic bands Q.
The output is their sum. No speed/maneuver-specific fallback or arbitrary S-to-Q crossfade is needed:
friction noise continues as the growing squeal becomes dominant.

#### Friction energy and squeal growth

Let `P = Px + Py` be accepted dissipated slip power and `s = hypot(wheelSpeed-vx, vy)`.
Zero support, zero work or zero slip cuts external friction excitation. Positive work is an available-energy cue; it is not
acoustic watts. Since P already includes accepted force, S/Q never multiply it by load again.
Demand is the tire model's dimensionless demand, not remaining grip or a measurement of microscopic slip.

Dimensionless excitation e combines `sqrt(P/(P+referenceWatts))`, smooth authored demand/slip windows,
a high-slip roll-off and material susceptibility. Susceptibility appears once, in e, rather than again
in Q's output gain. The authored threshold reduces the range that sustains squeal; it is not a measured tire instability
threshold. Current listening feedback and comparison priorities belong to NEXT.

One scalar, dimensionless vibration energy E follows the Hopf radial normal form with a small seed term:

```text
E' = 2 * growth * (e - threshold) * E - 2 * damping * E² + seedPower * e²
A = sqrt(E)
```

E is an acoustic state, not physical tread energy in joules. The seed provides weak background vibration
and initiation; the threshold marks positive self-excited growth, not mathematical silence below it.
Nonlinear damping bounds strong excitation. Unlike a second periodic oscillator, this state contains
only the amplitude needed by the noise bands; no unused phase or duplicate amplitude envelope is kept.
Raising the threshold also changes sustained amplitude and recovery, rather than imposing a separate
hard gate. The discrete update preserves nonnegative finite energy across the supported rate/domain.

Q band h is driven by `A * squealGain * harmonicWeights[h-1] * c^(h-1)`, where
`c = min(1, A/harmonicAmplitudeReference)`. Weak vibration loses upper harmonics progressively; strong
vibration recovers the accepted four-band palette. Authored slip and directional-work mappings drive
fundamental pitch; bandwidth and slow random wander give each harmonic finite width. These mappings
retain the accepted response character without claiming a derived rubber stiffness or resonant mode.

#### Rolling and the approach to squeal

R follows accepted wheel rotation, peripheral speed and normal load. Its two broad centers follow wheel
orders; its road-only filtering emphasizes low-frequency texture. Locked translation cannot actively
excite rolling, while supported wheel spin can. Rolling modulation uses
`f = maximumHz * abs(wheelSpeed) / (abs(wheelSpeed) + maximumHz * textureLengthMeters)`.
This approaches distance-per-time divided by authored length at low speed and bounds modulation at
high speed. Units are inverse seconds; wheel angular speed is not divided by metres. Texture lengths and wheel
orders are sound-design parameters, not measured tread pitch, road grain size or guessed game radii.

S follows accepted slip power through two low/mid broad bands. It can sound below Q's growth threshold,
including during locked-wheel sliding. Its color and modulation vary continuously with slip and surface;
it has no event trigger or special understeer/oversteer branch. S does not disappear when Q grows and
is not an estimate of sound energy diverted from Q. Additive R/S/Q is an authored acoustic decomposition,
not a conservation equation for total contact power.

Loss of support, invalid input, zero slip or zero power removes external friction excitation and S
forcing immediately. The scalar vibration state then decays; its `sqrt(E)` continues to drive Q's
stochastic bands as an acoustic release representation. This does not conserve physical energy or
require every random output sample to decrease monotonically. Stored band/filter states are not reset.
Pitch freezes when friction excitation is absent. Recontact resumes stored states. Physical observations
remain immutable.

#### Ownership, approximation and cost

Every non-derived coefficient in `HYBRID_SETTINGS`, shared `ROLLING_SETTINGS` and their catalogs is explicitly authored:
a magic number for listening/calibration, not empirical tire data. This includes power/load references,
onset windows, threshold, growth/damping/seeding, following times, pitches, widths, harmonic weights,
texture lengths/depths and output gains/filters. Mathematical constants and numerical support limits
have separate roles. No added contact solver, temperature state or local tire property is invented to
justify those choices. [Calibration](calibration.md#tire-audio-tuning) maps tuning responsibilities.

Eight bands per axle run at native rate with a rational control clock; only the selected axle pair is
constructed. There is no CONTACT root solve or redundant HOPF oscillator in HYBRID. R/S/Q buttons
retain the shared output-only fade; all state continues while muted, without boosting other components.
Regressions cover subthreshold sliding, later Q growth, recovery, zero-work/support release, rotation,
material transitions, independent seeds, finite-domain output, block partitions and model/component
lifetime. Host timing is not device performance or listening acceptance evidence.

### UNIFIED game synthesis

UNIFIED is a retained selectable method, not a replacement or retune of HYBRID. Each axle composes the
same [rolling source](../src/audio/tire-rolling-model.ts) with one
[friction resonator](../src/audio/friction-resonator.ts). Its Q output covers rubbing, the approach to
squeal and self-excited vibration. There is no separate S source, amplitude/energy envelope, S/Q blend,
mode switch, onset timer, authored harmonic palette or slip-dependent stiffness/pitch remap.

#### One friction port and fixed vibration modes

Two fixed passive modes receive the same scalar friction force. With normalized coordinates
`x_i = omega_i*q_i`, modal velocities `v_i` and participation coefficients normalized to `sum(b_i²)=1`:

```text
x_i' = omega_i*v_i
v_i' = -omega_i*x_i - d_i*v_i + b_i*F
u = sum(b_i*v_i)
F = a*u - beta*u³ + sigma*noise
pickup = sum(b_i*x_i/omega_i)
```

The shared velocity `u` couples both modes through one nonlinear friction feedback. Colored noise
acts at that same input; it is not mixed directly into the output. Below instability, forced vibration
is damped and produces rubbing. As feedback counteracts modal loss, resonant content becomes more
prominent; sufficient feedback permits self-excitation, bounded by cubic dissipation. These are regimes
of the same equations, not separately selected sounds. Frequencies/damping are fixed, so parameter
following does not inject energy by changing stiffness. Nonlinear timbre arises from this system;
there is no separately synthesized harmonic bank.

The listener-selected high-mode default is 1,000 Hz; the low mode is 300 Hz. These are authored
settings, not measured tire frequencies or a promise that the nonlinear output peak equals either
mode frequency. Spectral tests cover both modes and the broad-to-resonant transition.

`E = sum(x_i² + v_i²)/2` is a computed diagnostic, not an independently advanced envelope or energy in
joules. The continuous surrogate satisfies
`E' = -sum(d_i*v_i²) + a*u² - beta*u⁴ + sigma*noise*u`. This identifies passive loss and active input
within the sound model; it does not equate its force, work or pickup to physical tire/acoustic units.
With feedback and noise removed, the remaining modal loss and cubic term are dissipative.

#### Observation mapping and release

Let `P=Px+Py`, `s=hypot(wheelSpeed-vx,vy)`, and `w=P/(P+powerReferenceWatts)`. The
[UNIFIED settings](../src/audio/tire-unified-acoustics.ts) own these authored mappings:

```text
sigma = noiseForcePerSecond * w * surface.roughness
a = feedbackMaximumPerSecond * surface.susceptibility * w
    * s/(s+slipHalfMps) / (1+(s/slipRolloffMps)²)
```

Accepted work already contains accepted force/load; there is no second load multiplier. Demand rho
is transported but unused by this method: it is not another onset authority. Increasing feedback
relative to damping changes instability and the response leading to it, rather than opening a hard
squeal gate. Surface roughness and susceptibility affect the same input's forcing and feedback.

Forward travel speed is not a separate Q control: identical slip, accepted work, surface and seed
produce identical Q even at different forward speeds. Any positive slip/work can force rubbing;
`slipHalfMps` shapes feedback, not the noise-force term. Both the noise bandwidth and passive modes
are time-fixed. Ordinary cornering can
produce positive work in the vehicle tire law without a gross skid. Converting that work to audible
rubbing is uncalibrated; it is not evidence that mild low-speed turns should sound loud. R instead has
its own peripheral-speed dependence. Diagnose R/Q separately before changing this mapping; do not
add a vehicle-speed gate that would also suppress supported stationary wheelspin.

The quieter-onset revision replaces the former square-root response with the work fraction itself
for BOTH forcing and feedback. It is linear near zero and approaches the same upper bound at high work:
relative to the former excitation it is multiplied by `sqrt(P/(P+powerReferenceWatts))`. Weak work
therefore receives a larger reduction, while substantial work still supports self-excited squeal.
This is an authored acoustic response, not a conversion from mechanical watts to acoustic watts.
No exponent control, positive-work dead band, onset timer, extra state or separate rubbing source is
added. All scalar settings, output gain, high mode and shared R are unchanged. At a given slip, more work
is now needed to counter modal loss; both forcing and deterministic instability onset are intentionally
revised. Spectral tests retain the former strong-slip case as an intermediate response and require
high-mode dominance at a stronger input, alongside the unchanged low/broad and transition checks.
Actual audibility and phone acceptance remain listening questions, not consequences of a fixed RMS threshold.

Positive-contact targets follow continuously. Zero support, zero slip, zero work or invalid input
immediately disables new friction forcing and feedback; stored vibration and output filters decay
without resetting. The colored-noise history continues while its force is zero. R retains its own
rotation/support behavior: zero friction work does not stop supported rolling. Input smoothing is
control transport, not an independently authored sound-amplitude envelope.

#### Integration and approximation

For each native sample, the solver composes an exact passive modal half-step, exact scalar nonlinear
feedback half-step, colored-force impulse, feedback half-step and passive half-step. The exact scalar
flow includes the analytic zero-feedback limit. This is split integration of the coupled system, not
an exact solution of its full stochastic evolution. A variance-normalized first-order colored-noise
recurrence has analytically normalized stationary variance with uniform innovations; its force impulse
is multiplied by `dt`, not `sqrt(dt)`.
No iterative contact solve, emergency output clamp, gain normalization or sample-loop allocation is
introduced. The displacement pickup receives fixed gain, DC removal and output filtering.

Every frequency, damping, participation, excitation scale, power/slip reference, surface value,
following time and output coefficient is explicitly an authored magic number. The two-mode normal
form is a synthesis surrogate, not a contact-patch solve or evidence of measured rubber friction.
Its modal structure and common friction input have a
[sound-synthesis precedent](tire-squeal-research.md#common-friction-input-as-a-synthesis-precedent),
which does not validate its tire calibration. Fixed modes, omitted contact/thermal detail and native-rate
nonlinearity limit spectral/aliasing fidelity. A later numerical instability point alone does not
establish later audible squeal. [NEXT](NEXT.md#current-state) owns that listening decision.

The shared voice/worklet runs only the selected axle pair. UNIFIED's R/Q controls fade output only;
muted states continue, S is absent, and engine/master lifetime stays unchanged. The fixed mechanics
oracle, read-only observations, independent axle histories, release, finite-domain behavior,
sample-rate convergence and model/component lifetime remain validation boundaries. Timing probes
and synthetic renders remain separate from phone performance and listening acceptance.

### MODAL game synthesis

MODAL and UNIFIED coexist as independently selectable comparisons. HYBRID remains a listening reference; HOPF, CONTACT and SPECTRAL also retain their waveforms. MODAL has Q only and never
constructs a rolling or separate scrub source. UNIFIED retains its [specified R+Q topology and modes](#unified-game-synthesis) and quieter work-fraction onset. Wind is not implemented.

The [generator](../src/audio/tire-modal-model.ts) composes four
[stochastic resonators](../src/audio/stochastic-resonator.ts), one output pickup and one filter chain.
[Settings](../src/audio/tire-modal-acoustics.ts) own its independent authored calibration. Existing seeded
random/wander primitives are reused without retuning the HYBRID/SPECTRAL references. Their passive band
primitive cannot self-excite, so it cannot express this new system unchanged.

#### One equation per band, no amplitude envelope

For complex sound state `z_i=x_i+i*y_i`, damping `d_i=pi*B_i`, feedback ratio `a`, saturation `b` and
noise level `n`, the normalized continuous surrogate is:

```text
dz_i = [d_i*(a-1-b*|z_i|²) + j*2*pi*f_i]*z_i*dt + sqrt(2*d_i)*n*dW_i
Q = outputGain * sum(harmonicWeight_i * x_i)
```

Each x/y state directly generates the sound. Below `a=1`, random forcing excites a lossy resonance;
as feedback counters loss, it becomes more pronounced. Above `a=1`, a perturbed state can sustain
oscillation even without ongoing noise. Cubic dissipation bounds its growth. There is no separate
energy envelope, S/Q crossfade, onset timer, contact-state switch or compulsory audible-noise prelude.
`sum(|z_i|²)` is a computed diagnostic, not joules or independently integrated amplitude state.

The four independent bands share controls, not a mechanically solved friction port. Frequencies are
at 1/2/3/4 times the base pitch and pickup weights start at HYBRID's 0.65/1/0.6/0.28. Their phases are
independent. This is an authored harmonic palette, not four measured tire modes. Unlike HYBRID, no
amplitude-dependent harmonic envelope is applied. Stochastic forcing remains in the SAME states during
squeal, preserving irregularity; listening must establish whether this is as convincing as HYBRID Q.

#### Observation mapping

With accepted slip work `P=Px+Py`, `s=hypot(wheelSpeed-vx,vy)` and `w=P/(P+powerReferenceWatts)`:

```text
noise = noiseRms * surface.roughness * w
feedback = feedbackMaximum * surface.susceptibility * w
           * s/(s+slipHalfMps) / (1+(s/slipRolloffMps)^2)
f = pitchBaseHz + pitchSlipHz*s/(s+pitchSlipHalfMps) + pitchLongitudinalHz*Px/P
```

The work fraction is linear near zero, preserving quiet weak-work excitation without a dead band.
Support, nonzero slip and positive work are necessary; no additional forward-speed gate, demand gate,
load multiplier or maneuver classification exists. Stationary wheelspin and locked sliding can sound.
Work is an acoustic control cue, NOT acoustic watts; instability depends on feedback relative to loss.

The pitch curve, bandwidth response to slip/wheel peripheral speed and slow 1.5% wander start from
HYBRID. The 1,100 Hz base is the HYBRID reference choice, distinct from UNIFIED's retained fixed
1,000 Hz high mode. They are not the same parameter: no assertion that the new output should peak at
1 kHz is made. Bandwidth is a damping parameter; nonlinear/stochastic output width need not equal it.
The explicit pitch map is a listening convention, not a prediction of tire stiffness. Changing pitch
rotates the normalized state without changing its norm. Wheel speed changes color, not a rolling layer.

Targets follow at a rational 1 kHz clock, independent of render block partitions (25 ms rise, 65 ms
fall for forcing/feedback). Pitch/width follow at 25 ms. Loss of support, zero work/slip or invalid
input immediately removes forcing/feedback, preserving stored vibration and filter tails with frozen
pitch/width. Positive-contact material changes follow through the same target controls. Inputs are
validated without retaining caller-owned observations or writing physics.

#### Numerical and cost contract

For each band, the step first integrates linear rotation/growth with analytic additive-noise covariance,
then exact cubic dissipation. With `sigma=d*(a-1)`, the linear multiplier is `exp(sigma*dt)`, each real
noise increment has variance `n²*d*expm1(2*sigma*dt)/sigma` (limit `2*n²*d*dt`), and the cubic step scales
both coordinates by `1/sqrt(1+2*d*b*dt*|z|²)`. Uniform innovations match the first two moments, not a
Gaussian process. This is first-order splitting of the full stochastic system, not an exact solver.

Four bands per axle require eight random draws and four square roots per sample. Exponential,
expm1, sine/cosine and covariance coefficients update at 1 kHz. There is no iterative contact solve,
audio-rate object allocation, output normalization, hard limiter or inactive R/S computation.
Only the selected pair runs. Q's button fades output without resetting or stopping its states.
Integer 44.1–192 kHz is supported; finite-domain, passive release, deterministic/noise-free instability,
rate convergence and spectral/pitch tests are numerical evidence, not listening or phone certification.
Output receives fixed 18 Hz DC removal and 8 kHz low-pass filtering.

Every calibration value and surface coefficient is explicitly an authored magic number. This is a
stochastic normal-form synthesizer, not a measured contact-patch model. Independent bands, simplified
friction feedback, omitted thermal/contact detail, split integration and native-rate nonlinear aliasing
remain limitations. HYBRID timbre is a comparison target, not a guaranteed preserved waveform.

### Interpretation and cost limits

Neither HOPF nor CONTACT is a validated whole-tire acoustic approximation. CONTACT's effective
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
and filters also run per sample. HOPF uses a direct oscillator update instead of a root search;
the comparison selector does not run both models simultaneously.

The host probe can measure a warmed alternating six-model replay; no complete phone audio/game budget is established here.
Offline renderer `elapsedMs` and `maxIterations` are diagnostics, not average iterations, pure kernel
cost or target-device certification. Do not infer a measured speed ratio from operation counts.
Lower-rate stepping or one/two Newton iterations are unvalidated proposals: they require convergence,
root-domain, spectrum/aliasing and transient checks, not an argument from fundamental pitch alone.
Current construction accepts 44.1–192 kHz. Sound selection and tuning are [deferred](NEXT.md#current-state) while visual presentation is developed.

### Session tuning

MODAL exposes friction controls in `MODAL_TUNING_RANGES`: feedback, saturation,
work reference, slip half/roll-off, noise strength, base pitch, bandwidth, pitch wander and output gain.
Audio owns validation, defaults and authored audition bounds. Surface values, pitch excursions,
harmonic weights, timing and output filters remain source-owned. The settings are not measured tire data.
UNIFIED retains its own controls and acoustic settings. Only the selected
model's panel is shown. Each panel preserves its own values while hidden, and reset changes that model
only. Kernels own frozen tuning snapshots. [Tire tuning](../src/audio/tire-tuning.ts) carries model identity
with values and validates through the corresponding acoustic owner.

An edit uses the existing tire-only replacement fade and installs new kernels at silence; it never
retunes stiffness on a running vibration state. Rapid edits supersede pending settings, returning to
active values cancels replacement, and unchanged values preserve states. Edits for an inactive model do not restart the active voice. Other reference models do
not use these settings. Model/vehicle changes, mute and sound retry retain session tuning and mix;
reload restores defaults. Tire reset changes only the selected model's settings. Invalid replacement tuning releases
forcing without crashing the worklet. The port protocol includes a validated model-specific tuning snapshot
on replacement, not per-frame parameter messages. Physics and the immutable render oracle are unchanged.
