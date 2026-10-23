"""Callers of the routine holding an address, from a dis68.py listing (static, direct branches only).

Usage: python3 -I callers.py <listing> <address> [<depth>]      (address in hex, depth default 3)

A routine starts at every target of a bsr or jsr; an address belongs to the nearest routine start at or below it.
Prints the routine holding the address and the branches (bsr, jsr, bra, jmp with an absolute target) that reach it,
then their callers in turn, to <depth> levels. Jump tables and computed branches are not followed.
"""
import bisect
import collections
import re
import sys

BRANCH = re.compile(r'^([0-9a-f]{6}):\s+\S+\s+(bsr\.[bws]|jsr|bra\.[bws]|jmp)\s+\$([0-9a-f]+)(?:\.[lw])?\s*$', re.I)


def load(path):
    targets = collections.defaultdict(set)
    starts = set()
    with open(path) as f:
        for line in f:
            m = BRANCH.match(line)
            if not m:
                continue
            source, op, target = int(m.group(1), 16), m.group(2).lower(), int(m.group(3), 16)
            targets[target].add((source, op))
            if op.startswith('bsr') or op == 'jsr':
                starts.add(target)
    return targets, sorted(starts)


def main(path, address, depth):
    targets, starts = load(path)

    def routine_of(a):
        i = bisect.bisect_right(starts, a) - 1
        return starts[i] if i >= 0 else None

    def walk(a, level, seen):
        start = routine_of(a)
        if start is None or start in seen or level > depth:
            return
        seen.add(start)
        calls = sorted(targets.get(start, ()))
        print('  ' * level + f'{a:06x} in {start:06x} <- ' + ', '.join(f'{s:06x} ({op})' for s, op in calls[:8]))
        for s, _ in calls[:8]:
            walk(s, level + 1, seen)

    walk(address, 0, set())


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3]) if len(sys.argv) == 4 else 3)
