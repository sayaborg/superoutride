# M8.3 Three-Mode Course Debug Composition

Status: current browser course-debug composition authority above unchanged Core, renderer, route,
topology, vehicle and M8.2 camera authority.

## 1. Scope and architecture decision gate

The browser exposes the three existing product route forms without distributing a mode flag through
the engine:

```text
1 -> LINEAR
2 -> BRANCHING
3 -> CIRCUIT
```

One browser boot module owns key/URL/entry selection. It imports exactly one top-level composition;
that composition supplies ordinary open runtime objects to unchanged physics, camera and renderer
consumers. No lower layer asks which product mode is active.

The URL forms are:

```text
?mode=linear
?mode=branching
?mode=circuit
```

Missing or unknown mode remains backward-compatible with BRANCHING.

## 2. LINEAR debug course

LINEAR uses one finite ordinary open 8 km four-lane highway:

```text
0 <= s <= 8000 m
```

It has no branch gate, endpoint connection, modulo, winding or lap authority. The straight plan
geometry isolates longitudinal, lateral, pitch, camera and input debugging while the authored
height profile still exercises hills, dips, nose dive and crest behavior.

## 3. BRANCHING debug ownership

The previous browser composition spawned one DEV rival 50 m ahead of the player. Under the current
frozen product rule:

```text
FIRST_PHYSICAL_CROSSING_LOCKS
```

that rival usually crossed first and locked one sibling route for the field. A player entering the
other child then correctly triggered `RECOVER_TO_LOCKED_BRANCH`; with continued opposite steering,
this looked like a stop at the branch/content switch.

The actual M7.2 LEFT and RIGHT transactions were separately reproduced through:

```text
world physics
-> physical route gate
-> PENDING
-> physical handoff seam
-> COMMIT child chart/content
-> continued child physics and rendering
```

Both retain speed and render after COMMIT. The handoff mechanism is therefore not weakened or
patched.

For course debugging, the BRANCHING top-level composition now authors zero rivals. The route rule
remains `FIRST_PHYSICAL_CROSSING_LOCKS`; the player's own physical crossing simply becomes the first
crossing, so either child can be debugged without an earlier DEV actor forcing recovery. The
historical one-rival M6.43 fixture remains available as historical regression authoring.

## 4. CIRCUIT debug course

CIRCUIT continues to use explicit closed-lap authoring unfolded into a finite open runtime window.
The 1/2/3 selector changes only which top-level composition is loaded. It adds no circuit branch to
Core, physics, camera or renderer.

## 5. Regression contract

Executable coverage proves:

- one mapping authority owns `Digit1`/`Digit2`/`Digit3`, numpad equivalents, URL modes and entries;
- LINEAR is exactly one finite 8 km open Guide and renders through the ordinary M5 path;
- current M7.2 LEFT and RIGHT physical forks both COMMIT and continue above 8 m/s;
- BRANCHING course debug has zero rivals while preserving physical first-crossing lock semantics;
- the single commit-versioned boot path loads all three entries;
- only the three explicit composition roots may assemble DEV fixtures.
