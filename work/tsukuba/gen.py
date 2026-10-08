import json, math, numpy as np, sys
from scipy.spatial import cKDTree
f=json.load(open('fit.json')); k=f['k']; els=f['els']
OUT=sys.argv[1] if len(sys.argv)>1 else 'tsukuba.course.json'
# ---- 1. rounded elements ---------------------------------------------------
names=['home-a','t1-entry','t1','s-in','s1','s-mid','s2','s-out','hairpin1','infield','dunlop','dunlop-out','r80','r80-out','left-fast','hairpin2-in','hairpin2','hairpin2-exit','back','final-entry','final-exit','home-b']
E=[]
for nm,e in zip(names,els):
    if e['kind']=='A': E.append(dict(id=nm,kind='arc',length=round(e['len_m']*2)/2,radius=float(round(e['R_m'])),turn=e['turn']))
    else: E.append(dict(id=nm,kind='straight',length=float(round(e['len_m']))))
def walk(E,x=0.,z=0.,h=0.):
    # frame: origin facing +Z, right turn increases heading toward +X
    pts=[(0.,x,z,h)]; s=0
    for e in E:
        L=e['length']
        if e['kind']=='straight': x+=L*math.sin(h); z+=L*math.cos(h)
        else:
            c=(1 if e['turn']=='right' else -1)/e['radius']
            x+=(-math.cos(h+c*L)+math.cos(h))/c; z+=(math.sin(h+c*L)-math.sin(h))/c; h+=c*L
        s+=L; pts.append((s,x,z,h))
    return pts
# closure: heading via final-exit length, position via back and home-b
def close(E):
    ib=[i for i,e in enumerate(E) if e['id']=='back'][0]; ih=len(E)-1; ia=len(E)-2
    for _ in range(50):
        p=walk(E); h=p[-1][3]
        tot=sum((1 if e['turn']=='right' else -1)*e['length']/e['radius'] for e in E if e['kind']=='arc')
        E[ia]['length']+= (2*math.pi-tot)*E[ia]['radius']
        p=walk(E); ex,ez=p[-1][1],p[-1][2]
        hb=p[ib][3]; hh=p[ih][3]
        A=np.array([[math.sin(hb),math.sin(hh)],[math.cos(hb),math.cos(hh)]]); d=np.linalg.solve(A,[-ex,-ez])
        E[ib]['length']+=d[0]; E[ih]['length']+=d[1]
        if abs(ex)+abs(ez)<1e-12: break
    return E
C=np.load('chain.npy'); p=f['p']; x0,y0,h0=p[0],p[1],p[2]
d=(C-[x0,y0])*k; fwd=np.array([math.cos(h0),math.sin(h0)]); rgt=np.array([-math.sin(h0),math.cos(h0)])
Cm=np.c_[d@rgt,d@fwd]
def sample(E,ds=1.0):
    out=[]; x=z=h=0.; s=0.
    for e in E:
        L=e['length']; n=max(2,int(round(e['n0']/ds))); t=np.linspace(0,L,n,endpoint=False)
        if e['kind']=='straight': xs=x+t*math.sin(h); zs=z+t*math.cos(h)
        else:
            c=(1 if e['turn']=='right' else -1)/e['radius']; xs=x+(-np.cos(h+c*t)+math.cos(h))/c; zs=z+(np.sin(h+c*t)-math.sin(h))/c
        out.append(np.c_[xs,zs])
        if e['kind']=='straight': x+=L*math.sin(h); z+=L*math.cos(h)
        else: x+=(-math.cos(h+c*L)+math.cos(h))/c; z+=(math.sin(h+c*L)-math.sin(h))/c; h+=c*L
        s+=L
    return np.vstack(out)
from scipy.optimize import least_squares
for e,o in zip(E,els): e['length']=o['len_m']; e['n0']=o['len_m']
dep={'back','final-exit','home-b'}; free=[i for i,e in enumerate(E) if e['id'] not in dep]
def model(q):
    for i,v in zip(free,q[3:]): E[i]['length']=float(v)
    close(E); M=sample(E); c,s_=math.cos(q[2]),math.sin(q[2])
    return np.c_[c*M[:,0]-s_*M[:,1]+q[0], s_*M[:,0]+c*M[:,1]+q[1]]
def res(q):
    Q=model(q); return np.r_[cKDTree(Q).query(Cm)[0], 0.5*cKDTree(Cm).query(Q[::4])[0]]
q0=np.r_[0,0,0,[E[i]['length'] for i in free]]
r=least_squares(res,q0,max_nfev=300); 
for i,v in zip(free,r.x[3:]): E[i]['length']=round(float(v),2)
close(E)
for e in E: e['length']=float(e['length']); e.pop('n0')
for e,o in zip(E,els): e['n0']=o['len_m']
Q=model(np.r_[r.x[:3],[E[i]['length'] for i in free]]); dd=cKDTree(Q).query(Cm)[0]
for e in E: e.pop('n0')
P=walk(E); TOT=P[-1][0]
print('total %.3f closure %.1e %.1e'%(TOT,P[-1][1],P[-1][2]))
print('deviation: rms %.2f m max %.2f m'%(np.sqrt((dd**2).mean()),dd.max()))
json.dump({'E':E,'TOT':TOT,'align':r.x[:3].tolist()},open('plan.json','w'),indent=1)
for e in E: print(e)
