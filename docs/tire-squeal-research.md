# Tire squeal: physical evidence and synthesis implications

This note records the physical evidence behind the current acoustic surrogate. [Audio](audio.md) owns current
runtime behavior. The released implementation uses a bounded normal-form oscillator; an isolated contact-model trial is now available.
Neither changes the vehicle force law.

## Mechanism supported by the sources

Tire squeal can arise from friction-fed self-excited tread vibration. Elastic deformation,
local slip and material damping determine whether vibration grows or dies away. Broadband
rolling/scrubbing sound and a sustained tonal squeal should therefore have distinct excitation
models. The four sources below concern rubber/tire contact; railway-wheel and brake-disc
squeal results are not treated as direct tire evidence.

### Senda, Nakai, Yokoi and Chiba, 1984 — Tire Squeal

The publisher abstract describes full-vehicle, single-tire and rubber-tread experiments. In those
conditions squeal appeared at sliding speeds around 1.1–1.7 m/s, and thinner vibrating tread
corresponded to higher frequencies. This supports an onset condition and a role for elastic
geometry. These are experiment-specific results, not universal thresholds or proof that all four
wheels must slide before any individual tire can squeal. The abstract was inspected; its full
experimental detail was not independently checked here.

Source: [Bulletin of JSME, 27(231), 2016–2023](https://www.jstage.jst.go.jp/article/jsme1958/27/231/27_231_2016/_article/-char/en).

### Kröger and Moldenhauer, 2010 — Influences on the vibration frequencies of tire tread blocks

The reduced tread-block model uses measured velocity/pressure-dependent friction and nonlinear
contact stiffness. Its parameter study shows self-excitation in a velocity-weakening friction
range, reduced vibration with greater damping, and oscillation loss outside some sliding-speed
ranges. Stick-slip frequency varies with slip and geometry and need not equal the free-block
natural frequency. Thus neither “more slip always means more squeal” nor “one fixed resonant
frequency explains squeal” follows from this model. Local block speeds must not be copied directly
into a whole-axle onset rule. See Sections 2–3 and Table 1.

Source: [ISMA 2010 proceedings, 4015–4022](https://past.isma-isaac.be/downloads/isma2010/papers/isma2010_0480.pdf).

### Tan Li, 2019 — Tire Braking/Cornering Noise Analysis: Stick/Slip Mechanism

Eleven tires were tested under dry braking/cornering and a subset under wet braking. Table 2
reports dry-cornering tones around 470–980 Hz and dry-braking tones around 490–1360 Hz across
the tested tires. Some spectrograms show harmonics and rising pitch while vehicle speed falls.
The explanations involving stiffness, temperature and friction are explicitly hypotheses needing
quantitative verification. These measurements support variable fundamental-plus-harmonic
synthesis, but do not establish universal pitch maps or prove that cornering always has higher
pitch than braking. See Figures 5–6, Table 2 and the conclusion.

Source: [NOISE-CON 2019, author-posted paper](https://www.researchgate.net/profile/Tan_Li8/publication/338375049_Tire_BrakingCornering_Noise_Analysis_StickSlip_Mechanism/links/5e0f8b6a92851c8364b007e1/Tire-Braking-Cornering-Noise-Analysis-Stick-Slip-Mechanism.pdf).

### Miyashita and Persson, 2026 — Tire Tread Block Dynamics

This single-block study distinguishes slowly varying background temperature from rapid,
localized flash heating, and relates friction to sliding history. Most frictional energy becomes
heat. It supports treating dissipated slip power as an available-energy cue rather than measured
sound power. It is not a calibrated full-tire squeal predictor. See the introduction and tread-block
model discussion.

Source: [Tribology Letters 74, article 62](https://link.springer.com/article/10.1007/s11249-026-02150-z).

## A minimal explanatory model

The following is our schematic derivation, not a quantitative model fitted to any of the papers.
A spring-mounted rubber element moves at velocity x-dot while a surface moves at V. If the
friction force is F(V - x-dot), a simple model is:

```text
m x-double-dot + c x-dot + k x = F(V - x-dot)
```

Linearizing about steady slip and removing the equilibrium force gives:

```text
m delta-x-double-dot + [c + F'(V)] delta-x-dot + k delta-x = 0
```

When the friction slope is negative enough to overcome damping, small vibrations grow.
Nonlinear friction and deformation can then bound the amplitude into a sustained oscillation.
This explains why increasing the Q of a passively driven noise filter is not itself a
self-excitation mechanism. It is an illustrative mechanism, not a claim that velocity weakening
is the only possible friction-induced instability.

## Consequences for SUPER OUTRIDE

The game now offers CURRENT and CONTACT for user-requested A/B comparison. CURRENT retains the
bounded self-excited oscillator without rolling noise; CONTACT reuses the accepted rolling rumble and
nonlinear friction-vibration kernel. The earlier broadband-mute preference does not restrict CONTACT.
[Audio](audio.md#contact-model-and-game-comparison) owns the equations, representative units, provisional
axle mapping and comparison limits. This evidence note does not validate the authored conversion or
establish realistic sound merely because a mechanical oscillator is used.

The sources do not validate the current onset, pitch, harmonic or roughness constants. Directional
slip power remains a useful energy input, but cannot alone determine tone frequency, onset or sound
pressure. The game has no local rubber stiffness, loss factor, tread temperature or contact-pressure
field; its vehicle-scale tire coefficients must not be relabeled as those quantities.

Use the current tire audition on lateral slide, wheel lock, spin, loose surface and recovery
sequences, with front/rear tested separately and together. Check 44.1/48 kHz stability, fading and
CPU cost. Choose pitch and onset controls explicitly as sound-design approximations. Do not infer
a universal threshold from one rig, make lateral sliding a prerequisite, or add thermal/contact
physics solely to justify an audio parameter. Earlier noise-band experiments are available in Git
if specifically needed; restarting does not require saved audio files or temporary reference modules.
