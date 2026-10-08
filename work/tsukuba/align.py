import numpy as np, json, math, sys
def align(flow,t0,t1,out,fps=30000/1001):
    dx=np.load(flow); t=(np.arange(len(dx))+0.5)/fps; x=dx[:,0].copy(); x[dx[:,2]<0.1]=np.nan
    ok=~np.isnan(x); x=np.interp(t,t[ok],x[ok]); x=np.convolve(x,np.ones(7)/7,'same')
    m=(t>=t0)&(t<=t1); th=np.cumsum(-x*m); th=th/th[m][-1]*2*math.pi
    plan=json.load(open('plan.json')); E=plan['E']; TOT=plan['TOT']
    ds=2.0; S_=np.arange(0,TOT+ds,ds); H=np.zeros_like(S_); s=0; h=0
    for e in E:
        c=((1 if e['turn']=='right' else -1)/e['radius']) if e['kind']=='arc' else 0
        mm=(S_>=s)&(S_<=s+e['length']); H[mm]=h+c*(S_[mm]-s); s+=e['length']; h+=c*e['length']
    H[S_>=TOT]=2*math.pi
    dt=0.1; T=np.arange(t0,t1+1e-9,dt); TH=np.interp(T,t,th)
    n,mS=len(T),len(S_); INF=1e18; cost=np.full((n,mS),INF); back=np.zeros((n,mS),np.int32)
    cost[0,0]=0; lo,hi=int(8*dt/ds),int(60*dt/ds)+1
    for i in range(1,n):
        c=(TH[i]-H)**2
        for k in range(lo,hi+1):
            cand=np.full(mS,INF); cand[k:]=cost[i-1,:mS-k] if k>0 else cost[i-1]
            cand=cand+c+0.002*(k-2.5)**2*0   # no speed prior
            better=cand<cost[i]; cost[i][better]=cand[better]; back[i][better]=k
    j=mS-1; path=[j]
    for i in range(n-1,0,-1): j-=back[i,j]; path.append(j)
    path=np.array(path[::-1]); s_t=S_[path]
    # smooth the mapping
    s_t=np.convolve(np.r_[np.full(5,s_t[0]),s_t,np.full(5,s_t[-1])],np.ones(11)/11,'valid'); s_t=np.maximum.accumulate(s_t); s_t[0]=0; s_t[-1]=TOT
    s_t=s_t+np.arange(len(s_t))*1e-6
    np.save(out,np.c_[T,s_t]); 
    acc=0
    for e in E: print(f"{e['id']:14s} s={acc:7.1f} t={float(np.interp(acc,s_t,T)):6.1f}"); acc+=e['length']
if __name__=='__main__': align(sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4])
