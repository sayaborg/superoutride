# UNIFIED tire audio

UNIFIED is an authored sound surrogate with independent front and rear generators. Each axle combines
rotation-driven rolling output R and a shared-friction resonator output Q. Coefficients describe this
normalized acoustic model rather than measured rubber properties or acoustic power.
[Audio](audio.md) owns the graph and lifetime, [Calibration](calibration.md#unified-tire-settings) owns
values, and [Browser](browser.md#sound-controls) owns controls. The friction mapping's form follows from physics: what
decides a squeal (the slip speed and the surface) is kept apart from how strongly it sounds (the friction power), the
forced sound's power follows the friction power, and the vibration's speed is bounded by the slip speed. Every value is
a listening setting changed by DEV controls, `UnifiedSettings` (friction) and `RollingSettings` (rolling). The only
constants are structural: random seeds, noise stream indices, the internal rolling control rate `controlHz`, the noise
band's numerical domain and the 1 kN unit of the pickup gain.

## Observation transport

The browser supplies completed physical observations: signed longitudinal/lateral contact velocities,
wheel peripheral/angular velocity, normal load, longitudinal/lateral dissipated power and surface.
One tire worklet receives independent k-rate parameter sets and seeded histories for both axles.

The voice's `tireSoundParameters` ([observation domains](../src/audio/tire-sound-transport.ts)) is the one
validation: it rejects values the transport's float32 cannot carry finitely, negative load or power and unknown
surfaces with `RangeError`, and bounds nothing else: every rolling input saturates (`x / (x + reference)`), and the
friction synthesis reads the friction power per load and the square root of the load, returning a finite value for any
finite input, so any finite value is heard as its own. Zero load or no material yields a silent contact observation. The worklet and kernels
read the transported values as trusted. The one bound the synthesis needs, a noise band's centre below
`maximumFrequencyRateFraction` of the output rate, is the rolling generator's own: it holds each band's centre within
the noise band's domain at any wheel speed.
The worklet rounds the surface index and releases the affected axle's forcing when it names no record; finite stored
tails decay, and subsequent input naming a record restores excitation.

## Surface sounds

Surface sounds are content: `content/surface-sounds/default.json` is the one `superoutride.surface-sounds`
version 1 document (manifest kind `surface-sound`, ID `default`). Its `surfaces` object holds one record per
material ID: `rolling` (`low`, `high`, `textureLengthMeters`, `textureDepth`) is the rolling palette and
`friction` (`roughness`, `susceptibility`) the [friction input](#work-and-slip-mapping). [`compileSurfaceSound`](../src/audio/surface-sounds.ts)
is the one value check (every number finite and at least 0, `textureLengthMeters` above 0, the friction input within
[0, 1], and the rolling palette within `ROLLING_PALETTE_LIMITS`: `textureDepth` at most 1, so the texture modulation
`1 + depth·u` stays in [0, 2], and `low` and `high` at most 1 / (2 × the largest rolling `gain`), 3.125, so every band
excitation stays within the noise band's [0, 1] for every admitted rolling setting); [`compileSurfaceSoundDocument`](../src/audio/surface-sound-document.ts) checks format, version and shapes and
calls it. `resolveSurfaceSoundRecords` numbers the records in material catalog order and rejects, with
`RangeError` and no fallback, a catalog material without a surface sound, a surface sound for an unknown
material and more than `SURFACE_SOUND_LIMIT` (256, the `surfaceIndex` transport range; an author value, since the
float32 parameter carries every integer to 2²⁴) materials; the content
build applies it before delivery and the game at startup. The voice looks up each observed material's number in
the catalog order; the worklet receives the records at construction and in every settings message
(`{ settings, rolling, control, surfaces }`), uses them as given ([admitted once](audio.md#audio-document)) and
replaces its kernels when they change, and the kernels read them by number. DEV's SURFACES panel
([Browser](browser.md#sound-controls)) changes the records at the same numbers, each through the one value check.

## Rolling synthesis

[Rolling synthesis](../src/audio/tire-rolling-model.ts) uses wheel angular velocity for noise-band
centres and peripheral velocity for texture rate and level. Normal load scales supported rolling.
Two finite-width noise bands and smooth random texture feed DC removal and a low-pass output.
[Rolling acoustics](../src/audio/tire-rolling-acoustics.ts) owns the `RollingSettings`
(orders, band shape, response rates, texture, gain and output filters); the [surface record](#surface-sounds) supplies band levels and texture.
Unsupported contact releases forcing with filter history intact; supported rolling remains active
at zero friction work.

## Friction synthesis

The [friction synthesis](../src/audio/friction-synthesis.ts) is one friction system, which
[UNIFIED synthesis](../src/audio/tire-unified-model.ts) uses as its Q beside rolling R. It drives two passive vibration
resonances ([friction resonator](../src/audio/friction-resonator.ts)) through one scalar nonlinear friction input. With `x_i=omega_i*q_i`, modal velocity `v_i` and participation
normalized to `sum(b_i²)=1`:

```text
x_i' = omega_i*v_i
v_i' = -omega_i*x_i - d_i*v_i + b_i*F
u = sum(b_i*v_i)
F = a*u - (a/s²)*u³ + sigma*noise
pickup = sum(b_i*x_i/omega_i)
```

Velocities are in m/s, and `s` is the slip speed. Both resonances receive the same force, and their shared velocity
couples the feedback. Colored noise enters that force. Damped forced vibration produces rubbing; increasing feedback
counteracts modal loss and supports self-excitation, bounded by the cubic term where the port's speed `u` reaches the
slip speed: a vibration faster than the sliding would stick. Q covers this continuous transition.
Modal frequencies, damping and participation are fixed for a kernel's lifetime; they are settings
(`lowFrequencyHz`, `highFrequencyHz`, `resonanceDampingPerSecond` shared by both modes, and `lowParticipation`
with the high mode's `sqrt(1-low²)` keeping `sum(b_i²)=1`).

The normalized state energy and its continuous derivative are:

```text
E = sum(x_i²+v_i²)/2
E' = -sum(d_i*v_i²) + a*u²*(1 - u²/s²) + sigma*noise*u
```

Passive loss and the cubic term dissipate stored state when feedback and forcing are removed.

### Work and slip mapping

For slip speed `s=hypot(wheelSpeed-vx,vy)` (m/s), dissipated friction power `P=Px+Py` (W) and normal load `N` (the
observation's `load`, N):

```text
a      = feedbackMaximumPerSecond*surface.susceptibility*g(s)
g(s)   = s/(s+slipHalfMps) / (1+(s/slipRolloffMps)²)
sigma  = noiseForcePerSecond*surface.roughness*sqrt(P/N)
beta   = a/s²
output = pickup*outputGainPerSecond*sqrt(N / 1 kN)
```

Whether the contact squeals is intensive: `a` depends on the slip speed and the surface, never on the power or the
load. How strongly it sounds is extensive: `P/N` is the friction power per load (`mu*s`, m/s), and at a constant
contact pressure the sliding area follows the load, so the pickup's `sqrt(N)` and the forcing's `sqrt(P/N)` together
make the forced sound's power proportional to the friction power, with no ceiling; the output stage (the mix's
compressor) bounds it. The cubic term holds the vibration's speed to the slip speed, so a squeal's amplitude grows with
the slip. 1 kN is the unit of the pickup gain, not a listening value.

The friction input is two fractions, each in the closed interval [0, 1], of a setting's maximum: `roughness` of
`noiseForcePerSecond`, the forcing of the roughest input at a friction power per load of 1 m/s, and `susceptibility` of
`feedbackMaximumPerSecond`. A value outside [0, 1] is rejected at admission, never clamped. Roughness controls forcing
and susceptibility controls feedback at the same friction input. Equal slip, power, load, surface and seed produce
equal Q, including supported stationary wheelspin.

`sigma`, `a`, `s` and the pickup's `sqrt(N / 1 kN)` follow continuously within the kernel
([`observationSeconds`](../src/audio/audio-control-policy.ts)); `s` starts from its observation the first time the
contact is excited, not from 0. Zero slip, power or load, and a released axle, immediately set `sigma` and `a` to 0;
`s` and the pickup's gain hold, and stored vibration and the output filters decay. Colored-noise history continues. R
follows its separate rotation/support inputs.

### Numerical domain

The [friction resonator](../src/audio/friction-resonator.ts) and the noise bands accept the synthesis's sample rates,
`SYNTHESIS_RATE_DOMAIN` ([noise](../src/audio/noise.ts)): integers from 44100 through 192000 Hz, author values (the
range the numerics are checked over), whose one owner the audio lifetime also reads ([Audio](audio.md#mix-and-lifetime)). Resonances have positive frequency below one quarter of the rate and positive
underdamped loss: `0 < d_i/2 < omega_i`. Participation has positive squared norm.
Feedback maximum is positive; `feedbackMaximumPerSecond/rate < 1`. Feedback lies in `[0, feedbackMaximumPerSecond]`,
and while it is positive the slip speed is positive.
Noise bandwidth is positive and below Nyquist. Invalid parameters throw `RangeError`.

Each sample composes passive half-step, scalar-feedback half-step, colored-force impulse,
scalar-feedback half-step and passive half-step. Passive and scalar flows use their analytic
solutions. The scalar half-step of `u' = a*u - (a/s²)*u³` is

```text
u <- u*e^(a*dt/2) / sqrt(1 + (u/s)²*(e^(a*dt) - 1))
```

whose fixed point is `u = s`; with `a = 0` it is the identity and reads no `s`. It is computed through `(u/s)²`, finite
for the least positive slip speed float32 carries. The variance-one first-order colored-noise recurrence uses
uniform innovations; its force impulse scales by `dt`. This split integration approximates the
coupled stochastic system at the native rate. The displacement pickup uses the `outputGainPerSecond`,
`dcHz` and `outputCutoffHz` settings.

## Settings replacement

`resolveUnifiedSettings` and `resolveRollingSettings` admit frozen snapshots using the acoustic ranges, where settings
are admitted ([Audio](audio.md#audio-document)); the worklet message carries `{ settings, rolling, control }` and a change to any of them replaces the kernels. Replacement
uses a tire-only fade and installs fresh kernels at silence. Rapid edits supersede pending settings;
returning to active values cancels replacement, and equal values preserve synthesis state.

Vehicle changes, mute and sound retry retain settings and mix. Reload restores defaults. R/Q switches (`rolling`/`friction` components) fade (`componentSeconds`) only their
output taps for both axles; synthesis and the other component continue at their own levels.
