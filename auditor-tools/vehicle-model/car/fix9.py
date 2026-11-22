import sys; sys.path.insert(0,'tools')
import glbio, view, numpy as np, io, hashlib, os, scipy.sparse as sp
from scipy.sparse.linalg import splu
from PIL import Image
SRC='out/porsche-928-s4-1987-v8.glb'; OUT='out/porsche-928-s4-1987-v9.glb'; PAINT=(231,10,14)
js,binb,P,UV,I,img=view.mesh(SRC); prim=js['meshes'][0]['primitives'][0]
w=np.load('out/weld.npz'); inv=w['inv']; J=w['J']; n=inv.max()+1
X=np.load('out/porsche-928-s4-1987-v8.npy').copy(); assert np.allclose(X[inv],P,atol=1e-6)
def box(Q,m=0.0): return (np.abs(Q[...,0])<0.355+m)&(Q[...,1]>0.675-m)&(Q[...,1]<0.765+m)&(Q[...,2]<-2.0)
# 1) texture: the panel between the tail lamps becomes plain body paint
z=np.load('out/uvraster.npz'); tb=z['tb'].astype(np.int64); wb=z['wb'].astype(np.float64); cov=tb>=0
a=np.asarray(img(0).convert('RGB')).copy(); T=a.shape[0]
t=tb[cov]; ww=wb[cov]; pos=P[I[t,0]]*ww[:,0:1]+P[I[t,1]]*ww[:,1:2]+P[I[t,2]]*ww[:,2:3]
sel=np.zeros((T,T),bool); sel[cov]=box(pos)
changed=sel&~(a==np.array(PAINT,np.uint8)).all(-1); a[sel]=PAINT
# padding next to changed texels
from scipy import ndimage as ndi
idx=ndi.distance_transform_edt(~cov,return_distances=False,return_indices=True); a[~cov]=a[idx[0],idx[1]][~cov]
print('texels repainted',int(changed.sum()))
# 2) geometry: flatten the same panel (edges held)
free=box(X,0.005)
E_=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]]); A=sp.coo_matrix((np.ones(len(E_)*2),(np.concatenate([E_[:,0],E_[:,1]]),np.concatenate([E_[:,1],E_[:,0]]))),shape=(n,n)).tocsr(); A.data[:]=1.0
Lap=(sp.diags(np.asarray(A.sum(1)).ravel())-A).tocsr()/6.0
fi=np.nonzero(free)[0]; ci=np.nonzero(~free)[0]; R=Lap[fi]; Rf=R[:,fi].tocsc(); Rc=R[:,ci]
alpha=1e6; lu=splu((sp.identity(len(fi))+alpha*(Rf.T@Rf)).tocsc()); X0=X.copy()
for k in range(3): X[fi,k]=lu.solve(X0[fi,k]-alpha*(Rf.T@(Rc@X0[ci,k])))
d=np.linalg.norm(X-X0,axis=1)[free]*1000; print('flattened vertices',int(free.sum()),'moved mm pct50/90/max',np.percentile(d,[50,90,100]).round(2))
fn=np.cross(X[J[:,1]]-X[J[:,0]],X[J[:,2]]-X[J[:,0]]); N=np.zeros_like(X)
for i in range(3): np.add.at(N,J[:,i],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-20
Pn=X[inv].astype('<f4'); Nv=N[inv].astype('<f4')
for name,arr in (('POSITION',Pn),('NORMAL',Nv)):
    ac=js['accessors'][prim['attributes'][name]]; bv=js['bufferViews'][ac['bufferView']]; o=bv.get('byteOffset',0)+ac.get('byteOffset',0); binb[o:o+arr.nbytes]=arr.tobytes()
    if name=='POSITION': ac['min']=[float(v) for v in Pn.min(0)]; ac['max']=[float(v) for v in Pn.max(0)]
png=io.BytesIO(); Image.fromarray(a).save(png,'PNG'); png=png.getvalue()
bvs=js['bufferViews']; iv=js['images'][0]['bufferView']; new=bytearray()
for k,bv in enumerate(bvs):
    data=png if k==iv else bytes(binb[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])
    while len(new)%4: new.append(0)
    bv['byteOffset']=len(new); bv['byteLength']=len(data); new+=data
js['buffers'][0]['byteLength']=len(new); glbio.save(OUT,js,new); np.save(OUT.replace('.glb','.npy'),X)
print(OUT,round(os.path.getsize(OUT)/1e6,1),'MB',hashlib.sha256(open(OUT,'rb').read()).hexdigest())
