import sys; sys.path.insert(0,'tools')
import numpy as np, scipy.sparse as sp, view
from scipy.sparse.linalg import splu
from scipy.sparse.csgraph import connected_components
w=np.load('work/weld.npz'); J=w['J']; inv=w['inv']; X=np.load('work/X3b.npy').copy(); n=len(X); F=len(J); X0=X.copy()
cls=np.load('work/cls1.npy'); z=np.load('work/uvraster.npz'); tb=z['tb'].astype(np.int64); cov=tb>=0
g=np.bincount(tb[cov],weights=(cls[cov]==3),minlength=F); a=np.bincount(tb[cov],minlength=F)
js,binb,P,UV,I,img=view.mesh('in/e150-src.glb'); T=4096
tx=np.clip((UV[:,0]%1.0)*T,0,T-1).astype(int); ty=np.clip((UV[:,1]%1.0)*T,0,T-1).astype(int)
vg=np.zeros(n,bool); vg[inv[cls[ty,tx]==3]]=True
fg=np.where(a>0,g>0.5*a,vg[J].all(1))
e=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]]); e.sort(1); fid=np.tile(np.arange(F),3)
key=e[:,0]*n+e[:,1]; o=np.argsort(key,kind='stable'); key=key[o]; fid=fid[o]
same=key[1:]==key[:-1]; fa=fid[:-1][same]; fb=fid[1:][same]; ok=fg[fa]&fg[fb]
nc,lab=connected_components(sp.coo_matrix((np.ones(ok.sum()),(fa[ok],fb[ok])),shape=(F,F)).tocsr(),directed=False)
lab[~fg]=-1; fn=np.cross(X0[J[:,1]]-X0[J[:,0]],X0[J[:,2]]-X0[J[:,0]]); area=np.linalg.norm(fn,axis=1)/2; cen=(X0[J[:,0]]+X0[J[:,1]]+X0[J[:,2]])/3
ar=np.bincount(lab[fg],weights=area[fg],minlength=nc)
E=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]]); A=sp.coo_matrix((np.ones(len(E)*2),(np.concatenate([E[:,0],E[:,1]]),np.concatenate([E[:,1],E[:,0]]))),shape=(n,n)).tocsr(); A.data[:]=1.0
Lap=(sp.diags(np.asarray(A.sum(1)).ravel())-A).tocsr()/6.0
body=np.load('work/body.npy'); moved_all=np.zeros(n,bool)
def terms(u,v,deg): return np.stack([u**a*v**b for a in range(deg+1) for b in range(deg+1-a)],1)
def sheet(faces,name,dep,deg):
    ia=[k for k in range(3) if k!=dep]; f=np.nonzero(faces)[0]
    u,v,d=cen[f,ia[0]],cen[f,ia[1]],cen[f,dep]; wgt=area[f]; keep=np.ones(len(f),bool)
    for it in range(6):
        A_=terms(u[keep],v[keep],deg)*np.sqrt(wgt[keep])[:,None]; c,*_=np.linalg.lstsq(A_,d[keep]*np.sqrt(wgt[keep]),rcond=None)
        res=d-terms(u,v,deg)@c; keep=np.abs(res)<0.003
    if wgt[keep].sum()<0.6*wgt.sum():
        print('%-16s area %.3f m2 | fit: %.0f%% within 3 mm - not one pane, left as supplied'%(name,wgt.sum(),100*wgt[keep].sum()/wgt.sum())); return
    inside=np.zeros(n,np.int32); np.add.at(inside,J[faces].ravel(),1)
    free=(inside>0)&~body
    fi=np.nonzero(free)[0]; X[fi,dep]=terms(X0[fi,ia[0]],X0[fi,ia[1]],deg)@c
    dd=np.abs(X[fi,dep]-X0[fi,dep])*1000; moved_all[fi]=True
    rel=np.zeros(n,bool); rel[fi[dd>2.0]]=True
    for _ in range(2): rel=((A@rel.astype(float))>0)&free
    ri=np.nonzero(rel)[0]; ci=np.nonzero(~rel)[0]
    if len(ri):
        R=Lap[ri]; lu=splu(R[:,ri].tocsc()); Rc=R[:,ci]
        for k in ia: X[ri,k]=lu.solve(-(Rc@X[ci,k]))
        X[ri,dep]=terms(X[ri,ia[0]],X[ri,ia[1]],deg)@c
    print('%-16s area %.3f m2 | fit: %.0f%% within 3 mm | set on the surface %d vertices, moved mm pct50/90/99/max %s | spread out %d'%(name,wgt.sum(),100*wgt[keep].sum()/wgt.sum(),len(fi),np.percentile(dd,[50,90,99,100]).round(1),len(ri)))
for r in np.argsort(-ar)[:12]:
    if ar[r]<0.03: break
    m=lab==r; c=cen[m]
    if abs(c[:,0].mean())<0.1 and c[:,2].mean()>-0.4: name,dep,deg='windscreen',2,4
    elif abs(c[:,0].mean())<0.1: name,dep,deg='rear window',2,4
    else: name,dep,deg=('side %s z %.2f'%('L' if c[:,0].mean()>0 else 'R',c[:,2].mean())),0,3
    sheet(m,name,dep,deg)
print('painted-body vertices moved:',int((np.abs(X-X0).max(1)[body]>0).sum()),'| vertices moved outside the panes:',int(((np.abs(X-X0).max(1)>0)&~moved_all).sum()))
np.save('work/X4.npy',X)
