"""Print the lines of a dis68.py listing whose address lies in [low, high).

Usage: python3 -I listing_range.py <listing> <low> <high>     (addresses in hex)
"""
import sys


def main(path, low, high):
    with open(path) as f:
        for line in f:
            try:
                address = int(line[:6], 16)
            except ValueError:
                continue
            if address >= high:
                break
            if address >= low:
                sys.stdout.write(line)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3], 16))
