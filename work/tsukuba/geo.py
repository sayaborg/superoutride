import numpy as np, math, json, sys
f=json.load(open('fit.json')); k=f['k']; p=f['p']; els=f['els']
def centre(ds=1.0):
    x,y,h=p[0],p[1],p[2]; j=3; P=[]; s=0
    for e in els:
        L=p[j]; j+=1; c=0.0
        if e['kind']=='A': c=p[j]; j+=1
        m=max(2,int(L*k/ds)); t=np.linspace(0,L,m+1)[:-1]
        if c==0: xs=x+t*math.cos(h); ys=y+t*math.sin(h)
        else: xs=x+(np.sin(h+c*t)-math.sin(h))/c; ys=y-(np.cos(h+c*t)-math.cos(h))/c
        for a,b,tt in zip(xs,ys,t): P.append(((s+tt)*k,a,b))
        if c==0: x,y=x+L*math.cos(h),y+L*math.sin(h)
        else: x,y=x+(math.sin(h+c*L)-math.sin(h))/c, y-(math.cos(h+c*L)-math.cos(h))/c
        h+=c*L; s+=L
    return np.array(P)
reg=np.load('reg.npy'); C=np.load('chain.npy'); Cc=np.vstack([C,C[:1]]); seg=np.hypot(*np.diff(Cc,axis=0).T); cum=np.r_[0,np.cumsum(seg)]
t=np.arange(0,cum[-1],6.0); R=np.c_[np.interp(t,cum,Cc[:,0]),np.interp(t,cum,Cc[:,1])]; c0=R.mean(0)
def to_sat(P):
    th,sc,tx,ty=reg; c,s_=math.cos(th),math.sin(th); Q=P-c0
    return np.c_[sc*(c*Q[:,0]-s_*Q[:,1])+tx, sc*(s_*Q[:,0]+c*Q[:,1])+ty]
def to_ll(XY,cx=1470.,cy=1110.5,mpp=100/212):
    e=(XY[:,0]-cx)*mpp; n=-(XY[:,1]-cy)*mpp
    return np.c_[36.1500776+n/110950, 139.9208239+e/(111320*math.cos(math.radians(36.15)))]
if __name__=='__main__':
    P=centre(); N=int(sys.argv[1]); ss=np.linspace(0,2045,N,endpoint=False)
    idx=[np.argmin(abs(P[:,0]-s)) for s in ss]; ll=to_ll(to_sat(P[idx,1:]))
    for s,(la,lo) in zip(ss,ll): print(f'{s:6.1f} https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon={lo:.6f}&lat={la:.6f}&outtype=JSON')
