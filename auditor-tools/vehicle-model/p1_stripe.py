import sys,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend
from scipy.spatial import cKDTree
from scipy import ndimage as ndi
from PIL import Image
O='/home/claude/work/out/'; L=np.load(O+'p1_L_b.npy'); pm=np.load(O+'posmap.npz'); cov=pm['cov']; pos=pm['pos']
B=rend.base_tex('/home/claude/work/in2/p1.glb',0); Bf=B.astype(np.float32); mx=Bf.max(2); sat=(mx-Bf.min(2))/np.maximum(mx,1)
cand=cov&(L==0)&(mx>60)&(sat<0.35); P=pos[cand]
dr,_=cKDTree(pos[cov&(L==1)][::3]).query(P,distance_upper_bound=0.03,workers=-1); db,_=cKDTree(pos[cov&(L==2)][::3]).query(P,distance_upper_bound=0.03,workers=-1)
lim=np.where(P[:,2]>0.3,0.028,0.012); hit=(dr<lim)&(db<lim)&(dr+db<np.where(P[:,2]>0.3,0.034,0.02)); t=np.zeros(cov.shape,bool); t[cand]=hit
print('stripe texels -> white',int(t.sum()),'z pct',np.percentile(pos[t][:,2],[1,25,50,75,99]).round(2),'left/right',int((pos[t][:,0]>0).sum()),int((pos[t][:,0]<0).sum()))
L[t]=3
# second pass: whatever is still unpainted inside the stripe
c2=cov&(L==0); P2=pos[c2]; a,_=cKDTree(pos[cov&(L==1)][::3]).query(P2,distance_upper_bound=0.028,workers=-1); b,_=cKDTree(pos[cov&(L==2)][::3]).query(P2,distance_upper_bound=0.028,workers=-1); w,_=cKDTree(pos[t]).query(P2,distance_upper_bound=0.004,workers=-1)
h2=np.isfinite(a)&np.isfinite(b)&np.isfinite(w)&(a+b<np.where(P2[:,2]>0.3,0.034,0.02)); t2=np.zeros(cov.shape,bool); t2[c2]=h2; L[t2]=3; print('second pass',int(t2.sum()))
# small red / blue islands inside another paint colour
n_is=0; ch=0
for k in (1,2):
    cl,n=ndi.label(L==k,np.ones((3,3))); sz=np.bincount(cl.ravel()); sl=ndi.find_objects(cl)
    for c in np.where(sz[1:]<900)[0]+1:
        s0,s1=sl[c-1]; s0=slice(max(s0.start-3,0),s0.stop+3); s1=slice(max(s1.start-3,0),s1.stop+3); m=cl[s0,s1]==c
        ring=ndi.binary_dilation(m,np.ones((3,3)),iterations=2)&~m; nb=L[s0,s1][ring]; cv=cov[s0,s1][ring]
        if cv.sum()<0.8*ring.sum(): continue                     # chart edge: cannot tell
        nbp=nb[np.isin(nb,(1,2,3))&(nb!=k)]
        if len(nbp)>0.8*ring.sum(): L[s0,s1][m]=np.bincount(nbp).argmax(); n_is+=1; ch+=int(m.sum())
print('islands',n_is,'texels changed',ch)
np.save(O+'p1_L_c.npy',L)
PAL={1:(215,5,17),2:(32,46,131),3:(235,235,233),5:(17,17,17),6:(255,0,255)}; T=B.copy()
for k,v in PAL.items(): T[L==k]=v
dist,(iy,ix)=ndi.distance_transform_edt(~cov,return_indices=True); pad=(~cov)&(dist<=8); T[pad]=T[iy[pad],ix[pad]]; Image.fromarray(T).save(O+'p1_tex_c.png')
