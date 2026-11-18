import sys,json,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import fit as F, cand2 as C, setview
LS={'L2':dict(main=[-0.25,0.85,0.46],amb=0.16,sky=0.26,mainw=0.95,fillw=0.10),
    'M1':dict(main=[-0.25,0.85,0.46],amb=0.20,sky=0.30,mainw=1.15,fillw=0.10),
    'M2':dict(main=[-0.25,0.85,0.46],amb=0.10,sky=0.22,mainw=1.25,fillw=0.08),
    'M3':dict(main=[-0.25,0.85,0.46],amb=0.14,sky=0.30,mainw=1.45,fillw=0.12)}
NM={'L2':'L2  current','M1':'M1  brighter all over','M2':'M2  stronger contrast: darker shade, stronger sun','M3':'M3  brighter and stronger contrast'}
F.LIGHTS.update(LS); _full=F.full; CACHE={}
def full(light,cell):
    k=(light,cell)
    if k not in CACHE: CACHE[k]=_full(light,cell)
    rgb,m,best,rr=CACHE[k]; return rgb,m,np.where(best==2,3,best),rr
F.full=full
alloc=tuple(int(a) for a in sys.argv[1].split(',')); rows=[]; big=[]; info={}
for L in LS:
    px=[[] for _ in range(4)]
    for cl in F.fitcells:
        rgb,m,best,rr=full(L,cl)
        for k in range(4): px[k].append(rr[m&(best==k)])
    r=[]
    for k,a in enumerate(alloc):
        P=np.concatenate(px[k]).astype(float)
        if a==0 or len(P)==0: r.append((np.array([0.0]),np.zeros((1,3)))); continue
        lum=P@F.LW; c=F.kmeans1(lum,a); l=np.abs(lum[:,None]-c[None]).argmin(1); r.append((c,np.array([P[l==i].mean(0) for i in range(len(c))])))
    info[L]=[[list(map(int,c)) for c in cols] for _,cols in r]; f=lambda c,L=L,r=r: F.quant(L,c,r,False)
    rows.append(F.row(NM[L],f)); big.append(F.row(NM[L]+'  x8',f,8,[(0,0),(8,0),(16,0),(32,0)])); CACHE.clear()
tag=sys.argv[2]; setview.stack(rows,f'/home/claude/work/out/{tag}_sheet.png'); setview.stack(big,f'/home/claude/work/out/{tag}_big.png'); json.dump(info,open(f'/home/claude/work/out/{tag}.json','w'),indent=1); print(json.dumps(info))
