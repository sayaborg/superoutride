"""Find printable ASCII runs in a program image (stage names, debug labels, messages).

Usage: python3 -I rom_strings.py <image> [<min length>] [<regex>]

<image> is a program image (interleave.py). Prints the address and text of every run of at least <min length>
(default 5) printable characters, or only the runs matching <regex> (case-insensitive) when one is given. The output
is research output: it is never committed.
"""
import re
import sys


def main(path, minimum, pattern):
    with open(path, 'rb') as f:
        image = f.read()
    run = re.compile(rb'[ -~]{%d,}' % minimum)
    wanted = re.compile(pattern, re.I) if pattern else None
    for m in run.finditer(image):
        text = m.group().decode('ascii')
        if wanted is None or wanted.search(text):
            print(f'{m.start():06x} {text}')


if __name__ == '__main__':
    if len(sys.argv) not in (2, 3, 4) or sys.argv[1] in ('-h', '--help'):
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) >= 3 else 5, sys.argv[3] if len(sys.argv) == 4 else None)
