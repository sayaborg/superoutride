"""Disassemble a big-endian 68000 program image with capstone.

Usage: python3 -I dis68.py <image> <start> <end>        (addresses in hex)

Prints one line per instruction, "aaaaaa: bytes mnemonic operands"; a word capstone cannot decode is printed as
"dc.w" and skipped. The listing of an original's program is research output: it is never committed. An encrypted
program (FD1094, FD1089) disassembles as noise; this tool does not decrypt.
"""
import sys

import capstone


def main(path, start, end):
    with open(path, 'rb') as f:
        image = f.read()
    md = capstone.Cs(capstone.CS_ARCH_M68K, capstone.CS_MODE_BIG_ENDIAN | capstone.CS_MODE_M68K_000)
    a = start
    while a < end:
        for ins in md.disasm(image[a:end + 16], a):
            if ins.address >= end:
                break
            print('%06x: %-20s %s %s' % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
            a = ins.address + ins.size
        if a < end:
            print('%06x: %-20s dc.w' % (a, image[a:a + 2].hex()))
            a += 2


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3], 16))
