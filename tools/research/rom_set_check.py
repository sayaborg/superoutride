"""Check a ROM zip against a set's ROM list in a MAME driver source.

Usage: python3 -I rom_set_check.py <driver.cpp> <set> <zip> [<parent zip>]

<driver.cpp> is the MAME driver holding the set's ROM_START block (for example src/mame/sega/segaxbd.cpp), read as
text: only its ROM list and its GAME line are used. Every ROM the block lists (name, CRC-32) is looked for in the zip,
and in the parent's zip for a clone kept split. The report gives the set's parent from its GAME line, then the ROMs
missing (no entry with the CRC), extra (an entry of the set's own zip that no listed ROM has), renamed (the CRC found
under another name) and bad (data not matching the CRC its zip records), and NO_DUMP entries. A zip matches its set
exactly when all four counts are 0. Nothing is written.
"""
import re
import sys
import zipfile
import zlib

LOAD = re.compile(r'ROM_[A-Z0-9_]*\(\s*"([^"]+)"\s*,[^)]*?CRC\(([0-9a-fA-F]{8})\)', re.S)


def rom_list(source, name):
    block = re.search(r'ROM_START\(\s*%s\s*\)(.*?)ROM_END' % re.escape(name), source, re.S)
    if not block:
        sys.exit(f'{name}: no ROM_START block in the driver')
    roms = [(m.group(1), m.group(2).lower()) for m in LOAD.finditer(block.group(1))]
    no_dump = re.findall(r'ROM_[A-Z0-9_]*\(\s*"([^"\n]+)"[^\n]*NO_DUMP', block.group(1))
    return roms, no_dump


def game_line(source, name):
    pattern = r'GAMEL?\s*\(\s*\d+\s*,\s*%s\s*,\s*(\w+)\s*,[^\n]*?"([^"]*)"\s*,\s*"([^"]*)"' % re.escape(name)
    m = re.search(pattern, source)
    return (m.group(1), m.group(2), m.group(3)) if m else None


def entries(paths):
    found = {}
    for path in paths:
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                crc = zlib.crc32(z.read(info.filename)) & 0xFFFFFFFF
                found[info.filename] = ('%08x' % crc, crc == info.CRC)
    return found


def main(driver, name, zips):
    with open(driver, encoding='latin-1') as f:
        source = f.read()
    roms, no_dump = rom_list(source, name)
    game = game_line(source, name)
    if game:
        parent, maker, title = game
        print(f'{name}: "{title}" ({maker}), ' + ('parent set' if parent == '0' else f'clone of {parent}'))
    own = entries(zips[:1])
    have = entries(zips[1:])
    have.update(own)
    have_crcs = {crc for crc, _ in have.values()}
    listed_crcs = {crc for _, crc in roms}
    missing = [(n, c) for n, c in roms if c not in have_crcs]
    extra = [(n, c) for n, (c, _) in own.items() if c not in listed_crcs]
    renamed = [(n, c) for n, c in roms if n not in have and c in have_crcs]
    bad = [n for n, (_, ok) in have.items() if not ok]
    print(f'{name}: the driver lists {len(roms)} ROMs, the zip(s) hold {len(have)} entries; '
          f'missing {len(missing)}, extra {len(extra)}, renamed {len(renamed)}, bad {len(bad)}, no dump {len(no_dump)}')
    for label, rows in (('missing', missing), ('extra', extra), ('renamed', renamed)):
        for row in rows:
            print(f'  {label} {row[0]} {row[1]}')
    for n in bad:
        print(f'  bad {n}')
    for n in no_dump:
        print(f'  no dump {n}')
    return 0 if not (missing or extra or renamed or bad) else 1


if __name__ == '__main__':
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3:]))
