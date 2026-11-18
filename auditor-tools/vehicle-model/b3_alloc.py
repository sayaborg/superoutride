import sys,json,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import fit as F, cand2 as C, setview
F.LIGHTS['L2']=dict(main=[-0.25,0.85,0.46],amb=0.16,sky=0.26,mainw=0.95,fillw=0.10)
_full=F.full; CACHE={}
def full(light,cell):
    k=(light,cell)
    if k not in CACHE: CACHE[k]=_full(light,cell)
    rgb,m,best,rr=CACHE[k]; return rgb,m,np.where(best==2,3,best),rr
F.full=full
px=[[] for _ in range(4)]; raw=np.zeros(5)
for cl in F.fitcells:
    rgb,m,best,rr=full('L2',cl); b0=CACHE[('L2',cl)][2]
    for k in range(5): raw[k]+=(m&(b0==k)).sum()
    for k in range(4): px[k].append(rr[m&(best==k)])
print('share of picture: red %.1f%% blue %.1f%% white %.1f%% metal/tire/black %.1f%% lamp %.1f%%'%tuple(100*raw/raw.sum()))
def ramps(alloc):
    out=[]
    for k,a in enumerate(alloc):
        P=np.concatenate(px[k]).astype(float)
        if a==0 or len(P)==0: out.append((np.array([0.0]),np.zeros((1,3)))); continue
        lum=P@F.LW; c=F.kmeans1(lum,a); l=np.abs(lum[:,None]-c[None]).argmin(1); out.append((c,np.array([P[l==i].mean(0) for i in range(len(c))])))
    return out
A=ramps((4,4,0,6)); B=ramps((3,3,0,8)); fa=lambda c: F.quant('L2',c,A,False); fb=lambda c: F.quant('L2',c,B,False)
for nm,r in (('4-4-6',A),('3-3-8',B)): print(nm,[[list(map(int,c)) for c in cols] for _,cols in r])
setview.stack([F.row('A 4, B 4, grey 6  (current)',fa),F.row('A 3, B 3, grey 8',fb),F.row('no color limit',F.fullimg('L2'))],'/home/claude/work/out/alloc2_sheet.png')
cs=[(0,0),(8,0),(16,0),(32,0)]
setview.stack([F.row('A 4, B 4, grey 6  (current)  x8',fa,8,cs),F.row('A 3, B 3, grey 8  x8',fb,8,cs)],'/home/claude/work/out/alloc2_big.png')
