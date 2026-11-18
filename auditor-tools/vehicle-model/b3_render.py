import sys,json,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import fit as F, cand2 as C, setview
F.LIGHTS['L2']=dict(main=[-0.25,0.85,0.46],amb=0.16,sky=0.26,mainw=0.95,fillw=0.10)
_full=F.full; CACHE={}
def full(light,cell):
    k=(light,cell)
    if k not in CACHE: CACHE[k]=_full(light,cell)
    rgb,m,best,rr=CACHE[k]; return rgb,m,np.where(best==2,3,best),rr
F.full=full
px=[[] for _ in range(4)]
for cl in F.fitcells:
    rgb,m,best,rr=full('L2',cl)
    for k in range(4): px[k].append(rr[m&(best==k)])
ramps=[]
for k,a in enumerate((4,4,0,6)):
    P=np.concatenate(px[k]).astype(float)
    if a==0 or len(P)==0: ramps.append((np.array([0.0]),np.zeros((1,3)))); continue
    lum=P@F.LW; c=F.kmeans1(lum,a); l=np.abs(lum[:,None]-c[None]).argmin(1); ramps.append((c,np.array([P[l==i].mean(0) for i in range(len(c))])))
f=lambda c: F.quant('L2',c,ramps,False); tag=sys.argv[1]
cells2=[(40,0),(48,0),(56,0),(60,0),(0,20),(0,40),(4,-20),(60,20)]
setview.stack([F.row('new model, light L2, 4-4 + 6 greys',f),F.row('same, other yaws and banks',f,4,cells2),F.row('no color limit (for comparison)',F.fullimg('L2'))],f'/home/claude/work/out/{tag}_sheet.png')
setview.stack([F.row('new model, light L2, 4-4 + 6 greys (x8)',f,8,F.cells[:4]),F.row('',f,8,[(24,0),(32,0),(0,-20),(0,-40)])],f'/home/claude/work/out/{tag}_big.png')
json.dump([[list(map(int,c)) for c in cols] for _,cols in ramps],open(f'/home/claude/work/out/{tag}_ramps.json','w')); print(json.load(open(f'/home/claude/work/out/{tag}_ramps.json')))
