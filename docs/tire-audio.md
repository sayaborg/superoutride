# Tire audio

Tire sound is read-only presentation. [Audio](audio.md) owns the fixed graph and browser lifetime;
[Calibration](calibration.md#tire-audio-tuning) owns control guidance. Acoustic coefficients are authored
listening choices, not measured tire properties. [NEXT](NEXT.md#current-state) owns open tuning work.

## Source ownership

- [UNIFIED synthesis](../src/audio/tire-unified-model.ts) and [acoustics](../src/audio/tire-unified-acoustics.ts)
  own friction composition, coefficients, surfaces and validated tuning snapshots.
- [Friction resonator](../src/audio/friction-resonator.ts) owns coupled vibration state and its solver.
- [Rolling synthesis](../src/audio/tire-rolling-model.ts) and [acoustics](../src/audio/tire-rolling-acoustics.ts)
  own rotation-driven R independently of friction forcing.
- [Noise primitives](../src/audio/noise.ts) own `RandomStream`, `SmoothRandom`, `NoiseBand`,
  `deriveNoiseSeed` and the numerical `NOISE_BAND_DOMAIN`. Stream IDs are authored in their consumer's settings.
- [Observation](../src/audio/tire-sound-observation.ts) owns bounded acoustic inputs.
  [Controls](../src/audio/tire-sound-controls.ts), [voice](../src/audio/tire-voice.ts) and
  [processor](../src/audio/tire-processor.ts) own transport, output taps and faded tuning replacement.

## Player tire synthesis

One worklet contains independent front and rear UNIFIED sources, with separately seeded histories.
The browser copies completed physical observations: signed longitudinal/lateral contact velocities,
wheel peripheral/angular velocity, normal load, longitudinal/lateral dissipated power and surface.
The voice bounds acoustic transport without writing physical state. Zero load or VOID becomes a
silent observation. Invalid worklet controls release only the affected axle's forcing; stored finite
tails may decay and later valid controls can recover.

### Shared transport

The voice sends one k-rate parameter set per axle. The processor validates each block against the
observation domains; the kernels own following and release. There is no model selector or alternate
input mapping. The game and [tire audition](../tools/audio/tire-browser.html) use this same voice/worklet.

### Component output controls

The game exposes `R: ON/OFF` for rolling and `Q: ON/OFF` for friction/squeal, both initially on.
They affect both axles, fade over the shared output-control time and do not stop source state or
renormalize the other component. Buttons have descriptive labels and pressed state and are disabled
when audio is unavailable. ENG, TIRE and MASTER gains remain independent of these taps.

### Rolling synthesis

R uses wheel angular velocity for band centers and wheel peripheral velocity for texture rate and
level. Normal load scales supported rolling; no friction work is required. Two finite-width noise
bands and smooth random texture feed DC removal and the fixed low-pass output. Surface coefficients,
orders, following times and gains are owned by rolling acoustics. They are authored, not measured
road texture or tire resonances. Unsupported contact releases forcing without resetting filter history.

### UNIFIED game synthesis

UNIFIED is the sole tire sound model. Each axle composes the [rolling source](../src/audio/tire-rolling-model.ts) with one
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
mode frequency.

`E = sum(x_i² + v_i²)/2` describes the modal state, not an independently advanced envelope or energy in
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

Accepted work already contains accepted force/load; there is no second load multiplier. Increasing feedback
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

The work fraction is linear near zero and approaches the same upper bound at high work for both
forcing and feedback. This is an authored acoustic response, not a conversion from mechanical watts
to acoustic watts. Actual audibility and phone acceptance remain listening questions.

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

### Session tuning

`UNIFIED_TUNING_RANGES` owns friction feedback/saturation, work and slip response, noise bandwidth/force,
mode frequencies and output controls. `resolveUnifiedTuning` validates and freezes each snapshot.
The DEV panel reads these defaults and bounds; reset restores this one model's defaults.

An edit uses the tire-only replacement fade and installs new kernels at silence, rather than retuning
stiffness on a running vibration state. Rapid edits supersede pending settings; returning to active
values cancels replacement, and unchanged values preserve state. Vehicle changes, mute and sound
retry retain session tuning and mix; reload restores defaults. Invalid replacement tuning releases
forcing without crashing the worklet. Replacement messages carry a tuning snapshot, not per-frame
observations. [Development](development.md#audio-audition) owns the audition entry points.
