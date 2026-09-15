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
   Use `http://localhost:8000/?mode=circuit` for in-game CURRENT/CONTACT/SPECTRAL comparison. Audition and
   regeneration commands are in [development](development.md#tire-comparison-tools).
   Prior chat attachments, generated WAVs and former machine paths are not required.
5. Verify any release through exact Git/PR refs, CI and the Pages artifact/version. Local listening,
   source tests, deployment evidence and actual device playback are separate claims.

## Next decision: a third tire-sound method

The user listened to the SPECTRAL WAVs, judged them good, and authorized implementation in the game.
The [SPECTRAL contract](audio.md#spectral-game-synthesis) now owns eight shared audio bands per axle:
the retained asphalt scrub/squeal plus rolling texture and authored loose-surface differences.
The kernel/settings moved from DEV into audio rather than being copied. DEV keeps only the separate
S/Q audition worklet. Signed contact velocities and effective wheel peripheral speed are optional
completed-solve observations, never another physical state or tire solve.

CURRENT, CONTACT and SPECTRAL are available through the existing tire-only faded selector in every
course. CURRENT remains the reload default. Engine tuning/reset, vehicle replacement, mute/resume and
sound retry preserve the session's tire choice. Existing CURRENT/CONTACT synthesis and engine behavior
are unchanged. Approved S/Q waveforms have exact 44.1/48 kHz replay regressions; added rolling and the
new front/rear game mix are not covered by the earlier subjective approval.

### User feedback to carry forward

The previous rolling rumble and smooth/rough contrast were useful listening references, not a mandate
to retain CONTACT's implementation. The user wants a high, rich friction sound and recognizable loose
surfaces. SPECTRAL's asphalt S/Q WAVs were judged good; this is not whole-game, speaker or phone acceptance.
Fidelity to essential audible behavior, simplicity and phone suitability remain joint priorities.

### Next action: assess the integrated game

Select TIRES: SPECTRAL (two presses from CURRENT). Compare ordinary rolling, progressive cornering,
locked slide, moving/stationary wheelspin, sideways/reverse travel, shoulders and loose ground,
loss of support/recontact, rapid model changes and mute/resume. Front and rear retain independent
observations/state with identical synthesis/settings. SPECTRAL's road low band responds to contact
travel and the high band to effective wheel peripheral speed; do not relabel either as the other.

The separate S/Q audition still isolates the approved asphalt core. Use the
[development tools](development.md#tire-comparison-tools) for fixed-gain replay and the actual-mechanics
host probe. Do not infer an Android budget from host throughput, full-suite time or source operation
counts. Workflow/artifact evidence is not native-browser listening. Keep performance, timbre, spectrum,
transients and actual device execution as separate evidence.

### Decision gate

This release makes the selected candidate usable, not permanently adopted. Do not remove CURRENT or
CONTACT, change the default, normalize the engine or add corrective gains/detuning to conceal a failed
mix. If the core fails in gameplay, distinguish incorrect observations/mapping from timbre; reject the
hypothesis and move to method four/five rather than accumulating corrective oscillators. Prepared,
precomputed, procedural and hybrid tire successors remain eligible; the engine contract is unchanged.

Demand rho is not grip remaining; accepted slip work is not acoustic watts. Local tread pressure,
temperature and stiffness are not inferred. Preserve valid observation/lifecycle/physics/rendering
coverage and the immutable mechanics/render oracle. Model-specific waveform revisions need an explicit
listening/design decision; a genuinely different future method need not reproduce the old PCM.

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
