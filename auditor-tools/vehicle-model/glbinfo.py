import sys, json, struct
p=sys.argv[1]
b=open(p,'rb').read()
magic,ver,length=struct.unpack('<4sII',b[:12])
off=12
chunks=[]
while off<length:
    clen,ctype=struct.unpack('<II',b[off:off+8])
    chunks.append((ctype,b[off+8:off+8+clen])); off+=8+clen
j=json.loads(chunks[0][1])
print('version',ver,'len',length,'chunks',[(hex(c[0]),len(c[1])) for c in chunks])
print('asset',j.get('asset'))
print('keys',{k:(len(v) if isinstance(v,list) else v) for k,v in j.items()})
print('scenes',j.get('scenes'))
for i,n in enumerate(j.get('nodes',[])):
    print('node',i,json.dumps(n,ensure_ascii=False))
for i,m in enumerate(j.get('materials',[])):
    print('mat',i,json.dumps(m,ensure_ascii=False))
acc=j.get('accessors',[])
for i,m in enumerate(j.get('meshes',[])):
    print('mesh',i,m.get('name'))
    for pr in m['primitives']:
        a=acc[pr['attributes']['POSITION']]
        idx=acc[pr['indices']]['count'] if 'indices' in pr else None
        print('   prim mat',pr.get('material'),'mode',pr.get('mode',4),'verts',a['count'],'idx',idx,'min',a.get('min'),'max',a.get('max'),'attrs',list(pr['attributes']))
print('images',j.get('images'),'textures',j.get('textures'))
print('extensions',j.get('extensionsUsed'),'animations',len(j.get('animations',[])))
