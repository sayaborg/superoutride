# SUPER OUTRIDE — Development contract

Before changing code, read this contract, [README](README.md), the [documentation index](docs/README.md),
[NEXT](docs/NEXT.md) and the relevant topic specifications. Inspect current main, active PRs and CI,
then the responsible source, types, compilers and checks. The repository is the continuing project memory.

## Authority and design

All repository documentation is written in English. Architectural elegance, simplicity and consistency
are the highest design priorities. The documentation index assigns one owner to each specification;
this file owns development conventions and release procedure. NEXT owns the ordered work.
Remove completed PR descriptions and completed stage sections from NEXT; keep their rationale and evidence in PRs.

- Give each decision one owning layer and each concept one authority; avoid duplicate state or coordinates.
- Keep product, mode, vehicle and course branches out of general engine layers.
- Prefer existing primitives, authored/compiled data and upper-level composition over lower-layer exceptions.
- Express behavior through its responsible model rather than hidden force, velocity, coordinate or progress corrections.

## Construction and documentation

- `compileX` transforms authored data into a validated immutable product; `createX` assembles a live instance,
  session or adapter from products. Constructors establish local value/reader invariants.
- Validate untrusted input and cross-object consistency once at admission/compilation boundaries. Reuse domain
  helpers and let trusted consumers use admitted references. Changing observations and numerical-solver guards
  retain their own checks.
- Use `TypeError` for wrong shape/type, `RangeError` for values outside a declared domain, structured diagnostics
  for expected authored-content errors, and `Error` for internal invariant failures. Preserve I/O causes.
- Immutable publication includes nested ownership: exposing a mutable Map, array or buffer requires an explicit
  read-only boundary even when its containing object is frozen.
- State each positive contract and its scope once in its owning document, including essential failure conditions.
  Update that contract with its implementation; keep audit reasoning and results in the PR.

## Checks

The standing checks are:

1. Type checking, lint, formatting and build.
2. Startup smoke: compile a course and render a few frames through the shared scene.
3. Acyclic layer dependencies, including type-only imports.

Add other tests only when a concrete need arises. Test observable behavior and compiled relationships rather
than source spelling; use parsed dependencies for architecture checks. Assess performance on real devices.
AI reference driving generates game time limits, not test timing baselines.

## Work and release

- Give each PR one purpose. Keep moves/renames, deletions and logic changes in separate PRs.
- Keep logic changes small enough to read in one review. If they would exceed that scope, split the work
  and report the split instead of broadening the PR.
- Keep the game playable after every PR. If old and new implementations temporarily coexist, remove
  the old implementation in the final PR of the same stage and name that cleanup in NEXT.

- Before fast-forwarding main, remove temporary diagnostic, formatting and other work-only commits from the feature branch; feature-branch history may be rewritten, but main history must not be rewritten.

Inspect main and active PR/CI state, preserve unrelated local changes, and work on a `codex/` feature branch.
Review the diff and run Node 24 `npm test`. Open a PR and obtain green CI on its exact head. Recheck main;
if it moved, update the branch and validate again. Fast-forward main to the validated head without a merge
commit or force push. Verify Pages, then delete the merged feature branch. Leave unrelated or unmerged work intact.

## Restart

Use the documentation index, NEXT and current Git/PR/CI state. Keep one current checkpoint; Git retains history.
