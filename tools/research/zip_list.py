"""List a ROM zip's entries: name, size, the CRC-32 the zip records and the CRC-32 of the data read back.

Usage: python3 -I zip_list.py <zip> [<zip> ...]

Prints each zip's size and SHA-256, then one line per entry sorted by name. An entry whose data does not match the
CRC-32 its zip records is marked BAD. Nothing is written.
"""
import hashlib
import os
import sys
import zipfile
import zlib


def main(paths):
    for path in paths:
        with open(path, 'rb') as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        print(f'== {os.path.basename(path)}  {os.path.getsize(path)} bytes  sha256 {digest}')
        with zipfile.ZipFile(path) as z:
            for info in sorted(z.infolist(), key=lambda i: i.filename):
                crc = zlib.crc32(z.read(info.filename)) & 0xFFFFFFFF
                mark = '' if crc == info.CRC else '  BAD'
                print(f'   {info.filename:24s} {info.file_size:8d}  crc {info.CRC:08x}{mark}')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        sys.exit(__doc__)
    main(sys.argv[1:])
