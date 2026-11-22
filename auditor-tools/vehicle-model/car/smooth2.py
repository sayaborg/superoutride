import sys; sys.path.insert(0,'tools')
import view, numpy as np, scipy.sparse as sp
from scipy.sparse.linalg import cg, splu
js,binb,P,UV,I,img=view.mesh('src/pink_sports_car_3d_model.glb')
w=np.load('out/weld.npz'); inv=w['inv']; J=w['J']; d=np.load('out/weldP.npz'); Cw=d['Cw']; darklab=d['darklab']
P1=np.load('out/P1.npy'); n=inv.max()+1
X=np.zeros((n,3)); X[inv]=P1; X0=X.copy()
E=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]])
A=sp.coo_matrix((np.ones(len(E)*2),(np.concatenate([E[:,0],E[:,1]]),np.concatenate([E[:,1],E[:,0]]))),shape=(n,n)).tocsr(); A.data[:]=1.0
deg=np.asarray(A.sum(1)).ravel()
Lap=(sp.diags(deg)-A).tocsr()/6.0
def dilate(m,k):
    for _ in range(k): m=m|((A@m.astype(np.float64))>0)
    return m
def erode(m,k): return ~dilate(~m,k)
def fnorm(X):
    fn=np.cross(X[J[:,1]]-X[J[:,0]],X[J[:,2]]-X[J[:,0]]); return fn/(np.linalg.norm(fn,axis=1,keepdims=True)+1e-20)
def implicit(X,free,alpha):
    """minimise |x-x0|^2 on free + alpha |L x|^2 on rows near free; fixed vertices keep position"""
    rows=np.nonzero(free)[0]
    R=Lap[rows]
    fi=np.nonzero(free)[0]; ci=np.nonzero(~free)[0]
    Rf=R[:,fi].tocsc(); Rc=R[:,ci]
    M=(sp.identity(len(fi))+alpha*(Rf.T@Rf)).tocsc()
    lu=splu(M)
    out=X.copy()
    for k in range(3):
        rhs=X[fi,k]-alpha*(Rf.T@(Rc@X[ci,k]))
        out[fi,k]=lu.solve(rhs)
    # keep only the part of the move that is along the smoothed surface normal (the texture stays where it is)
    fn=np.cross(out[J[:,1]]-out[J[:,0]],out[J[:,2]]-out[J[:,0]]); Nn=np.zeros_like(out)
    for k in range(3): np.add.at(Nn,J[:,k],fn)
    Nn/=np.linalg.norm(Nn,axis=1,keepdims=True)+1e-20
    D=out-X; return X+np.einsum('ij,ij->i',D,Nn)[:,None]*Nn
aG=float(sys.argv[1]); aB=float(sys.argv[2]); tag=sys.argv[3]
# ---- glass
panes={'windshield':[175143],'rear':[326990],'doorL':[530986],'doorR':[0],'quarterL':[534338],'quarterR':[143765]}
glass=np.zeros(n,bool)
for name,ids in panes.items():
    m=np.isin(darklab,ids)
    if name.startswith('door'): m&=~((np.abs(X[:,0])>0.78)&(X[:,2]>-0.05))
    glass|=m
gfree=erode(glass,1)
X=implicit(X,gfree,aG)
dg=np.linalg.norm(X-X0,axis=1)[gfree]*1000; print('glass disp mm 50/90/99/max',np.percentile(dg,[50,90,99,100]).round(2))
# ---- body
FN=fnorm(X0)
Es=np.sort(E,axis=1); key=Es[:,0]*n+Es[:,1]; Fi=np.tile(np.arange(len(J)),3)
o=np.argsort(key); ks=key[o]; fs=Fi[o]; same=ks[1:]==ks[:-1]
f1=fs[:-1][same]; f2=fs[1:][same]; ek=ks[:-1][same]
cosd=np.einsum('ij,ij->i',FN[f1],FN[f2]); sharp=cosd<np.cos(np.radians(25))
feat=np.zeros(n,bool); feat[ek[sharp]//n]=True; feat[ek[sharp]%n]=True
pink=(Cw[:,0]>140)&(Cw[:,0]-Cw[:,1]>25)&(Cw[:,0]-Cw[:,2]>5)&(Cw[:,1]>90)
body=pink&~dilate(feat,1)&erode(pink,2)
# drop tiny free islands / keep as is
Xb=X.copy()
X=implicit(X,body,aB)
db=np.linalg.norm(X-Xb,axis=1)[body]*1000; print('body n',body.sum(),'disp mm 50/90/99/max',np.percentile(db,[50,90,99,100]).round(2))
np.save(f'out/X_{tag}.npy',X); np.savez('out/masks.npz',glass=glass,gfree=gfree,body=body,feat=feat,pink=pink)
