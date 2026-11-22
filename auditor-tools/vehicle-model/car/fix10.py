import numpy as np,sys,io,json,hashlib;sys.path.insert(0,'tools');import glbio
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from PIL import Image
B=np.load('painted/B.npy').copy();X=np.load('painted/texpos.npy');cov=~np.isnan(X[...,0])
PAINT=(231,10,14);MAG=(255,0,255);WIN=(10,10,12);BLK=(17,17,17);WHT=(227,221,221)
B[(B==(215,5,17)).all(2)]=PAINT
def cls(T):
    c=np.zeros(T.shape[:-1],np.uint8)
    for k,v in enumerate([PAINT,MAG,BLK,WIN,WHT],1):c[(T==v).all(-1)]=k
    return c
ys,xs=np.nonzero(cov);Pc=X[cov].astype(float);C=B[cov].copy();cc=cls(C)
VOX=0.004;lo=Pc.min(0)-2*VOX;ijk=np.floor((Pc-lo)/VOX).astype(int);shp=tuple(ijk.max(0)+3)
tree=cKDTree(Pc);log=[]
def comps(m):
    occ=np.zeros(shp,bool);occ[tuple(ijk[m].T)]=True;lab,n=ndi.label(occ,np.ones((3,3,3)));l=np.zeros(len(Pc),int);l[m]=lab[tuple(ijk[m].T)];return l,np.bincount(l,minlength=n+1)
def absorb(idx,why,need=0.0,allow_other=True):
    nb=np.unique(np.concatenate(tree.query_ball_point(Pc[idx[::max(1,len(idx)//400)]],0.006)));nb=np.setdiff1d(nb,idx)
    if len(nb)==0:return
    k=np.bincount(cc[nb],minlength=6);k[2]*=1  # majority class
    kk=int(k.argmax())
    if kk in(0,3) and not allow_other:return
    if k[kk]<need*len(nb):return
    src=nb[cc[nb]==kk];d,i=cKDTree(Pc[src]).query(Pc[idx]);C[idx]=C[src[i]];log.append((why,len(idx),Pc[idx].mean(0).round(3).tolist(),kk))
# 1 islands of flat colours
for k,lim in [(1,200),(2,200),(4,200),(5,100)]:
    l,sz=comps(cc==k)
    for r in np.nonzero((sz>0)&(sz<lim))[0]:
        if r:absorb(np.nonzero(l==r)[0],f'island of class {k}')
cc=cls(C)
# 2 specks and lens leftovers inside flat colours
l,sz=comps((cc==0)|(cc==3))
for r in np.nonzero(sz>0)[0]:
    if not r:continue
    idx=np.nonzero(l==r)[0];q=Pc[idx].mean(0);col=C[idx].mean(0)
    lens=sz[r]<600 and q[2]<-1.95 and 0.6<q[1]<0.8 and col[0]>100 and col[1]<90
    if sz[r]<60:absorb(idx,'speck',need=0.7,allow_other=False)
    elif lens:absorb(idx,'lens leftover',need=0.5,allow_other=False)
B[ys,xs]=C
# padding: uncovered texels take the nearest covered texel within 8 px
d,ind=ndi.distance_transform_edt(~cov,return_indices=True);pad=(~cov)&(d<=8);B[pad]=B[ind[0][pad],ind[1][pad]]
for e in log:print(e)
np.save('painted/B10.npy',B);print('texels changed vs K',int((B!=np.load('painted/B.npy')).any(2).sum()))
# write GLB from v9 with the new image
js,b=glbio.load('out/porsche-928-s4-1987-v9.glb');jp,bp=glbio.load('painted/in.glb')
for a in range(4):assert np.array_equal(glbio.acc(js,b,a),glbio.acc(jp,bp,a)),a
bio=io.BytesIO();Image.fromarray(B).save(bio,'PNG',optimize=False);png=bio.getvalue()
im=js['images'][js['textures'][js['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];tv=im['bufferView'];out=bytearray()
for i in sorted(range(len(js['bufferViews'])),key=lambda i:js['bufferViews'][i].get('byteOffset',0)):
    v=js['bufferViews'][i];o=v.get('byteOffset',0);data=png if i==tv else bytes(b[o:o+v['byteLength']])
    while len(out)%4:out.append(0)
    v['byteOffset']=len(out);v['byteLength']=len(data);out+=data
js['buffers'][0]['byteLength']=len(out)+(-len(out))%4;im['mimeType']='image/png'
glbio.save('out/porsche-928-s4-1987-v10.glb',js,out);print(hashlib.sha256(open('out/porsche-928-s4-1987-v10.glb','rb').read()).hexdigest())
