# Procedural audio

Audio is read-only presentation of completed vehicle observations. Its pressure-like pulses,
pipe dimensions and output gains form an authored acoustic surrogate rather than measured vehicle
sound. [Tire audio](tire-audio.md) owns UNIFIED synthesis, [Calibration](calibration.md) owns numeric
settings, [Browser](browser.md#sound-controls) owns operation, and
[Development](development.md#audio-audition) owns audition commands and workflow.

## Observations and profiles

The [acoustic observation](../src/audio/vehicle-audio-observation.ts) contains powertrain, position
and tire inputs. From the powertrain, audio reads engine RPM, the effective opening
(`effectiveOpening`, the engine's only command and the excitation source) and the last shift
(sequence, direction and engine RPM before and after, as
[vehicle physics](vehicle-physics.md#wheel-and-powertrain) publishes it). A sequence the voice has not yet heard
marks a new shift; shift sounds such as downshift blips are not yet synthesized. The browser supplies completed observations once per presented frame.
Physics owns RPM, actuators, contact loads, wheel motion and dissipated work; audio owns oscillator,
filter and envelope state. Player tire observations use the optional physical observation channel;
rival sound uses engine observations.

A [vehicle audio profile](../src/audio/vehicle-audio-profile.ts) contains one or two revolutions per
cycle, ordered firing phases, collector membership, primary lengths and a common outlet length per
collector. Phase count determines cylinder count. The vehicle catalog binds these profiles to the
same sample-free engine kernel. Firing rows identify events and collector groups.

## Engine synthesis

The voice reads engine RPM exactly as simulated; physics keeps it at or above idle, and the exhaust
processor's own `rpm` parameter range (0 to 24000) is the only bound. Excitation follows the
powertrain's effective opening, so it includes the idle-holding opening and is zero during fuel cut.
Closed throttle has a positive excitation floor;
stronger excitation shortens pulse rise time, while decay time is independent of load.

At each firing, `strength = max(0, excitation + pulseVariation*r)` for seeded xorshift32 `r` in `[-1,1)`.
Variation is an absolute fraction of full excitation. The same seed and input history reproduce the
same event sequence; random draws occur at firing events.

The pulse model is:

```text
p' = -p/decayTime
r' = (p-r)/riseTime
```

Firing resets `p` and keeps `r` continuous. Exact exponential evolution across fractional firing times
supplies the sample-average pulse to the pipe. Rise and decay are independent positive time constants.

The [waveguide](../src/audio/exhaust-waveguide.ts) has bidirectional primary and outlet delays rounded
to the nearest sample at the reference wave speed. Each traversal multiplies amplitude by
`exp(-attenuationPerMeter*length)`. Equal-admittance collector scattering uses
`p = 2*sum(incoming)/portCount` and `outgoing = p-incoming`.

The source reflection varies from +0.94 to -0.3 through the aperture `16*u²*(1-u)²` over 0.23 firing
cycles, then returns to its closed value. The aperture has continuous value and slope and a window
mean of 8/15. Source and outlet low-pass filters act inside their return paths. The listening pickup
sums outgoing and low-passed outgoing waves, with collector mixing divided by `sqrt(collectorCount)`.

Each acoustic step runs at the output sample rate. Integer pipe delays, the pulse approximation and
native-rate nonlinear stages define the model's temporal and spectral resolution.

## Output conditioning

```text
Collector mix -> 18 Hz DC removal -> soft clipping -> final low-pass filter
              -> voice/master gain -> compressor
```

Soft clipping uses `y = 0.65*x/(1+abs(x))`, with small-signal gain 0.65 and asymptotic bounds ±0.65.
The final filter uses `tone += a*(y-tone)`, where `a = 1-exp(-2*pi*outputCutoffHz/sampleRate)`.
It is independent of the boundary return filter. The master compressor supplies envelope-based
compression. Output depends on the profile, RPM, excitation and fixed mix gains.

## Reference coefficients

The default pipe coefficients are **480 m/s wave speed, -1 outlet reflection, 3100 Hz return cutoff
and 0.03 Np/m attenuation**. [Exhaust acoustics](../src/audio/exhaust-acoustics.ts) derives them for
an unflanged 50 mm internal-diameter pipe, 573.15 K air at 101325 Pa, `gamma=1.4`, `R=287 J/(kg K)`,
`Pr=0.71` and a 500 Hz loss reference.

The derivation uses `c=sqrt(gamma*R*T)`, the open-end negative reflection limit,
`fc=c/(2*pi*radius)` and
`alpha=sqrt(pi*f*nu)/(radius*c)*(1+(gamma-1)/sqrt(Pr))`. Sutherland viscosity uses
`mu0=1.716e-5 Pa s`, `T0=273 K` and `S=111 K`; density is `p/(R*T)` and `nu=mu/density`.
The resulting loss is about 0.034 Np/m before rounding. These are fixed reference coefficients.

## Mix and lifetime

[Audio engine](../src/audio/audio-engine.ts) owns three fixed worklets: player engine, selected rival
engine and player tires. The nearest rival within 100 physical world metres occupies the rival slot.
Its gain uses 3D distance and its pan uses lateral displacement in the player's yaw frame.
A rival change fades before reusing the slot. ENG, TIRE and MASTER independently multiply their
outputs. Component output switches leave synthesis state running.

The shared control-following constant is 25 ms and transition duration is 90 ms. Engine profile/tuning
replacement fades to silence before installing a new kernel. New settings supersede pending values;
returning to active values cancels pending replacement. Tire replacement is specified in
[Tire audio](tire-audio.md#tuning-replacement).

Construction leaves the AudioContext unopened. An eligible user gesture starts or resumes audio.
Hidden or stopped shells suspend it; mute fades before suspension. Disposal closes the context,
including a graph completing initialization after disposal. Module URLs resolve within the selected
commit-versioned build.

An audio failure closes the affected graph and exposes retry while driving continues. A late result
from an older initialization cannot replace or close a newer graph. Invalid processor replacements
produce silence. Browsers without AudioWorklet support remain playable with unavailable sound.
The browser's normal audio session and device output controls determine audible output.
