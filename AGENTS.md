# SUPER OUTRIDE — Development contract

Before changing code, read this contract, [README](README.md) and the [documentation index](docs/README.md), including its current restart checkpoint and relevant topic specifications. Then inspect the responsible source, types, compilers and tests. Current repository evidence is the continuing project memory.

## Authority and priorities

All repository documentation must be written and maintained in English. Architectural elegance, simplicity, consistency and the absence of ad hoc implementations are the highest design priorities.

The documentation index assigns one owner to each specification. Topic documents own technical invariants; this file owns development priorities and work/release procedure.

Optimize for architectural simplicity, one authority per concept, mathematical consistency, simple period-plausible computation, then convenience. Prefer authored/compiled ordinary data and upper-level composition over lower-layer special cases. Do not patch visible symptoms with hidden force, velocity, coordinate or progress corrections.

Before any nontrivial change, answer from repository evidence:

1. Which layer owns the decision?
2. Can an existing primitive express it?
3. Does it duplicate state, coordinates or authority?
4. Does it add a product/mode/vehicle/route/stage branch to a general engine layer?
5. Can authoring, compilation or composition express it more simply?
6. Which frozen invariants apply, and are they preserved?
7. Which causal regression or architecture check proves the behavior and boundary?

An explicit design revision is required to change an invariant. A feature request alone does not authorize silently weakening one. Update the responsible topic document and executable contract together. Historical test names do not establish current authority; preserve their still-valid causal coverage.

## Work and release

Never implement directly on main. Inspect/fetch exact main and active PR/CI before changing code. Preserve unrelated local changes; use a feature branch (`codex/` prefix) from the inspected main SHA. Inspect the final diff for unrelated edits.

Use the validation commands in [development](docs/development.md) for every implementation milestone and release candidate. Bug fixes need a regression of the causal failure. Do not weaken a valid test to pass a redesign; document supersession before replacing an obsolete requirement. Retain reproducible diagnostics rather than copied historical results.

Open a PR targeting main. Obtain complete green CI on the exact feature head, including documentation and validation changes. Re-fetch main. Release only when ahead > 0, behind = 0 and merge base is current main. Move main to the validated SHA with `force=false`; never manufacture an extra merge commit. Verify main SHA = PR head SHA = PR merge SHA, then verify main-push CI and Pages on that SHA. Rebase/revalidate if main moved. Never force main or release an unvalidated SHA.

CI workflow checkout and artifacts are release evidence. The working tree keeps current specifications and the current restart checkpoint, not an accumulating release archive. A documentation-only follow-up is still a new SHA and needs CI before release. Do not embed a commit's own SHA in its source as a supposed exact-head record.

When investigating a browser problem, distinguish source, build artifact, deployment and browser display/cache evidence. Preserve complete commit-versioned ESM builds. Do not claim a public deployment was inspected unless its workflow, artifact or endpoint was actually checked.

## Restart

Use the current checkpoint linked from the documentation index, current Git/PR/CI state and current specifications. Do not repeat old migration ceremonies or require previous chat attachments. Keep one current checkpoint. Past design/release records are retrievable from Git; do not reconstruct a history directory.
