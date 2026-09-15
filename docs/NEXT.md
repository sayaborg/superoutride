# Next task checkpoint

## Restart

1. Inspect the working tree and fetch exact main from the [repository](https://github.com/sayaborg/superoutride).
   Check active PRs, CI and Pages. Preserve unrelated local changes; start a `codex/` branch from the
   inspected main. Follow [AGENTS](../AGENTS.md) for release gates, including documentation-only work.
2. Read the [specification index](README.md), [architecture](architecture.md), this checkpoint and
   [audio](audio.md). Audio owns current runtime behavior; this file owns the next decision.
   The [tire evidence note](tire-squeal-research.md) supplies research and its limits, not a chosen algorithm.
3. Use Node.js 24 and the [development workflow](development.md). Run `npm ci` and `npm test`.
   CI builds the immutable physics/render reference pinned in the existing workflow. A local run
   without that reference checks determinism, not historical equivalence. Do not change the oracle.
4. Serve the built checkout over HTTP, for example `python3 -m http.server 8000`.
   Use `http://localhost:8000/?mode=circuit` for in-game CURRENT/CONTACT comparison. Audition and
   regeneration commands are in [development](development.md#tire-comparison-tools).
   Prior chat attachments, generated WAVs and former machine paths are not required.
5. Verify any release through exact Git/PR refs, CI and the Pages artifact/version. Local listening,
   source tests, deployment evidence and actual device playback are separate claims.

## Next decision: a third tire-sound method

The user judges the current model an insufficient approximation of real tire sound and wants a
**third approach**, discussed in a new thread. This supersedes continuing CONTACT tuning or
optimizing its nonlinear solver as the default next task. No third algorithm, name or implementation
has been selected. "Third" does not preselect a previously discussed option or a renamed CURRENT.

Keep CURRENT and CONTACT, their A/B switch and their tests unchanged as audible references for now.
Do not remove either model, change the reload default, add a placeholder mode or refactor gameplay
in preparation for an unknown design. CONTACT is a useful experiment, not the physical truth that a
successor must reproduce sample-for-sample.

### User feedback to carry forward

- The rolling rumble sounded convincing, and smooth/rough differences were clearly audible.
  Preserve that as a listening reference, not a requirement to retain its algorithm in the third method.
- The revised friction tone was usable; CURRENT and CONTACT produced surprisingly similar impressions.
  This is subjective feedback, not proof of waveform, mechanism or physical equivalence.
- The user wants a higher, richer squeal rather than a single-tone impression, and recognizable loose
  surfaces. The published CONTACT already includes the requested treble and separate surface sketches;
  that implementation is not a general realism or final mix approval.
- Fidelity to the essential audible behavior, simplicity and phone suitability matter together.
  Expensive microscopic-looking equations do not by themselves establish a good approximation.

### Design brief for the next thread

First propose and compare a few genuinely distinct approaches before implementation. Use the same
sound engine for front and rear, with independent observations and internal state. Consider rolling
texture, irregular rubbing and tonal squeal separately where useful; their earlier three-way grouping
and CONTACT's two-mode decomposition are candidates, not frozen architecture.

Prepared sound with controlled playback, generated/precomputed sound, procedural synthesis and hybrids
are eligible for tire work. The user explicitly allowed prepared sound, while preferring an essential,
simple model. The accepted engine's sample-free contract is unchanged. Do not add recordings or assets
until their role and provenance are settled.

For each candidate, state the mechanism retained, what is approximated, the smallest input/state set,
expected behavior through grip/slide/recovery and loose surfaces, and how to test sound and cost.
Do not invent local tread pressure, temperature or stiffness from vehicle-scale tire coefficients.
Do not assume a universal slip threshold or prescribe extra oscillators just to produce complexity.
Use the [current observation and model contracts](audio.md#player-tire-synthesis) to distinguish raw
physics observations from method-specific acoustic mappings; a third method need not inherit CONTACT's
representative load/slip conversion.

Performance is a selection criterion, not a measured conclusion: the [cost limits](audio.md#interpretation-and-cost-limits)
distinguish source-level work from host/device timings. No CONTACT/CURRENT speed ratio or smartphone
budget has been established. Reduced internal rates and fixed Newton counts are unvalidated suggestions,
not accepted optimizations. Avoid starting this thread by implementing them.

### Decision gate

Agree on a candidate and its minimal experiment before wiring a third game mode. Compare front, rear
and their mix over ordinary rolling, cornering, longitudinal lock/spin, sideways/reverse travel,
loose-surface changes, loss of support and grip recovery. Keep listening, spectral/transient analysis,
bounded output, read-only physics and warmed host/device timing as separate evidence. Fixed-gain
comparisons must not hide level differences with automatic normalization.

Retain the engine baseline and existing gameplay during that investigation. A later intentional model
replacement may revise model-specific waveform tests explicitly, but must preserve valid mechanical,
observation, lifecycle and rendering coverage. Do not require a new synthesis method to match the
old method's waveform merely to satisfy a historical hash.

## Accepted engine baseline

Preserve the adopted native-rate waveguide, integrated fractional pulses, authored profiles, shared
tuning and permission/failure lifecycle. The [audio specification](audio.md) owns their details; this
checkpoint does not restate their coefficients. Engine sound is approved as a listening baseline,
not a universal device or absolute-loudness calibration. Vehicle-level differences and final tire/engine
balance remain open; do not silently normalize the engine while changing tires.

## Other implementation areas

Rendering, camera, sprites, tunnel content and race/session rules retain their existing owners in the
[specification index](README.md). Do not reopen them as part of tire method selection.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
