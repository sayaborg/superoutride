"""Nissan 300ZX 2+2 1984: flat colours on the texture. One paint key (the body), glass, matte black, brake lamps.
Badges, lettering, the number plate's panel, lamps, wheels and mouldings stay as supplied (nothing was asked of them)."""
import sys; sys.path.insert(0,'tools')
import numpy as np
from scipy import ndimage as ndi
PAINT=(200,20,26); GLASS=(10,10,12); MATTE=(22,22,24); BRAKE=(255,0,255)
z=np.load('work/uvraster.npz'); tb=z['tb'].astype(np.int64); cov=tb>=0
a=np.load('work/tex0.npy').astype(np.int32); T=4096
pos=np.load('work/texpos.npy'); c0=np.load('work/cls0.npy'); nrm=np.load('work/texnrm.npy')
fi=np.load('work/fitinfo.npy',allow_pickle=True).item(); wh=np.load('work/wheels0.npy',allow_pickle=True).item()
x,y,zz=pos[...,0],pos[...,1],pos[...,2]; nx,ny,nz=nrm[...,0],nrm[...,1],nrm[...,2]; ax=np.abs(x)
ZR=np.nanmin(zz); ZF=np.nanmax(zz)
rear=cov&(zz<ZR+0.30)&(nz<-0.2)
lamps=rear&(ax>0.29)&(ax<0.745)&(y>0.61)&(y<0.865)          # the two rear lamp clusters
cls=np.zeros((T,T),np.uint8); cls[c0==2]=2
cls[(c0==1)&~lamps]=1
# glass: the windscreen, the hatch glass, the door glass with the T-bar roof's panels, the quarter windows (dark, above the belt)
m=(c0==2)&(y>0.78)&(ax<0.84); Pc=pos[m].astype(float); VOX=0.012; lo=Pc.min(0)-2*VOX; ijk=np.floor((Pc-lo)/VOX).astype(int); shp=tuple(ijk.max(0)+3)
occ=np.zeros(shp,bool); occ[tuple(ijk.T)]=True; lab,n=ndi.label(occ,np.ones((3,3,3)))
l=lab[tuple(ijk.T)]; sz=np.bincount(l,minlength=n+1); green=[]
for r in np.argsort(-sz)[:14]:
    if r==0 or sz[r]<1500: continue
    q=Pc[l==r]; lo_,hi_=q.min(0),q.max(0)
    ok=sz[r]>50000 and hi_[1]>1.15                             # reaches the roof: a window (the rear spoiler, the roof vents and the bonnet's scoop do not)
    print('dark component',r,sz[r],lo_.round(2),hi_.round(2),'GLASS' if ok else '')
    if ok: green.append(r)
gv=np.isin(lab,green); sel=np.zeros(T*T,bool); idx=np.nonzero(m.ravel())[0]; sel[idx]=gv[tuple(ijk.T)]; cls[sel.reshape(T,T)]=3
# K 2026-11-27: the strip joining the two rear lamps above the plate is a red lens that does not light (a key of its own, not the brake lamp's, its lettering covered); the two black squares on the roof
# behind the glass panels are painted over; the badge on the hatch's right (the turbo badge) is painted over
strip=rear&(ax<0.30)&(y>0.745)&(y<0.87); print('strip between the rear lamps -> the red lens key:',int(strip.sum())); cls[strip]=6
vent=cov&(ax<0.36)&(y>1.22)&(zz>-1.18)&(zz<-1.04)&(cls==2); print('roof squares -> paint:',int(vent.sum())); cls[vent]=1
badge=cov&(x>-0.60)&(x<-0.38)&(y>0.86)&(y<0.96)&(zz<-1.9)&(cls==0); print('hatch badge -> paint:',int(badge.sum()),'x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f'%(x[badge].min(),x[badge].max(),y[badge].min(),y[badge].max(),zz[badge].min(),zz[badge].max()) if badge.sum() else ''); cls[badge]=1
# tyres and wheels (for the wheel step)
keep=np.zeros((T,T),bool); s0=fi['s0']; sy=fi['sy']
for k in wh:
    zc=fi['zf'] if k[0]=='F' else fi['zr']
    rho=np.sqrt((zz-zc)**2+((y-0.3195)*s0/sy)**2)
    keep|=cov&(ax>0.55)&(rho<0.3195+0.03)&((x>0)==(k[1]=='L'))
np.save('work/keep.npy',keep)
out=a.copy()
# brake lamps: the red upper lenses of the rear lamp clusters
r_,g_,b_=a[...,0],a[...,1],a[...,2]
br=lamps&(y>0.735)&(r_>120)&(g_<0.3*r_)&(b_<0.3*r_)
br=ndi.binary_closing(br,np.ones((3,3)))&cov&lamps
print('brake lamp texels',int(br.sum())); cls[br]=0; out[br]=BRAKE
# small clusters of other colours inside the paint are absorbed (not near lamps, wheels, the rear face or the nose's lamps)
oth=(cls==0)&cov&~br
labk,nk=ndi.label(oth,np.ones((3,3))); szk=np.bincount(labk.ravel(),minlength=nk+1); szk[0]=0
prot=lamps|keep|(cov&(zz<ZR+0.35)&~badge)|(cov&(zz>ZF-0.6)&(y<0.80))
small=oth&(szk[labk]<150)&~prot
idx2=ndi.distance_transform_edt((cls==0)|~cov,return_distances=False,return_indices=True)
cls[small]=cls[idx2[0],idx2[1]][small]
print('absorbed small other texels',int(small.sum()))
dk=(cls==2)&cov; labd,nd=ndi.label(dk,np.ones((3,3))); szd=np.bincount(labd.ravel(),minlength=nd+1); szd[0]=0
ring=ndi.binary_dilation(dk,np.ones((5,5)))&~dk&cov; big=ndi.grey_dilation(labd,size=(5,5))
nb_all=np.bincount(big[ring],minlength=nd+1); nb_paint=np.bincount(big[ring&(cls==1)],minlength=nd+1)
okc=(szd>0)&(szd<300)&(nb_paint>0.8*np.maximum(nb_all,1)); speck=dk&okc[labd]&~prot
cls[speck]=1; print('dark specks inside the paint -> paint: %d clusters, %d texels'%(int(okc.sum()),int(speck.sum())))
print('paint texels inside the wheels, left as they came:',int((keep&(cls==1)).sum())); cls[keep&(cls==1)]=0
out[cls==1]=PAINT; out[cls==2]=MATTE; out[cls==3]=GLASS; out[cls==6]=(240,20,10)
print('paint %.3f matte %.3f glass %.3f other %.3f'%tuple((cls[cov]==k).mean() for k in (1,2,3,0)))
np.save('work/cls1.npy',cls); np.save('work/tex1.npy',out.astype(np.uint8))
