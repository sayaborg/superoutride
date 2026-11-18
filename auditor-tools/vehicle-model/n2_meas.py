import numpy as np
d=np.load('out/n2_geom_col.npz'); s=2.07209184314697; zmid=0.009127101558277562
P=d['pts'].astype(float); P[:,2]-=zmid; P*=s; lum=d['col'].astype(float).mean(1); C=d['col'].astype(float)
W={'F':(0.6900,0.3037,0.3059),'R':(-0.6900,0.3445,0.3445)}
for n,(z,y,R) in W.items():
    r=np.hypot(P[:,2]-z,P[:,1]-y); low=P[:,1]<y-0.02
    print(n,'center z',z,'R',R)
    for a,b in [(0.95,1.01),(0.9,0.95),(0.85,0.9),(0.8,0.85),(0.75,0.8),(0.7,0.75),(0.65,0.7),(0.6,0.65),(0.55,0.6),(0.5,0.55)]:
        m=low&(r>a*R)&(r<b*R)&(np.abs(P[:,0])<0.14)
        if m.sum()<50: continue
        x=P[m,0]; print('  r %.2f-%.2f R (%.0f-%.0f mm) halfwidth p99.5 %.1f mm  mean lum %.0f  n %d'%(a,b,a*R*1000,b*R*1000,np.percentile(np.abs(x),99.5)*1000,lum[m].mean(),m.sum()))
print('L',P[:,2].max()-P[:,2].min(),'front',P[:,2].max(),'rear',P[:,2].min(),'H',P[:,1].max(),'W',np.ptp(P[:,0]))
m=(P[:,1]>0.25)&(P[:,1]<0.9)&(P[:,2]>-0.2)&(P[:,2]<0.5)
# cowl width: red/white/blue paint excluding rider (y<0.75)
sat=C.max(1)-C.min(1)
for y0 in (0.3,0.4,0.5,0.6,0.7,0.8):
    mm=(np.abs(P[:,1]-y0)<0.02)&(P[:,2]>0.0)&(P[:,2]<0.6); print('y',y0,'width front half',np.ptp(P[mm,0]))
print('asym: x min/max',P[:,0].min(),P[:,0].max())
print('--- bottom sector only (within 35 deg of straight down), dark points')
for n,(z,y,R) in W.items():
    dz=P[:,2]-z; dy=P[:,1]-y; r=np.hypot(dz,dy); sec=(dy<0)&(np.abs(dz)<np.tan(np.radians(35))*-dy)&(lum<90)&(np.abs(P[:,0])<0.2)
    for a in np.arange(0.5,1.0,0.05):
        m=sec&(r>a*R)&(r<(a+0.05)*R)
        if m.sum()>30: print(' ',n,'r %.0f-%.0f mm halfwidth max %.1f p99 %.1f lum %.0f n %d'%(a*R*1000,(a+.05)*R*1000,np.abs(P[m,0]).max()*1000,np.percentile(np.abs(P[m,0]),99)*1000,lum[m].mean(),m.sum()))
    m=(dy<0)&(np.abs(dz)<np.tan(np.radians(35))*-dy)&(np.abs(P[:,0])<0.2)&(r<R*0.8)&(lum>110)
    if m.sum(): print('  bright (rim) radius range',np.percentile(r[m],[1,50,99])*1000)
print('--- fine')
for n,(z,y,R) in W.items():
    dz=P[:,2]-z; dy=P[:,1]-y; r=np.hypot(dz,dy); sec=(dy<0)&(np.abs(dz)<np.tan(np.radians(45))*-dy)&(np.abs(P[:,0])<0.2)
    for a in np.arange(0.150,0.250,0.005):
        m=sec&(r>a)&(r<a+0.005)
        if m.sum()>30: print(' ',n,'r %.0f mm hw %.1f lum@edge %.0f rgb %s'%(a*1000,np.percentile(np.abs(P[m,0]),99.5)*1000,lum[m&(np.abs(P[:,0])>np.percentile(np.abs(P[m,0]),80))].mean(),C[m].mean(0).round()))
