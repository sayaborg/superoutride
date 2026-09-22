# UNIFIED tire audio

UNIFIED is an authored sound surrogate with independent front and rear sources. Each axle combines
rotation-driven rolling output R and a shared-friction resonator output Q. Coefficients describe this
normalized acoustic model rather than measured rubber properties or acoustic power.
[Audio](audio.md) owns the graph and lifetime, [Calibration](calibration.md#unified-tire-settings) owns
current values, and [Browser](browser.md#sound-controls) owns controls.

## Observation transport

The browser supplies completed physical observations: signed longitudinal/lateral contact velocities,
wheel peripheral/angular velocity, normal load, longitudinal/lateral dissipated power and surface.
One tire worklet receives independent k-rate parameter sets and seeded histories for both axles.
The game and tire audition use the same voice, processor and observation mapping.

[Observation domains](../src/audio/tire-sound-observation.ts) bound acoustic transport. Zero load or
VOID yields a silent contact observation. An invalid block releases only the affected axle's forcing;
finite stored tails decay, and subsequent valid input restores excitation.

## Rolling synthesis

[Rolling synthesis](../src/audio/tire-rolling-model.ts) uses wheel angular velocity for noise-band
centres and peripheral velocity for texture rate and level. Normal load scales supported rolling.
Two finite-width noise bands and smooth random texture feed DC removal and a fixed low-pass output.
[Rolling acoustics](../src/audio/tire-rolling-acoustics.ts) owns surface coefficients and response rates.
Unsupported contact releases forcing with filter history intact; supported rolling remains active
at zero friction work.

## Friction synthesis

[UNIFIED synthesis](../src/audio/tire-unified-model.ts) drives two passive vibration modes through one
scalar nonlinear friction input. With `x_i=omega_i*q_i`, modal velocity `v_i` and participation
normalized to `sum(b_i²)=1`:

```text
x_i' = omega_i*v_i
v_i' = -omega_i*x_i - d_i*v_i + b_i*F
u = sum(b_i*v_i)
F = a*u - beta*u³ + sigma*noise
pickup = sum(b_i*x_i/omega_i)
```

Both modes receive the same force, and their shared velocity couples the feedback. Colored noise
enters that force. Damped forced vibration produces rubbing; increasing feedback counteracts modal
loss and supports self-excitation bounded by cubic dissipation. Q covers this continuous transition.
Modal frequencies and damping are fixed for a kernel's lifetime.

The normalized state energy and its continuous derivative are:

```text
E = sum(x_i²+v_i²)/2
E' = -sum(d_i*v_i²) + a*u² - beta*u⁴ + sigma*noise*u
```

Passive loss and the cubic term dissipate stored state when feedback and forcing are removed.

### Work and slip mapping

For accepted dissipated power `P=Px+Py`, slip speed `s=hypot(wheelSpeed-vx,vy)` and
`w=P/(P+powerReferenceWatts)`:

```text
sigma = noiseForcePerSecond*w*surface.roughness
a = feedbackMaximumPerSecond*surface.susceptibility*w
    * s/(s+slipHalfMps) / (1+(s/slipRolloffMps)²)
```

Accepted work includes force and load. Roughness controls forcing and susceptibility controls feedback
at the same friction input. `w` is linear near zero and approaches one at high work. Equal slip,
accepted work, surface and seed produce equal Q, including supported stationary wheelspin.

Positive-contact targets follow continuously. Zero support, slip or work, and invalid input,
immediately disable new friction forcing and feedback. Stored vibration and output filters decay;
colored-noise history continues. R follows its separate rotation/support inputs.

### Numerical domain

The [friction resonator](../src/audio/friction-resonator.ts) accepts integer sample rates from 44100
through 192000 Hz. Modes have positive frequency below one quarter of the rate and positive
underdamped loss: `0 < d_i/2 < omega_i`. Participation has positive squared norm.
Feedback maximum and saturation are positive; `feedbackMaximumPerSecond/rate < 1`.
Noise bandwidth is positive and below Nyquist. Invalid parameters throw `RangeError`.

Each sample composes passive half-step, scalar-feedback half-step, colored-force impulse,
scalar-feedback half-step and passive half-step. Passive and scalar flows use their analytic
solutions, including zero feedback. The variance-one first-order colored-noise recurrence uses
uniform innovations; its force impulse scales by `dt`. This split integration approximates the
coupled stochastic system at the native rate. The displacement pickup uses fixed gain, DC removal
and output filtering.

## Tuning replacement

`resolveUnifiedTuning` produces a validated frozen snapshot using the acoustic ranges. Replacement
uses a tire-only fade and installs fresh kernels at silence. Rapid edits supersede pending settings;
returning to active values cancels replacement, and equal values preserve source state.

Vehicle changes, mute and sound retry retain tuning and mix. Reload restores defaults. Invalid
replacement tuning releases forcing without terminating the worklet. R/Q switches fade only their
output taps for both axles; synthesis and the other component continue at their own levels.
