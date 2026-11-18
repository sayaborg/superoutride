import json, struct, numpy as np
def load(p):
    b=bytearray(open(p,'rb').read()); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(bytes(b[20:20+jl])); return b,j,jl
def acc_info(b,j,jl,i):
    a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]; o=20+jl+8+v.get('byteOffset',0)+a.get('byteOffset',0)
    n={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]; dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]
    return a,o,n,dt
def get(b,j,jl,i):
    a,o,n,dt=acc_info(b,j,jl,i); return np.frombuffer(bytes(b[o:o+a['count']*n*np.dtype(dt).itemsize]),dt).reshape(a['count'],n)
def put(b,j,jl,i,arr):
    a,o,n,dt=acc_info(b,j,jl,i); d=arr.astype(dt).tobytes(); b[o:o+len(d)]=d
def save(p,b,j,jl):
    js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4); binc=bytes(b[20+jl:])
    out=b'glTF'+struct.pack('<II',2,20+len(js)+len(binc))+struct.pack('<II',len(js),0x4E4F534A)+js+binc
    open(p,'wb').write(out); return out
