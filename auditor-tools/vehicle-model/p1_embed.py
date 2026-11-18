import sys,json,struct,hashlib
sys.path.insert(0,'/home/claude/work/scripts'); import glbio
O='/home/claude/work/out/'; tex,dst=sys.argv[1:3]
b_,j,jl=glbio.load(O+'n2_fit.glb'); bin0=20+jl+8; png=open(tex,'rb').read(); tgt=j['images'][0]['bufferView']; out=bytearray()
for k in sorted(range(len(j['bufferViews'])),key=lambda k:j['bufferViews'][k].get('byteOffset',0)):
    v=j['bufferViews'][k]; data=png if k==tgt else bytes(b_[bin0+v.get('byteOffset',0):bin0+v.get('byteOffset',0)+v['byteLength']])
    while len(out)%4: out.append(0)
    v['byteOffset']=len(out); v['byteLength']=len(data); out+=data
while len(out)%4: out.append(0)
j['images'][0]['mimeType']='image/png'; j['images'][0]['name']='basecolor_flat_symmetric.png'; j['buffers'][0]['byteLength']=len(out)
ex=j['nodes'][0]['extras']; j['nodes'][0]['name']='Honda_NSR500_1984'
for k in ('wheel_F','wheel_R'): ex[k]['center']=[float(c) for c in ex[k]['center']]
ex['paint']={'red':[215,5,17],'blue':[32,46,131],'white':[235,235,233],'black':[17,17,17],'brake':[255,0,255]}
ex['exhaust_outlets']=json.load(open(O+'p1_exhaust.json')); ex['note']+='; paint flattened to solid colours, mirrored left to right (left is the master), rider lines redrawn, knee sliders black, tail marks removed, stripe between red and blue is white paint, exhaust outlets painted as bright ring and black hole'
js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
o=b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out)
open(dst,'wb').write(o); print(len(o),hashlib.sha256(o).hexdigest())
