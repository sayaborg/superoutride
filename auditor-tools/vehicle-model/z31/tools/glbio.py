import json, struct, numpy as np
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(path):
    b=open(path,'rb').read()
    assert b[:4]==b'glTF'
    jl=struct.unpack('<I',b[12:16])[0]
    js=json.loads(b[20:20+jl])
    off=20+jl
    bl=struct.unpack('<I',b[off:off+4])[0]
    binb=bytearray(b[off+8:off+8+bl])
    return js,binb
def acc(js,binb,i):
    a=js['accessors'][i]; bv=js['bufferViews'][a['bufferView']]
    dt=np.dtype(CT[a['componentType']]); n=NC[a['type']]
    o=bv.get('byteOffset',0)+a.get('byteOffset',0)
    st=bv.get('byteStride',0)
    if st and st!=dt.itemsize*n:
        raw=np.frombuffer(binb,dtype=np.uint8,count=st*a['count'],offset=o).reshape(a['count'],st)[:,:dt.itemsize*n]
        return np.frombuffer(raw.tobytes(),dtype=dt).reshape(a['count'],n)
    return np.frombuffer(binb,dtype=dt,count=a['count']*n,offset=o).reshape(a['count'],n)
def save(path,js,binb):
    j=json.dumps(js,separators=(',',':')).encode()
    j+=b' '*((4-len(j)%4)%4)
    bb=bytes(binb)+b'\0'*((4-len(binb)%4)%4)
    with open(path,'wb') as f:
        f.write(b'glTF'+struct.pack('<II',2,12+8+len(j)+8+len(bb)))
        f.write(struct.pack('<I',len(j))+b'JSON'+j)
        f.write(struct.pack('<I',len(bb))+b'BIN\0'+bb)
