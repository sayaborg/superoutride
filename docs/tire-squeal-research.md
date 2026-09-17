# Tire squeal: physical evidence and synthesis implications

This is supporting research, not a runtime specification or numerical calibration.
[Audio](audio.md#player-tire-synthesis) owns the in-game CURRENT/CONTACT/SPECTRAL/HYBRID/MODAL/UNIFIED implementations;
[NEXT](NEXT.md#next-work-modal-listening) owns current listening priorities.
The source summaries below retain their stated inspection limits. They motivate possible mechanisms,
not the numerical coefficients or realism of any existing sound engine.

## Mechanism supported by the sources

Tire squeal can arise from friction-fed self-excited tread vibration. Elastic deformation,
local slip and material damping determine whether vibration grows or dies away. Passive roughness
forcing and friction-fed instability are different energy inputs; they can act through one vibration
system. This does not require separate synthesized rubbing and squeal outputs. The four sources below concern rubber/tire contact; railway-wheel and brake-disc
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

## Common friction input as a synthesis precedent

Avanzini and colleagues' 2005 friction-sound synthesis paper couples modal resonating bodies through
a common friction interactor. A noise term enters the interaction force, rather than requiring a
separately mixed rubbing soundtrack. This is a structural precedent for sharing vibration states
between forced friction noise and self-excited sound. It does not validate MODAL's cubic normal
form, four independent harmonic bands, tire-scale observation mapping, coefficients or perceived realism.
MODAL shares the use of forced/self-excited sound states, not this paper's common-port topology.

Source: [Avanzini et al., 2005, author-hosted paper](https://avanzini.di.unimi.it/downloads/publications/avanzini_sap05.pdf).

## Limits for synthesis and tuning

The tire sources support friction-fed vibration as one possible mechanism; they do not select
HYBRID's scalar energy surrogate, CURRENT's oscillator, CONTACT's one-element law or MODAL's
independent stochastic band system or UNIFIED's common-port system. A mathematically consistent surrogate can still omit the structure and
statistics responsible for convincing tire sound. The synthesis precedent supports the possibility
of a shared friction system, not its calibration for this game.

The sources do not validate current onset, modal frequencies, damping, harmonic content, roughness or
output gains. Directional slip power is an available-energy cue, not acoustic power or a complete
predictor of frequency, onset or loudness. The game has no local rubber stiffness, loss factor, tread
temperature or contact-pressure field; vehicle-scale coefficients must not be relabeled as those
quantities. MODAL's computed state norm is not measured tread energy, and HYBRID's additive R/S/Q
does not partition mechanical power into calibrated acoustic watts.

Do not turn one experiment's speed into a universal axle threshold, require lateral slip for every
squeal, or add thermal/contact physics solely to justify an audio parameter. Distinguish harmonic
partials, other tonal components and broadband sound when evaluating richness. Adding oscillators,
using a single mechanism or matching one replay does not itself establish greater realism. Likewise,
a model's instability point and the listener's audible squeal onset are different observations.

[Audio](audio.md#player-tire-synthesis) owns current mechanisms and approximation limits;
[NEXT](NEXT.md#next-work-modal-listening) owns MODAL listening and method acceptance. HYBRID remains
the accepted/default reference while the new method is evaluated. Keep previous experiments in Git
rather than another proposal/handoff archive; existing tools regenerate references without prior
chat audio files.
