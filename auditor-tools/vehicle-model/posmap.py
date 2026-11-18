# rasterize the mesh into UV space: per texel 3D position, normal, coverage
import sys, io, numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import glbio
b,j,jl=glbio.load(sys.argv[1]); pr=j['meshes'][0]['primitives'][0]
P=glbio.get(b,j,jl,pr['attributes']['POSITION']).astype(np.float64); UV=glbio.get(b,j,jl,pr['attributes']['TEXCOORD_0']).astype(np.float64)
N=glbio.get(b,j,jl,pr['attributes']['NORMAL']).astype(np.float64); I=glbio.get(b,j,jl,pr['indices']).reshape(-1,3).astype(np.int64)
S=4096; print('uv range',UV.min(0),UV.max(0))
T=UV[I]*S                                   # (n,3,2) x=u*S, y=v*S
x0=np.ceil(T[:,:,0].min(1)-0.5).astype(int); x1=np.floor(T[:,:,0].max(1)-0.5).astype(int)
y0=np.ceil(T[:,:,1].min(1)-0.5).astype(int); y1=np.floor(T[:,:,1].max(1)-0.5).astype(int)
w=x1-x0+1; h=y1-y0+1; d=np.maximum(w,h); print('bbox dim pcts',np.percentile(d,[50,90,99,99.9,100]),'empty',(d<=0).sum())
pos=np.zeros((S,S,3),np.float32); nor=np.zeros((S,S,3),np.float32); cov=np.zeros((S,S),bool)
a,bq,c=T[:,0],T[:,1],T[:,2]; den=(bq[:,1]-c[:,1])*(a[:,0]-c[:,0])+(c[:,0]-bq[:,0])*(a[:,1]-c[:,1])
def run(idx,D):
    for oy in range(D):
        for ox in range(D):
            m=idx[(ox<w[idx])&(oy<h[idx])]
            if len(m)==0: continue
            px=x0[m]+ox; py=y0[m]+oy; cx=px+0.5; cy=py+0.5
            l1=((bq[m,1]-c[m,1])*(cx-c[m,0])+(c[m,0]-bq[m,0])*(cy-c[m,1]))/den[m]
            l2=((c[m,1]-a[m,1])*(cx-c[m,0])+(a[m,0]-c[m,0])*(cy-c[m,1]))/den[m]; l3=1-l1-l2
            ok=(l1>=-1e-6)&(l2>=-1e-6)&(l3>=-1e-6)&(px>=0)&(px<S)&(py>=0)&(py<S)
            m=m[ok]; l=np.c_[l1[ok],l2[ok],l3[ok]]; px=px[ok]; py=py[ok]
            pos[py,px]=(P[I[m]]*l[:,:,None]).sum(1); nor[py,px]=(N[I[m]]*l[:,:,None]).sum(1); cov[py,px]=True
valid=np.where((d>0)&(np.abs(den)>1e-12))[0]
prev=0
for D in (4,8,16,32,64,128,256,512,4096):
    idx=valid[(d[valid]>prev)&(d[valid]<=D)]
    if len(idx): print('D',D,'tris',len(idx)); 
    if len(idx) and D<=128: run(idx,D)
    elif len(idx):
        for t in idx: run(np.array([t]),int(d[t]))
    prev=D
print('coverage',cov.mean())
np.savez('/home/claude/work/out/posmap.npz',pos=pos,nor=nor,cov=cov)
