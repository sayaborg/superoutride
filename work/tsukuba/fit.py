import numpy as np, math, json, sys
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
C=np.load('chain.npy'); n=len(C)
Cc=np.vstack([C,C[:1]]); seg=np.hypot(*np.diff(Cc,axis=0).T); cum=np.r_[0,np.cumsum(seg)]; tot=cum[-1]
def proj(p):
    best=(1e9,0)
    for i in range(n):
        a=Cc[i];b=Cc[i+1];ab=b-a;t=np.clip(((p-a)@ab)/(ab@ab),0,1);q=a+t*ab;d=np.hypot(*(p-q))
        if d<best[0]: best=(d,cum[i]+t*seg[i],q)
    return best
st=[(1834,373),(2016,372),(1955,688),(1442,853),(1260,959),(1101,1102),(931,1185),(747,1227),(856,1450),(1360,1189),(1570,1233),(1783,1473),(2136,1649),(2456,1644),(2729,1588),(2972,1495),(3033,1723),(2841,1758),(798,1775),(344,1260),(608,922)]
kinds=['A','A','S','A','S','A','S','A','S','A','S','A','S','A','S','A','A','S','A','A']  # element after station i (i -> i+1), last: 90R end -> (home straight handled separately)
names=['55R','35R','','105R','','75R','','25R','','35R','','80R','','80R-2','','25R','105R','back','100R','90R']
d0,s0,q0=proj(np.array([994.,741.]))
ss=[proj(np.array(p,float))[1] for p in st]
# elements: home part1 (start->st0), then 20 elements st[i]->st[i+1] (i=0..19), then home part2 (st20->start)
els=[('S','home-a',(ss[0]-s0)%tot)]
for i in range(20): els.append((kinds[i],names[i],(ss[i+1]-ss[i])%tot))
els.append(('S','home-b',(s0-ss[20])%tot))
# initial curvature from chain: signed heading change / length
def heading_at(s):
    s%=tot; i=min(np.searchsorted(cum,s)-1,n-1); i=max(i,0); v=Cc[i+1]-Cc[i]; return math.atan2(v[1],v[0])
def unwrap(a): return (a+math.pi)%(2*math.pi)-math.pi
init=[]; s=s0
for k_,nm,L in els:
    if k_=='A':
        # integrate heading change along chain
        ts=np.linspace(s+3,s+L-3,max(4,int(L/15))); hs=[heading_at(t) for t in ts]; dh=sum(unwrap(hs[i+1]-hs[i]) for i in range(len(hs)-1))
        init.append((L,dh/(ts[-1]-ts[0])))
    else: init.append((L,0.0))
    s+=L
RINIT={'55R':52,'35R':33.7,'105R':-100.7,'75R':67.2,'25R':-26.0,'80R':-77.0,'80R-2':-163.8,'100R':95.6,'90R':86.7}
cnt={}
new=[]
for (k_,nm,L),(L0,c0) in zip(els,init):
    if k_=='A':
        cnt[nm]=cnt.get(nm,0)+1
        R=RINIT[nm]
        if nm=='35R' and cnt[nm]==2: R=33.7
        if nm=='25R' and cnt[nm]==2: R=24.1
        if nm=='105R' and cnt[nm]==2: R=102.4
        new.append((L0,0.2044/R))
    else: new.append((L0,0.0))
init=new
h0=heading_at(s0+5)
def build(p,ds=4.0,full=False):
    x,y,h=p[0],p[1],p[2]; pts=[]; j=3; ends=[]
    for (k_,nm,_),(L0,c0) in zip(els,init):
        L=p[j]; j+=1
        if k_=='A': c=p[j]; j+=1
        else: c=0.0
        m=max(2,int(L0/ds)); t=np.linspace(0,L,m+1)
        if abs(c)<1e-12: xs=x+t*math.cos(h); ys=y+t*math.sin(h)
        else: xs=x+(np.sin(h+c*t)-math.sin(h))/c; ys=y-(np.cos(h+c*t)-math.cos(h))/c
        pts.append(np.c_[xs,ys][:-1]); x,y,h=xs[-1],ys[-1],h+c*L; ends.append((x,y,h))
    return np.vstack(pts),(x,y,h),ends
p0=[q0[0],q0[1],h0]
for (k_,nm,_),(L,c) in zip(els,init):
    p0.append(L)
    if k_=='A': p0.append(c)
p0=np.array(p0)
WCL=float(sys.argv[1]) if len(sys.argv)>1 else 3.0
def resid(p):
    pts,(x,y,h),_=build(p); tr=cKDTree(pts); d,_i=tr.query(C)
    tc=cKDTree(C); d2,_=tc.query(pts[::3])
    clo=[WCL*(x-p[0]),WCL*(y-p[1]),WCL*200*math.sin(h-p[2])]
    return np.r_[d,0.5*d2,clo]
lo=np.where(np.abs(p0)<0.1,np.minimum(p0*0.8,p0*1.2),p0-60); hi=np.where(np.abs(p0)<0.1,np.maximum(p0*0.8,p0*1.2),p0+60)
lo[:3]=p0[:3]-[30,30,0.1]; hi[:3]=p0[:3]+[30,30,0.1]
r=least_squares(resid,p0,bounds=(lo,hi),x_scale=np.where(np.abs(p0)<0.1,1e-3,1.0),max_nfev=600)
p=r.x; pts,(x,y,h),ends=build(p,1.0); tr=cKDTree(pts); d,_=tr.query(C)
Ltot=sum(p[j] for j in [3+sum(1+(e[0]=='A') for e in els[:i]) for i in range(len(els))])
k=2045/Ltot
print('total px',round(Ltot,1),'k',round(k,5),'rms px',round(float(np.sqrt((d**2).mean())),2),'max px',round(float(d.max()),2),'=> rms m',round(float(np.sqrt((d**2).mean()))*k,2),'max m',round(float(d.max())*k,2))
print('closure px',round(x-p[0],2),round(y-p[1],2),'deg',round(math.degrees(unwrap(h-p[2])),3))
j=3; s=0; out=[]
for (k_,nm,_ ) in els:
    L=p[j]; j+=1
    if k_=='A': c=p[j]; j+=1; R=1/abs(c)*k; turn='right' if c>0 else 'left'; print(f'{nm:7s} arc      s={s*k:7.1f}  len {L*k:6.1f}  R {R:6.1f}  {turn:5s} sweep {math.degrees(abs(c)*L):6.1f}')
    else: c=0; print(f'{nm:7s} straight s={s*k:7.1f}  len {L*k:6.1f}')
    out.append({'name':nm,'kind':k_,'len_m':L*k,'R_m':(1/abs(c)*k if c else None),'turn':(None if not c else ('right' if c>0 else 'left'))}); s+=L
json.dump({'k':k,'p':p.tolist(),'els':out},open('fit.json','w'))
# worst residual locations
idx=np.argsort(-d)[:8]; print('worst',[(int(C[i][0]),int(C[i][1]),round(float(d[i])*k,2)) for i in idx])
