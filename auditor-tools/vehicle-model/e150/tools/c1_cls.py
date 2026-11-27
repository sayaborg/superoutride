import sys; sys.path.insert(0,'tools')
import numpy as np
w=np.load('work/weld.npz'); inv=w['inv']; J=w['J']; X1=np.load('work/X1.npy')
z=np.load('work/uvraster.npz'); tb=z['tb'].astype(np.int64); wb=z['wb'].astype(np.float64); cov=tb>=0
a=np.load('work/tex0.npy').astype(np.int32); T=4096
t=tb[cov]; ww=wb[cov]
pos=np.full((T,T,3),np.nan,np.float32)
pos[cov]=(X1[J[t,0]]*ww[:,0:1]+X1[J[t,1]]*ww[:,1:2]+X1[J[t,2]]*ww[:,2:3]).astype(np.float32)
np.save('work/texpos.npy',pos)
fn=np.cross(X1[J[:,1]]-X1[J[:,0]],X1[J[:,2]]-X1[J[:,0]]); fn/=np.linalg.norm(fn,axis=1,keepdims=True)+1e-20
nrm=np.zeros((T,T,3),np.float32); nrm[cov]=fn[tb[cov]]; np.save('work/texnrm.npy',nrm)
r,g,b=[a[...,k].astype(float) for k in range(3)]; lum=(r+g+b)/3; mx=a.max(-1); mn=a.min(-1)
white=(r>150)&(g>0.68*r)&(g<0.92*r)&(b>0.35*r)&(b<0.68*r)   # the body's beige (the paint candidates)
red=(r>120)&(g<0.35*r)&(b<0.35*r)
dark=(lum<62)&~white
amber=(r>170)&(g>0.3*r)&(g<0.66*r)&(b<0.35*r)
c=np.zeros((T,T),np.uint8); c[white&cov]=1; c[dark&cov]=2; c[red&cov]=4; c[amber&cov]=5
np.save('work/cls0.npy',c)
print({k:round(float((c[cov]==k).mean()),3) for k in (0,1,2,4,5)})
x,y,zz=pos[...,0],pos[...,1],pos[...,2]
print('extent x %.3f..%.3f y ..%.3f z %.3f..%.3f'%(np.nanmin(x),np.nanmax(x),np.nanmax(y),np.nanmin(zz),np.nanmax(zz)))
vis=a.copy().astype(np.uint8); vis[c==1]=(60,200,60); vis[c==2]=(40,40,200); vis[c==4]=(255,0,255); vis[c==5]=(0,255,255)
np.save('work/vis0.npy',vis)
