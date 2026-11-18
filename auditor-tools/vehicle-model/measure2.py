import sys, numpy as np
d=np.load(sys.argv[1]); P=d['pts'].astype(float); C=d['col'].astype(float)
lum=C.mean(1)
def fit(zsign):
    m=(np.abs(P[:,0])<0.012)&(lum<80)&(P[:,2]*zsign>0.2)&(P[:,1]<0.30)
    q=P[m][:,[2,1]]
    c=np.array([0.344*zsign,0.15]);R=0.15
    for it in range(40):
        v=q-c; ang=np.degrees(np.arctan2(v[:,1],v[:,0]*zsign)); r=np.hypot(v[:,0],v[:,1])
        # use arc from -150deg..+20deg measured with outward(+)=away from bike : lower + outer part of tyre
        sel=(ang>-150)&(ang<25)
        bins=np.floor((ang[sel]+150)/1.0).astype(int); qs=q[sel]; rs=r[sel]
        pts=[]
        for bi in np.unique(bins):
            mm=bins==bi
            if mm.sum()>8: pts.append(qs[mm][np.argmax(rs[mm])])
        pts=np.array(pts)
        A=np.c_[2*pts,np.ones(len(pts))]; sol=np.linalg.lstsq(A,(pts**2).sum(1),rcond=None)[0]
        c=sol[:2]; R=np.sqrt(sol[2]+c@c)
    res=np.abs(np.hypot(*(pts-c).T)-R)
    return c,R,res.mean(),res.max(),len(pts)
for n,s in (('front',1),('rear',-1)):
    c,R,rm,rx,k=fit(s); print(n,'z',c[0],'y',c[1],'R',R,'res',rm,rx,k)
# rim radius: bright/non-black ring? report tyre min y near each centre
for n,s in (('front',1),('rear',-1)):
    m=(np.abs(P[:,0])<0.012)&(P[:,2]*s>0.3)&(P[:,2]*s<0.4); print(n,'min y',P[m][:,1].min())
# widths
for n,s in (('front',1),('rear',-1)):
    for y0 in (0.03,0.08,0.15):
        m=(P[:,2]*s>0.28)&(P[:,2]*s<0.42)&(np.abs(P[:,1]-y0)<0.01)&(lum<80); print(n,y0,P[m][:,0].min(),P[m][:,0].max())
# handlebar width, fairing width
m=(P[:,1]>0.2); print('max |x| overall',np.abs(P[:,0]).max(),'at',P[np.argmax(np.abs(P[:,0]))])
