"""Assemble a 68000 program image from a ROM zip's even-byte and odd-byte ROMs.

Usage: python3 -I interleave.py <zip> <out.bin> <even>:<odd> [<even>:<odd> ...]

Each pair names the zip's even-byte ROM and odd-byte ROM of one half (MAME's ROM_LOAD16_BYTE at an even and an odd
offset); the halves follow each other in the order given. The image is written to <out.bin>, which must lie outside the
repository or under its reference-media/ (an image of an original's program is never committed); any other place in
the repository is refused. The program is read as stored: an encrypted program stays encrypted.
"""
import pathlib
import sys
import zipfile


def repository():
    """The checkout holding this script (the nearest folder with .git above it), or None."""
    return next((d for d in pathlib.Path(__file__).resolve().parents if (d / '.git').exists()), None)


def interleave(z, pairs):
    out = bytearray()
    for even, odd in pairs:
        e, o = z.read(even), z.read(odd)
        if len(e) != len(o):
            sys.exit(f'{even} and {odd} differ in size')
        half = bytearray(len(e) * 2)
        half[0::2] = e
        half[1::2] = o
        out += half
    return bytes(out)


if __name__ == '__main__':
    if len(sys.argv) < 4 or sys.argv[1] in ('-h', '--help'):
        sys.exit(__doc__)
    out = pathlib.Path(sys.argv[2]).resolve()
    repo = repository()
    if repo and out.is_relative_to(repo) and not out.is_relative_to(repo / 'reference-media'):
        sys.exit(f'{out} lies in the repository outside reference-media/: write the image elsewhere')
    pairs = [tuple(p.split(':', 1)) for p in sys.argv[3:]]
    with zipfile.ZipFile(sys.argv[1]) as z:
        image = interleave(z, pairs)
    with open(out, 'wb') as f:
        f.write(image)
    print(f'{len(image)} bytes')
