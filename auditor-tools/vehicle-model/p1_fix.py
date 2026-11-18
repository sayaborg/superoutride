import sys,io,json,struct,hashlib,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend,glbio
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from PIL import Image
O='/home/claude/work/out/'; G='/home/claude/work/in2/p1.glb'; B=rend.base_tex(G,0); RM=rend.base_tex(G,1).astype(np.float32)
pm=np.load(O+'posmap.npz'); cov=pm['cov']; pos=pm['pos'].astype(np.float64); nor=pm['nor'].astype(np.float64); x,y,z=pos[...,0],pos[...,1],pos[...,2]
L=np.load(O+'p1_L0.npy'); exact=np.load(O+'p1_exact.npy')
VOX=float(sys.argv[1])/1000; SIG=float(sys.argv[2]); ISL=float(sys.argv[3]); TAG=sys.argv[4]
def msm(a,s):
    w=ndi.gaussian_filter(cov.astype(np.float32),s); return ndi.gaussian_filter(np.where(cov,a,0).astype(np.float32),s)/np.maximum(w,1e-6)
metalish=(msm(RM[...,2],5)>=32)|(msm(RM[...,1],3)>=62)
# A1 swingarm is bare metal, not white paint
sw=(L==3)&(exact==0)&(z<-0.27)&(y>0.25)&(y<0.56); L[sw]=0; print('swingarm texels released',int(sw.sum()))
# A2 dark marks on the tail cowl -> the paint round them
mxc=B.max(2); cand=cov&(L==0)&(mxc<100)&(z<-0.42)&(y>0.72)
P=pos[cov&(z<-0.40)&(y>0.70)]; lab=L[cov&(z<-0.40)&(y>0.70)]; cd=cand[cov&(z<-0.40)&(y>0.70)]
lo=P.min(0)-0.01; ijk=np.floor((P-lo)/0.003).astype(int); shp=tuple(ijk.max(0)+3); occ=np.zeros(shp,bool); occ[tuple(ijk[cd].T)]=True
cl,n=ndi.label(occ,np.ones((3,3,3))); sz=np.bincount(cl.ravel()); cid=cl[tuple(ijk.T)]
paintvox=np.zeros(shp,np.uint8); pv=np.isin(lab,(1,2,3)); paintvox[tuple(ijk[pv].T)]=lab[pv]
newl=lab.copy(); erased=0
for c in range(1,n+1):
    if sz[c]>350: continue                      # ~30 cm2: seat pad, exhaust openings stay
    m=cl==c; ring=ndi.binary_dilation(m,np.ones((3,3,3)),iterations=2)&~m; nb=paintvox[ring]; emp_or=(occ[ring]).sum()
    if (nb>0).sum()<8: continue
    k=np.bincount(nb[nb>0]).argmax()
    if (nb==k).sum()>0.6*max((nb>0).sum(),1) and k==1:
        t=cd&(cid==c); newl[t]=k; erased+=int(t.sum())
tmp=L[cov&(z<-0.40)&(y>0.70)]; tmp[:]=newl; L[cov&(z<-0.40)&(y>0.70)]=tmp; print('tail mark texels painted red',erased)
bx=cov&(L==0)&(z>-0.73)&(z<-0.59)&(y>0.87)&(y<0.99)&(np.abs(x)>0.05); L[bx]=1; print('tail slots painted red',int(bx.sum()))
Bf=B.astype(np.float32); bmx=Bf.max(2); bsat=(bmx-Bf.min(2))/np.maximum(bmx,1)
near=cov&(x>0.15)&(np.hypot(y-0.74,z+0.066)<0.085)&(exact==0)
beige=near&(bsat>0.04)&(bsat<0.35)&(Bf[...,0]>Bf[...,2]+8)&(bmx>120)&(bmx<235)
c=np.median(pos[beige],0); print('knee slider centre',c.round(3),'beige texels',int(beige.sum()))
dk=np.linalg.norm(pos-c,axis=2); pad=cov&(x>0.15)&(exact==0)&(dk<0.075)&(beige|(bmx<80)|((L==3)&(dk<0.045)))
L[pad]=5; print('knee slider texels painted black',int(pad.sum()))
L1=L.copy()
# B mirror left (+X, master) -> right
ms=cov&(x>0); sl=cov&(x<-0.002); tree=cKDTree(pos[ms]); q=pos[sl]*np.array([-1,1,1]); d,i=tree.query(q,workers=-1)
mL=L[ms][i]; mN=nor[ms][i]; sN=nor[sl]*np.array([-1,1,1]); dot=(mN*sN).sum(1)/(np.linalg.norm(mN,axis=1)*np.linalg.norm(sN,axis=1)+1e-9)
sL=L[sl]; okp=(d<0.005)&(dot>0.2); take=okp&(mL>0)&((sL>0)|~metalish[sl])
print('right texels',int(sl.sum()),'partner',int(okp.sum()),'label changed',int((take&(mL!=sL)).sum()),'left unpaired paint',int(((~okp)&(sL>0)).sum()))
sL[take]=mL[take]; L[sl]=sL
# C redraw the lines K painted: vote in folded space from the left side, smooth, drop islands
ex=cov&np.isin(exact,(1,2,3)); F=lambda p: np.c_[np.abs(p[:,0]),p[:,1],p[:,2]]
te=cKDTree(F(pos[ex&(x>-0.002)])[::4]); paint=cov&np.isin(L,(1,2,3)); dd,_=te.query(F(pos[paint]),distance_upper_bound=0.02,workers=-1)
R=np.zeros(cov.shape,bool); R[paint]=np.isfinite(dd); print('texels in the redraw zone',int(R.sum()))
src=R&(x>-0.002); Pm=F(pos[src]); lm=L[src]; lo=F(pos[R]).min(0)-6*VOX; shp=tuple(np.floor((F(pos[R]).max(0)-lo)/VOX).astype(int)+7); print('voxels',shp)
K=[1,2,3]; cnt=np.zeros((3,)+shp,np.float32); ijk=np.floor((Pm-lo)/VOX).astype(int)
for a,k in enumerate(K): np.add.at(cnt[a],tuple(ijk[lm==k].T),1)
occ=cnt.sum(0)>0; V=np.where(occ,cnt.argmax(0)+1,0)
def islands(V,mv):
    V=V.copy(); nr=0
    for a in (1,2,3):
        cl,n=ndi.label(V==a,np.ones((3,3,3)))
        if n==0: continue
        sz=np.bincount(cl.ravel()); small=np.isin(cl,np.where(sz<mv)[0])&(cl>0); V[small]=-1; nr+=int((sz[1:]<mv).sum())
    known=V>0; dist,idx=ndi.distance_transform_edt(~known,return_indices=True); f=V==-1; V[f]=V[idx[0][f],idx[1][f],idx[2][f]]; return V,nr
mv=int(ISL*100/(VOX*1000)**2); V,n1=islands(V,mv)
sm=lambda V: np.stack([ndi.gaussian_filter((V==a).astype(np.float32),SIG) for a in (1,2,3)])
for it in range(2): V=np.where(occ,sm(V).argmax(0)+1,0)
V,n2=islands(V,mv); sc=sm(V); print('islands removed',n1,n2)
qa=((F(pos[R])-lo)/VOX-0.5).T; val=np.stack([ndi.map_coordinates(sc[a],qa,order=1,mode='nearest') for a in range(3)]); new=np.asarray(K)[val.argmax(0)]
old=L[R]; new=np.where(val.max(0)>1e-4,new,old); print('redraw changed',int((new!=old).sum()),'of',len(old)); L[R]=new
np.save(O+'p1_L_'+TAG+'.npy',L); np.save(O+'p1_L1.npy',L1)
# D bake
PAL={1:(215,5,17),2:(32,46,131),3:(235,235,233),5:(17,17,17),6:(255,0,255)}; T=B.copy()
for k,v in PAL.items(): T[L==k]=v
dist,(iy,ix)=ndi.distance_transform_edt(~cov,return_indices=True); pad=(~cov)&(dist<=8); T[pad]=T[iy[pad],ix[pad]]
Image.fromarray(T).save(O+'p1_tex_'+TAG+'.png'); print({k:int((L==k).sum()) for k in PAL})
