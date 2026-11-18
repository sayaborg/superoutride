import sys, io, json, struct, hashlib, numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import glbio
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from PIL import Image
src,lab,dst=sys.argv[1:4]
pm=np.load('/home/claude/work/out/posmap.npz'); pos=pm['pos'].astype(np.float64); cov=pm['cov']; L=np.load(lab)
VOX=0.003; sel=cov&(L>0); P=pos[sel]; lb=L[sel]; lo=P.min(0)-2*VOX; ijk=np.floor((P-lo)/VOX).astype(int); shp=tuple(ijk.max(0)+3)
rid=np.zeros(len(P),np.int64); nxt=1
for k in range(1,6):
    m=lb==k
    if not m.any(): continue
    occ=np.zeros(shp,bool); occ[tuple(ijk[m].T)]=True; cl,n=ndi.label(occ,np.ones((3,3,3))); rid[m]=cl[tuple(ijk[m].T)]+nxt-1; nxt+=n
nreg=nxt-1; print('regions',nreg); assert nreg<65535
sz=np.bincount(rid,minlength=nreg+1); print('largest',np.sort(sz)[-8:],'regions under 50 texels',int((sz[1:]<50).sum()))
# mirror table
sub=np.arange(0,len(P),3); tree=cKDTree(P[sub]); mirror=list(range(nreg+1)); rng=np.random.default_rng(0); order=np.argsort(rid,kind='stable'); starts=np.searchsorted(rid[order],np.arange(nreg+2))
for r in range(1,nreg+1):
    idx=order[starts[r]:starts[r+1]]
    if len(idx)>1500: idx=rng.choice(idx,1500,replace=False)
    q=P[idx]*np.array([-1,1,1]); d,i=tree.query(q); ok=d<0.006
    if ok.sum()>len(idx)*0.3:
        rr=rid[sub[i[ok]]]; same=lb[sub[i[ok]]]==lb[idx[0]]; rr=rr[same]
        if len(rr): mirror[r]=int(np.bincount(rr).argmax())
print('regions with a different mirror region',sum(1 for r in range(1,nreg+1) if mirror[r]!=r))
img=np.zeros(L.shape+(3,),np.uint8); R=np.zeros(L.shape,np.int64); R[sel]=rid; img[...,0]=R&255; img[...,1]=R>>8; img[...,2]=np.where(cov,255,0)
bio=io.BytesIO(); Image.fromarray(img).save(bio,'PNG',optimize=False); png=bio.getvalue(); print('region png bytes',len(png))
b,j,jl=glbio.load(src); bin0=20+jl+8; out=bytearray()
for i in sorted(range(len(j['bufferViews'])),key=lambda i:j['bufferViews'][i].get('byteOffset',0)):
    v=j['bufferViews'][i]; data=bytes(b[bin0+v.get('byteOffset',0):bin0+v.get('byteOffset',0)+v['byteLength']])
    while len(out)%4: out.append(0)
    v['byteOffset']=len(out); out+=data
while len(out)%4: out.append(0)
j['bufferViews'].append({'buffer':0,'byteOffset':len(out),'byteLength':len(png)}); out+=png
while len(out)%4: out.append(0)
j['images'].append({'name':'paint_regions','mimeType':'image/png','bufferView':len(j['bufferViews'])-1}); j['buffers'][0]['byteLength']=len(out)
j['nodes'][0]['extras']['paint_regions']={'image':len(j['images'])-1,'encoding':'id = R + 256*G, B = 255 where the texel is on the surface','mirror':mirror}
js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
o=b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out)
open(dst,'wb').write(o); print(len(o),hashlib.sha256(o).hexdigest())
