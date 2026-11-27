"""Ford Econoline E-150 1983: a circle on each tyre of K's model (model units, before sizing), from the tread's lower arc only.
Writes work/wheels0.npy: {FL,FR,RL,RR: (centre z, centre y, radius, |x| of the tread's inner edge, |x| of its outer edge)}.
The contact patches' centres (front z 0.3744, rear -0.2547) were read from the vertices within 0.004 of the ground."""
import numpy as np
w=np.load('work/weld.npz'); X=w['X']; Cw=w['Cw']; lum=Cw.mean(1)
def fit(z,y):
    A=np.stack([2*z,2*y,np.ones(len(z))],1); b=z*z+y*y
    for _ in range(10):
        s,*_=np.linalg.lstsq(A,b,rcond=None); cz,cy=s[0],s[1]; r=np.sqrt(s[2]+cz*cz+cy*cy)
        res=np.hypot(z-cz,y-cy)-r; k=np.abs(res)<max(2.5*np.std(res),0.0002); A,b,z,y=A[k],b[k],z[k],y[k]
    return cz,cy,r,np.std(res)
wh={}
for k,zc,xs in (('FL',0.3744,1),('FR',0.3744,-1),('RL',-0.2547,1),('RR',-0.2547,-1)):
    xa=X[:,0]*xs; t=(lum<70)&(xa>0.125)&(np.abs(X[:,2]-zc)<0.085)&(X[:,1]<0.16)
    xin,xout=np.percentile(xa[t&(X[:,1]<0.01)],1),np.percentile(xa[t&(X[:,1]<0.01)],99)
    m=t&(xa>xin+0.3*(xout-xin))&(xa<xout-0.3*(xout-xin))
    z,y=X[m,2],X[m,1]; y0=0.065
    ang=np.round(np.degrees(np.arctan2(y-y0,z-zc))/2).astype(int); rr=np.hypot(z-zc,y-y0); keep=np.zeros(len(z),bool)
    for a in np.unique(ang):
        mm=ang==a; keep[np.nonzero(mm)[0][rr[mm]>=np.percentile(rr[mm],92)]]=True
    keep&=(y<0.055)&(rr<0.08)&(y>0.004)
    cz,cy,r,sd=fit(z[keep],y[keep]); wh[k]=(cz,cy,r,xin,xout)
    print(k,'cz %.4f cy %.4f r %.4f sd %.5f x %.4f..%.4f n %d'%(cz,cy,r,sd,xin,xout,keep.sum()))
np.save('work/wheels0.npy',wh,allow_pickle=True)
