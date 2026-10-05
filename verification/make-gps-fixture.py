"""Add synthetic GPS to the existing abstract JPEG locally, for removal testing.
The GPS-bearing image is deliberately absent from the public source package.
"""
from pathlib import Path
import struct
root=Path(__file__).resolve().parent
# Little-endian TIFF: root GPS pointer -> N / 37 degrees, 0 minutes, 0 seconds.
tiff=b'II'+struct.pack('<HI',42,8)
tiff+=struct.pack('<H',1)+struct.pack('<HHII',34853,4,1,26)+struct.pack('<I',0)
tiff+=struct.pack('<H',2)+struct.pack('<HHI',1,2,2)+b'N\x00\x00\x00'
tiff+=struct.pack('<HHII',2,5,3,56)+struct.pack('<I',0)
tiff+=struct.pack('<IIIIII',37,1,0,1,0,1)
payload=b'Exif\x00\x00'+tiff
jpg=(root/'landscape.jpg').read_bytes()
(root/'gps-test.jpg').write_bytes(jpg[:2]+b'\xff\xe1'+struct.pack('>H',len(payload)+2)+payload+jpg[2:])
print('Synthetic local GPS fixture ready; do not publish this file.')
