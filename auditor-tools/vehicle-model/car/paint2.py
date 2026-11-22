import sys, os; sys.path.insert(0,'tools')
import glbio, view, rast, numpy as np, io, hashlib, scipy.sparse as sp
from PIL import Image
from scipy import ndimage as ndi
SRC='out/porsche-928-s4-1987-v1.glb'; OUT='out/porsche-928-s4-1987-v2.glb'
PAINT=(231,10,14); GLASS=(10,10,12)
ITER=int(sys.argv[1]) if len(sys.argv)>1 else 40
KEEPMIN=int(sys.argv[2]) if len(sys.argv)>2 else 40
js,binb,P,UV,I,img=view.mesh(SRC)
T=4096
a=np.asarray(img(0).convert('RGB')).astype(np.int32)
# ---- texel -> owning face (cached)
if os.path.exists('out/uvraster.npz'):
    z=np.load('out/uvraster.npz'); tb=z['tb'].astype(np.int64); wb=z['wb'].astype(np.float32)
else:
    Puv=np.stack([UV[:,0]*T,T-UV[:,1]*T,np.zeros(len(UV))],1)
    tb,wb,_,_,_=rast.raster(Puv,I,((1,0,0),(0,1,0),(0,0,1)),W=T+20,bounds=(0,T,0,T))
    tb=tb[10:10+T,10:10+T]; wb=wb[10:10+T,10:10+T]
    np.savez('out/uvraster.npz',tb=tb.astype(np.int32),wb=wb.astype(np.float16))
cov=tb>=0
w=np.load('out/weld.npz'); inv=w['inv']; J=w['J']; n=inv.max()+1
glass_v=np.load('out/masks.npz')['glass']
gface=glass_v[J[:,0]]&glass_v[J[:,1]]&glass_v[J[:,2]]
# ---- raw classes: 0 keep, 1 paint, 2 dark, 3 window
r,g,b=a[...,0],a[...,1],a[...,2]; lum=(r+g+b)/3
mx=a.max(-1); mn=a.min(-1); chroma=(mx-mn)/np.maximum(mx,1)
pink=(lum>40)&(r>=g)&(r>=b)&(b>=g*0.9)&(chroma>=0.08)&(chroma<=0.45)
keep=~pink&(((chroma>0.5)&(lum>40))|((chroma<0.07)&(lum>140)))
keep&=cov
# texel positions on the car (for the tyre cylinders and the low parts)
tt=tb[cov]; wt=wb[cov].astype(np.float64)
pos=np.zeros((T,T,3),np.float32)
pos[cov]=(P[I[tt,0]]*wt[:,0:1]+P[I[tt,1]]*wt[:,1:2]+P[I[tt,2]]*wt[:,2:3]).astype(np.float32)
ex=js['nodes'][0]['extras']; tyre=np.zeros((T,T),bool)
for k in ('wheel_FL','wheel_FR','wheel_RL','wheel_RR'):
    c=np.array(ex[k]['center']); R=ex[k]['radius']; Wd=ex[k]['width']
    tyre|=cov&(np.abs(pos[...,0]-c[0])<=Wd/2+0.015)&(np.hypot(pos[...,1]-c[1],pos[...,2]-c[2])<=R+0.01)
lowdark=cov&(pos[...,1]<0.25)&(lum<55)
print('pink removed in tyres',int((pink&tyre).sum()),'low & dark',int((pink&lowdark&~tyre).sum()))
pink&=~tyre&~lowdark
lab_,nk=ndi.label(keep,structure=np.ones((3,3)))
szk=np.bincount(lab_.ravel(),minlength=nk+1); szk[0]=0
small=szk[lab_]<KEEPMIN; keep&=~small
print('keep clusters',nk,'absorbed small keep texels',int(small[lab_>0].sum()))
cls=np.full((T,T),2,np.uint8); cls[pink]=1; cls[keep]=0; cls[~cov]=0
win=np.zeros((T,T),bool); win[cov]=gface[tb[cov]]
cls[win&(cls==2)]=3
# ---- texel counts per face -> welded vertices, then smooth on the surface (normalised shares)
t=tb[cov]; c=cls[cov]; F=len(J)
cnt={k:np.bincount(t,weights=(c==k),minlength=F) for k in (1,2,3)}
Nv={k:np.zeros(n) for k in (1,2,3)}
for k in (1,2,3):
    for j in range(3): np.add.at(Nv[k],J[:,j],cnt[k])
E=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]])
A=sp.coo_matrix((np.ones(len(E)*2),(np.concatenate([E[:,0],E[:,1]]),np.concatenate([E[:,1],E[:,0]]))),shape=(n,n)).tocsr(); A.data[:]=1.0
M=sp.diags(1/np.asarray(A.sum(1)).ravel())@A
for _ in range(ITER):
    for k in (1,2,3): Nv[k]=0.5*Nv[k]+0.5*(M@Nv[k])
tot=Nv[1]+Nv[2]+Nv[3]+1e-12
Jt=J[t]; ww=wb[cov].astype(np.float64)
def at(f): return f[Jt[:,0]]*ww[:,0]+f[Jt[:,1]]*ww[:,1]+f[Jt[:,2]]*ww[:,2]
fp=at(Nv[1]/tot); fw=at(Nv[3]/tot); fd=at(Nv[2]/tot)
newc=c.copy(); sel=c>=1
newc[sel]=np.where(fp[sel]>0.5,1,np.where(fw[sel]>=fd[sel],3,2))
final=np.zeros((T,T),np.uint8); final[cov]=newc
# ---- colours
out=a.copy()
darkmed=np.median(a[(final==2)&(cls==2)],axis=0).astype(np.int32)
out[final==1]=PAINT; out[final==3]=GLASS
flip=(final==2)&(cls!=2); out[flip]=darkmed
idx=ndi.distance_transform_edt(~cov,return_distances=False,return_indices=True)
out[~cov]=out[idx[0],idx[1]][~cov]
print('iter',ITER,'| paint %.3f dark %.3f window %.3f other %.3f'%tuple((final==k).mean() for k in (1,2,3,0)),
      '| to dark',int(flip.sum()),'to paint',int(((final==1)&(cls!=1)).sum()),'to window',int(((final==3)&(cls!=3)).sum()),'window->dark/paint',int(((cls==3)&(final!=3)).sum()),'| dark median',darkmed)
np.save('out/class_v2.npy',final)
# ---- write
png=io.BytesIO(); Image.fromarray(out.astype(np.uint8)).save(png,'PNG'); png=png.getvalue()
bvs=js['bufferViews']; iv=js['images'][0]['bufferView']; new=bytearray()
for k,bv in enumerate(bvs):
    data=png if k==iv else bytes(binb[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])
    while len(new)%4: new.append(0)
    bv['byteOffset']=len(new); bv['byteLength']=len(data); new+=data
js['images'][0]['mimeType']='image/png'; js['images'][0]['name']='porsche-928-s4-1987_basecolor.png'
js['buffers'][0]['byteLength']=len(new)
js['nodes'][0]['extras']['paint']={'body':list(PAINT),'window':list(GLASS),'brakeLamp':[255,0,255]}
glbio.save(OUT,js,new)
print(OUT, os.path.getsize(OUT)/1e6,'MB', hashlib.sha256(open(OUT,'rb').read()).hexdigest())
