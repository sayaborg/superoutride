"""Ford Econoline E-150 1983 (a converted van, K's model): flat colours on the texture. One paint key (the body and the spare tyre's cover),
glass, matte black, brake lamps. K 2026-11-27: the wipers and the debris on the sides are taken off; the lettering and the emblems stay as supplied."""
import sys; sys.path.insert(0,'tools')
import numpy as np
from scipy import ndimage as ndi
PAINT=(200,20,26); GLASS=(10,10,12); MATTE=(22,22,24); BRAKE=(255,0,255)
z=np.load('work/uvraster.npz'); tb=z['tb'].astype(np.int64); cov=tb>=0
a=np.load('work/tex0.npy').astype(np.int32); T=4096
pos=np.load('work/texpos.npy'); c0=np.load('work/cls0.npy'); nrm=np.load('work/texnrm.npy')
fi=np.load('work/fitinfo.npy',allow_pickle=True).item(); wh=np.load('work/wheels0.npy',allow_pickle=True).item()
x,y,zz=pos[...,0],pos[...,1],pos[...,2]; nx,ny,nz=nrm[...,0],nrm[...,1],nrm[...,2]; ax=np.abs(x)
cls=np.zeros((T,T),np.uint8); cls[c0==2]=2; cls[c0==1]=1
# glass: dark components wholly above 1.0 m (the windscreen, the side windows and their lower panes, the two rear windows); the grille and the tube under the spare tyre are not
m=(c0==2)&(y>0.90); Pc=pos[m].astype(float); VOX=0.015; lo=Pc.min(0)-2*VOX; ijk=np.floor((Pc-lo)/VOX).astype(int)
occ=np.zeros(tuple(ijk.max(0)+3),bool); occ[tuple(ijk.T)]=True; lab,n=ndi.label(occ,np.ones((3,3,3)))
l=lab[tuple(ijk.T)]; sz=np.bincount(l,minlength=n+1); idx=np.nonzero(m.ravel())[0]; filled=0
for r in np.argsort(-sz)[:40]:
    if r==0 or sz[r]<4000: continue
    q=Pc[l==r]; lo_,hi_=q.min(0),q.max(0)
    if lo_[1]<1.0: print('dark component, not a window:',sz[r],lo_.round(2),hi_.round(2)); continue
    sel=np.zeros(T*T,bool); sel[idx[l==r]]=True; sel=sel.reshape(T,T); cls[sel]=3
    # what lies on the pane inside its outline is glass too: the wipers on the windscreen, the rod and the knob in a side window (K)
    d=0 if abs(nrm[sel][:,0].mean())>0.6 else 2; u,v=[k for k in range(3) if k!=d]; G=0.01
    box=cov&(pos[...,d]>lo_[d]-0.04)&(pos[...,d]<hi_[d]+0.04)&(pos[...,u]>lo_[u])&(pos[...,u]<hi_[u])&(pos[...,v]>lo_[v])&(pos[...,v]<hi_[v])
    iu=np.floor((pos[...,u][box]-lo_[u])/G).astype(int)+4; iv=np.floor((pos[...,v][box]-lo_[v])/G).astype(int)+4
    M=np.zeros((int((hi_[u]-lo_[u])/G)+9,int((hi_[v]-lo_[v])/G)+9),bool); g=sel[box]; M[iu[g],iv[g]]=True
    M=ndi.binary_fill_holes(ndi.binary_closing(M,np.ones((3,3)),iterations=3)); M=ndi.binary_erosion(M,np.ones((3,3)),iterations=1)
    inside=np.zeros((T,T),bool); inside[box]=M[iu,iv]; add=inside&(cls!=3)&(cls!=1); filled+=int(add.sum()); cls[add]=3
    print('window',sz[r],lo_.round(2),hi_.round(2),'| on the pane, made glass:',int(add.sum()))
# K 2026-11-27: the ladder on the right rear door is chrome all over (parts of it had the door's and the window's colours)
dr=cov&(((x>-0.72)&(x<-0.60))|((x>-0.14)&(x<-0.04)))&(zz<-2.6)&(y>0.75)&(y<1.95)&(nz<-0.5)
yb=np.arange(0.6,2.0,0.02); zb=np.array([np.median(zz[dr&(y>=b)&(y<b+0.02)]) if (dr&(y>=b)&(y<b+0.02)).sum()>20 else np.nan for b in yb]); ok_=~np.isnan(zb)
zb=np.minimum(zb[ok_],ndi.minimum_filter1d(zb[ok_],5)); doorz=np.interp(y,yb[ok_]+0.01,zb); cz=np.polyfit(yb[ok_],zb,1)   # the door's own profile beside the ladder, 2 cm steps (it bulges at the belt)
lad=cov&(x>-0.57)&(x<-0.17)&(y>0.62)&(((zz<doorz-0.02)&(y<2.0))|((y>=2.0)&(zz<-2.35)&(zz>-3.0)))
lit=lad&(a.min(2)>150)&((a.max(2)-a.min(2))<30); CHROME=tuple(int(v) for v in np.median(a[lit],0))
print('ladder: door face z = %.3f %+.3f y | %d texels, of them paint %d glass %d matte %d -> chrome %s'%(cz[1],cz[0],int(lad.sum()),int((lad&(cls==1)).sum()),int((lad&(cls==3)).sum()),int((lad&(cls==2)).sum()),CHROME))
cls[lad]=7
# debris on the sides (K): the square silver plate low on the right sliding door and the bit by the right door handles -> paint
plate=cov&(x<-0.9)&(zz>-0.06)&(zz<0.11)&(y>0.68)&(y<0.82)&(cls!=1); bit=cov&(x<-0.9)&(zz>-0.07)&(zz<0.05)&(y>1.14)&(y<1.24)&(cls!=1)
print('right side: plate -> paint %d texels, bit by the handles -> paint %d'%(int(plate.sum()),int(bit.sum()))); cls[plate|bit]=1
# K 2026-11-27: the roof's lengthwise ribs are body colour all over (the supplied texture has them paler, with darker edges); the rack above is grey and stays
chrome_like=(a.min(2)>150)&((a.max(2)-a.min(2))<30)
rib=cov&(cls!=1)&(cls!=3)&(y>1.85)&(ny>0.3)&(zz>-2.8)&(zz<1.1)&~chrome_like; print('roof ribs and every other mark on the roof that is not the rack -> paint (K):',int(rib.sum())); cls[rib]=1
# tyres and wheels
keep=np.zeros((T,T),bool); s0=fi['s0']; sy=fi['sy']; R=0.3593; rho_all=np.full((T,T),9.0)
for k in wh:
    zc=fi['zf'] if k[0]=='F' else fi['zr']; cy=wh[k][1]*sy; r0=wh[k][2]
    rho=np.sqrt(((zz-zc)/s0)**2+((y-cy)/sy)**2)/r0          # in tyre radii, as supplied
    sel=cov&(ax>0.6)&(rho<1.08)&((x>0)==(k[1]=='L')); keep|=sel; rho_all[sel]=rho[sel]
np.save('work/keep.npy',keep)
out=a.copy()
# the tyres' white lettering is garbled: the sidewalls are made matte black (K agreed); the wheels stay as supplied
side=keep&(rho_all>0.60)&(cls!=2); print('tyre sidewalls made matte:',int(side.sum())); cls[side]=2
# brake lamps: the red lenses on the rear face
br=cov&(c0==4)&(nz<-0.3)&(ax>0.7)&(zz<-2.6); br=ndi.binary_closing(br,np.ones((3,3)))&cov
print('brake lamp texels',int(br.sum())); cls[br]=0; out[br]=BRAKE
# small clusters of other colours inside the paint are absorbed (rivet dots and the like; not near lamps, wheels or the nose)
oth=(cls==0)&cov&~br&~lad
labk,nk=ndi.label(oth,np.ones((3,3))); szk=np.bincount(labk.ravel(),minlength=nk+1); szk[0]=0
prot=keep|(cov&(zz<-2.6)&(ax<0.7))|(cov&(zz>2.15))
small=oth&(szk[labk]<150)&~prot
idx2=ndi.distance_transform_edt((cls==0)|~cov,return_distances=False,return_indices=True)
cls[small]=cls[idx2[0],idx2[1]][small]
print('absorbed small other texels',int(small.sum()))
dk=(cls==2)&cov&~lad; labd,nd=ndi.label(dk,np.ones((3,3))); szd=np.bincount(labd.ravel(),minlength=nd+1); szd[0]=0
ring=ndi.binary_dilation(dk,np.ones((5,5)))&~dk&cov; big=ndi.grey_dilation(labd,size=(5,5))
nb_all=np.bincount(big[ring],minlength=nd+1); nb_paint=np.bincount(big[ring&(cls==1)],minlength=nd+1)
okc=(szd>0)&(szd<300)&(nb_paint>0.8*np.maximum(nb_all,1)); speck=dk&okc[labd]&~prot
cls[speck]=1; print('dark specks inside the paint -> paint: %d clusters, %d texels'%(int(okc.sum()),int(speck.sum())))
print('paint texels inside the wheels, left as they came:',int((keep&(cls==1)).sum())); cls[keep&(cls==1)]=0
out[cls==1]=PAINT; out[cls==2]=MATTE; out[cls==3]=GLASS; out[cls==7]=CHROME; cls[cls==7]=0
print('paint %.3f matte %.3f glass %.3f other %.3f'%tuple((cls[cov]==k).mean() for k in (1,2,3,0)))
np.save('work/cls1.npy',cls); np.save('work/tex1.npy',out.astype(np.uint8))
