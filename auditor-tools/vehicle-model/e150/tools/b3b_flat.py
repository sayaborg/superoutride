"""Ford Econoline E-150 1983: the debris on the right side (K 2026-11-27) is levelled: inside each box the body side takes the surface
fitted to a 4 cm band round the box (x as a quadratic in z and y), blended over 1.5 cm at the box's edge."""
import numpy as np
X=np.load('work/X3.npy').copy(); X0=X.copy(); body=np.load('work/body.npy')
BOX=[('plate low on the right sliding door',(-0.06,0.11,0.68,0.82)),('bit by the right door handles',(-0.07,0.05,1.14,1.24))]
def T(z,y): return np.stack([np.ones_like(z),z,y,z*z,z*y,y*y],1)
for nm,(z0,z1,y0,y1) in BOX:
    side=(X0[:,0]<-0.9)&(X0[:,0]>-1.08)
    inb=side&(X0[:,2]>z0)&(X0[:,2]<z1)&(X0[:,1]>y0)&(X0[:,1]<y1)
    band=side&(X0[:,2]>z0-0.04)&(X0[:,2]<z1+0.04)&(X0[:,1]>y0-0.04)&(X0[:,1]<y1+0.04)&~inb
    c,*_=np.linalg.lstsq(T(X0[band,2],X0[band,1]),X0[band,0],rcond=None); res=X0[band,0]-T(X0[band,2],X0[band,1])@c
    k=np.abs(res)<0.004; c,*_=np.linalg.lstsq(T(X0[band,2],X0[band,1])[k],X0[band,0][k],rcond=None)
    e=np.minimum.reduce([X0[inb,2]-z0,z1-X0[inb,2],X0[inb,1]-y0,y1-X0[inb,1]]); f=np.clip(e/0.015,0,1); f=f*f*(3-2*f)
    xn=T(X0[inb,2],X0[inb,1])@c; X[inb,0]=X0[inb,0]+f*(xn-X0[inb,0]); d=np.abs(X[inb,0]-X0[inb,0])*1000
    print('%s: %d vertices, band %d (fit sd %.2f mm), moved mm pct50/90/99/max %s'%(nm,int(inb.sum()),int(k.sum()),res[k].std()*1000,np.percentile(d,[50,90,99,100]).round(1)))
np.save('work/X3b.npy',X)
