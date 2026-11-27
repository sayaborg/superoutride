"""Nissan 300ZX 1984, non-turbo (K 2026-11-27): the bonnet's turbo scoop is taken off. The bonnet's left half takes the right half's height,
mirrored, inside the scoop's outline, blended over 20 mm at the outline; the scoop's dark opening is painted."""
import sys; sys.path.insert(0,'tools')
import numpy as np
from scipy.spatial import cKDTree
X=np.load('work/X3.npy').copy(); X0=X.copy()
B=(0.27,0.585,0.74,1.35)                                  # x and z of the scoop's outline, from the left-right height difference (up to 54 mm)
sel=(X0[:,0]>B[0])&(X0[:,0]<B[1])&(X0[:,2]>B[2])&(X0[:,2]<B[3])&(X0[:,1]>0.75)
R=(X0[:,0]<-B[0]+0.03)&(X0[:,0]>-B[1]-0.03)&(X0[:,2]>B[2]-0.03)&(X0[:,2]<B[3]+0.03)&(X0[:,1]>0.75)
t=cKDTree(np.stack([-X0[R,0],X0[R,2]],1)); d,i=t.query(np.stack([X0[sel,0],X0[sel,2]],1),k=4)
w=1/(d+1e-4); ym=(X0[R,1][i]*w).sum(1)/w.sum(1)
e=np.minimum.reduce([X0[sel,0]-B[0],B[1]-X0[sel,0],X0[sel,2]-B[2],B[3]-X0[sel,2]]); f=np.clip(e/0.02,0,1); f=f*f*(3-2*f)
X[sel,1]=X0[sel,1]+f*(ym-X0[sel,1])
dd=np.abs(X[sel,1]-X0[sel,1])*1000
print('scoop: %d vertices set, moved mm pct50/90/99/max %s'%(int(sel.sum()),np.percentile(dd,[50,90,99,100]).round(1)))
np.save('work/X3b.npy',X)
pos=np.load('work/texpos.npy'); cls=np.load('work/cls1.npy'); tex=np.load('work/tex1.npy')
x,y,z=pos[...,0],pos[...,1],pos[...,2]
m=(x>B[0])&(x<B[1])&(z>B[2])&(z<B[3])&(y>0.75)&(cls!=1)
print('scoop texels painted',int(m.sum())); cls[m]=1; tex[m]=(200,20,26)
np.save('work/cls1.npy',cls); np.save('work/tex1.npy',tex)
# check: left against right afterwards
L=(X[:,0]>0.1)&(X[:,2]>0.7)&(X[:,2]<1.5)&(X[:,1]>0.75)&(X[:,0]<0.7); Rr=(X[:,0]<-0.1)&(X[:,2]>0.7)&(X[:,2]<1.5)&(X[:,1]>0.75)&(X[:,0]>-0.7)
t2=cKDTree(np.stack([-X[Rr,0],X[Rr,2]],1)); d2,i2=t2.query(np.stack([X[L,0],X[L,2]],1)); dy=(X[L,1]-X[Rr,1][i2])[d2<0.004]
print('after: left minus right height, mm, pct1/50/99/max',np.percentile(dy*1000,[1,50,99,100]).round(1))
